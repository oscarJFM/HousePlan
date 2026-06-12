import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation, useParams } from "wouter";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { ArrowLeft, CheckCircle, Loader2, RotateCcw, Camera, Smartphone } from "lucide-react";

// 12 yaw sectors × 3 pitch levels = 36 total sectors
const YAW_SECTORS = 12;
const YAW_STEP = 360 / YAW_SECTORS; // 30° per sector

// Pitch levels: floor, horizon, ceiling
const PITCH_LEVELS = [-40, 0, 40] as const;
const PITCH_ZONE_HALF = 25; // ±25° around each pitch level counts as that zone

interface CapturedFrame {
  dataUrl: string;
  yaw: number;
  pitch: number;
}

// Sector key encodes both yaw bucket and pitch level index
function sectorKey(yawSector: number, pitchIdx: number) {
  return `${yawSector}_${pitchIdx}`;
}

function yawSectorFor(yaw: number) {
  return Math.floor(((yaw % 360) + 360) % 360 / YAW_STEP);
}

// Map a pitch value to its pitch level index (or null if between zones)
function pitchLevelFor(pitch: number): number | null {
  for (let i = 0; i < PITCH_LEVELS.length; i++) {
    if (Math.abs(pitch - PITCH_LEVELS[i]) <= PITCH_ZONE_HALF) return i;
  }
  return null;
}

