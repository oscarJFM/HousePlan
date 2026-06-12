import { Suspense, useEffect, useRef, useState, useMemo } from "react";
import { Canvas, useThree, useFrame } from "@react-three/fiber";
import { OrbitControls, Html } from "@react-three/drei";
import * as THREE from "three";
import type { RoomItem } from "@/lib/supabase";
import { ITEM_TYPES } from "@/lib/supabase";

export interface PanoFrame {
  url: string;
  yaw: number;   // degrees 0-360
  pitch: number; // degrees, 0 = horizon
}

export interface LabelPin {
  id: string;
  name: string;
  itemType: string;
  x: number;   // sphere x
  y: number;   // sphere y
  z: number;   // sphere z
}

interface PanoramaViewerProps {
  frames: PanoFrame[];
  items: RoomItem[];
  onPlaceLabel?: (x: number, y: number, z: number) => void;
  placingMode?: boolean;
}

const SPHERE_RADIUS = 8;

// Convert yaw/pitch degrees to XYZ on sphere surface
function yawPitchToXYZ(yawDeg: number, pitchDeg: number, r = SPHERE_RADIUS) {
  const yaw = (yawDeg * Math.PI) / 180;
  const pitch = (pitchDeg * Math.PI) / 180;
  return new THREE.Vector3(
    r * Math.cos(pitch) * Math.sin(yaw),
    r * Math.sin(pitch),
    r * Math.cos(pitch) * Math.cos(yaw)
  );
}

// A single frame projected onto the sphere interior
function FrameMesh({ frame }: { frame: PanoFrame }) {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    const loader = new THREE.TextureLoader();
    loader.load(frame.url, (t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      setTexture(t);
    });
  }, [frame.url]);

  const position = useMemo(
    () => yawPitchToXYZ(frame.yaw, frame.pitch, SPHERE_RADIUS - 0.01),
    [frame.yaw, frame.pitch]
  );

  const ref = useRef<THREE.Mesh>(null);

  useEffect(() => {
    if (!ref.current) return;
    ref.current.lookAt(0, 0, 0);
    ref.current.rotateY(Math.PI); // flip to face inward
  }, []);

  if (!texture) return null;

  // Approximate coverage: ~60° horizontal, ~40° vertical
  const w = 2 * SPHERE_RADIUS * Math.tan((30 * Math.PI) / 180) * 1.1;
  const h = w * (texture.image?.naturalHeight / (texture.image?.naturalWidth || 1) || 0.75);

  return (
    <mesh ref={ref} position={position}>
      <planeGeometry args={[w, h]} />
      <meshBasicMaterial map={texture} side={THREE.FrontSide} />
    </mesh>
  );
}

// Interior sphere (base tint when frames don't cover everything)
function BackgroundSphere() {
  return (
    <mesh>
      <sphereGeometry args={[SPHERE_RADIUS, 32, 32]} />
      <meshBasicMaterial color="#1a1a2e" side={THREE.BackSide} />
    </mesh>
  );
}

