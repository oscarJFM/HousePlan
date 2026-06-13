import SwiftUI

struct DashboardView: View {
    @EnvironmentObject var supabase: SupabaseService

    @State private var rooms: [Room] = []
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var showNewRoom = false

    var body: some View {
        NavigationStack {
            Group {
                if isLoading && rooms.isEmpty {
                    ProgressView("Loading rooms…")
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if rooms.isEmpty {
                    ContentUnavailableView(
                        "No rooms yet",
                        systemImage: "house",
                        description: Text("Tap + to add your first room.")
                    )
                } else {
                    List {
                        ForEach(rooms) { room in
                            NavigationLink(destination: RoomDetailView(room: room)) {
                                RoomRow(room: room)
                            }
                        }
                        .onDelete { indexSet in
                            Task { await deleteRooms(at: indexSet) }
                        }
                    }
                    .listStyle(.insetGrouped)
                }
            }
            .navigationTitle("HousePlan")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showNewRoom = true
                    } label: {
                        Image(systemName: "plus")
                    }
                }
                ToolbarItem(placement: .topBarLeading) {
                    Button("Sign Out", role: .destructive) {
                        supabase.signOut()
                    }
                    .font(.footnote)
                }
            }
            .sheet(isPresented: $showNewRoom) {
                NewRoomSheet { room in
                    rooms.insert(room, at: 0)
                }
            }
            .task { await loadRooms() }
            .refreshable { await loadRooms() }
        }
    }

    private func loadRooms() async {
        isLoading = true
        do {
            rooms = try await supabase.fetchRooms()
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    private func deleteRooms(at offsets: IndexSet) async {
        for i in offsets {
            let room = rooms[i]
            try? await supabase.deleteRoom(id: room.id)
        }
        rooms.remove(atOffsets: offsets)
    }
}

struct RoomRow: View {
    let room: Room

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(room.name)
                .font(.headline)
            HStack(spacing: 8) {
                if let area = room.floorArea {
                    Label("\(String(format: "%.0f", area)) m²", systemImage: "square.dashed")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                if let desc = room.description, !desc.isEmpty {
                    Text(desc)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }
        }
        .padding(.vertical, 4)
    }
}

struct NewRoomSheet: View {
    @EnvironmentObject var supabase: SupabaseService
    @Environment(\.dismiss) private var dismiss

    var onCreate: (Room) -> Void

    @State private var name = ""
    @State private var description = ""
    @State private var floorArea = ""
    @State private var isLoading = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("Room details") {
                    TextField("Name (e.g. Living Room)", text: $name)
                    TextField("Description (optional)", text: $description)
                    TextField("Floor area m² (optional)", text: $floorArea)
                        .keyboardType(.decimalPad)
                }

                if let err = errorMessage {
                    Section {
                        Text(err).foregroundStyle(.red).font(.footnote)
                    }
                }
            }
            .navigationTitle("New Room")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Create") {
                        Task { await create() }
                    }
                    .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty || isLoading)
                }
            }
        }
    }

    private func create() async {
        isLoading = true
        defer { isLoading = false }
        do {
            let area = Double(floorArea)
            let room = try await supabase.createRoom(
                name: name.trimmingCharacters(in: .whitespaces),
                description: description.isEmpty ? nil : description,
                floorArea: area
            )
            onCreate(room)
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
