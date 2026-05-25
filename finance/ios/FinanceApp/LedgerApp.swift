import SwiftUI

@main
struct LedgerApp: App {
    @StateObject private var auth = AuthManager()
    @StateObject private var lock = BiometricLock()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(auth)
                .environmentObject(lock)
                .task { await auth.restore() }
                .onChange(of: scenePhase) { _, phase in
                    lock.handleScenePhase(phase)
                }
        }
    }
}

struct RootView: View {
    @EnvironmentObject var auth: AuthManager
    @EnvironmentObject var lock: BiometricLock

    var body: some View {
        Group {
            switch auth.state {
            case .unknown:
                ProgressView().controlSize(.large)
            case .signedOut:
                LoginView()
            case .signedIn:
                if lock.state == .locked {
                    LockedView()
                } else {
                    AppTabs()
                }
            }
        }
    }
}

/// Shown when the app is in signed-in state but the device-local biometric
/// lock is engaged (e.g. coming back from a long background).
struct LockedView: View {
    @EnvironmentObject var lock: BiometricLock

    var body: some View {
        VStack(spacing: 20) {
            Image(systemName: "faceid")
                .font(.system(size: 64))
                .foregroundStyle(.secondary)
            Text("Ledger is locked")
                .font(.headline)
            if let err = lock.lastError {
                Text(err)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal)
            }
            Button("Unlock") { Task { await lock.unlock() } }
                .buttonStyle(.borderedProminent)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .task { await lock.unlock() }
    }
}

struct AppTabs: View {
    var body: some View {
        TabView {
            DashboardView()
                .tabItem { Label("Dashboard", systemImage: "chart.line.uptrend.xyaxis") }
            StatementsListView()
                .tabItem { Label("Statements", systemImage: "doc.viewfinder") }
            SpendingView()
                .tabItem { Label("Spending", systemImage: "creditcard") }
            SettingsView()
                .tabItem { Label("Settings", systemImage: "gear") }
        }
    }
}
