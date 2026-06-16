import SwiftUI
import RoomPlan
import SceneKit

// MARK: - RoomCaptureCoordinator
// Bridges RoomPlan's delegate callbacks into our SwiftUI world.

@MainActor
final class RoomCaptureCoordinator: NSObject, ObservableObject,
    RoomCaptureSessionDelegate, RoomCaptureViewDelegate {

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    func encode(with coder: NSCoder) {
        // No encoding needed
    }

    @Published var isScanning = false
    @Published var isDone = false
    @Published var instructionText = "Move slowly around the room"
    @Published var capturedRoom: CapturedRoom?
    let session = RoomCaptureSession()

    override init() {
        super.init()
        session.delegate = self
    }

    // ── RoomCaptureSessionDelegate ──────────────────────────────────────────

    nonisolated func captureSession(
        _ session: RoomCaptureSession,
        didUpdate room: CapturedRoom
    ) {
        Task { @MainActor in
            self.capturedRoom = room
        }
    }

    nonisolated func captureSession(
        _ session: RoomCaptureSession,
        didProvide instruction: RoomCaptureSession.Instruction
    ) {
        Task { @MainActor in
            self.instructionText = instruction.description
        }
    }

    nonisolated func captureSession(
        _ session: RoomCaptureSession,
        didEndWith data: CapturedRoomData,
        error: Error?
    ) {
        Task { @MainActor in
            self.isScanning = false
        }
    }

    // ── RoomCaptureViewDelegate ─────────────────────────────────────────────

    nonisolated func captureView(
        didPresent result: CapturedRoom,
        error: Error?
    ) {
        Task { @MainActor in
            self.isDone = true
        }
    }

    // ── Control ────────────────────────────────────────────────────────────

    func startSession(captureView: RoomCaptureView) {
        let config = RoomCaptureSession.Configuration()
        captureView.delegate = self
        session.run(configuration: config)
        isScanning = true
        isDone = false
    }

    func stopSession(captureView: RoomCaptureView) {
        session.stop()
    }

    func exportUSDZ() async -> URL? {
        guard let room = capturedRoom else { return nil }
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString)
            .appendingPathExtension("usdz")
        do {
            try room.export(to: url)
            return url
        } catch {
            print("USDZ export failed: \(error)")
            return nil
        }
    }
}

extension RoomCaptureSession.Instruction: @retroactive CustomStringConvertible {
    public var description: String {
        switch self {
        case .moveCloseToWall:   return "Move closer to the wall"
        case .moveAwayFromWall:  return "Move away from the wall"
        case .slowDown:          return "Slow down"
        case .turnOnLight:       return "Turn on a light"
        case .normal:            return "Keep scanning…"
        case .lowTexture:        return "Move to a more textured area"
        @unknown default:        return "Keep scanning…"
        }
    }
}

// MARK: - RoomCaptureViewRepresentable
// Wraps RoomPlan's UIKit RoomCaptureView for SwiftUI.

struct RoomCaptureViewRepresentable: UIViewRepresentable {
    @ObservedObject var coordinator: RoomCaptureCoordinator
    @Binding var captureView: RoomCaptureView?

    func makeUIView(context: Context) -> RoomCaptureView {
        let view = RoomCaptureView(frame: .zero)
        coordinator.startSession(captureView: view)
        DispatchQueue.main.async {
            captureView = view
        }
        return view
    }

    func updateUIView(_ uiView: RoomCaptureView, context: Context) {}

    static func dismantleUIView(_ uiView: RoomCaptureView, coordinator: ()) {
        // Session is managed by coordinator
    }
}

// MARK: - RoomScanView (main screen shown from RoomDetailView)

struct RoomScanView: View {
    let room: Room

    @EnvironmentObject var supabase: SupabaseService
    @Environment(\.dismiss) private var dismiss

    @StateObject private var coordinator = RoomCaptureCoordinator()
    @State private var captureView: RoomCaptureView?
    @State private var phase: Phase = .scanning
    @State private var isUploading = false
    @State private var uploadDone = false
    @State private var errorMessage: String?

