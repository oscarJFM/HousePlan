import { Suspense, useEffect, useRef, useState, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Html } from "@react-three/drei";
import * as THREE from "three";
import type { RoomItem } from "@/lib/supabase";
import { ITEM_TYPES } from "@/lib/supabase";

export interface PanoFrame {
  url: string;
  yaw: number;   // degrees 0-360
  pitch: number; // degrees, 0 = horizon, +40 = ceiling, -40 = floor
}

export interface LabelPin {
  id: string;
  name: string;
  itemType: string;
  x: number;
  y: number;
  z: number;
}

interface PanoramaViewerProps {
  frames: PanoFrame[];
  items: RoomItem[];
  onPlaceLabel?: (x: number, y: number, z: number) => void;
  placingMode?: boolean;
}

const SPHERE_RADIUS = 10;

// ──────────────────────────────────────────────────────────────────
// THREE.SphereGeometry phi/theta conventions:
//   phi   = azimuthal (horizontal), 0 at +Z, increasing CCW viewed from above
//   theta = polar (vertical), 0 at +Y (top), PI at -Y (bottom)
//
// Our yaw/pitch convention:
//   yaw=0   → +Z,  yaw=90 → +X   (same as THREE phi but offset)
//   pitch=0 → horizon,  pitch>0 → up,  pitch<0 → down
//
// Mapping:
//   phi   = PI/2 + yaw * PI/180      (verified below)
//   theta = PI/2 - pitch * PI/180
//
// Proof: yaw=0, pitch=0 → phi=PI/2, theta=PI/2
//   x = -r * cos(phi) * sin(theta) = -r * cos(PI/2) * 1 = 0
//   y =  r * cos(theta)             = r * cos(PI/2)     = 0
//   z =  r * sin(phi) * sin(theta)  = r * sin(PI/2) * 1 = r  ✓ (+Z at yaw=0)
//
// We use side=BackSide so the texture faces inward (viewer is at centre).
// ──────────────────────────────────────────────────────────────────

// Half-FOVs for each frame patch — generous overlap for seamless coverage
const HALF_FOV_H = 22; // degrees horizontal
const HALF_FOV_V = 28; // degrees vertical

function yawPitchToSpherePos(yawDeg: number, pitchDeg: number, r = SPHERE_RADIUS) {
  const phi   = Math.PI / 2 + (yawDeg * Math.PI) / 180;
  const theta = Math.PI / 2 - (pitchDeg * Math.PI) / 180;
  return new THREE.Vector3(
    -r * Math.cos(phi) * Math.sin(theta),
     r * Math.cos(theta),
     r * Math.sin(phi) * Math.sin(theta)
  );
}

// A single camera frame projected as a spherical patch on the inside of the sphere
function FrameMesh({ frame }: { frame: PanoFrame }) {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    const loader = new THREE.TextureLoader();
    loader.load(frame.url, (t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      setTexture(t);
    });
  }, [frame.url]);

  // Build a spherical patch geometry covering the frame's angular extent.
  // phiStart / phiLength control horizontal extent.
  // thetaStart / thetaLength control vertical extent.
  const geometry = useMemo(() => {
    const phiStart  = Math.PI / 2 + ((frame.yaw - HALF_FOV_H) * Math.PI) / 180;
    const phiLength = (2 * HALF_FOV_H * Math.PI) / 180;

    const thetaCenter = Math.PI / 2 - (frame.pitch * Math.PI) / 180;
    const thetaStart  = thetaCenter - (HALF_FOV_V * Math.PI) / 180;
    const thetaLength = (2 * HALF_FOV_V * Math.PI) / 180;

    return new THREE.SphereGeometry(
      SPHERE_RADIUS,
      24,   // width segments — enough for smooth curve
      16,   // height segments
      phiStart,
      phiLength,
      thetaStart,
      thetaLength
    );
  }, [frame.yaw, frame.pitch]);

  if (!texture) return null;

  return (
    <mesh geometry={geometry}>
      <meshBasicMaterial
        map={texture}
        side={THREE.BackSide}
        depthWrite={false}
      />
    </mesh>
  );
}

// Dark sphere interior — visible where frames don't reach
function BackgroundSphere() {
  return (
    <mesh>
      <sphereGeometry args={[SPHERE_RADIUS, 32, 32]} />
      <meshBasicMaterial color="#111122" side={THREE.BackSide} />
    </mesh>
  );
}

// Amber pin for a labelled item
function ItemPin({ item }: { item: RoomItem }) {
  const [hovered, setHovered] = useState(false);

  const pos = useMemo(() => {
    let z = 0;
    if (item.notes) {
      try {
        const match = item.notes.match(/^__pz:([-\d.]+)__/);
        if (match) z = parseFloat(match[1]);
      } catch { /* ignore */ }
    }
    return new THREE.Vector3(item.position_x, item.position_y, z);
  }, [item]);

  const typeLabel = ITEM_TYPES.find((t) => t.value === item.item_type)?.label ?? item.item_type;

  return (
    <group position={pos}>
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

      {hovered && (
        <Html distanceFactor={10} center>
          <div className="bg-card border rounded-lg shadow-xl p-2.5 text-xs min-w-[140px] pointer-events-none">
            <p className="font-semibold text-foreground">{item.name}</p>
            <p className="text-muted-foreground">{typeLabel}</p>
            {item.brand && (
              <p className="text-muted-foreground">
                {item.brand}{item.model ? ` · ${item.model}` : ""}
              </p>
            )}
            {item.color && <p className="text-muted-foreground">Colour: {item.color}</p>}
          </div>
        </Html>
      )}
    </group>
  );
}

// Invisible sphere used for click-to-place
function ClickSphere({ onPlace }: { onPlace: (x: number, y: number, z: number) => void }) {
  return (
    <mesh onClick={(e) => { e.stopPropagation(); onPlace(e.point.x, e.point.y, e.point.z); }}>
      <sphereGeometry args={[SPHERE_RADIUS - 0.1, 32, 32]} />
      <meshBasicMaterial transparent opacity={0.001} side={THREE.BackSide} />
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

      {/* Render frames back-to-front by pitch so floor/ceiling don't clip horizon */}
      {[...frames]
        .sort((a, b) => Math.abs(b.pitch) - Math.abs(a.pitch))
        .map((f, i) => (
          <FrameMesh key={i} frame={f} />
        ))}

      {items.map((item) => (
        <ItemPin key={item.id} item={item} />
      ))}

      {placingMode && <ClickSphere onPlace={onPlace} />}
    </>
  );
}

export default function PanoramaViewer({
  frames,
  items,
  onPlaceLabel,
  placingMode = false,
}: PanoramaViewerProps) {
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
          gl={{ logarithmicDepthBuffer: true }}
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
