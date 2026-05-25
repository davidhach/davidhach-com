import SwiftUI
import LocalAuthentication

/**
 LocalAuthentication-backed app lock.

 Responsibilities:
   - Track whether the app is currently "unlocked" for the local user.
   - On cold launch and on foregrounding after a configurable idle window,
     require Face ID / Touch ID (or the device passcode as a fallback) before
     showing protected content.

 Crucially: this is a *device-local* lock. The server-side session token is
 the actual proof of identity to the API. Face ID never substitutes for a
 server credential — it just gates access to the unlocked cookie sitting in
 the keychain.

 Wired up from `LedgerApp.swift` via the scenePhase environment value.
 */
@MainActor
final class BiometricLock: ObservableObject {
    enum LockState { case locked, unlocked, unavailable }

    @Published var state: LockState = .locked
    @Published var lastError: String?

    /// Persisted user preference. `true` = always re-lock when the app is
    /// backgrounded for longer than `idleLockSeconds`.
    @AppStorage("ledger.biometric.enabled") var biometricEnabled: Bool = true

    /// Re-prompt after this many seconds of background time. Shorter = safer,
    /// longer = less interruption. 60s is a reasonable default for a finance app.
    let idleLockSeconds: TimeInterval = 60

    private var backgroundedAt: Date?

    /// Called when the user opens the app (foreground transition or cold launch).
    func evaluateOnForeground() async {
        guard biometricEnabled else { state = .unlocked; return }
        if let bg = backgroundedAt, Date().timeIntervalSince(bg) < idleLockSeconds {
            // Brief blip in/out of the app — keep the unlocked state.
            backgroundedAt = nil
            return
        }
        await unlock()
    }

    func handleScenePhase(_ phase: ScenePhase) {
        switch phase {
        case .background, .inactive:
            backgroundedAt = Date()
        case .active:
            Task { await evaluateOnForeground() }
        @unknown default: break
        }
    }

    /// Show the biometric prompt. Falls back to device passcode if biometrics
    /// are not enrolled, so a stolen-phone scenario still requires the passcode.
    func unlock() async {
        let ctx = LAContext()
        ctx.localizedFallbackTitle = "Use passcode"
        var err: NSError?
        let policy: LAPolicy = .deviceOwnerAuthentication // biometry OR passcode
        guard ctx.canEvaluatePolicy(policy, error: &err) else {
            // No biometrics AND no passcode set — leave unlocked, the OS can't
            // help us. Server session is still the source of truth.
            state = .unavailable
            return
        }
        do {
            let ok = try await ctx.evaluatePolicy(policy, localizedReason: "Unlock Ledger")
            state = ok ? .unlocked : .locked
        } catch {
            lastError = error.localizedDescription
            state = .locked
        }
    }
}
