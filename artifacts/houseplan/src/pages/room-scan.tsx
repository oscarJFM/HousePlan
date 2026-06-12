import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation, useParams } from "wouter";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { ArrowLeft, CheckCircle, Loader2, RotateCcw, Camera, Smartphone } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Trnio-style continuous capture
//
// Instead of waiting for the user to cover specific sectors, we simply capture
// a frame every CAPTURE_INTERVAL_MS while the camera is moving (gyroscope has
// changed more than MIN_MOVE_DEG since the last capture).  Overlapping frames
// are fine — more frames = better coverage.  The equirectangular stitcher in
// PanoramaViewer handles blending.
// ─────────────────────────────────────────────────────────────────────────────

const CAPTURE_INTERVAL_MS = 400; // max one frame every 400 ms
const MIN_MOVE_DEG = 8;          // only capture if camera moved ≥ 8° from last capture
const MAX_FRAMES = 120;          // safety cap

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
  const lastCapture = useRef({ yaw: -999, pitch: -999, time: 0 });

  const [phase, setPhase] = useState<"permission" | "scanning" | "uploading" | "done">("permission");
  const [frames, setFrames] = useState<CapturedFrame[]>([]);
  const [hasOrientation, setHasOrientation] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Heatmap: 36 cells (12 yaw × 3 pitch) to show coverage visually
  const [heatmap, setHeatmap] = useState<Map<string, number>>(new Map());

  function heatKey(yaw: number, pitch: number) {
    const y = Math.floor(((yaw % 360) + 360) % 360 / 30); // 0-11
    const p = pitch > 20 ? 2 : pitch < -20 ? 0 : 1;       // floor/horizon/ceiling
    return `${y}_${p}`;
  }

  const captureFrame = useCallback((): string | null => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !video.videoWidth) return null;
    const W = 640;
    const H = Math.round(W * (video.videoHeight / video.videoWidth));
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, W, H);
    return canvas.toDataURL("image/jpeg", 0.82);
  }, []);

  const tryCapture = useCallback(() => {
    if (frames.length >= MAX_FRAMES) return;
    const now = Date.now();
    if (now - lastCapture.current.time < CAPTURE_INTERVAL_MS) return;

    const { yaw, pitch } = orientRef.current;
    const dy = Math.abs(yaw - lastCapture.current.yaw) % 360;
    const dp = Math.abs(pitch - lastCapture.current.pitch);
    const moved = Math.min(dy, 360 - dy) + dp;
    if (moved < MIN_MOVE_DEG && lastCapture.current.time > 0) return;

    const dataUrl = captureFrame();
    if (!dataUrl) return;

    lastCapture.current = { yaw, pitch, time: now };
    setFrames((prev) => [...prev, { dataUrl, yaw, pitch }]);
    setHeatmap((prev) => {
      const k = heatKey(yaw, pitch);
      return new Map(prev).set(k, (prev.get(k) ?? 0) + 1);
    });
  }, [captureFrame, frames.length]);

  // Attach camera to video element once scanning starts
  useEffect(() => {
    if (phase !== "scanning") return;
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream) return;
    video.srcObject = stream;
    video.play().catch(() => {});
  }, [phase]);

  // Orientation listener
  useEffect(() => {
    if (phase !== "scanning") return;
    const onOrientation = (e: DeviceOrientationEvent) => {
      const yaw = e.alpha ?? 0;
      const pitch = (e.beta ?? 90) - 90; // 0 = level, +40 = up, -40 = down
      orientRef.current = { yaw, pitch };
      setHasOrientation(true);
      tryCapture();
    };
    window.addEventListener("deviceorientation", onOrientation, true);
    return () => window.removeEventListener("deviceorientation", onOrientation, true);
  }, [phase, tryCapture]);

  async function requestPermissionsAndStart() {
    setCameraError(null);
    // iOS 13+ needs explicit orientation permission
    const DOE = DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<string>;
    };
    if (typeof DOE.requestPermission === "function") {
      try {
        const res = await DOE.requestPermission();
        if (res !== "granted") {
          toast({ title: "Motion access denied", description: "We need motion access to guide the scan.", variant: "destructive" });
        }
      } catch { /* not needed on this device */ }
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      setPhase("scanning");
    } catch {
      setCameraError("Camera access denied — please allow camera access and reload.");
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
  }

  function handleManualCapture() {
    const { yaw, pitch } = orientRef.current;
    const dataUrl = captureFrame();
    if (!dataUrl) return;
    lastCapture.current = { yaw, pitch, time: Date.now() };
    setFrames((prev) => [...prev, { dataUrl, yaw, pitch }]);
    setHeatmap((prev) => {
      const k = heatKey(yaw, pitch);
      return new Map(prev).set(k, (prev.get(k) ?? 0) + 1);
    });
  }

  async function finishScan() {
    if (frames.length === 0) {
      toast({ title: "No frames captured", description: "Move your phone around to scan the room first.", variant: "destructive" });
      return;
    }
    stopCamera();
    setPhase("uploading");

    // Delete previous scan frames for this room
    await supabase.from("room_photos").delete().eq("room_id", roomId);

    let uploaded = 0;
    for (const frame of frames) {
      const blob = await (await fetch(frame.dataUrl)).blob();
      const filename = `frame_yaw${frame.yaw.toFixed(1)}_pitch${frame.pitch.toFixed(1)}_${Date.now()}.jpg`;
      const storagePath = `${user!.id}/${roomId}/${filename}`;
      const { error } = await supabase.storage
        .from("room-photos")
        .upload(storagePath, blob, { contentType: "image/jpeg", upsert: true });
      if (!error) {
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

  function resetScan() {
    setFrames([]);
    setHeatmap(new Map());
    lastCapture.current = { yaw: -999, pitch: -999, time: 0 };
  }

  // Coverage stats
  const coveredCells = heatmap.size;
  const totalCells = 36;
  const coveragePct = Math.round((coveredCells / totalCells) * 100);

  return (
    <div className="min-h-screen bg-black flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 z-20 relative">
        <Button
          variant="ghost" size="sm" className="text-white hover:bg-white/20"
          onClick={() => { stopCamera(); setLocation(`/rooms/${roomId}`); }}
          data-testid="button-back"
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <div className="text-white text-sm font-medium">Room Scan</div>
        <div className="w-16" />
      </header>

      {/* PERMISSION */}
      {phase === "permission" && (
        <div className="flex-1 flex flex-col items-center justify-center px-8 gap-6 text-center">
          <div className="bg-primary/10 rounded-full p-6">
            <Smartphone className="h-12 w-12 text-primary" />
          </div>
          <div>
            <h2 className="text-white text-xl font-bold mb-2">Scan your room</h2>
            <p className="text-white/60 text-sm leading-relaxed">
              Hold your phone up and slowly pan it around the entire room —
              walls, floor, ceiling. Move continuously and overlap areas
              you've already scanned for better quality.
            </p>
          </div>
          {cameraError && (
            <p className="text-red-400 text-sm bg-red-950/40 rounded-lg px-4 py-2">{cameraError}</p>
          )}
          <Button onClick={requestPermissionsAndStart} size="lg" className="gap-2" data-testid="button-start-scan">
            <Camera className="h-5 w-5" /> Start scanning
          </Button>
        </div>
      )}

      {/* SCANNING */}
      {phase === "scanning" && (
        <div className="flex-1 relative min-h-0" style={{ minHeight: "calc(100dvh - 56px)" }}>
          <video
            ref={videoRef}
            autoPlay playsInline muted
            {...{ "webkit-playsinline": "true" } as React.VideoHTMLAttributes<HTMLVideoElement>}
            className="absolute inset-0 w-full h-full object-cover"
            data-testid="video-camera"
          />

          <div className="absolute inset-0 flex flex-col items-center pointer-events-none">
            {/* Guide pill */}
            <div className="mt-4 bg-black/60 backdrop-blur-sm rounded-full px-4 py-2 text-white text-sm text-center max-w-[300px]">
              {!hasOrientation
                ? "Move your phone to scan the room"
                : frames.length === 0
                ? "Scanning… move slowly around the room"
                : `${frames.length} frames captured · ${coveragePct}% coverage`}
            </div>

            {/* Coverage grid */}
            <div className="mt-4">
              <CoverageGrid heatmap={heatmap} />
            </div>

            {/* Pitch level pills */}
            <div className="mt-2 flex gap-2">
              {["Floor", "Horizon", "Ceiling"].map((lbl, i) => {
                const count = Array.from({ length: 12 }, (_, j) =>
                  (heatmap.get(`${j}_${i}`) ?? 0) > 0 ? 1 : 0
                ).reduce((a, b) => a + b, 0);
                return (
                  <div key={i} className={`text-[11px] px-2.5 py-1 rounded-full ${
                    count >= 10 ? "bg-green-500/80 text-white"
                    : count > 0 ? "bg-amber-500/80 text-white"
                    : "bg-white/10 text-white/40"
                  }`}>
                    {lbl} {count}/12
                  </div>
                );
              })}
            </div>
          </div>

          {/* Bottom controls */}
          <div className="absolute bottom-8 inset-x-0 flex items-center justify-center gap-6">
            <Button
              variant="secondary" onClick={handleManualCapture}
              className="rounded-full h-12 w-12 p-0 pointer-events-auto"
              data-testid="button-manual-capture" title="Force capture"
            >
              <Camera className="h-5 w-5" />
            </Button>
            <button
              onClick={finishScan}
              data-testid="button-done-scan"
              className="w-16 h-16 rounded-full bg-primary shadow-lg flex items-center justify-center text-primary-foreground font-semibold text-sm hover:bg-primary/90 active:scale-95 transition-transform pointer-events-auto"
            >
              Done
            </button>
            <Button
              variant="secondary" onClick={resetScan}
              className="rounded-full h-12 w-12 p-0 pointer-events-auto"
              data-testid="button-reset-scan" title="Reset scan"
            >
              <RotateCcw className="h-5 w-5" />
            </Button>
          </div>
        </div>
      )}

      {/* UPLOADING */}
      {phase === "uploading" && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <Loader2 className="h-10 w-10 text-primary animate-spin" />
          <p className="text-white font-medium">Uploading {frames.length} frames…</p>
          <div className="w-48 bg-white/20 rounded-full h-2 overflow-hidden">
            <div className="h-full bg-primary rounded-full transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
          </div>
          <p className="text-white/50 text-sm">{uploadProgress}%</p>
        </div>
      )}

      {/* DONE */}
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

// ─────────────────────────────────────────────────────────────────────────────
// Coverage grid visualisation (12 cols × 3 rows = floor / horizon / ceiling)
// ─────────────────────────────────────────────────────────────────────────────

function CoverageGrid({ heatmap }: { heatmap: Map<string, number> }) {
  const rows = [
    { label: "Ceiling", idx: 2 },
    { label: "Horizon", idx: 1 },
    { label: "Floor",   idx: 0 },
  ];
  const maxCount = Math.max(1, ...Array.from(heatmap.values()));

  return (
    <div className="flex flex-col gap-0.5">
      {rows.map(({ label, idx }) => (
        <div key={idx} className="flex items-center gap-1">
          <span className="text-[9px] text-white/40 w-12 text-right pr-1">{label}</span>
          <div className="flex gap-0.5">
            {Array.from({ length: 12 }, (_, col) => {
              const count = heatmap.get(`${col}_${idx}`) ?? 0;
              const intensity = count / maxCount;
              return (
                <div
                  key={col}
                  className="w-5 h-5 rounded-sm"
                  style={{
                    backgroundColor: count === 0
                      ? "rgba(255,255,255,0.07)"
                      : `rgba(${idx === 2 ? "16,185,129" : idx === 1 ? "245,158,11" : "59,130,246"},${0.3 + intensity * 0.7})`,
                  }}
                />
              );
            })}
          </div>
        </div>
      ))}
      <div className="flex items-center gap-1 mt-0.5">
        <span className="w-12" />
        <div className="flex gap-0.5">
          {Array.from({ length: 12 }, (_, i) => (
            <div key={i} className="w-5 text-[8px] text-white/20 text-center">
              {i * 30}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
