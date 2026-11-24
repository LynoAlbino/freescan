/// <reference lib="webworker" />
import { orderCorners, validCorners } from "../lib/geometry";
import { fullCorners, type Edits, type Corners } from "../types";
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
function detect(image: ImageData) {
  const owned: { delete: () => void }[] = [];
  const own = <T extends { delete: () => void }>(m: T) => {
    owned.push(m);
    return m;
  };
  try {
    const src = own(cv.matFromImageData(image)),
      gray = own(new cv.Mat()),
      blur = own(new cv.Mat()),
      edge = own(new cv.Mat()),
      contours = own(new cv.MatVector()),
      hierarchy = own(new cv.Mat());
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0);
    cv.Canny(blur, edge, 45, 135);
    const kernel = own(cv.Mat.ones(3, 3, cv.CV_8U));
    cv.morphologyEx(edge, edge, cv.MORPH_CLOSE, kernel);
    cv.findContours(
      edge,
      contours,
      hierarchy,
      cv.RETR_LIST,
      cv.CHAIN_APPROX_SIMPLE,
    );
    let best: Corners = fullCorners(),
      confidence = 0;
    const inspect = () => {
      for (let i = 0; i < contours.size(); i++) {
        const c = contours.get(i),
          poly = new cv.Mat();
        try {
          const area = cv.contourArea(c);
          if (area < image.width * image.height * 0.12) continue;
          cv.approxPolyDP(c, poly, 0.025 * cv.arcLength(c, true), true);
          if (poly.rows !== 4 || !cv.isContourConvex(poly)) continue;
          const p = orderCorners(
            Array.from({ length: 4 }, (_, j) => ({
              x: poly.data32S[j * 2] / image.width,
              y: poly.data32S[j * 2 + 1] / image.height,
            })),
          );
          if (!validCorners(p)) continue;
          const border = p.some(
            (v) => v.x < 0.01 || v.x > 0.99 || v.y < 0.01 || v.y > 0.99,
          );
          let angle = 0;
          for (let j = 0; j < 4; j++) {
            const a = p[(j + 3) % 4],
              b = p[j],
              d = p[(j + 1) % 4];
            const dot = (a.x - b.x) * (d.x - b.x) + (a.y - b.y) * (d.y - b.y);
            angle += Math.abs(
              dot /
                (Math.hypot(a.x - b.x, a.y - b.y) *
                  Math.hypot(d.x - b.x, d.y - b.y)),
            );
          }
          const score =
            Math.min(1, (area / (image.width * image.height)) * 1.3) * 0.7 +
            (1 - angle / 4) * 0.3 -
            (border ? 0.3 : 0);
          if (score > confidence) {
            confidence = score;
            best = p;
          }
        } finally {
          c.delete();
          poly.delete();
        }
      }
    };
    inspect();
    if (confidence < 0.55) {
      cv.threshold(blur, edge, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
      cv.findContours(
        edge,
        contours,
        hierarchy,
        cv.RETR_LIST,
        cv.CHAIN_APPROX_SIMPLE,
      );
      inspect();
    }
    const lap = own(new cv.Mat()),
      mean = own(new cv.Mat()),
      std = own(new cv.Mat());
    cv.Laplacian(gray, lap, cv.CV_64F);
    cv.meanStdDev(lap, mean, std);
    return {
      corners: best,
      confidence,
      brightness: cv.mean(gray)[0],
      blur: std.data64F[0] ** 2,
    };
  } finally {
    owned.reverse().forEach((m) => m.delete());
  }
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
        cv.GaussianBlur(gray, out, new cv.Size(3, 3), 0.4);
        cv.normalize(out, out, 0, 255, cv.NORM_MINMAX);
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
      cv.resize(
        gray,
        small,
        new cv.Size(
          Math.max(2, Math.round(gray.cols / 16)),
          Math.max(2, Math.round(gray.rows / 16)),
        ),
        0,
        0,
        cv.INTER_AREA,
      );
      const k = own(cv.Mat.ones(9, 9, cv.CV_8U));
      cv.morphologyEx(small, small, cv.MORPH_CLOSE, k);
      cv.GaussianBlur(small, small, new cv.Size(7, 7), 0);
      cv.resize(small, background, gray.size(), 0, 0, cv.INTER_LINEAR);
      const out = own(result.clone());
      const data = out.data,
        bg = background.data;
      const strength =
        mode === "color"
          ? 0.38
          : mode === "auto"
            ? 0.78
            : mode === "whiteboard"
              ? 1
              : 0.93;
      const sums = [0, 0, 0];
      for (let i = 0; i < data.length; i += 4)
        for (let c = 0; c < 3; c++) sums[c] += data[i + c];
      const avg = (sums[0] + sums[1] + sums[2]) / 3;
      for (let i = 0; i < data.length; i += 4) {
        const illumination = Math.max(45, bg[i / 4]),
          factor = 1 + strength * (246 / illumination - 1);
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
        action === "detect" ? detect(image) : process(image, edits);
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
