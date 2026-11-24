import { PDFDocument, degrees } from "pdf-lib";
import { assetURL, canvasBlob, checkAbort } from "./files";
import { parsePageRange } from "./geometry";
export async function loadPDF(blob: Blob) {
  const head = new TextDecoder().decode(
    await blob.slice(0, 1024).arrayBuffer(),
  );
  if (!head.includes("%PDF-")) throw new Error("This file is not a valid PDF.");
  try {
    const pdf = await PDFDocument.load(await blob.arrayBuffer());
    if (!pdf.catalog || pdf.getPageCount() < 1)
      throw new Error("Missing page tree");
    return pdf;
  } catch (e) {
    if (/encrypt|password/i.test(String(e)))
      throw new Error(
        "This PDF is password-protected. Unlock it on your device first, then import it.",
      );
    throw new Error(
      "This PDF is damaged or unsupported. Try re-saving it from a PDF viewer.",
    );
  }
}
export async function mergePDFs(
  files: Blob[],
  progress: (n: number) => void,
  signal?: AbortSignal,
) {
  const out = await PDFDocument.create();
  for (let i = 0; i < files.length; i++) {
    checkAbort(signal);
    const pdf = await loadPDF(files[i]);
    for (const p of await out.copyPages(pdf, pdf.getPageIndices()))
      out.addPage(p);
    progress((i + 1) / files.length);
  }
  return new Blob([new Uint8Array(await out.save())], {
    type: "application/pdf",
  });
}
export async function editPDF(file: Blob, range: string, angle: number) {
  const input = await loadPDF(file),
    out = await PDFDocument.create();
  const indexes = parsePageRange(range, input.getPageCount());
  const pages = await out.copyPages(input, indexes);
  pages.forEach((p) => {
    p.setRotation(degrees((p.getRotation().angle + angle) % 360));
    out.addPage(p);
  });
  return new Blob([new Uint8Array(await out.save())], {
    type: "application/pdf",
  });
}
export async function splitPDF(
  file: Blob,
  progress: (n: number) => void,
  signal?: AbortSignal,
) {
  const { zip } = await import("fflate");
  const input = await loadPDF(file),
    files: Record<string, Uint8Array> = {};
  for (let i = 0; i < input.getPageCount(); i++) {
    checkAbort(signal);
    const out = await PDFDocument.create();
    out.addPage((await out.copyPages(input, [i]))[0]);
    files[`page-${String(i + 1).padStart(3, "0")}.pdf`] = await out.save();
    progress((i + 1) / input.getPageCount());
  }
  return new Promise<Blob>((resolve, reject) =>
    zip(files, { level: 0 }, (e, b) =>
      e
        ? reject(e)
        : resolve(new Blob([new Uint8Array(b)], { type: "application/zip" })),
    ),
  );
}
async function renderer(file: Blob) {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = assetURL("vendor/pdf.worker.min.mjs");
  return pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    isEvalSupported: false,
    useSystemFonts: true,
  }).promise;
}
export async function compressPDF(
  file: Blob,
  rasterize: boolean,
  dpi: number,
  quality: number,
  progress: (n: number) => void,
  signal?: AbortSignal,
) {
  const input = await loadPDF(file);
  if (!rasterize) {
    const bytes = await input.save({ useObjectStreams: true });
    return bytes.length < file.size
      ? new Blob([new Uint8Array(bytes)], { type: "application/pdf" })
      : file;
  }
  const rendering = await renderer(file),
    out = await PDFDocument.create();
  try {
    for (let i = 0; i < rendering.numPages; i++) {
      checkAbort(signal);
      const p = await rendering.getPage(i + 1),
        viewport = p.getViewport({ scale: dpi / 72 }),
        canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      if (canvas.width * canvas.height > 30_000_000)
        throw new Error(
          "A PDF page is too large at this resolution. Choose a lower DPI.",
        );
      const task = p.render({
        canvasContext: canvas.getContext("2d")!,
        viewport,
      });
      const cancel = () => task.cancel();
      signal?.addEventListener("abort", cancel, { once: true });
      try {
        await task.promise;
      } finally {
        signal?.removeEventListener("abort", cancel);
      }
      const blob = await canvasBlob(canvas, "image/jpeg", quality),
        img = await out.embedJpg(await blob.arrayBuffer()),
        size = p.getViewport({ scale: 1 });
      out
        .addPage([size.width, size.height])
        .drawImage(img, { x: 0, y: 0, width: size.width, height: size.height });
      canvas.width = 0;
      canvas.height = 0;
      p.cleanup();
      progress((i + 1) / rendering.numPages);
    }
    return new Blob([new Uint8Array(await out.save())], {
      type: "application/pdf",
    });
  } finally {
    await rendering.destroy();
  }
}
export async function pdfThumbnail(file: Blob) {
  const doc = await renderer(file);
  try {
    const p = await doc.getPage(1),
      v = p.getViewport({ scale: 1 }),
      viewport = p.getViewport({ scale: 280 / Math.max(v.width, v.height) }),
      c = document.createElement("canvas");
    c.width = viewport.width;
    c.height = viewport.height;
    await p.render({ canvasContext: c.getContext("2d")!, viewport }).promise;
    return await canvasBlob(c);
  } finally {
    await doc.destroy();
  }
}
