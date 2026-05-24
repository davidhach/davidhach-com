import Foundation

@MainActor
final class DashboardViewModel: ObservableObject {
    @Published var payload: DashboardPayload?
    @Published var loading = false
    @Published var showError = false
    @Published var errorMessage: String?

    struct Point: Identifiable { let id = UUID(); let date: Date; let value: Double }

    var snapshotPoints: [Point] {
        guard let p = payload else { return [] }
        var points = p.snapshots.map { Point(date: $0.date, value: NSDecimalNumber(decimal: $0.netWorth.asDecimal).doubleValue) }
        points.append(Point(date: Date(), value: NSDecimalNumber(decimal: p.breakdown.netWorth.asDecimal).doubleValue))
        return points
    }

    var netWorthFormatted: String {
        guard let p = payload else { return "—" }
        return p.breakdown.netWorth.formatted(currency: p.breakdown.currency)
    }

    var monthOverMonth: Double? {
        guard let p = payload, let last = p.snapshots.last else { return nil }
        let now = NSDecimalNumber(decimal: p.breakdown.netWorth.asDecimal).doubleValue
        let then = NSDecimalNumber(decimal: last.netWorth.asDecimal).doubleValue
        guard then != 0 else { return nil }
        return (now - then) / then
    }

    func load() async {
        loading = true; defer { loading = false }
        do {
            payload = try await APIClient.shared.get("/api/dashboard", as: DashboardPayload.self)
        } catch {
            errorMessage = error.localizedDescription
            showError = true
        }
    }
}
