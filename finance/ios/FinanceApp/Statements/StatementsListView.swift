import SwiftUI
import PhotosUI

struct StatementsListView: View {
    @State private var uploads: [StatementUpload] = []
    @State private var showPicker = false
    @State private var showCamera = false
    @State private var pickedItem: PhotosPickerItem?
    @State private var uploading = false
    @State private var error: String?
    @State private var pushTarget: ParseResponse?

    var body: some View {
        NavigationStack {
            List {
                Section {
                    HStack {
                        Button {
                            showCamera = true
                        } label: {
                            Label("Take photo", systemImage: "camera.fill")
                        }
                        Spacer()
                        PhotosPicker(selection: $pickedItem, matching: .images, photoLibrary: .shared()) {
                            Label("Choose from library", systemImage: "photo.on.rectangle")
                        }
                    }
                    if uploading { ProgressView("Uploading & reading…") }
                    if let e = error { Text(e).foregroundStyle(.red).font(.footnote) }
                }
                Section("Recent") {
                    if uploads.isEmpty {
                        Text("No statements uploaded yet").foregroundStyle(.secondary)
                    } else {
                        ForEach(uploads) { u in
                            NavigationLink(value: u.id) {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(u.fileName).lineLimit(1)
                                    Text("\(u.status.lowercased()) · \(u.uploadedAt.formatted(.dateTime))")
                                        .font(.caption).foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
                }
            }
            .navigationTitle("Statements")
            .navigationDestination(for: String.self) { id in
                StatementDetailView(uploadId: id)
            }
            .navigationDestination(item: $pushTarget) { parsed in
                ReviewView(payload: parsed)
            }
            .refreshable { await load() }
            .task { await load() }
            .onChange(of: pickedItem) { _, new in
                guard let new else { return }
                Task { await handlePickerItem(new) }
            }
            .sheet(isPresented: $showCamera) {
                CameraPicker { data in
                    Task { await upload(data: data, name: "camera-\(Date().timeIntervalSince1970).jpg", mime: "image/jpeg") }
                }
            }
        }
    }

    private func load() async {
        do { uploads = try await APIClient.shared.get("/api/statements", as: [StatementUpload].self) }
        catch { self.error = error.localizedDescription }
    }

    private func handlePickerItem(_ item: PhotosPickerItem) async {
        do {
            guard let data = try await item.loadTransferable(type: Data.self) else { return }
            await upload(data: data, name: "library-\(Date().timeIntervalSince1970).jpg", mime: "image/jpeg")
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func upload(data: Data, name: String, mime: String) async {
        uploading = true; error = nil; defer { uploading = false }
        do {
            let up = try await APIClient.shared.upload("/api/statements", fileData: data, fileName: name, mimeType: mime, finAccountId: nil)
            let parsed: ParseResponse = try await APIClient.shared.post("/api/statements/\(up.id)/parse", body: EmptyEncodable(), as: ParseResponse.self)
            pushTarget = parsed
            await load()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

struct EmptyEncodable: Encodable {}
