import type { Detection } from "./processing";

export interface CameraGuidance {
  title: string;
  detail: string;
  ready: boolean;
}
export function cameraGuidance(d?: Detection, movement = 0): CameraGuidance {
  const advice = (title: string, detail: string, ready = false) => ({
    title,
    detail,
    ready,
  });
  if (!d)
    return advice(
      "Find the page",
      "Place one document on a flat surface with all four corners visible.",
    );
  if (d.brightness < 60)
    return advice(
      "More light needed",
      "Move to brighter light. Keep your phone's shadow off the page.",
    );
  if (d.confidence <= 0.5)
    return advice(
      "Show all four corners",
      "Use a contrasting surface and keep the whole page in view.",
    );
  const p = d.corners;
  const area =
    Math.abs(
      p.reduce((sum, a, i) => {
        const b = p[(i + 1) % 4];
        return sum + a.x * b.y - a.y * b.x;
      }, 0),
    ) / 2;
  if (
    p.some((v) => v.x < 0.018 || v.x > 0.982 || v.y < 0.018 || v.y > 0.982) ||
    area > 0.87
  )
    return advice(
      "Move back a little",
      "Leave a small border around all four edges of the page.",
    );
  // Narrow receipts need a length check as well as area; their small area is normal.
  const width = Math.max(...p.map((v) => v.x)) - Math.min(...p.map((v) => v.x));
  const height =
    Math.max(...p.map((v) => v.y)) - Math.min(...p.map((v) => v.y));
  if (area < 0.3 && Math.max(width, height) < 0.76)
    return advice(
      "Move closer",
      "Fill more of the camera view so small text stays sharp.",
    );
  const distance = (a: number, b: number) =>
    Math.hypot(p[a].x - p[b].x, p[a].y - p[b].y);
  const top = distance(0, 1),
    bottom = distance(3, 2),
    left = distance(0, 3),
    right = distance(1, 2);
  if (Math.max(top / bottom, bottom / top, left / right, right / left) > 1.38)
    return advice(
      "Hold the phone flat",
      "Keep the camera parallel to the page, directly above its center.",
    );
  if (d.blur < 45)
    return advice(
      "Wait for a sharp image",
      "Hold still and tap the page to focus if your camera supports it.",
    );
  if (movement > 0.018)
    return advice("Hold still", "Keep the page and phone steady for a moment.");
  return advice(
    "Hold steady",
    "The page is in position. Auto capture will take the photo.",
    true,
  );
}
