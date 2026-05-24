import SwiftUI

struct ReviewView: View {
    let payload: ParseResponse
    @State private var kept: Set<String>
    @State private var saving = false
    @State private var done = false
    @Environment(\.dismiss) private var dismiss

    init(payload: ParseResponse) {
        self.payload = payload
        _kept = State(initialValue: Set(payload.transactions.map { $0.id }))
    }

    var body: some View {
        List {
            Section {
                HStack {
                    Text("\(kept.count) selected").foregroundStyle(.secondary)
                    Spacer()
                    Button(kept.count == payload.transactions.count ? "Deselect all" : "Select all") {
                        if kept.count == payload.transactions.count { kept.removeAll() }
                        else { kept = Set(payload.transactions.map { $0.id }) }
                    }.font(.footnote)
                }
            }
            ForEach(payload.transactions) { t in
                HStack {
                    Image(systemName: kept.contains(t.id) ? "checkmark.circle.fill" : "circle")
                        .foregroundStyle(kept.contains(t.id) ? .accentColor : .secondary)
                    VStack(alignment: .leading) {
                        Text(t.merchant ?? t.description).lineLimit(1)
                        Text("\(t.date.formatted(.dateTime.year().month().day())) · \(t.category?.name ?? "Uncategorized")")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                    Spacer()
                    Text(t.amount.formatted(currency: t.currency))
                        .monospacedDigit()
                        .foregroundStyle((t.amount.asDecimal as NSDecimalNumber).doubleValue < 0 ? .primary : .green)
                }
                .contentShape(.rect)
                .onTapGesture {
                    if kept.contains(t.id) { kept.remove(t.id) } else { kept.insert(t.id) }
                }
            }
        }
        .navigationTitle("Review")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button(action: save) {
                    if saving { ProgressView() }
                    else { Text("Save (\(kept.count))").bold() }
                }
                .disabled(saving || kept.isEmpty)
            }
        }
        .navigationBarBackButtonHidden(saving)
        .alert("Saved", isPresented: $done) {
            Button("OK") { dismiss() }
        }
    }

    private func save() {
        Task {
            saving = true; defer { saving = false }
            struct Body: Encodable { let keep: [String]; let reject: [String]; let edits: [String: String] = [:] }
            let body = Body(
                keep: Array(kept),
                reject: payload.transactions.map { $0.id }.filter { !kept.contains($0) }
            )
            do {
                _ = try await APIClient.shared.post("/api/statements/\(payload.upload.id)/confirm", body: body, as: EmptyDecodable.self)
                done = true
            } catch {
                print("save failed", error)
            }
        }
    }
}

struct StatementDetailView: View {
    let uploadId: String
    @State private var loading = true
    @State private var parsed: ParseResponse?
    @State private var error: String?

    var body: some View {
        Group {
            if loading { ProgressView() }
            else if let parsed { ReviewView(payload: parsed) }
            else if let error { Text(error).foregroundStyle(.red) }
        }
        .task {
            do {
                parsed = try await APIClient.shared.get("/api/statements/\(uploadId)", as: ParseResponse.self)
            } catch { self.error = error.localizedDescription }
            loading = false
        }
    }
}
