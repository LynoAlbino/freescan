import { useCallback, useEffect, useRef, useState } from "react";
import {
  X,
  SwitchCamera,
  Zap,
  ZapOff,
  Images,
  Camera as CameraIcon,
  Check,
  LoaderCircle,
} from "lucide-react";
import {
  detectFrame,
  cancelProcessing,
  type Detection,
} from "../lib/processing";
import { canvasBlob, errorMessage } from "../lib/files";
import { useI18n } from "../lib/i18n";
type ExtraCapabilities = MediaTrackCapabilities & {
  torch?: boolean;
  focusMode?: string[];
  pointsOfInterest?: unknown;
};
export function Camera({
  onCapture,
  onClose,
  onDone,
  count,
  onFallback,
}: {
  onCapture: (blob: Blob) => Promise<void>;
  onClose: () => void;
  onDone: () => void;
  count: number;
  onFallback: () => void;
}) {
  const { t } = useI18n(),
    video = useRef<HTMLVideoElement>(null),
    stream = useRef<MediaStream | null>(null),
    inFlight = useRef(false),
    captureRef = useRef<() => void>(() => {});
  const [facing, setFacing] = useState<"environment" | "user">("environment"),
    [error, setError] = useState(""),
    [status, setStatus] = useState("Starting camera…"),
    [detection, setDetection] = useState<Detection>(),
    [auto, setAuto] = useState(true),
    [torch, setTorch] = useState(false),
    [canTorch, setCanTorch] = useState(false),
    [busy, setBusy] = useState(false),
    [ratio, setRatio] = useState(3 / 4);
  const automatic = useRef(auto);
  automatic.current = auto;
  const armed = useRef(true),
    lastCapture = useRef(0);
  useEffect(() => {
    let disposed = false,
      timer: ReturnType<typeof setTimeout> | undefined,
      last: Detection | undefined,
      stable = 0;
    async function start() {
      try {
        if (!navigator.mediaDevices?.getUserMedia)
          throw new Error(
            "Live camera needs HTTPS and a supported browser. Use your device camera or import an image.",
          );
        const media = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: facing },
            width: { ideal: 2560 },
            height: { ideal: 1920 },
          },
        });
        if (disposed) {
          media.getTracks().forEach((t) => t.stop());
          return;
        }
        stream.current = media;
        const track = media.getVideoTracks()[0],
          cap = track.getCapabilities?.() as ExtraCapabilities;
        setCanTorch(!!cap?.torch);
        setTorch(false);
        if (video.current) {
          video.current.srcObject = media;
          await video.current.play();
          setRatio(video.current.videoWidth / video.current.videoHeight);
        }
        setError("");
        setStatus(t("Position a document inside the frame"));
        void tick();
      } catch (e) {
        if (!disposed)
          setError(
            e instanceof DOMException && e.name === "NotAllowedError"
              ? "Camera access was denied. Allow camera access in browser settings, or use Import Images."
              : errorMessage(e),
          );
      }
    }
    async function tick() {
      if (disposed) return;
      const v = video.current;
      if (v && v.readyState >= 2 && !inFlight.current) {
        const c = document.createElement("canvas"),
          scale = 640 / v.videoWidth;
        c.width = 640;
        c.height = Math.round(v.videoHeight * scale);
        const ctx = c.getContext("2d", { willReadFrequently: true })!;
        ctx.drawImage(v, 0, 0, c.width, c.height);
        try {
          const d = await detectFrame(
            ctx.getImageData(0, 0, c.width, c.height),
          );
          if (disposed) return;
          setDetection(d);
          const movement = last
            ? Math.max(
                ...d.corners.map((p, i) =>
                  Math.hypot(
                    p.x - last!.corners[i].x,
                    p.y - last!.corners[i].y,
                  ),
                ),
              )
            : 1;
          if (d.confidence < 0.5 || movement > 0.08) armed.current = true;
          const good = d.confidence > 0.58 && d.blur > 45 && d.brightness > 65;
          stable = good && movement < 0.018 ? stable + 1 : 0;
          setStatus(
            d.brightness < 65
              ? "More light will help"
              : d.confidence < 0.5
                ? t("Position a document inside the frame")
                : d.blur < 45
                  ? "Image is soft. Hold still."
                  : stable >= 2
                    ? t("Hold steady")
                    : "Document detected",
          );
          last = d;
          if (
            automatic.current &&
            armed.current &&
            stable >= 3 &&
            Date.now() - lastCapture.current > 3500
          ) {
            stable = 0;
            armed.current = false;
            captureRef.current();
          }
        } catch (e) {
          if (!disposed) setStatus(errorMessage(e));
        }
      }
      if (!disposed) timer = setTimeout(() => void tick(), 600);
    }
    void start();
    return () => {
      disposed = true;
      clearTimeout(timer);
      stream.current?.getTracks().forEach((t) => t.stop());
      stream.current = null;
      cancelProcessing();
    };
  }, [facing, t]);
  const capture = useCallback(async () => {
    if (inFlight.current || !video.current?.videoWidth) return;
    inFlight.current = true;
    setBusy(true);
    lastCapture.current = Date.now();
    armed.current = false;
    try {
      let blob: Blob | undefined;
      const track = stream.current?.getVideoTracks()[0];
      const ImageCaptureAPI = (
        window as unknown as {
          ImageCapture?: new (track: MediaStreamTrack) => {
            takePhoto: () => Promise<Blob>;
          };
        }
      ).ImageCapture;
      if (ImageCaptureAPI && track) {
        try {
          blob = await new ImageCaptureAPI(track).takePhoto();
        } catch {
          /* Some cameras expose ImageCapture but reject takePhoto. */
        }
      }
      if (!blob) {
        const v = video.current,
          c = document.createElement("canvas");
        c.width = v.videoWidth;
        c.height = v.videoHeight;
        c.getContext("2d")!.drawImage(v, 0, 0);
        blob = await canvasBlob(c, "image/jpeg", 0.98);
      }
      await onCapture(blob);
      setStatus("Page saved. Position the next page.");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }, [onCapture]);
  captureRef.current = () => void capture();
  async function toggleTorch() {
    try {
      await stream.current?.getVideoTracks()[0].applyConstraints({
        advanced: [{ torch: !torch } as MediaTrackConstraintSet],
      });
      setTorch(!torch);
    } catch {
      setStatus("Torch is unavailable on this camera.");
    }
  }
  async function focus(e: React.PointerEvent<HTMLVideoElement>) {
    const track = stream.current?.getVideoTracks()[0];
    const caps = track?.getCapabilities?.() as ExtraCapabilities;
    if (!track || !caps?.focusMode?.includes("single-shot")) return;
    const r = e.currentTarget.getBoundingClientRect();
    try {
      await track.applyConstraints({
        advanced: [
          {
            focusMode: "single-shot",
            pointsOfInterest: [
              {
                x: (e.clientX - r.left) / r.width,
                y: (e.clientY - r.top) / r.height,
              },
            ],
          },
        ],
      } as unknown as MediaTrackConstraints);
    } catch {
      setStatus("This camera handles focus automatically.");
    }
  }
  return (
    <section className="camera-screen">
      <header className="camera-top">
        <button
          className="icon-button"
          aria-label={t("Exit scanner")}
          onClick={onClose}
          disabled={busy}
        >
          <X />
        </button>
        <span>{t("New scan")}</span>
        {canTorch ? (
          <button
            className="icon-button"
            aria-label="Toggle torch"
            onClick={() => void toggleTorch()}
          >
            {torch ? <Zap /> : <ZapOff />}
          </button>
        ) : (
          <span />
        )}
      </header>
      <div className="camera-stage">
        {error ? (
          <div className="camera-error">
            <CameraIcon size={40} />
            <h2> {t("Camera unavailable")} </h2>
            <p>{error}</p>
            <button className="button primary" onClick={onFallback}>
              {t("Open device camera")}
            </button>
            <button className="button" onClick={onClose}>
              {t("Back")}
            </button>
          </div>
        ) : (
          <div className="video-wrap" style={{ aspectRatio: ratio }}>
            <video
              ref={video}
              playsInline
              muted
              autoPlay
              onPointerDown={(e) => void focus(e)}
            />
            {detection && detection.confidence > 0.45 && (
              <svg
                className="boundary"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
              >
                <polygon
                  points={detection.corners
                    .map((p) => `${p.x * 100},${p.y * 100}`)
                    .join(" ")}
                  fill="#30da9c18"
                  stroke="#45e4b0"
                  strokeWidth=".5"
                />
                {detection.corners.map((p, i) => (
                  <circle
                    key={i}
                    cx={p.x * 100}
                    cy={p.y * 100}
                    r=".9"
                    fill="#45e4b0"
                  />
                ))}
              </svg>
            )}
          </div>
        )}
      </div>
      <div className="camera-bottom">
        <p role="status">{busy ? "Processing page…" : status}</p>
        <button className="camera-mode" onClick={() => setAuto(!auto)}>
          {t(auto ? "Auto capture" : "Manual capture")}
        </button>
        <div className="capture-controls">
          <button
            className="icon-button"
            aria-label={t("Switch camera")}
            onClick={() =>
              setFacing(facing === "environment" ? "user" : "environment")
            }
            disabled={busy}
          >
            <SwitchCamera />
          </button>
          <button
            className="shutter"
            aria-label={t("Capture page")}
            onClick={() => void capture()}
            disabled={busy || !!error}
          >
            {busy ? <LoaderCircle className="spin" /> : <span />}
          </button>
          <button
            className="camera-count"
            onClick={onDone}
            disabled={!count || busy}
            aria-label={`${t("Done")}, ${count} pages`}
          >
            <Images />
            <span>{count}</span>
            {count > 0 && <Check size={14} />}
          </button>
        </div>
      </div>
    </section>
  );
}
