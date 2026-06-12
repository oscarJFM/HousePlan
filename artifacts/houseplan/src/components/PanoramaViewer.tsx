import { Suspense, useEffect, useRef, useState, useMemo } from "react";
import { Canvas, useThree, useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import type { RoomItem } from "@/lib/supabase";
import { ITEM_TYPES } from "@/lib/supabase";

export interface PanoFrame {
  url: string;
  yaw: number;   // degrees 0–360
  pitch: number; // degrees: 0=horizon, positive=up, negative=down
}

interface PanoramaViewerProps {
  frames: PanoFrame[];
  items: RoomItem[];
  onPlaceLabel?: (x: number, y: number, z: number) => void;
  placingMode?: boolean;
}

const SPHERE_R = 10;
const EQUIRECT_W = 2048;
const EQUIRECT_H = 1024;
const CAM_HFOV = 65; // approximate phone camera horizontal FOV in degrees

// ─────────────────────────────────────────────────────────────────────────────
// Equirectangular stitching
//
// Each frame is drawn onto a 2048×1024 canvas at its (yaw, pitch) position.
// CORS fix: use fetch() → blob → createImageBitmap() instead of new Image().
// This avoids canvas taint from previously cached cross-origin image URLs.
// ─────────────────────────────────────────────────────────────────────────────

async function stitchToEquirect(frames: PanoFrame[]): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  canvas.width = EQUIRECT_W;
  canvas.height = EQUIRECT_H;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#111122";
  ctx.fillRect(0, 0, EQUIRECT_W, EQUIRECT_H);

  // Sort: extreme pitches first, horizon last (so horizon seams are cleanest)
  const sorted = [...frames].sort(
    (a, b) => Math.abs(b.pitch) - Math.abs(a.pitch)
  );

  for (const frame of sorted) {
    try {
      // fetch → blob → ImageBitmap avoids the CORS canvas-taint problem
      const res = await fetch(frame.url);
      if (!res.ok) continue;
      const blob = await res.blob();
      const bmp = await createImageBitmap(blob);

      const aspect = bmp.width / bmp.height || 4 / 3;
      const fw = (CAM_HFOV / 360) * EQUIRECT_W;
      const fh = fw / aspect;

      // Equirect: u = yaw/360, v = 0.5 – pitch/180
      const cx = (frame.yaw / 360) * EQUIRECT_W;
      const cy = (0.5 - frame.pitch / 180) * EQUIRECT_H;
      const x = cx - fw / 2;
      const y = cy - fh / 2;

      ctx.drawImage(bmp, x, y, fw, fh);
      // Handle 0°/360° seam wrap-around
      if (x < 0) ctx.drawImage(bmp, x + EQUIRECT_W, y, fw, fh);
      if (x + fw > EQUIRECT_W) ctx.drawImage(bmp, x - EQUIRECT_W, y, fw, fh);

      bmp.close();
    } catch {
      // skip frames that fail to fetch
    }
  }

  return canvas;
}