export default function RoomScanPage() {
  const { id: roomId } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const orientRef = useRef({ yaw: 0, pitch: 0 });
  const capturedKeys = useRef<Set<string>>(new Set());

  const [phase, setPhase] = useState<"permission" | "scanning" | "uploading" | "done">("permission");
  const [frames, setFrames] = useState<CapturedFrame[]>([]);
  const [coveredKeys, setCoveredKeys] = useState<Set<string>>(new Set());
  const [currentYaw, setCurrentYaw] = useState(0);
  const [currentPitch, setCurrentPitch] = useState(0);
  const [hasOrientation, setHasOrientation] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  const captureFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !video.videoWidth) return null;

    const W = 640, H = Math.round(640 * (video.videoHeight / video.videoWidth));
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, W, H);
    return canvas.toDataURL("image/jpeg", 0.8);
  }, []);

  const tryAutoCapture = useCallback(() => {
    const { yaw, pitch } = orientRef.current;
    const ySector = yawSectorFor(yaw);
    const pIdx = pitchLevelFor(pitch);
    if (pIdx === null) return; // between zones — don't capture

    const key = sectorKey(ySector, pIdx);
    if (!capturedKeys.current.has(key)) {
      const dataUrl = captureFrame();
      if (dataUrl) {
        capturedKeys.current.add(key);
        setCoveredKeys((prev) => new Set([...prev, key]));
        setFrames((prev) => [...prev, { dataUrl, yaw, pitch: PITCH_LEVELS[pIdx] }]);
      }
    }
  }, [captureFrame]);

  useEffect(() => {
    if (phase !== "scanning") return;
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream) return;
    video.srcObject = stream;
    video.play().catch(() => {});
  }, [phase]);

  useEffect(() => {
    if (phase !== "scanning") return;

    const handleOrientation = (e: DeviceOrientationEvent) => {
      const yaw = e.alpha ?? 0;
      // e.beta: 0=flat, 90=upright portrait, >90=tilted back (ceiling), <90=tilted forward (floor)
      // Convert to pitch relative to horizon: 0=level, +40=looking up, -40=looking down
      const pitch = (e.beta ?? 90) - 90;
      orientRef.current = { yaw, pitch };
      setCurrentYaw(yaw);
      setCurrentPitch(pitch);
      setHasOrientation(true);
      tryAutoCapture();
    };

    window.addEventListener("deviceorientation", handleOrientation, true);
    return () => window.removeEventListener("deviceorientation", handleOrientation, true);
  }, [phase, tryAutoCapture]);

  async function requestPermissionsAndStart() {
    setCameraError(null);
    if (
      typeof (DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> })
        .requestPermission === "function"
    ) {
      try {
        const result = await (
          DeviceOrientationEvent as unknown as { requestPermission: () => Promise<string> }
        ).requestPermission();
        if (result !== "granted") {
          toast({
            title: "Motion access denied",
            description: "We need motion access to track scan direction.",
            variant: "destructive",
          });
        }
      } catch {
        // not needed on this device
      }
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      setPhase("scanning");
    } catch {
      setCameraError("Camera access denied. Please allow camera access and reload.");
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
  }

  async function finishScan() {
    if (frames.length === 0) {
      toast({ title: "No frames captured", description: "Move your phone around to scan the room first.", variant: "destructive" });
      return;
    }
    stopCamera();
    setPhase("uploading");

    await supabase.from("room_photos").delete().eq("room_id", roomId);

    let uploaded = 0;
    for (const frame of frames) {
      const blob = await (await fetch(frame.dataUrl)).blob();
      const filename = `frame_yaw${frame.yaw.toFixed(1)}_pitch${frame.pitch.toFixed(1)}_${Date.now()}.jpg`;
      const storagePath = `${user!.id}/${roomId}/${filename}`;

      const { error: storageErr } = await supabase.storage
        .from("room-photos")
        .upload(storagePath, blob, { contentType: "image/jpeg", upsert: true });

      if (!storageErr) {
        await supabase.from("room_photos").insert({
          room_id: roomId,
          user_id: user!.id,
          storage_path: storagePath,
        });
      }

      uploaded++;
      setUploadProgress(Math.round((uploaded / frames.length) * 100));
    }

    setPhase("done");
    setTimeout(() => setLocation(`/rooms/${roomId}`), 1500);
  }

  function manualCapture() {
    const dataUrl = captureFrame();
    if (!dataUrl) return;
    const { yaw, pitch } = orientRef.current;
    const ySector = yawSectorFor(yaw);
    // For manual capture, snap pitch to nearest level
    const levels = PITCH_LEVELS as readonly number[];
    const pIdx = levels.reduce((best, lvl, i) =>
      Math.abs(pitch - lvl) < Math.abs(pitch - levels[best]!) ? i : best, 0);
    const key = sectorKey(ySector, pIdx);
    capturedKeys.current.add(key);
    setCoveredKeys((prev) => new Set([...prev, key]));
    setFrames((prev) => [...prev, { dataUrl, yaw, pitch: PITCH_LEVELS[pIdx] }]);
  }

  const totalSectors = YAW_SECTORS * PITCH_LEVELS.length;
  const coveragePercent = Math.round((coveredKeys.size / totalSectors) * 100);
  const allCovered = coveredKeys.size >= totalSectors;

  // Per-pitch coverage for guidance
  const coveredByLevel = PITCH_LEVELS.map((_, i) =>
    Array.from({ length: YAW_SECTORS }, (__, j) => coveredKeys.has(sectorKey(j, i))).filter(Boolean).length
  );

  function guideText() {
    if (!hasOrientation) return "Move your phone slowly to scan the room";
    if (allCovered) return "✅ Full scan complete — tap Done";
    const pIdx = pitchLevelFor(currentPitch);
    if (pIdx === null) {
      // between zones — suggest where to go
      if (currentPitch < -PITCH_ZONE_HALF) return "⬆️ Tilt phone up — scanning floor level";
      if (currentPitch > PITCH_ZONE_HALF) return "⬇️ Tilt phone down — scanning ceiling level";
      return "Point phone at horizon level";
    }
    const levelName = ["floor", "horizon", "ceiling"][pIdx];
    const levelCovered = coveredByLevel[pIdx];
    if (levelCovered < YAW_SECTORS) return `Rotate slowly — scanning ${levelName} (${levelCovered}/${YAW_SECTORS})`;
    // current level done, suggest next
    if (coveredByLevel[0] < YAW_SECTORS) return "⬇️ Tilt down to scan the floor";
    if (coveredByLevel[2] < YAW_SECTORS) return "⬆️ Tilt up to scan the ceiling";
    return "Rotate to cover remaining angles";
  }

  return (
    <div className="min-h-screen bg-black flex flex-col">
      <header className="flex items-center justify-between px-4 py-3 z-20 relative">
        <Button
          variant="ghost" size="sm" className="text-white hover:bg-white/20"
          onClick={() => { stopCamera(); setLocation(`/rooms/${roomId}`); }}
          data-testid="button-back"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <div className="text-white text-sm font-medium">Room Scan</div>
        <div className="w-16" />
      </header>

      {phase === "permission" && (
        <div className="flex-1 flex flex-col items-center justify-center px-8 gap-6 text-center">
          <div className="bg-primary/10 rounded-full p-6">
            <Smartphone className="h-12 w-12 text-primary" />
          </div>
          <div>
            <h2 className="text-white text-xl font-bold mb-2">Scan your room</h2>
            <p className="text-white/60 text-sm">
              Hold up your phone and slowly rotate 360° around the room — once pointing
              forward, once tilted up to the ceiling, and once tilted down to the floor.
              The app captures all angles to build a complete 3D panorama.
            </p>
          </div>
          {cameraError && (
            <p className="text-red-400 text-sm bg-red-950/40 rounded-lg px-4 py-2">{cameraError}</p>
          )}
          <Button onClick={requestPermissionsAndStart} size="lg" className="gap-2" data-testid="button-start-scan">
            <Camera className="h-5 w-5" />
            Start scanning
          </Button>
        </div>
      )}

      {phase === "scanning" && (
        <>
          <div className="flex-1 relative min-h-0" style={{ minHeight: "calc(100dvh - 56px)" }}>
            <video
              ref={videoRef}
              autoPlay playsInline muted
              {...{ "webkit-playsinline": "true" } as React.VideoHTMLAttributes<HTMLVideoElement>}
              className="absolute inset-0 w-full h-full object-cover"
              data-testid="video-camera"
            />

            <div className="absolute inset-0 flex flex-col items-center">
              <div className="mt-4 bg-black/60 backdrop-blur-sm rounded-full px-4 py-2 text-white text-sm text-center max-w-[300px]">
                {guideText()}
              </div>

              <div className="mt-4">
                <ScanRadar
                  coveredKeys={coveredKeys}
                  yawSectors={YAW_SECTORS}
                  currentYaw={currentYaw}
                  currentPitch={currentPitch}
                />
              </div>

              <div className="mt-2 text-white/70 text-xs">
                {coveragePercent}% covered · {frames.length} frames
              </div>

              {/* Pitch level indicators */}
              <div className="mt-2 flex gap-3">
                {["Floor", "Horizon", "Ceiling"].map((label, i) => (
                  <div key={i} className="flex flex-col items-center gap-0.5">
                    <div className={`text-xs px-2 py-0.5 rounded-full ${
                      coveredByLevel[i] >= YAW_SECTORS
                        ? "bg-green-500/80 text-white"
                        : coveredByLevel[i] > 0
                        ? "bg-amber-500/80 text-white"
                        : "bg-white/10 text-white/40"
                    }`}>
                      {label}
                    </div>
                    <span className="text-white/40 text-[10px]">{coveredByLevel[i]}/{YAW_SECTORS}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="absolute bottom-8 inset-x-0 flex items-center justify-center gap-6">
              <Button variant="secondary" onClick={manualCapture}
                className="rounded-full h-12 w-12 p-0" data-testid="button-manual-capture" title="Manual capture">
                <Camera className="h-5 w-5" />
              </Button>
              <button
                onClick={finishScan}
                data-testid="button-done-scan"
                className="w-16 h-16 rounded-full bg-primary shadow-lg flex items-center justify-center text-primary-foreground font-semibold text-sm hover:bg-primary/90 active:scale-95 transition-transform"
              >
                Done
              </button>
              <Button variant="secondary"
                onClick={() => { setFrames([]); setCoveredKeys(new Set()); capturedKeys.current.clear(); }}
                className="rounded-full h-12 w-12 p-0" data-testid="button-reset-scan" title="Reset scan">
                <RotateCcw className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </>
      )}

      {phase === "uploading" && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <Loader2 className="h-10 w-10 text-primary animate-spin" />
          <p className="text-white font-medium">Building your panorama…</p>
          <div className="w-48 bg-white/20 rounded-full h-2 overflow-hidden">
            <div className="h-full bg-primary rounded-full transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
          </div>
          <p className="text-white/50 text-sm">{uploadProgress}% uploaded</p>
        </div>
      )}

      {phase === "done" && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <CheckCircle className="h-12 w-12 text-green-400" />
          <p className="text-white font-medium text-lg">Scan complete!</p>
          <p className="text-white/60 text-sm">Redirecting to your room…</p>
        </div>
      )}

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}

// ── Radial scan progress indicator (3 rings = floor / horizon / ceiling) ──
function ScanRadar({
  coveredKeys,
  yawSectors,
  currentYaw,
  currentPitch,
}: {
  coveredKeys: Set<string>;
  yawSectors: number;
  currentYaw: number;
  currentPitch: number;
}) {
  const size = 140;
  const cx = size / 2;
  const cy = size / 2;
  const sectorAngle = (2 * Math.PI) / yawSectors;

  // 3 rings: outer=floor (idx 0), middle=horizon (idx 1), inner=ceiling (idx 2)
  const rings = [
    { pitchIdx: 0, r: 62, innerR: 44, color: "#3b82f6" },   // floor — blue
    { pitchIdx: 1, r: 42, innerR: 28, color: "#f59e0b" },   // horizon — amber
    { pitchIdx: 2, r: 26, innerR: 12, color: "#10b981" },   // ceiling — green
  ];

  const currentPitchIdx = pitchLevelFor(currentPitch);

  return (
    <svg width={size} height={size} className="drop-shadow-lg">
      <circle cx={cx} cy={cy} r={64} fill="rgba(0,0,0,0.5)" stroke="rgba(255,255,255,0.15)" strokeWidth={1} />

      {rings.map(({ pitchIdx, r, innerR, color }) =>
        Array.from({ length: yawSectors }, (_, i) => {
          const startAngle = i * sectorAngle - Math.PI / 2;
          const endAngle = startAngle + sectorAngle - 0.04;
          const covered = coveredKeys.has(sectorKey(i, pitchIdx));

          // Outer arc
          const ox1 = cx + r * Math.cos(startAngle);
          const oy1 = cy + r * Math.sin(startAngle);
          const ox2 = cx + r * Math.cos(endAngle);
          const oy2 = cy + r * Math.sin(endAngle);
          // Inner arc (reversed for donut segment)
          const ix1 = cx + innerR * Math.cos(endAngle);
          const iy1 = cy + innerR * Math.sin(endAngle);
          const ix2 = cx + innerR * Math.cos(startAngle);
          const iy2 = cy + innerR * Math.sin(startAngle);

          return (
            <path
              key={`${pitchIdx}_${i}`}
              d={`M ${ox1} ${oy1} A ${r} ${r} 0 0 1 ${ox2} ${oy2} L ${ix1} ${iy1} A ${innerR} ${innerR} 0 0 0 ${ix2} ${iy2} Z`}
              fill={covered ? color : "rgba(255,255,255,0.06)"}
              stroke="rgba(0,0,0,0.4)"
              strokeWidth={0.5}
              opacity={covered ? (currentPitchIdx === pitchIdx ? 1 : 0.7) : 1}
            />
          );
        })
      )}

      {/* Current direction needle */}
      {(() => {
        const angle = ((currentYaw - 90) * Math.PI) / 180;
        const needleR = currentPitchIdx !== null ? rings[currentPitchIdx].r : 30;
        return (
          <line
            x1={cx} y1={cy}
            x2={cx + (needleR - 4) * Math.cos(angle)}
            y2={cy + (needleR - 4) * Math.sin(angle)}
            stroke="white" strokeWidth={2} strokeLinecap="round"
          />
        );
      })()}

      <circle cx={cx} cy={cy} r={4} fill="white" />
      <text x={cx} y={cy + 4} textAnchor="middle" fill="white" fontSize={7} opacity={0.6} dominantBaseline="middle">
        N
      </text>
    </svg>
  );
}
