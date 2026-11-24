import {
  PDFDocument,
  PageSizes,
  PDFOperator,
  PDFOperatorNames,
  PDFName,
  PDFHexString,
  endMarkedContent,
} from "pdf-lib";
import type { ExportOptions, OCRResult } from "../types";
import { fitPage } from "./geometry";
export interface PDFInput {
  image: Blob;
  width: number;
  height: number;
  ocr?: OCRResult;
}
export const MM = 72 / 25.4;
export function paperDimensions(
  options: ExportOptions,
  width: number,
  height: number,
): [number, number] {
  let size: [number, number];
  if (options.size === "Original")
    size = [
      (width * 72) / 300 + options.margin * MM * 2,
      (height * 72) / 300 + options.margin * MM * 2,
    ];
  else if (options.size === "Custom")
    size = [options.width * MM, options.height * MM];
  else size = [...PageSizes[options.size]];
  if (!size.every((n) => Number.isFinite(n) && n >= 36 && n <= 14400))
    throw new Error("Page dimensions must be between 12.7 and 5,080 mm.");
  if (options.size !== "Original") {
    const [a, b] = size;
    size =
      options.orientation === "landscape"
        ? [Math.max(a, b), Math.min(a, b)]
        : [Math.min(a, b), Math.max(a, b)];
  }
  return size;
}
export async function buildPDF(
  pages: PDFInput[],
  name: string,
  options: ExportOptions,
  progress: (n: number) => void = () => {},
) {
  if (!pages.length) throw new Error("Add at least one page before exporting.");
  if (!Number.isFinite(options.margin) || options.margin < 0)
    throw new Error("Enter a valid non-negative margin.");
  const pdf = await PDFDocument.create();
  pdf.setTitle(name.replace(/[\u0000-\u001f]/g, "").slice(0, 160));
  pdf.setCreator("");
  pdf.setProducer("");
  pdf.setCreationDate(new Date());
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i],
      bytes = await p.image.arrayBuffer();
    const embedded =
      p.image.type === "image/png"
        ? await pdf.embedPng(bytes)
        : await pdf.embedJpg(bytes);
    const [w, h] = paperDimensions(options, p.width, p.height);
    const placement = fitPage(p.width, p.height, w, h, options.margin * MM);
    const page = pdf.addPage([w, h]);
    page.drawImage(embedded, placement);
    if (options.searchable && p.ocr?.pdf) {
      const layer = await PDFDocument.load(p.ocr.pdf);
      const sourcePage=layer.getPage(0);
      // Keep Tesseract's positioned glyphs and supply logical Unicode text for
      // viewers that otherwise split RTL glyphs into disconnected characters.
      const rtl = /[\u0590-\u08ff]/.test(p.ocr.text);
      if (rtl) {
        const begin=PDFOperator.of(PDFOperatorNames.BeginMarkedContentSequence, [
            PDFName.of("Span"),
            layer.context
              .obj({ ActualText: PDFHexString.fromText(p.ocr.text) })
              .toString(),
          ]);
        const contents=sourcePage.node.normalizedEntries().Contents;
        contents?.insert(0,layer.context.register(layer.context.flateStream(begin.toString()+'\n')));
        contents?.push(layer.context.register(layer.context.flateStream('\n'+endMarkedContent().toString())));
      }
      const [text] = await pdf.embedPages([sourcePage]);
      page.drawPage(text, placement);
    }
    progress((i + 1) / pages.length);
  }
  return new Uint8Array(
    await pdf.save({ useObjectStreams: true, objectsPerTick: 30 }),
  );
}
