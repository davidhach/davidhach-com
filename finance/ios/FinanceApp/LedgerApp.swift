import SwiftUI

@main
struct LedgerApp: App {
    @StateObject private var auth = AuthManager()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(auth)
                .task { await auth.restore() }
        }
    }
}

struct RootView: View {
    @EnvironmentObject var auth: AuthManager

    var body: some View {
        Group {
            switch auth.state {
            case .unknown:
                ProgressView().controlSize(.large)
            case .signedOut:
                LoginView()
            case .signedIn:
                AppTabs()
            }
        }
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
