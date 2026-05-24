import SwiftUI
import Charts

struct DashboardView: View {
    @StateObject private var vm = DashboardViewModel()

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    headline
                    if !vm.snapshotPoints.isEmpty {
                        chart
                    }
                    allocation
                    stats
                    recent
                }
                .padding()
            }
            .navigationTitle("Ledger")
            .refreshable { await vm.load() }
            .task { await vm.load() }
            .overlay { if vm.loading && vm.payload == nil { ProgressView() } }
            .alert("Something went wrong", isPresented: $vm.showError) {
                Button("OK") {}
            } message: { Text(vm.errorMessage ?? "") }
        }
    }

    private var headline: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Net worth").font(.footnote).foregroundStyle(.secondary)
            Text(vm.netWorthFormatted)
                .font(.system(size: 36, weight: .semibold, design: .rounded))
                .monospacedDigit()
            if let pct = vm.monthOverMonth {
                Label("\(pct >= 0 ? "+" : "")\(String(format: "%.1f%%", pct * 100)) MoM",
                      systemImage: pct >= 0 ? "arrow.up.right" : "arrow.down.right")
                    .font(.caption)
                    .foregroundStyle(pct >= 0 ? .green : .red)
            }
        }
    }

    private var chart: some View {
        Chart(vm.snapshotPoints) { point in
            AreaMark(x: .value("Date", point.date), y: .value("Net worth", point.value))
                .foregroundStyle(.linearGradient(colors: [.accentColor.opacity(0.35), .clear], startPoint: .top, endPoint: .bottom))
            LineMark(x: .value("Date", point.date), y: .value("Net worth", point.value))
                .foregroundStyle(.tint)
        }
        .frame(height: 200)
        .chartXAxis { AxisMarks(values: .stride(by: .month, count: 3)) }
    }

    private var allocation: some View {
        Group {
            if let breakdown = vm.payload?.breakdown {
                let entries = breakdown.byAssetClass
                    .map { (name: $0.key, value: NSDecimalNumber(decimal: $0.value.asDecimal).doubleValue) }
                    .sorted { $0.value > $1.value }
                VStack(alignment: .leading, spacing: 6) {
                    Text("Allocation").font(.footnote).foregroundStyle(.secondary)
                    ForEach(entries, id: \.name) { e in
                        HStack {
                            Text(e.name.replacingOccurrences(of: "_", with: " ").capitalized)
                            Spacer()
                            Text(String(format: "%.1f%%", e.value / max(0.0001, NSDecimalNumber(decimal: breakdown.totalAssets.asDecimal).doubleValue) * 100))
                                .monospacedDigit().foregroundStyle(.secondary)
                        }
                        .font(.subheadline)
                    }
                }
                .padding()
                .background(.background.secondary, in: .rect(cornerRadius: 16))
            }
        }
    }

    private var stats: some View {
        Group {
            if let b = vm.payload?.breakdown {
                HStack(spacing: 12) {
                    Stat(title: "Assets", value: b.totalAssets.formatted(currency: b.currency))
                    Stat(title: "Liabilities", value: b.totalLiabilities.formatted(currency: b.currency))
                }
            }
        }
    }

    private var recent: some View {
        Group {
            if let txs = vm.payload?.recentTransactions, !txs.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Recent").font(.footnote).foregroundStyle(.secondary)
                    ForEach(txs) { t in
                        HStack {
                            VStack(alignment: .leading) {
                                Text(t.merchant ?? t.description).lineLimit(1)
                                Text("\(t.date.formatted(.dateTime.month().day())) · \(t.category?.name ?? "Uncategorized")")
                                    .font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer()
                            Text(t.amount.formatted(currency: t.currency))
                                .monospacedDigit()
                                .foregroundStyle((t.amount.asDecimal as NSDecimalNumber).doubleValue < 0 ? .primary : .green)
                        }
                        .padding(.vertical, 4)
                        Divider()
                    }
                }
                .padding()
                .background(.background.secondary, in: .rect(cornerRadius: 16))
            }
        }
    }
}

struct Stat: View {
    let title: String
    let value: String
    var body: some View {
        VStack(alignment: .leading) {
            Text(title).font(.caption).foregroundStyle(.secondary)
            Text(value).font(.title3.bold()).monospacedDigit()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(.background.secondary, in: .rect(cornerRadius: 16))
    }
}
