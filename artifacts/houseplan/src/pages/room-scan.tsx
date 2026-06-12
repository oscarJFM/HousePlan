import { useState, useRef, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Camera, RotateCcw, Check, Loader2, ImageIcon } from "lucide-react";

export default function RoomScanPage() {
  const { id: roomId } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [phase, setPhase] = useState<"camera" | "preview" | "saved">("camera");
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [photoCount, setPhotoCount] = useState(0);
  const [saving, setSaving] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  useEffect(() => {
    loadPhotoCount();
    startCamera();
    return () => stopCamera();
  }, []);

  async function loadPhotoCount() {
    const { count } = await supabase
      .from("room_photos")
      .select("id", { count: "exact", head: true })
      .eq("room_id", roomId);
    setPhotoCount(count ?? 0);
  }

  async function startCamera() {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      setCameraError(
        "Camera access denied. Please allow camera access and try again."
      );
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
  }

  function capturePhoto() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        setCapturedBlob(blob);
        setPreviewUrl(URL.createObjectURL(blob));
        setPhase("preview");
        stopCamera();
      },
      "image/jpeg",
      0.9
    );
  }

  function retake() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setCapturedBlob(null);
    setPreviewUrl(null);
    setPhase("camera");
    startCamera();
  }

  async function savePhoto() {
    if (!user || !capturedBlob) return;
    setSaving(true);

    const fileName = `${Date.now()}.jpg`;
    const filePath = `${user.id}/${roomId}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from("room-photos")
      .upload(filePath, capturedBlob, { contentType: "image/jpeg" });

    if (uploadError) {
      toast({ title: "Upload failed", description: uploadError.message, variant: "destructive" });
      setSaving(false);
      return;
    }

    const { error: dbError } = await supabase.from("room_photos").insert({
      room_id: roomId,
      user_id: user.id,
      storage_path: filePath,
    });

    setSaving(false);
    if (dbError) {
      toast({ title: "Failed to save photo record", description: dbError.message, variant: "destructive" });
    } else {
      const newCount = photoCount + 1;
      setPhotoCount(newCount);
      toast({ title: "Photo saved!" });
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setCapturedBlob(null);
      setPreviewUrl(null);
      setPhase("camera");
      startCamera();
    }
  }

  return (
    <div className="min-h-screen bg-black flex flex-col">
      <header className="flex items-center justify-between px-4 py-3 z-10">
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
        <div className="flex items-center gap-2 text-white text-sm">
          <ImageIcon className="h-4 w-4" />
          <span data-testid="text-photo-count">{photoCount} photo{photoCount !== 1 ? "s" : ""} saved</span>
        </div>
      </header>

      <div className="flex-1 relative flex flex-col items-center justify-center">
        {cameraError ? (
          <div className="text-center text-white/70 px-8">
            <Camera className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">{cameraError}</p>
            <Button
              className="mt-4"
              variant="secondary"
              onClick={startCamera}
              data-testid="button-retry-camera"
            >
              Try again
            </Button>
          </div>
        ) : phase === "camera" ? (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover absolute inset-0"
              data-testid="video-camera"
            />
            <div className="absolute inset-0 border-2 border-white/20 m-8 rounded-xl pointer-events-none" />
            <div className="absolute bottom-10 left-1/2 -translate-x-1/2">
              <button
                onClick={capturePhoto}
                data-testid="button-capture"
                className="w-16 h-16 rounded-full bg-white border-4 border-white/50 shadow-lg hover:scale-105 active:scale-95 transition-transform"
              />
            </div>
          </>
        ) : (
          <>
            {previewUrl && (
              <img
                src={previewUrl}
                alt="Captured room photo"
                className="w-full h-full object-cover absolute inset-0"
                data-testid="img-preview"
              />
            )}
            <div className="absolute bottom-10 flex gap-4">
              <Button
                variant="secondary"
                size="lg"
                onClick={retake}
                disabled={saving}
                data-testid="button-retake"
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Retake
              </Button>
              <Button
                size="lg"
                onClick={savePhoto}
                disabled={saving}
                data-testid="button-save-photo"
              >
                {saving ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...</>
                ) : (
                  <><Check className="h-4 w-4 mr-2" /> Save to room</>
                )}
              </Button>
            </div>
          </>
        )}
      </div>

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