// Item label pin
function ItemPin({ item }: { item: RoomItem }) {
  const [hovered, setHovered] = useState(false);
  const position = new THREE.Vector3(item.position_x, item.position_y, 0);

  // Reconstruct sphere position from stored yaw/pitch if available
  // position_x = sphere X, position_y = sphere Y, we also store Z
  // For items placed in panorama, position_x/y/z are sphere coords
  const pos = useMemo(() => {
    // Check if item has a z_position stored in notes as JSON
    let z = 0;
    if (item.notes) {
      try {
        const meta = JSON.parse(item.notes);
        if (meta._pz !== undefined) z = meta._pz;
      } catch { /* not JSON */ }
    }
    return new THREE.Vector3(item.position_x, item.position_y, z);
  }, [item]);

  const typeLabel = ITEM_TYPES.find((t) => t.value === item.item_type)?.label ?? item.item_type;

  return (
    <group position={pos}>
      {/* Pin sphere */}
      <mesh
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
      >
        <sphereGeometry args={[0.18, 16, 16]} />
        <meshStandardMaterial
          color={hovered ? "#fbbf24" : "#f59e0b"}
          emissive={hovered ? "#f59e0b" : "#92400e"}
          emissiveIntensity={0.5}
        />
      </mesh>

      {/* Label popup */}
      {hovered && (
        <Html distanceFactor={10} center>
          <div className="bg-card border rounded-lg shadow-xl p-2.5 text-xs min-w-[140px] pointer-events-none">
            <p className="font-semibold text-foreground">{item.name}</p>
            <p className="text-muted-foreground">{typeLabel}</p>
            {item.brand && <p className="text-muted-foreground">{item.brand}{item.model ? ` · ${item.model}` : ""}</p>}
            {item.color && <p className="text-muted-foreground">Colour: {item.color}</p>}
          </div>
        </Html>
      )}
    </group>
  );
}

// Click plane for label placement
function ClickSphere({ onPlace }: { onPlace: (x: number, y: number, z: number) => void }) {
  return (
    <mesh onClick={(e) => { e.stopPropagation(); onPlace(e.point.x, e.point.y, e.point.z); }}>
      <sphereGeometry args={[SPHERE_RADIUS - 0.1, 32, 32]} />
      <meshBasicMaterial color="white" opacity={0.001} transparent side={THREE.BackSide} />
    </mesh>
  );
}

function PanoScene({
  frames,
  items,
  placingMode,
  onPlace,
}: {
  frames: PanoFrame[];
  items: RoomItem[];
  placingMode: boolean;
  onPlace: (x: number, y: number, z: number) => void;
}) {
  return (
    <>
      <ambientLight intensity={1.5} />

      <OrbitControls
        makeDefault
        enablePan={false}
        rotateSpeed={-0.5}
        minDistance={0.5}
        maxDistance={SPHERE_RADIUS - 1}
        enableDamping
        dampingFactor={0.08}
      />

      <BackgroundSphere />

      {frames.map((f, i) => (
        <FrameMesh key={i} frame={f} />
      ))}

      {items.map((item) => (
        <ItemPin key={item.id} item={item} />
      ))}

      {placingMode && <ClickSphere onPlace={onPlace} />}
    </>
  );
}

export default function PanoramaViewer({ frames, items, onPlaceLabel, placingMode = false }: PanoramaViewerProps) {
  return (
    <div className="relative w-full h-full rounded-xl overflow-hidden border bg-slate-900">
      {placingMode && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 bg-primary text-primary-foreground text-xs px-3 py-1.5 rounded-full shadow whitespace-nowrap">
          Click on any surface to place a label
        </div>
      )}

      {frames.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center z-10 text-white/40 text-sm">
          No panorama scanned yet
        </div>
      )}

      <Suspense
        fallback={
          <div className="flex items-center justify-center h-full text-white/40 text-sm">
            Loading panorama…
          </div>
        }
      >
        <Canvas
          camera={{ position: [0, 0, 0.1], fov: 75 }}
          style={{ cursor: placingMode ? "crosshair" : "grab" }}
        >
          <PanoScene
            frames={frames}
            items={items}
            placingMode={placingMode}
            onPlace={(x, y, z) => onPlaceLabel?.(x, y, z)}
          />
        </Canvas>
      </Suspense>

      <div className="absolute bottom-3 left-3 text-xs text-white/40 bg-black/40 rounded px-2 py-1 backdrop-blur-sm">
        Drag to look around · Scroll to zoom
      </div>

      {items.length > 0 && (
        <div className="absolute bottom-3 right-3 text-xs text-white/40 bg-black/40 rounded px-2 py-1 backdrop-blur-sm">
          {items.length} label{items.length !== 1 ? "s" : ""}
        </div>
      )}
    </div>
  );
}
