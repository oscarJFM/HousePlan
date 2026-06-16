import Foundation

// MARK: - SupabaseService
// Thin HTTP wrapper around Supabase REST + Storage APIs.
// No third-party SDK needed — all requests use URLSession directly.
//
// SETUP: Set SUPABASE_URL and SUPABASE_ANON_KEY in the Xcode scheme
// environment variables, or replace the hard-coded placeholders below.

@MainActor
final class SupabaseService: ObservableObject {

    static let shared = SupabaseService()

    // ── Config ───────────────────────────────────────────────────────────────
    // Replace these with your project's values, or set them as Xcode scheme
    // environment variables named SUPABASE_URL and SUPABASE_ANON_KEY.
    private var baseURL: String {
        ProcessInfo.processInfo.environment["SUPABASE_URL"]
            ?? "https://jylbtlvspfywizanekcr.supabase.co"
    }
    private var anonKey: String {
        ProcessInfo.processInfo.environment["SUPABASE_ANON_KEY"]
            ?? "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp5bGJ0bHZzcGZ5d2l6YW5la2NyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyNzY4MDQsImV4cCI6MjA5Njg1MjgwNH0.if8MEkqTNOn0HfKmNxm58VKaJLliEuq-egH_zY6oB08"
    }

    // ── Auth state ───────────────────────────────────────────────────────────
    @Published var currentUser: AuthUser?
    @Published var isLoading = false

    private var accessToken: String? { currentUser?.accessToken }

    private init() {
        loadStoredSession()
    }

