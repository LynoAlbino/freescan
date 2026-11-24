/// <reference lib="webworker" />
import { validCorners } from "../lib/geometry";
import { detectDocument } from "./detection";
import { type Edits } from "../types";
// OpenCV's generated Emscripten API is loaded only inside this dedicated worker.
type CV = typeof import("@techstark/opencv-js");
let cv: CV;
let ready: Promise<void> | undefined;
function initialize() {
  return (ready ??= (async () => {
    importScripts(new URL("opencv.js", self.location.href).href);
    const loaded = (
      self as unknown as {
        cv: CV & { then?: (callback: (module: CV) => void) => void };
      }
    ).cv;
    await new Promise<void>((resolve, reject) => {
      if (loaded.Mat) {
        cv = loaded;
        resolve();
      } else if (loaded.then) {
        loaded.then((module) => {
          cv = module;
          resolve();
        });
      } else reject(new Error("OpenCV initialization failed."));
    });
  })());
}
function process(image: ImageData, edits: Edits) {
  const owned: { delete: () => void }[] = [];
  const own = <T extends { delete: () => void }>(m: T) => {
    owned.push(m);
    return m;
  };
  try {
    if (!validCorners(edits.corners))
      throw new Error("Corners must form a rectangle without crossed edges.");
    const src = own(cv.matFromImageData(image)),
      warped = own(new cv.Mat());
    const p = edits.corners.map((v) => ({
      x: v.x * (image.width - 1),
      y: v.y * (image.height - 1),
    }));
    const dist = (a: number, b: number) =>
      Math.hypot(p[a].x - p[b].x, p[a].y - p[b].y);
    const w = Math.max(2, Math.round(Math.max(dist(0, 1), dist(2, 3)))),
      h = Math.max(2, Math.round(Math.max(dist(0, 3), dist(1, 2))));
    const from = own(
        cv.matFromArray(
          4,
          1,
          cv.CV_32FC2,
          p.flatMap((v) => [v.x, v.y]),
        ),
      ),
      to = own(
        cv.matFromArray(4, 1, cv.CV_32FC2, [
          0,
          0,
          w - 1,
          0,
          w - 1,
          h - 1,
          0,
          h - 1,
        ]),
      ),
      transform = own(cv.getPerspectiveTransform(from, to));
    cv.warpPerspective(
      src,
      warped,
      transform,
      new cv.Size(w, h),
      cv.INTER_CUBIC,
      cv.BORDER_REPLICATE,
    );
    let result = warped;
    if (edits.rotation % 360) {
      const rotated = own(new cv.Mat());
      cv.rotate(
        result,
        rotated,
        edits.rotation % 360 === 90
          ? cv.ROTATE_90_CLOCKWISE
          : edits.rotation % 360 === 180
            ? cv.ROTATE_180
            : cv.ROTATE_90_COUNTERCLOCKWISE,
      );
      result = rotated;
    }
    const gray = own(new cv.Mat());
    cv.cvtColor(result, gray, cv.COLOR_RGBA2GRAY);
    const mode = edits.mode;
    if (["bw", "receipt", "gray"].includes(mode)) {
      const out = own(new cv.Mat());
      if (mode === "gray") {
        cv.normalize(gray, out, 0, 255, cv.NORM_MINMAX);
      } else {
        let block = Math.min(
          mode === "receipt" ? 61 : 35,
          Math.min(gray.cols, gray.rows) - 1,
        );
        block = Math.max(3, block % 2 ? block : block - 1);
        cv.adaptiveThreshold(
          gray,
          out,
          255,
          mode === "receipt"
            ? cv.ADAPTIVE_THRESH_MEAN_C
            : cv.ADAPTIVE_THRESH_GAUSSIAN_C,
          cv.THRESH_BINARY,
          block,
          mode === "receipt" ? 13 : 9,
        );
      }
      const rgba = own(new cv.Mat());
      cv.cvtColor(out, rgba, cv.COLOR_GRAY2RGBA);
      result = rgba;
    } else if (mode !== "original") {
      // Low-frequency illumination estimate, then per-pixel normalization. Color
      // saturation is retained so signatures and stamps survive clean/auto modes.
      const small = own(new cv.Mat()),
        background = own(new cv.Mat());
      // Keep the illumination model at a consistent scale. A fixed 1/16
      // reduction made its kernel span almost half of a small document,
      // smearing bright areas into shadows and leaving a dark border behind.
      const backgroundScale = Math.min(1, 320 / Math.max(gray.cols, gray.rows));
      cv.resize(
        gray,
        small,
        new cv.Size(
          Math.max(2, Math.round(gray.cols * backgroundScale)),
          Math.max(2, Math.round(gray.rows * backgroundScale)),
        ),
        0,
        0,
        cv.INTER_AREA,
      );
      const kernelSize = Math.max(
        3,
        2 * Math.round(Math.min(small.cols, small.rows) * 0.012) + 1,
      );
      const k = own(cv.Mat.ones(kernelSize, kernelSize, cv.CV_8U));
      cv.morphologyEx(small, small, cv.MORPH_CLOSE, k);
      cv.GaussianBlur(small, small, new cv.Size(5, 5), 0);
      cv.resize(small, background, gray.size(), 0, 0, cv.INTER_LINEAR);
      const out = own(result.clone());
      const data = out.data,
        bg = background.data;
      const strength =
        mode === "color"
          ? 0.38
          : mode === "auto"
            ? 0.94
            : mode === "whiteboard"
              ? 1
              : 0.93;
      const sums = [0, 0, 0];
      for (let i = 0; i < data.length; i += 4)
        for (let c = 0; c < 3; c++) sums[c] += data[i + c];
      const avg = (sums[0] + sums[1] + sums[2]) / 3;
      for (let i = 0; i < data.length; i += 4) {
        const illumination = Math.max(45, bg[i / 4]),
          factor = 1 + strength * (252 / illumination - 1);
        for (let c = 0; c < 3; c++) {
          const balance = Math.min(
            1.12,
            Math.max(0.88, avg / Math.max(1, sums[c])),
          );
          let v = data[i + c] * factor * balance;
          if (mode === "whiteboard")
            v = v > 210 ? 255 : Math.max(0, (v - 20) * 1.18);
          else if (mode === "clean") v = (v - 8) * 1.045;
          else if (mode === "color") v = (v - 128) * 1.12 + 128;
          data[i + c] = Math.min(255, Math.max(0, v));
        }
      }
      result = out;
    }
    if (edits.brightness || edits.contrast) {
      const d = result.data,
        contrast = 1 + edits.contrast / 100;
      for (let i = 0; i < d.length; i += 4)
        for (let c = 0; c < 3; c++)
          d[i + c] = Math.min(
            255,
            Math.max(
              0,
              (d[i + c] - 128) * contrast + 128 + edits.brightness * 1.5,
            ),
          );
    }
    if (edits.sharpness > 0 && mode !== "bw" && mode !== "receipt") {
      const soft = own(new cv.Mat()),
        sharp = own(new cv.Mat());
      cv.GaussianBlur(result, soft, new cv.Size(0, 0), 1);
      const amount = edits.sharpness / 100;
      cv.addWeighted(result, 1 + amount, soft, -amount, 0, sharp);
      result = sharp;
    }
    return {
      width: result.cols,
      height: result.rows,
      data: new Uint8ClampedArray(result.data),
    };
  } finally {
    owned.reverse().forEach((m) => m.delete());
  }
}
let queue = Promise.resolve();
self.onmessage = (event: MessageEvent) => {
  queue = queue.then(async () => {
    const { id, action, image, edits } = event.data;
    try {
      await initialize();
      const result =
        action === "warmup"
          ? { ready: true }
          : action === "detect"
            ? detectDocument(cv, image)
            : process(image, edits);
      self.postMessage(
        { id, result },
        "data" in result ? [result.data.buffer] : [],
      );
    } catch (e) {
      self.postMessage({
        id,
        error:
          e instanceof Error
            ? e.message
            : typeof e === "number"
              ? "Image processing ran out of memory. Try a smaller image."
              : String(e),
      });
    }
  });
};
