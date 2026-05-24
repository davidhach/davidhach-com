import Foundation
import LocalAuthentication

@MainActor
final class AuthManager: ObservableObject {
    enum State { case unknown, signedOut, signedIn }
    @Published var state: State = .unknown

    private let keychainKey = "ledger.sessionCookie"

    /// Try to restore session from keychain, gated behind Face ID/Touch ID.
    func restore() async {
        do {
            let ctx = LAContext()
            var err: NSError?
            if ctx.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &err) {
                let ok = try await ctx.evaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, localizedReason: "Unlock Ledger")
                if !ok { state = .signedOut; return }
            }
            if let cookie = readKeychain() {
                applyCookie(cookie)
                // Hit a cheap endpoint to verify the session is still live.
                _ = try await APIClient.shared.get("/api/entities", as: [EmptyDecodable].self)
                state = .signedIn
            } else {
                state = .signedOut
            }
        } catch {
            state = .signedOut
        }
    }

    /// After the magic-link round-trip the web sets a session cookie. We capture
    /// it here and persist it in the keychain.
    func adopt(cookieHeader: String) {
        writeKeychain(value: cookieHeader)
        applyCookie(cookieHeader)
        state = .signedIn
    }

    func signOut() {
        deleteKeychain()
        HTTPCookieStorage.shared.cookies?.forEach { HTTPCookieStorage.shared.deleteCookie($0) }
        state = .signedOut
    }

    // MARK: - Internals

    private func applyCookie(_ raw: String) {
        guard let cookies = HTTPCookie.cookies(
            withResponseHeaderFields: ["Set-Cookie": raw],
            for: APIClient.shared.baseURL
        ) as [HTTPCookie]?
        else { return }
        cookies.forEach { HTTPCookieStorage.shared.setCookie($0) }
    }

    private func readKeychain() -> String? {
        let q: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
                                kSecAttrAccount as String: keychainKey,
                                kSecReturnData as String: true]
        var item: CFTypeRef?
        guard SecItemCopyMatching(q as CFDictionary, &item) == errSecSuccess,
              let data = item as? Data, let s = String(data: data, encoding: .utf8) else { return nil }
        return s
    }

    private func writeKeychain(value: String) {
        let q: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
                                kSecAttrAccount as String: keychainKey,
                                kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
                                kSecValueData as String: Data(value.utf8)]
        SecItemDelete(q as CFDictionary)
        SecItemAdd(q as CFDictionary, nil)
    }

    private func deleteKeychain() {
        let q: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
                                kSecAttrAccount as String: keychainKey]
        SecItemDelete(q as CFDictionary)
    }
}

struct EmptyDecodable: Decodable {}
