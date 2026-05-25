import Foundation
import LocalAuthentication

@MainActor
final class AuthManager: ObservableObject {
    enum State { case unknown, signedOut, signedIn }
    @Published var state: State = .unknown

    private let keychainKey = "ledger.sessionCookie"

    /// Try to restore the session from the keychain. The keychain item is
    /// access-control-gated to biometry/passcode (see writeKeychain), so the
    /// Face ID prompt happens implicitly inside readKeychain — no separate
    /// LAContext call needed here.
    func restore() async {
        do {
            if let cookie = readKeychain() {
                applyCookie(cookie)
                // Verify the session is still live server-side.
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
        // The matching SecAccessControl on the stored item forces a Face ID /
        // passcode prompt before the data is released — defence in depth on top
        // of BiometricLock's own gate.
        let q: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
                                kSecAttrAccount as String: keychainKey,
                                kSecReturnData as String: true,
                                kSecUseOperationPrompt as String: "Unlock Ledger session"]
        var item: CFTypeRef?
        let status = SecItemCopyMatching(q as CFDictionary, &item)
        guard status == errSecSuccess, let data = item as? Data,
              let s = String(data: data, encoding: .utf8) else { return nil }
        return s
    }

    private func writeKeychain(value: String) {
        // .userPresence = biometry (Face ID / Touch ID) OR device passcode.
        // .thisDeviceOnly = not exported to iCloud Keychain or device backups.
        var error: Unmanaged<CFError>?
        guard let access = SecAccessControlCreateWithFlags(
            kCFAllocatorDefault,
            kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly,
            .userPresence,
            &error
        ) else { return }

        let q: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
                                kSecAttrAccount as String: keychainKey,
                                kSecAttrAccessControl as String: access,
                                kSecValueData as String: Data(value.utf8)]
        // Idempotent: delete any prior copy then add.
        SecItemDelete([kSecClass as String: kSecClassGenericPassword,
                       kSecAttrAccount as String: keychainKey] as CFDictionary)
        SecItemAdd(q as CFDictionary, nil)
    }

    private func deleteKeychain() {
        let q: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
                                kSecAttrAccount as String: keychainKey]
        SecItemDelete(q as CFDictionary)
    }
}

struct EmptyDecodable: Decodable {}