    // ── JSON Decoder ─────────────────────────────────────────────────────────
    private let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let str = try container.decode(String.self)
            let fmts = [
                "yyyy-MM-dd'T'HH:mm:ss.SSSSSSZ",
                "yyyy-MM-dd'T'HH:mm:ssZ",
                "yyyy-MM-dd",
            ]
            for fmt in fmts {
                let f = DateFormatter()
                f.locale = Locale(identifier: "en_US_POSIX")
                f.dateFormat = fmt
                if let d = f.date(from: str) { return d }
            }
            throw DecodingError.dataCorruptedError(
                in: container,
                debugDescription: "Cannot parse date: \(str)"
            )
        }
        return d
    }()

    // ── Session persistence ──────────────────────────────────────────────────
    private func loadStoredSession() {
        guard let data = UserDefaults.standard.data(forKey: "supabase_session"),
              let user = try? decoder.decode(AuthUser.self, from: data)
        else { return }
        currentUser = user
    }

    private func saveSession(_ user: AuthUser?) {
        if let user, let data = try? JSONEncoder().encode(user) {
            UserDefaults.standard.set(data, forKey: "supabase_session")
        } else {
            UserDefaults.standard.removeObject(forKey: "supabase_session")
        }
    }

    // ── Auth ─────────────────────────────────────────────────────────────────

    func signIn(email: String, password: String) async throws {
        let body = ["email": email, "password": password]
        let data = try await post(
            path: "/auth/v1/token?grant_type=password",
            body: body,
            auth: false
        )
        let resp = try decoder.decode(SignInResponse.self, from: data)
        let user = AuthUser(
            id: resp.user.id,
            email: resp.user.email,
            accessToken: resp.accessToken,
            refreshToken: resp.refreshToken
        )
        currentUser = user
        saveSession(user)
    }

    func signUp(email: String, password: String) async throws {
        let body = ["email": email, "password": password]
        _ = try await post(path: "/auth/v1/signup", body: body, auth: false)
    }

    func signOut() {
        currentUser = nil
        saveSession(nil)
    }

    // ── Rooms ────────────────────────────────────────────────────────────────

    func fetchRooms() async throws -> [Room] {
        let data = try await get(path: "/rest/v1/rooms?select=*&order=created_at.desc")
        return try decoder.decode([Room].self, from: data)
    }

    func createRoom(name: String, description: String?, floorArea: Double?) async throws -> Room {
        guard let userId = currentUser?.id else { throw AppError.notAuthenticated }
        var body: [String: Any] = ["name": name, "user_id": userId.uuidString]
        if let d = description, !d.isEmpty { body["description"] = d }
        if let a = floorArea { body["floor_area"] = a }
        let data = try await post(path: "/rest/v1/rooms", body: body, returning: "representation")
        let rooms = try decoder.decode([Room].self, from: data)
        guard let room = rooms.first else { throw AppError.noData }
        return room
    }

    func deleteRoom(id: UUID) async throws {
        try await delete(path: "/rest/v1/rooms?id=eq.\(id)")
    }

    // ── Room Items ───────────────────────────────────────────────────────────

    func fetchItems(roomId: UUID) async throws -> [RoomItem] {
        let data = try await get(
            path: "/rest/v1/room_items?select=*&room_id=eq.\(roomId)&order=created_at.asc"
        )
        return try decoder.decode([RoomItem].self, from: data)
    }

    func createItem(_ item: NewItemPayload) async throws -> RoomItem {
        let data = try await post(
            path: "/rest/v1/room_items",
            body: item.asDictionary(),
            returning: "representation"
        )
        let items = try decoder.decode([RoomItem].self, from: data)
        guard let i = items.first else { throw AppError.noData }
        return i
    }

    func deleteItem(id: UUID) async throws {
        try await delete(path: "/rest/v1/room_items?id=eq.\(id)")
    }

    // ── Storage ──────────────────────────────────────────────────────────────

    /// Upload a USDZ file to the "room-scans" bucket and insert a row in room_scans.
    func uploadRoomScan(
        roomId: UUID,
        usdzData: Data,
        thumbnailData: Data?
    ) async throws -> String {
        guard let userId = currentUser?.id else { throw AppError.notAuthenticated }

        let ts = Int(Date().timeIntervalSince1970)
        let usdzPath = "\(userId)/\(roomId)/scan_\(ts).usdz"

        try await uploadStorage(
            bucket: "room-scans",
            path: usdzPath,
            data: usdzData,
            contentType: "model/vnd.usdz+zip"
        )

        var thumbPath: String? = nil
        if let thumb = thumbnailData {
            let tp = "\(userId)/\(roomId)/thumb_\(ts).jpg"
            try await uploadStorage(
                bucket: "room-scans",
                path: tp,
                data: thumb,
                contentType: "image/jpeg"
            )
            thumbPath = tp
        }

        // Insert metadata row (requires room_scans table — see SQL migration)
        var body: [String: Any] = [
            "room_id": roomId.uuidString,
            "user_id": userId.uuidString,
            "storage_path": usdzPath,
        ]
        if let tp = thumbPath { body["thumbnail_path"] = tp }
        _ = try await post(path: "/rest/v1/room_scans", body: body, returning: "representation")

        return usdzPath
    }

    func publicURL(bucket: String, path: String) -> URL? {
        URL(string: "\(baseURL)/storage/v1/object/public/\(bucket)/\(path)")
    }

    // ── Private HTTP helpers ─────────────────────────────────────────────────

    private func headers(auth: Bool = true) -> [String: String] {
        var h = [
            "apikey": anonKey,
            "Content-Type": "application/json",
        ]
        if auth, let token = accessToken {
            h["Authorization"] = "Bearer \(token)"
        }
        return h
    }

    private func get(path: String) async throws -> Data {
        let url = URL(string: "\(baseURL)\(path)")!
        var req = URLRequest(url: url)
        req.httpMethod = "GET"
        headers().forEach { req.setValue($1, forHTTPHeaderField: $0) }
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        let (data, resp) = try await URLSession.shared.data(for: req)
        try checkStatus(resp, data)
        return data
    }

    @discardableResult
    private func post(
        path: String,
        body: Any,
        auth: Bool = true,
        returning: String? = nil
    ) async throws -> Data {
        let url = URL(string: "\(baseURL)\(path)")!
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        headers(auth: auth).forEach { req.setValue($1, forHTTPHeaderField: $0) }
        if let ret = returning { req.setValue("return=\(ret)", forHTTPHeaderField: "Prefer") }
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (data, resp) = try await URLSession.shared.data(for: req)
        try checkStatus(resp, data)
        return data
    }

    private func delete(path: String) async throws {
        let url = URL(string: "\(baseURL)\(path)")!
        var req = URLRequest(url: url)
        req.httpMethod = "DELETE"
        headers().forEach { req.setValue($1, forHTTPHeaderField: $0) }
        let (data, resp) = try await URLSession.shared.data(for: req)
        try checkStatus(resp, data)
    }

    private func uploadStorage(
        bucket: String,
        path: String,
        data: Data,
        contentType: String
    ) async throws {
        let url = URL(string: "\(baseURL)/storage/v1/object/\(bucket)/\(path)")!
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue(anonKey, forHTTPHeaderField: "apikey")
        if let token = accessToken {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        req.setValue(contentType, forHTTPHeaderField: "Content-Type")
        req.httpBody = data
        let (respData, resp) = try await URLSession.shared.data(for: req)
        try checkStatus(resp, respData)
    }

    private func checkStatus(_ response: URLResponse, _ data: Data) throws {
        guard let http = response as? HTTPURLResponse else { return }
        guard (200...299).contains(http.statusCode) else {
            let msg = String(data: data, encoding: .utf8) ?? "HTTP \(http.statusCode)"
            throw AppError.server(msg)
        }
    }
}

// MARK: - Supporting types

private struct SignInResponse: Decodable {
    let accessToken: String
    let refreshToken: String
    let user: UserInfo

    enum CodingKeys: String, CodingKey {
        case accessToken = "access_token"
        case refreshToken = "refresh_token"
        case user
    }

    struct UserInfo: Decodable {
        let id: UUID
        let email: String?
    }
}

struct NewItemPayload {
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

    func asDictionary() -> [String: Any] {
        var d: [String: Any] = [
            "room_id": roomId.uuidString,
            "user_id": userId.uuidString,
            "name": name,
            "item_type": itemType,
            "position_x": 0,
            "position_y": 0,
        ]
        if let v = brand, !v.isEmpty { d["brand"] = v }
        if let v = model, !v.isEmpty { d["model"] = v }
        if let v = color, !v.isEmpty { d["color"] = v }
        if let v = notes, !v.isEmpty { d["notes"] = v }
        if let v = purchaseDate, !v.isEmpty { d["purchase_date"] = v }
        if let v = nextMaintenance, !v.isEmpty { d["next_maintenance"] = v }
        return d
    }
}

enum AppError: LocalizedError {
    case noData
    case notAuthenticated
    case server(String)

    var errorDescription: String? {
        switch self {
        case .noData: return "No data returned from server."
        case .notAuthenticated: return "You must be signed in."
        case .server(let msg): return msg
        }
    }
}
