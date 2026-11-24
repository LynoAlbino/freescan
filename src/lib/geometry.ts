import type { Corners, Point } from "../types";
export function orderCorners(points: Point[]): Corners {
  if (points.length !== 4) throw new Error("A document needs four corners.");
  const center = points.reduce(
    (a, p) => ({ x: a.x + p.x / 4, y: a.y + p.y / 4 }),
    { x: 0, y: 0 },
  );
  const sorted = [...points].sort(
    (a, b) =>
      Math.atan2(a.y - center.y, a.x - center.x) -
      Math.atan2(b.y - center.y, b.x - center.x),
  );
  const start = sorted.reduce(
    (n, p, i) => (p.x + p.y < sorted[n].x + sorted[n].y ? i : n),
    0,
  );
  return [...sorted.slice(start), ...sorted.slice(0, start)] as Corners;
}
export function validCorners(p: Corners): boolean {
  if (
    !Array.isArray(p) ||
    p.length !== 4 ||
    p.some((v) => !v || typeof v !== "object")
  )
    return false;
  if (
    p.some(
      (v) =>
        !Number.isFinite(v.x) ||
        !Number.isFinite(v.y) ||
        v.x < 0 ||
        v.y < 0 ||
        v.x > 1 ||
        v.y > 1,
    )
  )
    return false;
  let sign = 0,
    area = 0;
  for (let i = 0; i < 4; i++) {
    const a = p[i],
      b = p[(i + 1) % 4],
      c = p[(i + 2) % 4];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) < 0.0001) return false;
    if (sign && Math.sign(cross) !== sign) return false;
    sign = Math.sign(cross);
    area += a.x * b.y - a.y * b.x;
  }
  return sign > 0 && Math.abs(area) / 2 > 0.008;
}
export function parsePageRange(input: string, count: number): number[] {
  if (!input.trim()) return Array.from({ length: count }, (_, i) => i);
  const out: number[] = [];
  for (const part of input.split(",")) {
    const match = part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!match) throw new Error("Use page numbers such as 1, 3-5.");
    const a = Number(match[1]),
      b = Number(match[2] || a);
    if (a < 1 || b < 1 || a > count || b > count)
      throw new Error(`Pages must be between 1 and ${count}.`);
    const step = a <= b ? 1 : -1;
    for (let n = a; step > 0 ? n <= b : n >= b; n += step) out.push(n - 1);
  }
  return out;
}
export function fitPage(
  imageWidth: number,
  imageHeight: number,
  width: number,
  height: number,
  margin: number,
) {
  const scale = Math.min(
    (width - 2 * margin) / imageWidth,
    (height - 2 * margin) / imageHeight,
  );
  if (!Number.isFinite(scale) || scale <= 0)
    throw new Error("Margins leave no room on the page.");
  return {
    width: imageWidth * scale,
    height: imageHeight * scale,
    x: (width - imageWidth * scale) / 2,
    y: (height - imageHeight * scale) / 2,
  };
}
