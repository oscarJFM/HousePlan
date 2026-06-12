import { useRef, useState, Suspense } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, Text, Html } from "@react-three/drei";
import * as THREE from "three";
import type { RoomItem } from "@/lib/supabase";
import { ITEM_TYPES } from "@/lib/supabase";

interface RoomViewerProps {
  items: RoomItem[];
  onAddItem?: (x: number, y: number) => void;
  placingMode?: boolean;
}

function FloorMarker({
  item,
  onClick,
}: {
  item: RoomItem;
  onClick: (item: RoomItem) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const typeLabel = ITEM_TYPES.find((t) => t.value === item.item_type)?.label ?? item.item_type;

  return (
    <group
      position={[item.position_x, 0.05, item.position_y]}
      onClick={(e) => { e.stopPropagation(); onClick(item); }}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      <mesh>
        <cylinderGeometry args={[0.18, 0.18, 0.08, 16]} />
        <meshStandardMaterial
          color={hovered ? "#f59e0b" : "#d97706"}
          emissive={hovered ? "#f59e0b" : "#92400e"}
          emissiveIntensity={hovered ? 0.6 : 0.3}
        />
      </mesh>
      <mesh position={[0, 0.3, 0]}>
        <cylinderGeometry args={[0.02, 0.02, 0.5, 8]} />
        <meshStandardMaterial color="#d97706" />
      </mesh>
      {hovered && (
        <Html position={[0, 0.8, 0]} center distanceFactor={6}>
          <div className="bg-card border rounded-lg shadow-lg p-2 text-xs min-w-[120px] pointer-events-none">
            <p className="font-medium text-foreground">{item.name}</p>
            <p className="text-muted-foreground">{typeLabel}</p>
            {item.model && <p className="text-muted-foreground">{item.model}</p>}
          </div>
        </Html>
      )}
    </group>
  );
}

function FloorClickPlane({ onPlace }: { onPlace: (x: number, z: number) => void }) {
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, 0, 0]}
      onClick={(e) => {
        e.stopPropagation();
        onPlace(e.point.x, e.point.z);
      }}
    >
      <planeGeometry args={[8, 6]} />
      <meshStandardMaterial color="#e2d9c8" opacity={0.01} transparent />
    </mesh>
  );
}

function RoomScene({
  items,
  placingMode,
  onPlace,
  onItemClick,
}: {
  items: RoomItem[];
  placingMode: boolean;
  onPlace: (x: number, z: number) => void;
  onItemClick: (item: RoomItem) => void;
}) {
  return (
    <>
      <ambientLight intensity={0.6} />
      <pointLight position={[0, 2.5, 0]} intensity={1.5} castShadow />
      <pointLight position={[3, 2, 2]} intensity={0.4} color="#fde68a" />

      <OrbitControls
        makeDefault
        minDistance={1}
        maxDistance={12}
        maxPolarAngle={Math.PI * 0.85}
      />

      {/* Room box — viewer is inside, BackSide so inner walls visible */}
      <mesh>
        <boxGeometry args={[8, 3, 6]} />
        <meshStandardMaterial color="#f0ebe0" side={THREE.BackSide} />
      </mesh>

      {/* Floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.49, 0]}>
        <planeGeometry args={[8, 6]} />
        <meshStandardMaterial color="#e2d9c8" />
      </mesh>

      {/* Floor grid lines */}
      <gridHelper args={[8, 8, "#c9bfad", "#c9bfad"]} position={[0, -1.48, 0]} />

      {/* Item markers */}
      {items.map((item) => (
        <FloorMarker key={item.id} item={item} onClick={onItemClick} />
      ))}

      {/* Invisible click plane for placing items */}
      {placingMode && <FloorClickPlane onPlace={onPlace} />}
    </>
  );
}

function ErrorFallback() {
  return (
    <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
      3D view not available on this device.
    </div>
  );
}

export default function RoomViewer({ items, onAddItem, placingMode = false }: RoomViewerProps) {
  const [selectedItem, setSelectedItem] = useState<RoomItem | null>(null);

  function handlePlace(x: number, z: number) {
    if (onAddItem) onAddItem(x, z);
  }

  return (
    <div className="relative w-full h-full rounded-xl overflow-hidden border bg-muted">
      {placingMode && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 bg-primary text-primary-foreground text-xs px-3 py-1.5 rounded-full shadow">
          Click on the floor to place an item marker
        </div>
      )}

      {selectedItem && (
        <div className="absolute top-3 right-3 z-10 bg-card border rounded-lg shadow-lg p-3 text-sm max-w-[200px]">
          <p className="font-semibold">{selectedItem.name}</p>
          <p className="text-muted-foreground text-xs">
            {ITEM_TYPES.find((t) => t.value === selectedItem.item_type)?.label}
          </p>
          {selectedItem.brand && <p className="text-xs text-muted-foreground">{selectedItem.brand}</p>}
          {selectedItem.model && <p className="text-xs text-muted-foreground">{selectedItem.model}</p>}
          {selectedItem.color && (
            <div className="flex items-center gap-1.5 mt-1">
              <span className="text-xs text-muted-foreground">Colour:</span>
              <span className="text-xs">{selectedItem.color}</span>
            </div>
          )}
          <button
            className="text-xs text-muted-foreground mt-2 hover:text-foreground"
            onClick={() => setSelectedItem(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      <Suspense
        fallback={
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            Loading 3D view...
          </div>
        }
      >
        <Canvas
          camera={{ position: [0, 2, 5], fov: 65 }}
          style={{ cursor: placingMode ? "crosshair" : "grab" }}
        >
          <RoomScene
            items={items}
            placingMode={placingMode}
            onPlace={handlePlace}
            onItemClick={setSelectedItem}
          />
        </Canvas>
      </Suspense>

      <div className="absolute bottom-3 left-3 text-xs text-muted-foreground bg-card/80 rounded px-2 py-1 backdrop-blur-sm">
        Drag to orbit  ·  Scroll to zoom
      </div>
    </div>
  );
}
