import SwiftUI

struct LoginView: View {
    @EnvironmentObject var auth: AuthManager
    @State private var email = ""
    @State private var sending = false
    @State private var sent = false
    @State private var error: String?

    var body: some View {
        VStack(spacing: 20) {
            Spacer()
            VStack(spacing: 8) {
                Text("Ledger").font(.largeTitle.bold())
                Text("Sign in with your email").foregroundStyle(.secondary).font(.callout)
            }
            if sent {
                VStack(spacing: 8) {
                    Image(systemName: "envelope.open").font(.largeTitle).foregroundStyle(.tint)
                    Text("Check your email")
                    Text("Tap the link on this device to sign in.").font(.footnote).foregroundStyle(.secondary)
                }.padding()
            } else {
                VStack(alignment: .leading, spacing: 12) {
                    TextField("you@example.com", text: $email)
                        .textContentType(.emailAddress)
                        .keyboardType(.emailAddress)
                        .autocapitalization(.none)
                        .padding(12)
                        .background(.background.secondary, in: .rect(cornerRadius: 12))
                    if let e = error { Text(e).foregroundStyle(.red).font(.footnote) }
                    Button(action: requestLink) {
                        if sending { ProgressView().tint(.white) }
                        else { Text("Send magic link").frame(maxWidth: .infinity) }
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(email.isEmpty || sending)
                }.padding(.horizontal)
            }
            Spacer()
        }
        .padding()
    }

    private func requestLink() {
        Task {
            sending = true; error = nil
            do {
                struct Req: Encodable { let email: String; let csrfToken: String = "" }
                _ = try await APIClient.shared.post("/api/auth/signin/nodemailer", body: Req(email: email), as: EmptyDecodable.self)
                sent = true
            } catch {
                self.error = error.localizedDescription
            }
            sending = false
        }
    }
}
