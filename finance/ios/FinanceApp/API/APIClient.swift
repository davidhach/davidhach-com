import Foundation

enum APIError: LocalizedError {
    case http(Int, String)
    case decoding(String)
    case unauthorized
    case transport(Error)

    var errorDescription: String? {
        switch self {
        case .http(let code, let body): return "HTTP \(code): \(body)"
        case .decoding(let msg): return "Decode: \(msg)"
        case .unauthorized: return "Sign in again"
        case .transport(let e): return e.localizedDescription
        }
    }
}

/// Thin URLSession-based client. Reads the session cookie from the keychain so
/// requests are authenticated as the user.
final class APIClient {
    static let shared = APIClient()

    // Point this at your deployed origin. For sim dev, http://localhost:3000.
    var baseURL = URL(string: "http://localhost:3000")!

    private let session: URLSession = {
        let cfg = URLSessionConfiguration.default
        cfg.httpCookieAcceptPolicy = .always
        cfg.httpShouldSetCookies = true
        cfg.timeoutIntervalForRequest = 30
        return URLSession(configuration: cfg)
    }()

    private let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .iso8601
        return d
    }()

    func get<T: Decodable>(_ path: String, as type: T.Type = T.self) async throws -> T {
        try await send(method: "GET", path: path, body: nil)
    }

    func post<B: Encodable, T: Decodable>(_ path: String, body: B, as type: T.Type = T.self) async throws -> T {
        try await send(method: "POST", path: path, body: try JSONEncoder().encode(body))
    }

    func upload(_ path: String, fileData: Data, fileName: String, mimeType: String, finAccountId: String?) async throws -> StatementUpload {
        let boundary = "Boundary-\(UUID().uuidString)"
        var req = URLRequest(url: baseURL.appendingPathComponent(path))
        req.httpMethod = "POST"
        req.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")

        var body = Data()
        if let id = finAccountId {
            body.appendForm(boundary: boundary, name: "finAccountId", value: id)
        }
        body.appendFile(boundary: boundary, name: "file", filename: fileName, mimeType: mimeType, data: fileData)
        body.append("--\(boundary)--\r\n".data(using: .utf8)!)

        let (data, resp) = try await session.upload(for: req, from: body)
        return try handle(data: data, response: resp)
    }

    private func send<T: Decodable>(method: String, path: String, body: Data?) async throws -> T {
        var req = URLRequest(url: baseURL.appendingPathComponent(path))
        req.httpMethod = method
        if body != nil {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = body
        }
        let (data, resp) = try await session.data(for: req)
        return try handle(data: data, response: resp)
    }

    private func handle<T: Decodable>(data: Data, response: URLResponse) throws -> T {
        guard let http = response as? HTTPURLResponse else { throw APIError.transport(URLError(.badServerResponse)) }
        if http.statusCode == 401 { throw APIError.unauthorized }
        guard (200..<300).contains(http.statusCode) else {
            throw APIError.http(http.statusCode, String(data: data, encoding: .utf8) ?? "")
        }
        do { return try decoder.decode(T.self, from: data) }
        catch { throw APIError.decoding(String(describing: error)) }
    }
}

private extension Data {
    mutating func appendForm(boundary: String, name: String, value: String) {
        append("--\(boundary)\r\n".data(using: .utf8)!)
        append("Content-Disposition: form-data; name=\"\(name)\"\r\n\r\n".data(using: .utf8)!)
        append("\(value)\r\n".data(using: .utf8)!)
    }
    mutating func appendFile(boundary: String, name: String, filename: String, mimeType: String, data: Data) {
        append("--\(boundary)\r\n".data(using: .utf8)!)
        append("Content-Disposition: form-data; name=\"\(name)\"; filename=\"\(filename)\"\r\n".data(using: .utf8)!)
        append("Content-Type: \(mimeType)\r\n\r\n".data(using: .utf8)!)
        append(data)
        append("\r\n".data(using: .utf8)!)
    }
}
