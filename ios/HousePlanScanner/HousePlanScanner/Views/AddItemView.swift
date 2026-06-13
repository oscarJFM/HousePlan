import SwiftUI

struct AddItemView: View {
    let roomId: UUID
    var onAdd: (RoomItem) -> Void

    @EnvironmentObject var supabase: SupabaseService
    @Environment(\.dismiss) private var dismiss

    @State private var name = ""
    @State private var itemType = ItemType.other
    @State private var brand = ""
    @State private var model = ""
    @State private var color = ""
    @State private var notes = ""
    @State private var purchaseDate: Date? = nil
    @State private var nextMaintenance: Date? = nil
    @State private var hasPurchaseDate = false
    @State private var hasNextMaintenance = false
    @State private var isLoading = false
    @State private var errorMessage: String?

    private let dateFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    var body: some View {
        NavigationStack {
            Form {
                Section("Item details") {
                    TextField("Name (e.g. Ceiling light)", text: $name)

                    Picker("Type", selection: $itemType) {
                        ForEach(ItemType.allCases, id: \.self) { t in
                            Label(t.label, systemImage: t.systemImage).tag(t)
                        }
                    }

                    TextField("Brand (optional)", text: $brand)
                    TextField("Model (optional)", text: $model)
                    TextField("Colour / finish (optional)", text: $color)
                }

                Section("Dates") {
                    Toggle("Purchase date", isOn: $hasPurchaseDate)
                    if hasPurchaseDate {
                        DatePicker(
                            "Date",
                            selection: Binding(
                                get: { purchaseDate ?? Date() },
                                set: { purchaseDate = $0 }
                            ),
                            displayedComponents: .date
                        )
                    }

                    Toggle("Next service date", isOn: $hasNextMaintenance)
                    if hasNextMaintenance {
                        DatePicker(
                            "Date",
                            selection: Binding(
                                get: { nextMaintenance ?? Date() },
                                set: { nextMaintenance = $0 }
                            ),
                            displayedComponents: .date
                        )
                    }
                }

                Section("Notes") {
                    TextEditor(text: $notes)
                        .frame(minHeight: 80)
                }

                if let err = errorMessage {
                    Section {
                        Text(err).foregroundStyle(.red).font(.footnote)
                    }
                }
            }
            .navigationTitle("Add Item")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        Task { await save() }
                    }
                    .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty || isLoading)
                }
            }
        }
    }

    private func save() async {
        guard let userId = supabase.currentUser?.id else { return }
        isLoading = true
        defer { isLoading = false }
        do {
            let payload = NewItemPayload(
                roomId: roomId,
                userId: userId,
                name: name.trimmingCharacters(in: .whitespaces),
                itemType: itemType.rawValue,
                brand: brand.isEmpty ? nil : brand,
                model: model.isEmpty ? nil : model,
                color: color.isEmpty ? nil : color,
                notes: notes.isEmpty ? nil : notes,
                purchaseDate: hasPurchaseDate ? dateFormatter.string(from: purchaseDate ?? Date()) : nil,
                nextMaintenance: hasNextMaintenance ? dateFormatter.string(from: nextMaintenance ?? Date()) : nil
            )
            let item = try await supabase.createItem(payload)
            onAdd(item)
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
