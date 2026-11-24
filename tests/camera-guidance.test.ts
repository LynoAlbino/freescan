import { describe, it, expect } from "vitest";
import { cameraGuidance } from "../src/lib/camera-guidance";
import type { Detection } from "../src/lib/processing";
import type { Corners } from "../src/types";
const rectangle = (x: number, y: number, w: number, h: number): Corners => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
];
const detection = (corners = rectangle(0.12, 0.1, 0.76, 0.8)): Detection => ({
  corners,
  confidence: 0.9,
  brightness: 180,
  blur: 150,
});
describe("live camera guidance and capture gate", () => {
  it("asks for a closer shot of a distant page without enabling auto capture", () => {
    const result = cameraGuidance(detection(rectangle(0.35, 0.3, 0.3, 0.4)));
    expect(result.title).toBe("Move closer");
    expect(result.ready).toBe(false);
  });
  it("does not mistake a long narrow receipt for a distant document", () => {
    expect(
      cameraGuidance(detection(rectangle(0.4, 0.1, 0.15, 0.8))).ready,
    ).toBe(true);
  });
  it("prevents capture when corners are cut off", () => {
    expect(cameraGuidance(detection(rectangle(0, 0.1, 0.8, 0.8))).title).toBe(
      "Move back a little",
    );
  });
  it("prevents capture during motion, blur, poor light, tilt, or failed detection", () => {
    expect(cameraGuidance(detection(), 0.04).ready).toBe(false);
    expect(cameraGuidance({ ...detection(), blur: 15 }).ready).toBe(false);
    expect(cameraGuidance({ ...detection(), brightness: 40 }).ready).toBe(
      false,
    );
    expect(cameraGuidance({ ...detection(), confidence: 0.2 }).ready).toBe(
      false,
    );
    expect(
      cameraGuidance(
        detection([
          { x: 0.3, y: 0.1 },
          { x: 0.7, y: 0.1 },
          { x: 0.9, y: 0.9 },
          { x: 0.1, y: 0.9 },
        ]),
      ).title,
    ).toBe("Hold the phone flat");
  });
});
