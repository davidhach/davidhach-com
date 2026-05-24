import SwiftUI

struct SettingsView: View {
    @EnvironmentObject var auth: AuthManager

    var body: some View {
        NavigationStack {
            Form {
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