    enum Phase { case scanning, reviewing, uploading, done }

    func stopScan() {
        if let view = captureView {
            coordinator.stopSession(captureView: view)
        }
        coordinator.isScanning = false
        phase = .reviewing
    }

    var body: some View {
        ZStack {
            // ── Scanning phase ─────────────────────────────────────────────
            if phase == .scanning {
                RoomCaptureViewRepresentable(coordinator: coordinator, captureView: $captureView)
                    .ignoresSafeArea()

                VStack {
                    // Instruction pill
                    Text(coordinator.instructionText)
                        .font(.callout.weight(.medium))
                        .padding(.horizontal, 16)
                        .padding(.vertical, 8)
                        .background(.ultraThinMaterial)
                        .clipShape(Capsule())
                        .padding(.top, 60)

                    Spacer()

                    // Controls
                    HStack(spacing: 32) {
                        Button("Cancel") {
                            stopAndDismiss()
                        }
                        .buttonStyle(.bordered)
                        .tint(.white)

                        Button {
                            stopScan()
                        } label: {
                            Label("Done", systemImage: "checkmark.circle.fill")
                                .fontWeight(.semibold)
                                .padding(.horizontal, 24)
                                .padding(.vertical, 14)
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(.orange)
                    }
                    .padding(.bottom, 48)
                }
            }

            // ── Reviewing phase ────────────────────────────────────────────
            if phase == .reviewing {
                reviewingView
            }

            // ── Uploading phase ────────────────────────────────────────────
            if phase == .uploading {
                VStack(spacing: 20) {
                    ProgressView()
                        .scaleEffect(1.5)
                    Text("Uploading scan…")
                        .font(.headline)
                    Text("This may take a moment")
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Color(.systemBackground))
            }

            // ── Done phase ─────────────────────────────────────────────────
            if phase == .done {
                VStack(spacing: 20) {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 64))
                        .foregroundStyle(.green)
                    Text("Scan uploaded!")
                        .font(.title2.bold())
                    Text("Your 3D model is now saved to this room.")
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                    Button("Close") { dismiss() }
                        .buttonStyle(.borderedProminent)
                        .tint(.orange)
                }
                .padding(40)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Color(.systemBackground))
            }
        }
        .alert("Error", isPresented: .constant(errorMessage != nil)) {
            Button("OK") { errorMessage = nil }
        } message: {
            Text(errorMessage ?? "")
        }
    }

    // ── Review view ────────────────────────────────────────────────────────

    @ViewBuilder
    var reviewingView: some View {
        VStack(spacing: 0) {
            // Quick model preview using SceneKit
            if let room = coordinator.capturedRoom {
                RoomPreviewScene(room: room)
                    .frame(maxWidth: .infinity)
                    .frame(height: 340)
                    .background(Color(UIColor.secondarySystemBackground))
            } else {
                Rectangle()
                    .fill(Color(UIColor.secondarySystemBackground))
                    .frame(height: 340)
                    .overlay {
                        ProgressView("Processing…")
                    }
            }

            VStack(spacing: 16) {
                Text("Review your scan")
                    .font(.title2.bold())

                if let room = coordinator.capturedRoom {
                    HStack(spacing: 24) {
                        StatBadge(value: "\(room.walls.count)", label: "Walls")
                        StatBadge(value: "\(room.doors.count)", label: "Doors")
                        StatBadge(value: "\(room.windows.count)", label: "Windows")
                        StatBadge(value: "\(room.objects.count)", label: "Objects")
                    }
                }

                Text("Does the scan look correct? If not, rescan the room.")
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)

                HStack(spacing: 16) {
                    Button("Rescan") {
                        phase = .scanning
                    }
                    .buttonStyle(.bordered)
                    .frame(maxWidth: .infinity)

                    Button("Save Scan") {
                        Task { await uploadScan() }
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.orange)
                    .frame(maxWidth: .infinity)
                }
            }
            .padding(24)
        }
    }

    // ── Control helpers ────────────────────────────────────────────────────

    private func stopAndDismiss() {
        if let view = captureView {
            coordinator.stopSession(captureView: view)
        }
        coordinator.isScanning = false
        dismiss()
    }

    private func uploadScan() async {
        phase = .uploading
        guard let usdzURL = await coordinator.exportUSDZ() else {
            errorMessage = "Could not export 3D model. Try scanning again."
            phase = .reviewing
            return
        }
        do {
            let data = try Data(contentsOf: usdzURL)
            _ = try await supabase.uploadRoomScan(
                roomId: room.id,
                usdzData: data,
                thumbnailData: nil
            )
            phase = .done
        } catch {
            errorMessage = error.localizedDescription
            phase = .reviewing
        }
    }
}

