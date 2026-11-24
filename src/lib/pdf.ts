import type { ScanDocument, ExportOptions } from "../types";
import { checkAbort, resizeBlob } from "./files";
import { paperDimensions, type PDFInput } from "./pdf-engine";
export async function exportPDF(
  doc: ScanDocument,
  options: ExportOptions,
  onProgress: (n: number) => void = () => {},
  signal?: AbortSignal,
): Promise<Blob> {
  if (doc.pdfOnly && doc.pdf) return doc.pdf;
  const pages: PDFInput[] = [];
  for (let i = 0; i < doc.pages.length; i++) {
    checkAbort(signal);
    const p = doc.pages[i];
    let image = p.processed;
    if (options.quality !== "high") {
      const dpi =
        options.quality === "compressed"
          ? 120
          : options.quality === "standard"
            ? 200
            : options.dpi;
      const quality =
        options.quality === "compressed"
          ? 0.65
          : options.quality === "standard"
            ? 0.85
            : options.jpegQuality;
      const size = paperDimensions(options, p.width, p.height);
      image = await resizeBlob(
        image,
        (Math.max(...size) / 72) * dpi,
        "image/jpeg",
        quality,
      );
    }
    pages.push({
      image,
      width: p.width,
      height: p.height,
      ocr: options.searchable ? p.ocr : undefined,
    });
    onProgress(((i + 1) / doc.pages.length) * 0.4);
  }
  checkAbort(signal);
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("../workers/pdf.ts", import.meta.url), {
      type: "module",
    });
    const cleanup = () => {
      signal?.removeEventListener("abort", abort);
      worker.terminate();
    };
    const abort = () => {
      cleanup();
      reject(new DOMException("Export canceled.", "AbortError"));
    };
    signal?.addEventListener("abort", abort, { once: true });
    worker.onmessage = (e) => {
      if (e.data.progress !== undefined)
        onProgress(0.4 + e.data.progress * 0.6);
      else if (e.data.error) {
        cleanup();
        reject(new Error(e.data.error));
      } else {
        cleanup();
        resolve(new Blob([e.data.bytes], { type: "application/pdf" }));
      }
    };
    worker.onerror = () => {
      cleanup();
      reject(
        new Error(
          "PDF export ran out of memory or could not load. Try compressed quality, or export fewer pages.",
        ),
      );
    };
    worker.postMessage({ pages, name: doc.name, options });
  });
}
