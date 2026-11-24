import { describe, it, expect } from "vitest";
import {
  fitPage,
  orderCorners,
  parsePageRange,
  validCorners,
} from "../src/lib/geometry";
import { fullCorners, DEFAULT_EXPORT } from "../src/types";
import { paperDimensions } from "../src/lib/pdf-engine";
import { filename } from "../src/lib/files";
describe("document geometry", () => {
  it("orders skewed corners without relying on duplicate min/max sums", () => {
    expect(
      orderCorners([
        { x: 0.8, y: 0.9 },
        { x: 0.1, y: 0.2 },
        { x: 0.2, y: 0.8 },
        { x: 0.9, y: 0.1 },
      ]),
    ).toEqual([
      { x: 0.1, y: 0.2 },
      { x: 0.9, y: 0.1 },
      { x: 0.8, y: 0.9 },
      { x: 0.2, y: 0.8 },
    ]);
  });
  it("rejects crossing, collapsed, and out-of-range crops", () => {
    expect(validCorners(fullCorners())).toBe(true);
    expect(
      validCorners([
        { x: 0, y: 0 },
        { x: 1, y: 1 },
        { x: 1, y: 0 },
        { x: 0, y: 1 },
      ]),
    ).toBe(false);
    expect(
      validCorners([
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        { x: 0, y: 0 },
      ]),
    ).toBe(false);
    const c = fullCorners();
    c[0].x = NaN;
    expect(validCorners(c)).toBe(false);
  });
  it("fits images without stretching and centers margins", () => {
    expect(fitPage(1000, 2000, 600, 800, 20)).toEqual({
      width: 380,
      height: 760,
      x: 110,
      y: 20,
    });
    expect(() => fitPage(1, 1, 100, 100, 60)).toThrow();
  });
  it("supports ordered, descending and duplicate PDF page ranges", () => {
    expect(parsePageRange("3, 5-3, 1, 1", 5)).toEqual([2, 4, 3, 2, 0, 0]);
    expect(parsePageRange("", 3)).toEqual([0, 1, 2]);
    for (const invalid of ["0", "6", "abc", "1,,2", "1-"])
      expect(() => parsePageRange(invalid, 5)).toThrow();
  });
  it("validates physical PDF dimensions", () => {
    expect(
      paperDimensions(
        { ...DEFAULT_EXPORT, size: "Custom", width: 100, height: 200 },
        100,
        200,
      )[0],
    ).toBeCloseTo(283.46, 1);
    expect(() =>
      paperDimensions(
        { ...DEFAULT_EXPORT, size: "Custom", width: NaN },
        100,
        200,
      ),
    ).toThrow();
  });
  it("cleans filenames without destroying RTL names", () => {
    expect(filename("חשבונית / 24:11.pdf")).toBe("חשבונית  2411.pdf");
    expect(filename("")).toBe("Document.pdf");
    expect(filename("Notes.png", "jpg")).toBe("Notes.jpg");
  });
});