// MARK: - SceneKit Room Preview

struct RoomPreviewScene: UIViewRepresentable {
    let room: CapturedRoom

    func makeUIView(context: Context) -> SCNView {
        let sceneView = SCNView()
        sceneView.scene = buildScene()
        sceneView.allowsCameraControl = true
        sceneView.autoenablesDefaultLighting = true
        sceneView.backgroundColor = UIColor.secondarySystemBackground
        sceneView.antialiasingMode = .multisampling4X
        return sceneView
    }

    func updateUIView(_ uiView: SCNView, context: Context) {}

    private func buildScene() -> SCNScene {
        let scene = SCNScene()

        // Walls
        for wall in room.walls {
            let box = SCNBox(
                width: CGFloat(wall.dimensions.x),
                height: CGFloat(wall.dimensions.y),
                length: CGFloat(wall.dimensions.z),
                chamferRadius: 0
            )
            box.firstMaterial?.diffuse.contents = UIColor.systemBlue.withAlphaComponent(0.4)
            box.firstMaterial?.isDoubleSided = true
            let node = SCNNode(geometry: box)
            node.simdTransform = wall.transform
            scene.rootNode.addChildNode(node)
        }

        // Doors
        for door in room.doors {
            let box = SCNBox(
                width: CGFloat(door.dimensions.x),
                height: CGFloat(door.dimensions.y),
                length: CGFloat(door.dimensions.z),
                chamferRadius: 0
            )
            box.firstMaterial?.diffuse.contents = UIColor.systemBrown.withAlphaComponent(0.6)
            let node = SCNNode(geometry: box)
            node.simdTransform = door.transform
            scene.rootNode.addChildNode(node)
        }

        // Windows
        for window in room.windows {
            let box = SCNBox(
                width: CGFloat(window.dimensions.x),
                height: CGFloat(window.dimensions.y),
                length: CGFloat(window.dimensions.z),
                chamferRadius: 0
            )
            box.firstMaterial?.diffuse.contents = UIColor.systemCyan.withAlphaComponent(0.5)
            let node = SCNNode(geometry: box)
            node.simdTransform = window.transform
            scene.rootNode.addChildNode(node)
        }

        // Furniture / objects
        for obj in room.objects {
            let box = SCNBox(
                width: CGFloat(obj.dimensions.x),
                height: CGFloat(obj.dimensions.y),
                length: CGFloat(obj.dimensions.z),
                chamferRadius: 0.04
            )
            box.firstMaterial?.diffuse.contents = UIColor.systemOrange.withAlphaComponent(0.6)
            let node = SCNNode(geometry: box)
            node.simdTransform = obj.transform
            scene.rootNode.addChildNode(node)
        }

        // Floor
        let floor = SCNFloor()
        floor.firstMaterial?.diffuse.contents = UIColor.systemGray5
        floor.reflectivity = 0
        scene.rootNode.addChildNode(SCNNode(geometry: floor))

        return scene
    }
}

// MARK: - Helpers

struct StatBadge: View {
    let value: String
    let label: String

    var body: some View {
        VStack(spacing: 2) {
            Text(value)
                .font(.title3.bold())
                .foregroundStyle(.orange)
            Text(label)
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .frame(minWidth: 52)
        .padding(.vertical, 8)
        .background(Color(UIColor.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }
}
