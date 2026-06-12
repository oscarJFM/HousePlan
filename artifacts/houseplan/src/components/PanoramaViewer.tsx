import { Suspense, useEffect, useState, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Html } from "@react-three/drei";
import * as THREE from "three";
import type { RoomItem } from "@/lib/supabase";
import { ITEM_TYPES } from "@/lib/supabase";

export interface PanoFrame {
  url: string;
  yaw: number;   // degrees 0–360, compass heading when captured
  pitch: number; // degrees: 0=horizon, +40=ceiling, -40=floor
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

// ──────────────────────────────────────────────────────────────────────────
// Equirectangular stitching
//
// Strategy: project all captured frames onto a single equirectangular canvas,
// then apply that as a texture to the inside of a sphere.  This is exactly
// how Google Street View / 360° photo viewers work.
//
// Equirectangular coordinate system:
//   u ∈ [0, 1]  →  yaw  0° … 360°   (left → right)
//   v ∈ [0, 1]  →  pitch +90° … -90° (top → bottom)
//
// Each captured frame is a perspective (rectilinear) photo.  We approximate
// its footprint on the equirectangular canvas as a simple rectangle — a good
// approximation at moderate FOV (< 80°).
//
// The canvas is 4096 × 2048 px.  We draw floor/ceiling frames first, then
// horizon frames on top so overlap edges are clean.
//
// THREE.SphereGeometry with side=BackSide applies the texture as-is when
// viewed from the interior — no extra mirroring needed because THREE's UV
// mapping for a full sphere naturally reads the texture right-to-left when
// seen from inside, which corresponds to the panorama going the right
// direction as you rotate the camera.
// ──────────────────────────────────────────────────────────────────────────

const EQUIRECT_W = 4096;
const EQUIRECT_H = 2048;

// Approximate horizontal FOV of a phone rear camera.
// 65° is a good middle-ground for most modern phones.
const CAMERA_HFOV_DEG = 65;

function buildEquirectCanvas(frames: PanoFrame[]): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = EQUIRECT_W;
  canvas.height = EQUIRECT_H;
  return canvas;
}

// Load images, then stitch onto canvas and return a promise of the result.
async function stitchFrames(frames: PanoFrame[]): Promise<THREE.CanvasTexture> {
  const canvas = buildEquirectCanvas(frames);
  const ctx = canvas.getContext("2d")!;

  // Dark background for uncovered areas
  ctx.fillStyle = "#111122";
  ctx.fillRect(0, 0, EQUIRECT_W, EQUIRECT_H);

  // Load all images in parallel
  const loaded = await Promise.all(
    frames.map((frame) =>
      new Promise<{ frame: PanoFrame; img: HTMLImageElement } | null>((resolve) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => resolve({ frame, img });
        img.onerror = () => resolve(null);
        img.src = frame.url;
      })
    )
  );

  const valid = loaded.filter(
    (r): r is { frame: PanoFrame; img: HTMLImageElement } => r !== null
  );

  // Draw floor & ceiling frames first, then horizon — so horizon edges look crisp
  const sorted = [...valid].sort(
    (a, b) => Math.abs(b.frame.pitch) - Math.abs(a.frame.pitch)
  );

  for (const { frame, img } of sorted) {
    const aspect = img.naturalWidth / img.naturalHeight || 4 / 3;

    // Width of this frame on the equirect canvas (in pixels)
    const frameW = (CAMERA_HFOV_DEG / 360) * EQUIRECT_W;
    // Height derived from the image's actual aspect ratio
    const frameH = frameW / aspect;

    // Center position in equirectangular space:
    //   cx: yaw=0 → left edge, yaw=360 → right edge
    //   cy: pitch=+90 → top,   pitch=-90 → bottom
    const cx = (frame.yaw / 360) * EQUIRECT_W;
    const cy = (0.5 - frame.pitch / 180) * EQUIRECT_H;

    const x = cx - frameW / 2;
    const y = cy - frameH / 2;

    ctx.drawImage(img, x, y, frameW, frameH);

    // Handle wrap-around at the 0° / 360° seam
    if (x < 0) {
      ctx.drawImage(img, x + EQUIRECT_W, y, frameW, frameH);
    }
    if (x + frameW > EQUIRECT_W) {
      ctx.drawImage(img, x - EQUIRECT_W, y, frameW, frameH);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  // Flip horizontally so the panorama reads in the correct direction
  // when viewed from inside the sphere (BackSide material).
  texture.wrapS = THREE.RepeatWrapping;
  texture.repeat.set(-1, 1);
  texture.offset.set(1, 0);
  return texture;
}

// ── Hook: stitch frames into an equirect texture whenever frames change ──
function useEquirectTexture(frames: PanoFrame[]) {
  const [texture, setTexture] = useState<THREE.CanvasTexture | null>(null);
  const [stitching, setStitching] = useState(false);

  const frameKey = useMemo(
    () => frames.map((f) => `${f.url}:${f.yaw}:${f.pitch}`).join("|"),
    [frames]
  );

  useEffect(() => {
    if (frames.length === 0) {
      setTexture(null);
      return;
    }
    let cancelled = false;
    setStitching(true);
    stitchFrames(frames).then((t) => {
      if (!cancelled) {
        setTexture((old) => { old?.dispose(); return t; });
        setStitching(false);
      } else {
        t.dispose();
      }
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameKey]);

  return { texture, stitching };
}

// ── Interior panorama sphere ─────────────────────────────────────────────
function PanoSphere({ texture }: { texture: THREE.CanvasTexture | null }) {
  if (!texture) return null;
  return (
    <mesh>
      <sphereGeometry args={[SPHERE_RADIUS, 64, 32]} />
      <meshBasicMaterial map={texture} side={THREE.BackSide} />
    </mesh>
  );
}

// Dark fallback sphere shown while stitching or when there are no frames
function BackgroundSphere() {
  return (
    <mesh>
      <sphereGeometry args={[SPHERE_RADIUS, 32, 16]} />
      <meshBasicMaterial color="#111122" side={THREE.BackSide} />
    </mesh>
  );
}

// ── Label pin ────────────────────────────────────────────────────────────
function ItemPin({ item }: { item: RoomItem }) {
  const [hovered, setHovered] = useState(false);

  const pos = useMemo(() => {
    let z = 0;
    if (item.notes) {
      const match = item.notes.match(/^__pz:([-\d.]+)__/);
      if (match) z = parseFloat(match[1]);
    }
    return new THREE.Vector3(item.position_x, item.position_y, z);
  }, [item]);

  const typeLabel =
    ITEM_TYPES.find((t) => t.value === item.item_type)?.label ?? item.item_type;

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
                {item.brand}
                {item.model ? ` · ${item.model}` : ""}
              </p>
            )}
            {item.color && (
              <p className="text-muted-foreground">Colour: {item.color}</p>
            )}
          </div>
        </Html>
      )}
    </group>
  );
}

