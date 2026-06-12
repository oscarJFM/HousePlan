import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation, useParams } from "wouter";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { ArrowLeft, CheckCircle, Loader2, RotateCcw, Camera, Smartphone } from "lucide-react";

const CAPTURE_SECTORS = 12; // capture every 30° of yaw
const SPHERE_RADIUS = 360 / CAPTURE_SECTORS;

interface CapturedFrame {
  dataUrl: string;
  yaw: number;
  pitch: number;
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
  const lastCapturedYaw = useRef<Set<number>>(new Set());

  const [phase, setPhase] = useState<"permission" | "scanning" | "uploading" | "done">("permission");
  const [frames, setFrames] = useState<CapturedFrame[]>([]);
  const [coveredSectors, setCoveredSectors] = useState<Set<number>>(new Set());
  const [currentYaw, setCurrentYaw] = useState(0);
  const [hasOrientation, setHasOrientation] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  const sectorFor = (yaw: number) =>
    Math.floor(((yaw % 360) + 360) % 360 / SPHERE_RADIUS);

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
    const sector = sectorFor(yaw);
    if (!lastCapturedYaw.current.has(sector)) {
      const dataUrl = captureFrame();
      if (dataUrl) {
        lastCapturedYaw.current.add(sector);
        setCoveredSectors((prev) => new Set([...prev, sector]));
        setFrames((prev) => [...prev, { dataUrl, yaw, pitch }]);
      }
    }
  }, [captureFrame]);

  // Attach the camera stream to the video element once the scanning phase mounts it.
  useEffect(() => {
    if (phase !== "scanning") return;
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream) return;
    video.srcObject = stream;
    video.play().catch(() => {
      // autoplay may be blocked; user gesture will trigger play
    });
  }, [phase]);

  useEffect(() => {
    if (phase !== "scanning") return;

    const handleOrientation = (e: DeviceOrientationEvent) => {
      const yaw = e.alpha ?? 0;
      const pitch = e.beta ?? 0;
      orientRef.current = { yaw, pitch };
      setCurrentYaw(yaw);
      setHasOrientation(true);
      tryAutoCapture();
    };

    window.addEventListener("deviceorientation", handleOrientation, true);
    return () => window.removeEventListener("deviceorientation", handleOrientation, true);
  }, [phase, tryAutoCapture]);

  async function requestPermissionsAndStart() {
    setCameraError(null);
    // iOS 13+ requires explicit permission for device orientation
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
        // permission not needed on this device
      }
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      streamRef.current = stream;
      // Don't assign srcObject here — the video element doesn't exist yet.
      // A useEffect fires after the "scanning" phase re-render mounts it.
      setPhase("scanning");
    } catch (err) {
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

    // Delete old scan frames for this room
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
    setTimeout(() => {
      setLocation(`/rooms/${roomId}`);
    }, 1500);
  }

  function manualCapture() {
    const dataUrl = captureFrame();
    if (!dataUrl) return;
    const { yaw, pitch } = orientRef.current;
    const sector = sectorFor(yaw);
    lastCapturedYaw.current.add(sector);
    setCoveredSectors((prev) => new Set([...prev, sector]));
    setFrames((prev) => [...prev, { dataUrl, yaw, pitch }]);
  }

  const coveragePercent = Math.round((coveredSectors.size / CAPTURE_SECTORS) * 100);
  const allCovered = coveredSectors.size >= CAPTURE_SECTORS;

  return (
    <div className="min-h-screen bg-black flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 z-20 relative">
        <Button
          variant="ghost"
          size="sm"
          className="text-white hover:bg-white/20"
          onClick={() => { stopCamera(); setLocation(`/rooms/${roomId}`); }}
          data-testid="button-back"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <div className="text-white text-sm font-medium">Room Scan</div>
        <div className="w-16" />
      </header>

      {/* PHASE: Permission */}
      {phase === "permission" && (
        <div className="flex-1 flex flex-col items-center justify-center px-8 gap-6 text-center">
          <div className="bg-primary/10 rounded-full p-6">
            <Smartphone className="h-12 w-12 text-primary" />
          </div>
          <div>
            <h2 className="text-white text-xl font-bold mb-2">Scan your room</h2>
            <p className="text-white/60 text-sm">
              Hold up your phone and slowly rotate 360° around the room.
              The app will automatically capture frames and build a 3D panorama
              you can label.
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

      {/* PHASE: Scanning */}
      {phase === "scanning" && (
        <>
          <div className="flex-1 relative min-h-0" style={{ minHeight: "calc(100dvh - 56px)" }}>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              {...{ "webkit-playsinline": "true" } as React.VideoHTMLAttributes<HTMLVideoElement>}
              className="absolute inset-0 w-full h-full object-cover"
              data-testid="video-camera"
            />

            {/* Scan overlay */}
            <div className="absolute inset-0 flex flex-col items-center">
              {/* Top guide */}
              <div className="mt-4 bg-black/60 backdrop-blur-sm rounded-full px-4 py-2 text-white text-sm text-center max-w-[280px]">
                {allCovered
                  ? "✅ Full scan complete — tap Done"
                  : hasOrientation
                  ? "Rotate slowly to cover the whole room"
                  : "Move your phone slowly to scan the room"}
              </div>

              {/* Radial coverage indicator */}
              <div className="mt-4">
                <ScanRadar
                  coveredSectors={coveredSectors}
                  totalSectors={CAPTURE_SECTORS}
                  currentYaw={currentYaw}
                />
              </div>

              <div className="mt-2 text-white/70 text-xs">{coveragePercent}% covered · {frames.length} frames</div>
            </div>

            {/* Bottom controls */}
            <div className="absolute bottom-8 inset-x-0 flex items-center justify-center gap-6">
              <Button
                variant="secondary"
                onClick={manualCapture}
                className="rounded-full h-12 w-12 p-0"
                data-testid="button-manual-capture"
                title="Manual capture"
              >
                <Camera className="h-5 w-5" />
              </Button>
              <button
                onClick={finishScan}
                data-testid="button-done-scan"
                className="w-16 h-16 rounded-full bg-primary shadow-lg flex items-center justify-center text-primary-foreground font-semibold text-sm hover:bg-primary/90 active:scale-95 transition-transform"
              >
                Done
              </button>
              <Button
                variant="secondary"
                onClick={() => {
                  setFrames([]);
                  setCoveredSectors(new Set());
                  lastCapturedYaw.current.clear();
                }}
                className="rounded-full h-12 w-12 p-0"
                data-testid="button-reset-scan"
                title="Reset scan"
              >
                <RotateCcw className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </>
      )}

      {/* PHASE: Uploading */}
      {phase === "uploading" && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <Loader2 className="h-10 w-10 text-primary animate-spin" />
          <p className="text-white font-medium">Building your panorama…</p>
          <div className="w-48 bg-white/20 rounded-full h-2 overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-300"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
          <p className="text-white/50 text-sm">{uploadProgress}% uploaded</p>
        </div>
      )}

      {/* PHASE: Done */}
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

// ── Radial scan progress indicator ──────────────────────────────
function ScanRadar({
  coveredSectors,
  totalSectors,
  currentYaw,
}: {
  coveredSectors: Set<number>;
  totalSectors: number;
  currentYaw: number;
}) {
  const size = 120;
  const cx = size / 2;
  const cy = size / 2;
  const r = 50;

  const sectorAngle = (2 * Math.PI) / totalSectors;

  return (
    <svg width={size} height={size} className="drop-shadow-lg">
      {/* Background circle */}
      <circle cx={cx} cy={cy} r={r} fill="rgba(0,0,0,0.5)" stroke="rgba(255,255,255,0.2)" strokeWidth={1} />

      {/* Covered sectors */}
      {Array.from({ length: totalSectors }, (_, i) => {
        const startAngle = i * sectorAngle - Math.PI / 2;
        const endAngle = startAngle + sectorAngle;
        const x1 = cx + r * Math.cos(startAngle);
        const y1 = cy + r * Math.sin(startAngle);
        const x2 = cx + r * Math.cos(endAngle);
        const y2 = cy + r * Math.sin(endAngle);
        const covered = coveredSectors.has(i);

        return (
          <path
            key={i}
            d={`M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2} Z`}
            fill={covered ? "rgba(245,158,11,0.7)" : "rgba(255,255,255,0.05)"}
            stroke="rgba(0,0,0,0.3)"
            strokeWidth={1}
          />
        );
      })}

      {/* Current direction needle */}
      {(() => {
        const angle = ((currentYaw - 90) * Math.PI) / 180;
        return (
          <line
            x1={cx}
            y1={cy}
            x2={cx + (r - 5) * Math.cos(angle)}
            y2={cy + (r - 5) * Math.sin(angle)}
            stroke="white"
            strokeWidth={2}
            strokeLinecap="round"
          />
        );
      })()}

      {/* Center dot */}
      <circle cx={cx} cy={cy} r={4} fill="white" />
      <text x={cx} y={cy + 22} textAnchor="middle" fill="white" fontSize={9} opacity={0.7}>
        N
      </text>
    </svg>
  );
}
