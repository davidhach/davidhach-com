import SwiftUI

struct SpendingView: View {
    @State private var payload: SpendingPayload?
    @State private var loading = false

    var body: some View {
        NavigationStack {
            ScrollView {
                if let p = payload {
                    VStack(alignment: .leading, spacing: 16) {
                        HStack(spacing: 12) {
                            Stat(title: "Spending", value: p.totalSpending.formatted(currency: p.currency))
                            Stat(title: "Income", value: p.totalIncome.formatted(currency: p.currency))
                        }
                        Stat(title: "Net", value: p.net.formatted(currency: p.currency))

                        Section("Top categories") {
                            ForEach(p.byCategory.prefix(10)) { c in
                                HStack {
                                    Text(c.name)
                                    Spacer()
                                    Text(c.total.formatted(currency: p.currency)).monospacedDigit()
                                }
                                Divider()
                            }
                        }
                        .padding()
                        .background(.background.secondary, in: .rect(cornerRadius: 16))

                        Section("Top merchants") {
                            ForEach(p.byMerchant.prefix(10)) { m in
                                HStack {
                                    Text(m.name).lineLimit(1)
                                    Spacer()
                                    Text(m.total.formatted(currency: p.currency)).monospacedDigit()
                                }
                                Divider()
                            }
                        }
                        .padding()
                        .background(.background.secondary, in: .rect(cornerRadius: 16))
                    }
                    .padding()
                } else if loading {
                    ProgressView().padding()
                }
            }
            .navigationTitle("Spending")
            .refreshable { await load() }
            .task { await load() }
        }
    }

    private func load() async {
        loading = true; defer { loading = false }
        payload = try? await APIClient.shared.get("/api/spending", as: SpendingPayload.self)
    }
}