function useEquirectTexture(frames: PanoFrame[]) {
  const [texture, setTexture] = useState<THREE.CanvasTexture | null>(null);
  const [stitching, setStitching] = useState(false);

  const key = useMemo(
    () => frames.map((f) => `${f.yaw}:${f.pitch}:${f.url.slice(-20)}`).join("|"),
    [frames]
  );

  useEffect(() => {
    if (!frames.length) { setTexture(null); return; }
    let cancelled = false;
    setStitching(true);

    stitchToEquirect(frames).then((canvas) => {
      if (cancelled) return;
      const t = new THREE.CanvasTexture(canvas);
      t.colorSpace = THREE.SRGBColorSpace;
      // Flip horizontally: BackSide sphere reverses the U direction,
      // so we pre-flip the texture to keep the panorama the right way round.
      t.wrapS = THREE.RepeatWrapping;
      t.repeat.set(-1, 1);
      t.offset.set(1, 0);
      setTexture((old) => { old?.dispose(); return t; });
      setStitching(false);
    });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { texture, stitching };
}

// ─────────────────────────────────────────────────────────────────────────────
// Look controls – drag to rotate the camera (pointer-lock style)
// We manage this ourselves so we can also handle movement freely.
// ─────────────────────────────────────────────────────────────────────────────

function LookControls() {
  const { camera, gl } = useThree();
  const dragging = useRef(false);
  const last = useRef({ x: 0, y: 0 });
  const euler = useRef(new THREE.Euler(0, 0, 0, "YXZ"));

  useEffect(() => {
    const canvas = gl.domElement;

    const onDown = (e: PointerEvent) => {
      dragging.current = true;
      last.current = { x: e.clientX, y: e.clientY };
      canvas.setPointerCapture(e.pointerId);
    };
    const onUp = () => { dragging.current = false; };
    const onMove = (e: PointerEvent) => {
      if (!dragging.current) return;
      const dx = e.clientX - last.current.x;
      const dy = e.clientY - last.current.y;
      last.current = { x: e.clientX, y: e.clientY };

      euler.current.setFromQuaternion(camera.quaternion);
      euler.current.y -= dx * 0.003;
      euler.current.x -= dy * 0.003;
      euler.current.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, euler.current.x));
      camera.quaternion.setFromEuler(euler.current);
    };

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointermove", onMove);
    return () => {
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointermove", onMove);
    };
  }, [camera, gl]);

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Movement controls – WASD / arrow keys + on-screen joystick vector
// ─────────────────────────────────────────────────────────────────────────────

interface MoveInput {
  forward: number;  // -1..1
  strafe: number;   // -1..1
}

function MovementControls({ inputRef }: { inputRef: React.RefObject<MoveInput> }) {
  const { camera } = useThree();
  const keys = useRef<Set<string>>(new Set());

  useEffect(() => {
    const down = (e: KeyboardEvent) => keys.current.add(e.code);
    const up = (e: KeyboardEvent) => keys.current.delete(e.code);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  useFrame((_, dt) => {
    const SPEED = 3;
    let fwd = inputRef.current?.forward ?? 0;
    let str = inputRef.current?.strafe ?? 0;

    if (keys.current.has("KeyW") || keys.current.has("ArrowUp")) fwd += 1;
    if (keys.current.has("KeyS") || keys.current.has("ArrowDown")) fwd -= 1;
    if (keys.current.has("KeyA") || keys.current.has("ArrowLeft")) str -= 1;
    if (keys.current.has("KeyD") || keys.current.has("ArrowRight")) str += 1;

    if (!fwd && !str) return;

    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    dir.y = 0;
    if (dir.lengthSq() < 0.0001) return;
    dir.normalize();

    const right = new THREE.Vector3()
      .crossVectors(dir, new THREE.Vector3(0, 1, 0))
      .normalize();

    camera.position.addScaledVector(dir, fwd * SPEED * dt);
    camera.position.addScaledVector(right, str * SPEED * dt);

    // Stay inside the sphere
    const maxR = SPHERE_R - 1.2;
    if (camera.position.length() > maxR)
      camera.position.normalize().multiplyScalar(maxR);
  });

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// On-screen movement joystick (8-direction D-pad style)
// ─────────────────────────────────────────────────────────────────────────────

function DPad({ inputRef }: { inputRef: React.RefObject<MoveInput> }) {
  const set = (f: number, s: number) => {
    if (inputRef.current) {
      inputRef.current.forward = f;
      inputRef.current.strafe = s;
    }
  };

  const btn =
    "w-10 h-10 rounded-lg bg-black/50 border border-white/20 backdrop-blur-sm flex items-center justify-center text-white/80 text-lg select-none active:bg-white/20 cursor-pointer";

  return (
    <div className="absolute bottom-14 right-3 z-10 grid grid-cols-3 gap-1">
      <div />
      <button
        className={btn}
        onPointerDown={() => set(1, 0)}
        onPointerUp={() => set(0, 0)}
        onPointerLeave={() => set(0, 0)}
      >▲</button>
      <div />
      <button
        className={btn}
        onPointerDown={() => set(0, -1)}
        onPointerUp={() => set(0, 0)}
        onPointerLeave={() => set(0, 0)}
      >◀</button>
      <button
        className={btn}
        onPointerDown={() => set(-1, 0)}
        onPointerUp={() => set(0, 0)}
        onPointerLeave={() => set(0, 0)}
      >▼</button>
      <button
        className={btn}
        onPointerDown={() => set(0, 1)}
        onPointerUp={() => set(0, 0)}
        onPointerLeave={() => set(0, 0)}
      >▶</button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Panorama sphere + labels
// ─────────────────────────────────────────────────────────────────────────────

function PanoSphere({ texture }: { texture: THREE.CanvasTexture | null }) {
  if (!texture) return null;
  return (
    <mesh>
      <sphereGeometry args={[SPHERE_R, 64, 32]} />
      <meshBasicMaterial map={texture} side={THREE.BackSide} />
    </mesh>
  );
}

function BackgroundSphere() {
  return (
    <mesh>
      <sphereGeometry args={[SPHERE_R, 32, 16]} />
      <meshBasicMaterial color="#111122" side={THREE.BackSide} />
    </mesh>
  );
}

function ItemPin({ item }: { item: RoomItem }) {
  const [hovered, setHovered] = useState(false);
  const pos = useMemo(() => {
    let z = 0;
    if (item.notes) {
      const m = item.notes.match(/^__pz:([-\d.]+)__/);
      if (m) z = parseFloat(m[1]);
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
                {item.brand}{item.model ? ` · ${item.model}` : ""}
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
      <sphereGeometry args={[SPHERE_R - 0.05, 32, 32]} />
      <meshBasicMaterial transparent opacity={0.001} side={THREE.BackSide} />
    </mesh>
  );
}

function Scene({
  texture,
  items,
  placingMode,
  onPlace,
  moveInput,
}: {
  texture: THREE.CanvasTexture | null;
  items: RoomItem[];
  placingMode: boolean;
  onPlace: (x: number, y: number, z: number) => void;
  moveInput: React.RefObject<MoveInput>;
}) {
  return (
    <>
      <ambientLight intensity={1.5} />
      <LookControls />
      <MovementControls inputRef={moveInput} />
      <BackgroundSphere />
      <PanoSphere texture={texture} />
      {items.map((item) => (
        <ItemPin key={item.id} item={item} />
      ))}
      {placingMode && <ClickSphere onPlace={onPlace} />}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Public component
// ─────────────────────────────────────────────────────────────────────────────

export default function PanoramaViewer({
  frames,
  items,
  onPlaceLabel,
  placingMode = false,
}: PanoramaViewerProps) {
  const { texture, stitching } = useEquirectTexture(frames);
  const moveInput = useRef<MoveInput>({ forward: 0, strafe: 0 });

  return (
    <div className="relative w-full h-full rounded-xl overflow-hidden border bg-slate-900">
      {placingMode && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 bg-primary text-primary-foreground text-xs px-3 py-1.5 rounded-full shadow whitespace-nowrap pointer-events-none">
          Click any surface to place a label
        </div>
      )}

      {stitching && (
        <div className="absolute top-3 right-3 z-10 bg-black/60 text-white/70 text-xs px-3 py-1.5 rounded-full backdrop-blur-sm pointer-events-none">
          Stitching panorama…
        </div>
      )}

      {frames.length === 0 && !stitching && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-10 gap-2">
          <p className="text-white/40 text-sm">No panorama scanned yet</p>
        </div>
      )}

      <Suspense fallback={<div className="flex items-center justify-center h-full text-white/40 text-sm">Loading…</div>}>
        <Canvas
          camera={{ position: [0, 0, 0.01], fov: 75 }}
          style={{ cursor: placingMode ? "crosshair" : "grab" }}
        >
          <Scene
            texture={texture}
            items={items}
            placingMode={placingMode}
            onPlace={(x, y, z) => onPlaceLabel?.(x, y, z)}
            moveInput={moveInput}
          />
        </Canvas>
      </Suspense>

      {/* Movement D-pad */}
      {frames.length > 0 && <DPad inputRef={moveInput} />}

      {/* Controls hint */}
      <div className="absolute bottom-3 left-3 text-xs text-white/40 bg-black/40 rounded px-2 py-1 backdrop-blur-sm pointer-events-none">
        Drag to look · WASD / ▲▼◀▶ to move
      </div>

      {items.length > 0 && (
        <div className="absolute bottom-3 right-16 text-xs text-white/40 bg-black/40 rounded px-2 py-1 backdrop-blur-sm pointer-events-none">
          {items.length} label{items.length !== 1 ? "s" : ""}
        </div>
      )}
    </div>
  );
}
