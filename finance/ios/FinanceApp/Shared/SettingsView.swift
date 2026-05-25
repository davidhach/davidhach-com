import SwiftUI

struct SettingsView: View {
    @EnvironmentObject var auth: AuthManager
    @EnvironmentObject var lock: BiometricLock

    var body: some View {
        NavigationStack {
            Form {
                Section("Security") {
                    Toggle("Require Face ID to open Ledger", isOn: $lock.biometricEnabled)
                    Text("Re-prompts after \(Int(lock.idleLockSeconds))s of inactivity. The server-side login (password / TOTP) is unaffected.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Section("Account") {
                    Button("Sign out", role: .destructive) { auth.signOut() }
                }
                Section("About") {
                    LabeledContent("Backend", value: APIClient.shared.baseURL.absoluteString)
                    LabeledContent("Encryption", value: "AES-256-GCM (envelope)")
                }
            }
            .navigationTitle("Settings")
        }
    }
}
