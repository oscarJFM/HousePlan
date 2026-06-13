import Foundation

// MARK: - Supabase Models
// These mirror the web app's database schema exactly.

struct Room: Codable, Identifiable {
    let id: UUID
    var name: String
    var description: String?
    var floorArea: Double?
    let userId: UUID
    let createdAt: Date
    var updatedAt: Date

    enum CodingKeys: String, CodingKey {
        case id, name, description
        case floorArea = "floor_area"
        case userId = "user_id"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }
}

struct RoomItem: Codable, Identifiable {
    let id: UUID
    let roomId: UUID
    let userId: UUID
    var name: String
    var itemType: String
    var brand: String?
    var model: String?
    var color: String?
    var notes: String?
    var purchaseDate: String?
    var nextMaintenance: String?
    var positionX: Double
    var positionY: Double
    let createdAt: Date
    var updatedAt: Date

    enum CodingKeys: String, CodingKey {
        case id, name, brand, model, color, notes
        case roomId = "room_id"
        case userId = "user_id"
        case itemType = "item_type"
        case purchaseDate = "purchase_date"
        case nextMaintenance = "next_maintenance"
        case positionX = "position_x"
        case positionY = "position_y"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }
}

struct RoomPhoto: Codable, Identifiable {
    let id: UUID
    let roomId: UUID
    let userId: UUID
    var storagePath: String
    var caption: String?
    let createdAt: Date

    enum CodingKeys: String, CodingKey {
        case id, caption
        case roomId = "room_id"
        case userId = "user_id"
        case storagePath = "storage_path"
        case createdAt = "created_at"
    }
}

// RoomPlan scan result stored as USDZ in Supabase Storage
struct RoomScan: Codable, Identifiable {
    let id: UUID
    let roomId: UUID
    let userId: UUID
    var storagePath: String      // path to .usdz in "room-scans" bucket
    var thumbnailPath: String?   // path to .jpg thumbnail
    let createdAt: Date

    enum CodingKeys: String, CodingKey {
        case id
        case roomId = "room_id"
        case userId = "user_id"
        case storagePath = "storage_path"
        case thumbnailPath = "thumbnail_path"
        case createdAt = "created_at"
    }
}

// MARK: - Item Types (must match web app's ITEM_TYPES)
enum ItemType: String, CaseIterable {
    case bulb, paint, fixture, appliance, flooring
    case furniture, plumbing, hvac, electrical, window, other

    var label: String {
        switch self {
        case .bulb:       return "Light / Bulb"
        case .paint:      return "Paint / Finish"
        case .fixture:    return "Light Fixture"
        case .appliance:  return "Appliance"
        case .flooring:   return "Flooring"
        case .furniture:  return "Furniture"
        case .plumbing:   return "Plumbing"
        case .hvac:       return "HVAC"
        case .electrical: return "Electrical"
        case .window:     return "Window / Door"
        case .other:      return "Other"
        }
    }

    var systemImage: String {
        switch self {
        case .bulb:       return "lightbulb"
        case .paint:      return "paintbrush"
        case .fixture:    return "light.recessed"
        case .appliance:  return "washer"
        case .flooring:   return "square.grid.3x3"
        case .furniture:  return "sofa"
        case .plumbing:   return "drop"
        case .hvac:       return "thermometer"
        case .electrical: return "bolt"
        case .window:     return "door.french.open"
        case .other:      return "wrench.and.screwdriver"
        }
    }
}

// MARK: - Auth State
struct AuthUser: Codable {
    let id: UUID
    let email: String?
    let accessToken: String
    let refreshToken: String
}
