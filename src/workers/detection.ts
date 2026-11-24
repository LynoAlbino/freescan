import { orderCorners, validCorners } from "../lib/geometry";
import { fullCorners, type Corners } from "../types";
type CV = typeof import("@techstark/opencv-js");

/** Small camera frames only. All coordinates returned refer to the original frame. */
export function detectDocument(cv: CV, image: ImageData) {
  const owned: { delete(): void }[] = [];
  const own = <T extends { delete(): void }>(value: T) => {
    owned.push(value);
    return value;
  };
  try {
    const src = own(cv.matFromImageData(image)),
      gray = own(new cv.Mat()),
      blur = own(new cv.Mat()),
      mask = own(new cv.Mat()),
      contours = own(new cv.MatVector()),
      hierarchy = own(new cv.Mat()),
      kernel = own(cv.Mat.ones(3, 3, cv.CV_8U));
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, blur, new cv.Size(3, 3), 0);
    const width = image.width,
      height = image.height,
      frameArea = width * height;
    let best = fullCorners(),
      confidence = 0;
    const sample = (x: number, y: number) =>
      gray.data[
        Math.max(0, Math.min(height - 1, Math.round(y))) * width +
          Math.max(0, Math.min(width - 1, Math.round(x)))
      ];
    function score(p: Corners, contourArea: number) {
      if (!validCorners(p)) return;
      const px = p.map((v) => ({
        x: v.x * (width - 1),
        y: v.y * (height - 1),
      }));
      // A contour around the photograph is not a detected piece of paper.
      if (
        px.filter(
          (v) => v.x < 2 || v.y < 2 || v.x > width - 3 || v.y > height - 3,
        ).length >= 3
      )
        return;
      let angle = 0,
        area = 0,
        supportedSides = 0,
        contrast = 0;
      const lengths: number[] = [];
      for (let j = 0; j < 4; j++) {
        const a = px[(j + 3) % 4],
          b = px[j],
          c = px[(j + 1) % 4];
        const ab = Math.hypot(a.x - b.x, a.y - b.y),
          bc = Math.hypot(c.x - b.x, c.y - b.y);
        lengths.push(bc);
        angle += Math.abs(
          ((a.x - b.x) * (c.x - b.x) + (a.y - b.y) * (c.y - b.y)) / (ab * bc),
        );
        area += b.x * c.y - b.y * c.x;
        const nx = -(c.y - b.y) / bc,
          ny = (c.x - b.x) / bc;
        let support = 0,
          sideContrast = 0;
        for (let k = 1; k <= 12; k++) {
          const t = k / 13,
            x = b.x + (c.x - b.x) * t,
            y = b.y + (c.y - b.y) * t;
          // Sample either side of the boundary. Printed frames have paper on
          // both sides; the real perimeter separates paper and its background.
          const near = Math.abs(
            sample(x + nx * 4, y + ny * 4) - sample(x - nx * 4, y - ny * 4),
          );
          const far = Math.abs(
            sample(x + nx * 12, y + ny * 12) - sample(x - nx * 12, y - ny * 12),
          );
          const difference = Math.min(near, far);
          if (difference > 5) support++;
          sideContrast += Math.min(1, difference / 35);
        }
        if (support >= 5) supportedSides++;
        contrast += sideContrast / 12;
      }
      area = Math.abs(area) / 2;
      const coverage = area / frameArea;
      if (
        coverage < 0.035 ||
        Math.min(...lengths) < 14 ||
        supportedSides < 3 ||
        angle / 4 > 0.65
      )
        return;
      if (contourArea / area < 0.72) return;
      const candidate =
        0.23 +
        0.27 * Math.sqrt(coverage) +
        0.2 * (1 - angle / 4) +
        0.18 * (supportedSides / 4) +
        0.12 * (contrast / 4);
      if (candidate > confidence) {
        confidence = candidate;
        best = p;
      }
    }
    function inspect() {
      cv.findContours(
        mask,
        contours,
        hierarchy,
        cv.RETR_LIST,
        cv.CHAIN_APPROX_SIMPLE,
      );
      const candidates: { index: number; area: number }[] = [];
      for (let i = 0; i < contours.size(); i++) {
        const contour = contours.get(i);
        const area = Math.abs(cv.contourArea(contour));
        if (area > frameArea * 0.035) candidates.push({ index: i, area });
        contour.delete();
      }
      candidates.sort((a, b) => b.area - a.area);
      for (const candidate of candidates.slice(0, 12)) {
        const contour = contours.get(candidate.index),
          poly = new cv.Mat(),
          hull = new cv.Mat();
        try {
          cv.convexHull(contour, hull, false, true);
          for (const outline of [contour, hull]) {
            const perimeter = cv.arcLength(outline, true);
            for (const epsilon of [0.015, 0.025, 0.04]) {
              cv.approxPolyDP(outline, poly, epsilon * perimeter, true);
              if (poly.rows !== 4 || !cv.isContourConvex(poly)) continue;
              score(
                orderCorners(
                  Array.from({ length: 4 }, (_, j) => ({
                    x: poly.data32S[j * 2] / (width - 1),
                    y: poly.data32S[j * 2 + 1] / (height - 1),
                  })),
                ),
                candidate.area,
              );
              break;
            }
          }
        } finally {
          contour.delete();
          poly.delete();
          hull.delete();
        }
      }
    }
    // Faint edges need a lower threshold. Always consider segmentation as well:
    // an attractive inner printed box must not suppress the outer paper edge.
    cv.Canny(blur, mask, 18, 54);
    cv.morphologyEx(mask, mask, cv.MORPH_CLOSE, kernel);
    inspect();
    cv.threshold(blur, mask, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
    cv.morphologyEx(mask, mask, cv.MORPH_CLOSE, kernel);
    inspect();
    let qualityImage = gray;
    if (confidence > 0.5) {
      const xs = best.map((p) => p.x * (width - 1)),
        ys = best.map((p) => p.y * (height - 1));
      const left = Math.min(...xs),
        top = Math.min(...ys),
        w = Math.max(...xs) - left,
        h = Math.max(...ys) - top;
      qualityImage = own(
        gray.roi(
          new cv.Rect(
            Math.round(left + w * 0.2),
            Math.round(top + h * 0.2),
            Math.max(2, Math.floor(w * 0.6)),
            Math.max(2, Math.floor(h * 0.6)),
          ),
        ),
      );
    }
    const lap = own(new cv.Mat()),
      mean = own(new cv.Mat()),
      std = own(new cv.Mat());
    cv.Laplacian(qualityImage, lap, cv.CV_32F);
    cv.meanStdDev(lap, mean, std);
    return {
      corners: best,
      confidence,
      brightness: cv.mean(qualityImage)[0],
      blur: std.data64F[0] ** 2,
    };
  } finally {
    owned.reverse().forEach((m) => m.delete());
  }
}
