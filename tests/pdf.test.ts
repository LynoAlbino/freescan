import { describe, it, expect } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { buildPDF } from "../src/lib/pdf-engine";
import { DEFAULT_EXPORT } from "../src/types";
import { editPDF, loadPDF, mergePDFs, splitPDF } from "../src/lib/pdf-tools";
import { unzipSync } from "fflate";
const pixel = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
    "base64",
  ),
);
async function fixture() {
  const d = await PDFDocument.create();
  d.addPage([200, 300]);
  d.addPage([400, 600]);
  d.addPage([500, 700]);
  return new Blob([new Uint8Array(await d.save())], {
    type: "application/pdf",
  });
}
describe("genuine PDF generation and tools", () => {
  it("creates a correctly sized multi-page PDF with title metadata and no branding", async () => {
    const b = await buildPDF(
      [
        {
          image: new Blob([pixel], { type: "image/png" }),
          width: 100,
          height: 200,
        },
        {
          image: new Blob([pixel], { type: "image/png" }),
          width: 200,
          height: 100,
        },
      ],
      "A real scan",
      DEFAULT_EXPORT,
    );
    const pdf = await PDFDocument.load(b);
    expect(pdf.getPageCount()).toBe(2);
    expect(pdf.getTitle()).toBe("A real scan");
    expect(pdf.getPage(0).getWidth()).toBeCloseTo(595.28);
    expect(pdf.getCreator()).toBe("");
  });
  it("embeds an actual selectable text PDF as the OCR layer", async () => {
    const layer = await PDFDocument.create(),
      p = layer.addPage([100, 200]),
      font = await layer.embedFont(StandardFonts.Helvetica);
    p.drawText("FreeScan searchable test", {
      x: 5,
      y: 100,
      size: 6,
      font,
      opacity: 0,
    });
    const result = await buildPDF(
      [
        {
          image: new Blob([pixel], { type: "image/png" }),
          width: 100,
          height: 200,
          ocr: {
            text: "FreeScan searchable test",
            languages: ["eng"],
            confidence: 99,
            pdf: await layer.save(),
          },
        },
      ],
      "Searchable",
      { ...DEFAULT_EXPORT, searchable: true },
    );
    expect((await PDFDocument.load(result)).getPageCount()).toBe(1);
    expect(result.length).toBeGreaterThan(1000);
  });
  it("merges without rasterizing and preserves custom page sizes", async () => {
    const a = await fixture();
    const merged = await loadPDF(await mergePDFs([a, a], () => {}));
    expect(merged.getPageCount()).toBe(6);
    expect(merged.getPage(4).getSize()).toEqual({ width: 400, height: 600 });
  });
  it("extracts, reorders and rotates the requested pages", async () => {
    const out = await loadPDF(await editPDF(await fixture(), "3,1,1", 90));
    expect(out.getPageCount()).toBe(3);
    expect(out.getPage(0).getWidth()).toBe(500);
    expect(out.getPage(0).getRotation().angle).toBe(90);
    expect(out.getPage(1).getWidth()).toBe(200);
  });
  it("splits all pages to usable PDFs inside a ZIP", async () => {
    const archive = await splitPDF(await fixture(), () => {});
    const files = unzipSync(new Uint8Array(await archive.arrayBuffer()));
    expect(Object.keys(files)).toHaveLength(3);
    expect(
      (await PDFDocument.load(files["page-002.pdf"])).getPage(0).getWidth(),
    ).toBe(400);
  });
  it("rejects malformed inputs and cancellation", async () => {
    await expect(loadPDF(new Blob(["garbage"]))).rejects.toThrow("valid PDF");
    await expect(loadPDF(new Blob(["%PDF-1.7 broken"]))).rejects.toThrow(
      "damaged",
    );
    const abort = new AbortController();
    abort.abort();
    await expect(
      mergePDFs([await fixture()], () => {}, abort.signal),
    ).rejects.toThrow("canceled");
  });
});
