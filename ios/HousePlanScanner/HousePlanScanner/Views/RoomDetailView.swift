import SwiftUI

struct RoomDetailView: View {
    let room: Room

    @EnvironmentObject var supabase: SupabaseService
    @State private var items: [RoomItem] = []
    @State private var isLoading = false
    @State private var showAddItem = false
    @State private var showScanner = false
    @State private var selectedTab = 0

    var maintenanceDue: [RoomItem] {
        items.filter {
            guard let ds = $0.nextMaintenance,
                  let d = isoDate(ds) else { return false }
            return d.timeIntervalSinceNow < 30 * 86400
        }
    }

    var body: some View {
        TabView(selection: $selectedTab) {
            // ── Labels tab ──────────────────────────────────────────────────
            labelsTab
                .tabItem { Label("Labels", systemImage: "tag") }
                .tag(0)

            // ── 3D Scan tab ─────────────────────────────────────────────────
            scanTab
                .tabItem { Label("3D Scan", systemImage: "cube.transparent") }
                .tag(1)
        }
        .navigationTitle(room.name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    showAddItem = true
                } label: {
                    Image(systemName: "plus")
                }
            }
        }
        .sheet(isPresented: $showAddItem) {
            AddItemView(roomId: room.id) { item in
                items.append(item)
            }
        }
        .sheet(isPresented: $showScanner) {
            RoomScanView(room: room)
        }
        .task { await loadItems() }
    }

    // ── Labels Tab ─────────────────────────────────────────────────────────

    @ViewBuilder
    var labelsTab: some View {
        List {
            if !maintenanceDue.isEmpty {
                Section {
                    ForEach(maintenanceDue) { item in
                        MaintenanceBannerRow(item: item)
                    }
                } header: {
                    Label("Maintenance due soon", systemImage: "calendar.badge.exclamationmark")
                        .foregroundStyle(.orange)
                }
            }

            if items.isEmpty && !isLoading {
                ContentUnavailableView(
                    "No labels yet",
                    systemImage: "tag",
                    description: Text("Tap + to add a fixture, appliance, or surface to track.")
                )
            } else {
                Section("All items (\(items.count))") {
                    ForEach(items) { item in
                        ItemRow(item: item)
                    }
                    .onDelete { idx in
                        Task { await deleteItems(at: idx) }
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .refreshable { await loadItems() }
        .overlay {
            if isLoading && items.isEmpty {
                ProgressView()
            }
        }
    }

    // ── Scan Tab ───────────────────────────────────────────────────────────

    @ViewBuilder
    var scanTab: some View {
        VStack(spacing: 24) {
            Spacer()

            Image(systemName: "cube.transparent")
                .font(.system(size: 64))
                .foregroundStyle(.orange.opacity(0.8))

            VStack(spacing: 8) {
                Text("RoomPlan 3D Scan")
                    .font(.title2.bold())
                Text("Use Apple's LiDAR sensor to scan this room and generate an accurate 3D model with walls, doors, windows, and furniture.")
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)

                Text("Requires iPhone 12 Pro or later")
                    .font(.caption)
                    .foregroundStyle(.orange)
                    .padding(.top, 4)
            }

            Button {
                showScanner = true
            } label: {
                Label("Start Room Scan", systemImage: "camera.viewfinder")
                    .fontWeight(.semibold)
                    .frame(maxWidth: .infinity, minHeight: 50)
            }
            .buttonStyle(.borderedProminent)
            .tint(.orange)
            .padding(.horizontal, 40)

            Spacer()
        }
    }

    // ── Helpers ────────────────────────────────────────────────────────────

    private func loadItems() async {
        isLoading = true
        items = (try? await supabase.fetchItems(roomId: room.id)) ?? []
        isLoading = false
    }

    private func deleteItems(at offsets: IndexSet) async {
        for i in offsets {
            try? await supabase.deleteItem(id: items[i].id)
        }
        items.remove(atOffsets: offsets)
    }

    private func isoDate(_ s: String) -> Date? {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        return f.date(from: s)
    }
}

struct ItemRow: View {
    let item: RoomItem

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: ItemType(rawValue: item.itemType)?.systemImage ?? "wrench")
                .frame(width: 28)
                .foregroundStyle(.orange)

            VStack(alignment: .leading, spacing: 2) {
                Text(item.name).font(.headline)
                HStack(spacing: 6) {
                    Text(ItemType(rawValue: item.itemType)?.label ?? item.itemType)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    if let brand = item.brand {
                        Text("·").foregroundStyle(.secondary)
                        Text(brand).font(.caption).foregroundStyle(.secondary)
                    }
                }
                if let next = item.nextMaintenance {
                    Label(next, systemImage: "calendar")
                        .font(.caption2)
                        .foregroundStyle(.orange)
                }
            }
        }
        .padding(.vertical, 4)
    }
}

struct MaintenanceBannerRow: View {
    let item: RoomItem
    var body: some View {
        HStack {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(.orange)
            Text(item.name)
                .font(.callout.bold())
            Spacer()
            if let d = item.nextMaintenance {
                Text(d)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }
}