// Invisible click-sphere for label placement
function ClickSphere({
  onPlace,
}: {
  onPlace: (x: number, y: number, z: number) => void;
}) {
  return (
    <mesh
      onClick={(e) => {
        e.stopPropagation();
        onPlace(e.point.x, e.point.y, e.point.z);
      }}
    >
      <sphereGeometry args={[SPHERE_RADIUS - 0.05, 32, 32]} />
      <meshBasicMaterial transparent opacity={0.001} side={THREE.BackSide} />
    </mesh>
  );
}

// ── Scene ─────────────────────────────────────────────────────────────────
function PanoScene({
  texture,
  items,
  placingMode,
  onPlace,
}: {
  texture: THREE.CanvasTexture | null;
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
        minDistance={0.3}
        maxDistance={SPHERE_RADIUS - 0.5}
        enableDamping
        dampingFactor={0.08}
      />
      <BackgroundSphere />
      <PanoSphere texture={texture} />
      {items.map((item) => (
        <ItemPin key={item.id} item={item} />
      ))}
      {placingMode && <ClickSphere onPlace={onPlace} />}
    </>
  );
}

// ── Public component ──────────────────────────────────────────────────────
export default function PanoramaViewer({
  frames,
  items,
  onPlaceLabel,
  placingMode = false,
}: PanoramaViewerProps) {
  const { texture, stitching } = useEquirectTexture(frames);

  return (
    <div className="relative w-full h-full rounded-xl overflow-hidden border bg-slate-900">
      {placingMode && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 bg-primary text-primary-foreground text-xs px-3 py-1.5 rounded-full shadow whitespace-nowrap">
          Click on any surface to place a label
        </div>
      )}

      {stitching && (
        <div className="absolute top-3 right-3 z-10 bg-black/60 text-white/70 text-xs px-3 py-1.5 rounded-full backdrop-blur-sm">
          Building panorama…
        </div>
      )}

      {frames.length === 0 && !stitching && (
        <div className="absolute inset-0 flex items-center justify-center z-10 text-white/40 text-sm">
          No panorama scanned yet
        </div>
      )}

      <Suspense
        fallback={
          <div className="flex items-center justify-center h-full text-white/40 text-sm">
            Loading…
          </div>
        }
      >
        <Canvas
          camera={{ position: [0, 0, 0.1], fov: 75 }}
          style={{ cursor: placingMode ? "crosshair" : "grab" }}
        >
          <PanoScene
            texture={texture}
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
