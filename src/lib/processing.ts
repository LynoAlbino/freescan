import type { Corners, Edits, ScanPage } from "../types";
import { defaultEdits, fullCorners } from "../types";
import {
  assetURL,
  canvasBlob,
  checkAbort,
  decodeImage,
  releaseImage,
  validateImage,
} from "./files";
export interface Detection {
  corners: Corners;
  confidence: number;
  brightness: number;
  blur: number;
}
let worker: Worker | undefined,
  id = 0;
const pending = new Map<
  number,
  {
    resolve: (v: unknown) => void;
    reject: (e: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }
>();
function getWorker() {
  if (!worker) {
    worker = new Worker(assetURL("vendor/processor.js"));
    worker.onmessage = (e) => {
      const job = pending.get(e.data.id);
      if (job) {
        clearTimeout(job.timer);
        pending.delete(e.data.id);
        if (e.data.error) job.reject(new Error(e.data.error));
        else job.resolve(e.data.result);
      }
    };
    worker.onerror = () => {
      cancelProcessing(
        new Error(
          "Image engine could not load. Reconnect once to download the offline assets, then retry.",
        ),
      );
    };
  }
  return worker;
}
function request<T>(
  action: string,
  image?: ImageData,
  edits?: Edits,
): Promise<T> {
  const w = getWorker();
  return new Promise((resolve, reject) => {
    const n = ++id;
    const timer = setTimeout(
      () =>
        cancelProcessing(
          new Error(
            "Image processing took too long. Retry, or use a smaller image on this device.",
          ),
        ),
      120000,
    );
    pending.set(n, { resolve: resolve as (v: unknown) => void, reject, timer });
    try {
      w.postMessage(
        { id: n, action, image, edits },
        image ? [image.data.buffer] : [],
      );
    } catch (error) {
      clearTimeout(timer);
      pending.delete(n);
      reject(error);
    }
  });
}
export function cancelProcessing(
  error: Error = new DOMException("Processing canceled.", "AbortError"),
) {
  worker?.terminate();
  worker = undefined;
  for (const job of pending.values()) {
    clearTimeout(job.timer);
    job.reject(error);
  }
  pending.clear();
}
export async function pixels(blob: Blob, maxEdge?: number) {
  const img = await decodeImage(blob);
  try {
    const w = img.width,
      h = img.height;
    if (!maxEdge && w * h > 30_000_000)
      throw new Error(
        "This image exceeds the safe 30-megapixel working size. Resize it on your device and import again; the original has not been changed.",
      );
    const scale = maxEdge ? Math.min(1, maxEdge / Math.max(w, h)) : 1;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(2, Math.round(w * scale));
    canvas.height = Math.max(2, Math.round(h * scale));
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return {
      image: ctx.getImageData(0, 0, canvas.width, canvas.height),
      width: w,
      height: h,
    };
  } finally {
    releaseImage(img);
  }
}
export const detectFrame = (image: ImageData) =>
  request<Detection>("detect", image);
export const warmProcessing = () => request<{ ready: boolean }>("warmup");
export async function processImage(original: Blob, edits: Edits) {
  const { image } = await pixels(original);
  const result = await request<{
    width: number;
    height: number;
    data: Uint8ClampedArray<ArrayBuffer>;
  }>("process", image, edits);
  const c = document.createElement("canvas");
  c.width = result.width;
  c.height = result.height;
  c.getContext("2d")!.putImageData(
    new ImageData(result.data, result.width, result.height),
    0,
    0,
  );
  const thumb = document.createElement("canvas");
  const scale = Math.min(1, 320 / Math.max(c.width, c.height));
  thumb.width = Math.max(1, Math.round(c.width * scale));
  thumb.height = Math.max(1, Math.round(c.height * scale));
  thumb.getContext("2d")!.drawImage(c, 0, 0, thumb.width, thumb.height);
  const [processed, thumbnail] = await Promise.all([
    canvasBlob(c, "image/png"),
    canvasBlob(thumb, "image/jpeg", 0.85),
  ]);
  return { processed, thumbnail, width: result.width, height: result.height };
}
export async function importImage(
  original: Blob,
  signal?: AbortSignal,
): Promise<ScanPage> {
  await validateImage(original);
  checkAbort(signal);
  const { image, width, height } = await pixels(original, 720);
  const detection = await detectFrame(image);
  checkAbort(signal);
  const edits = defaultEdits(
    detection.confidence > 0.5 ? detection.corners : fullCorners(),
  );
  const result = await processImage(original, edits);
  checkAbort(signal);
  const warnings = [];
  if (detection.confidence <= 0.5)
    warnings.push(
      "No clear document boundary found. Adjust the four crop corners.",
    );
  if (detection.blur < 40)
    warnings.push(
      "This image may be blurry. Check fine text before exporting.",
    );
  if (detection.brightness < 65)
    warnings.push("Low light detected. A brighter photo may improve the scan.");
  return {
    id: crypto.randomUUID(),
    original,
    ...result,
    originalWidth: width,
    originalHeight: height,
    edits,
    warning: warnings.join(" "),
  };
}
