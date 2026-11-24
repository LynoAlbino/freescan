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
import { detectFrame, warmProcessing, type Detection } from "../lib/processing";
import { cameraGuidance, type CameraGuidance } from "../lib/camera-guidance";
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
    stage = useRef<HTMLDivElement>(null),
    stream = useRef<MediaStream | null>(null),
    inFlight = useRef(false),
    captureRef = useRef<() => void>(() => {});
  const [facing, setFacing] = useState<"environment" | "user">("environment"),
    [error, setError] = useState(""),
    [status, setStatus] = useState("Starting camera…"),
    [guidance, setGuidance] = useState<CameraGuidance>(cameraGuidance()),
    [detection, setDetection] = useState<Detection>(),
    [auto, setAuto] = useState(true),
    [torch, setTorch] = useState(false),
    [canTorch, setCanTorch] = useState(false),
    [busy, setBusy] = useState(false),
    [ratio, setRatio] = useState(3 / 4),
    [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    if (!stage.current) return;
    const observer = new ResizeObserver(([entry]) =>
      setStageSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      }),
    );
    observer.observe(stage.current);
    return () => observer.disconnect();
  }, []);
  const frameWidth = Math.min(stageSize.width, stageSize.height * ratio);
  const automatic = useRef(auto);
  automatic.current = auto;
  const armed = useRef(true),
    lastCapture = useRef(0);
  useEffect(() => {
    let disposed = false,
      timer: ReturnType<typeof setTimeout> | undefined,
      last: Detection | undefined,
      stableSince = 0;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    async function start() {
      try {
        void warmProcessing().catch(() => {});
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
      const started = performance.now();
      const v = video.current;
      if (v && v.readyState >= 2 && !inFlight.current) {
        setRatio(v.videoWidth / v.videoHeight);
        const scale = Math.min(1, 640 / Math.max(v.videoWidth, v.videoHeight));
        const width = Math.round(v.videoWidth * scale),
          height = Math.round(v.videoHeight * scale);
        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width;
          canvas.height = height;
        }
        ctx.drawImage(v, 0, 0, width, height);
        try {
          const d = await detectFrame(ctx.getImageData(0, 0, width, height));
          if (disposed) return;
          if (inFlight.current) {
            timer = setTimeout(() => void tick(), 100);
            return;
          }
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
          const advice = cameraGuidance(d, movement);
          setGuidance(advice);
          setStatus(advice.title);
          if (!advice.ready || d.confidence < 0.6) stableSince = 0;
          else if (!stableSince) stableSince = performance.now();
          last = d;
          if (
            automatic.current &&
            armed.current &&
            stableSince > 0 &&
            performance.now() - stableSince >= 450 &&
            Date.now() - lastCapture.current > 1800
          ) {
            stableSince = 0;
            armed.current = false;
            captureRef.current();
          }
        } catch (e) {
          if (!disposed) setStatus(errorMessage(e));
        }
      }
      if (!disposed)
        timer = setTimeout(
          () => void tick(),
          Math.max(16, 100 - (performance.now() - started)),
        );
    }
    void start();
    return () => {
      disposed = true;
      clearTimeout(timer);
      stream.current?.getTracks().forEach((t) => t.stop());
      stream.current = null;
      // Keep the initialized engine for editing and the next scan. No new
      // frames are queued after disposal; stopping the camera releases hardware.
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
      <div className="camera-stage" ref={stage}>
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
          <div
            className="video-wrap"
            style={{ width: frameWidth, height: frameWidth / ratio }}
          >
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
                  fill={guidance.ready ? "#30da9c10" : "#f6be4710"}
                  stroke={guidance.ready ? "#45e4b0" : "#ffd27b"}
                  strokeWidth=".5"
                />
                {detection.corners.map((p, i) => (
                  <circle
                    key={i}
                    cx={p.x * 100}
                    cy={p.y * 100}
                    r=".9"
                    fill={guidance.ready ? "#45e4b0" : "#ffd27b"}
                  />
                ))}
              </svg>
            )}
            {(!detection || detection.confidence <= 0.45) && (
              <div className="camera-target" aria-hidden="true" />
            )}
          </div>
        )}
      </div>
      <div className="camera-bottom">
        <div
          className="camera-guidance"
          data-ready={guidance.ready && !busy}
          role="status"
        >
          <strong>{t(busy ? "Processing page…" : status)}</strong>
          <span>
            {busy
              ? t("Keep the page still while the photo is saved.")
              : t(
                  guidance.ready && !auto
                    ? "Ready to scan. Tap the capture button."
                    : guidance.detail,
                )}
          </span>
        </div>
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
