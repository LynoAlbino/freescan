import { assetURL, checkAbort } from "./files";
import type { OCRResult } from "../types";
export const LANGUAGES = [
  ["eng", "English"],
  ["heb", "עברית · Hebrew"],
  ["ara", "العربية · Arabic"],
  ["rus", "Русский · Russian"],
  ["fra", "Français"],
  ["deu", "Deutsch"],
  ["spa", "Español"],
  ["ita", "Italiano"],
  ["por", "Português"],
  ["nld", "Nederlands"],
  ["ukr", "Українська"],
] as const;
export async function recognize(
  blob: Blob,
  languages: string[],
  onProgress: (n: number, status: string) => void,
  signal?: AbortSignal,
): Promise<OCRResult> {
  checkAbort(signal);
  if (!languages.length) throw new Error("Choose at least one OCR language.");
  const { createWorker, PSM } = await import("tesseract.js");
  let worker: Awaited<ReturnType<typeof createWorker>> | undefined;
  const abort = () => {
    void worker?.terminate();
  };
  signal?.addEventListener("abort", abort, { once: true });
  try {
    worker = await createWorker(languages, 1, {
      workerPath: assetURL("vendor/tesseract-worker.min.js"),
      corePath: assetURL("vendor/tesseract"),
      langPath: assetURL("tessdata"),
      workerBlobURL: false,
      gzip: true,
      logger: (m) => onProgress(m.progress || 0, m.status),
      errorHandler: () => {},
    });
    checkAbort(signal);
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.AUTO,
      preserve_interword_spaces: "1",
    });
    const { data } = await worker.recognize(
      blob,
      { pdfTextOnly: true },
      { text: true, pdf: true },
    );
    checkAbort(signal);
    if (!data.pdf)
      throw new Error(
        "OCR finished without a text layer. Try again or export without OCR.",
      );
    return {
      text: data.text,
      confidence: data.confidence,
      languages,
      pdf: new Uint8Array(data.pdf),
    };
  } catch (e) {
    if (signal?.aborted) throw new DOMException("OCR canceled.", "AbortError");
    if (!navigator.onLine)
      throw new Error(
        "The OCR engine or selected language is not cached. Connect once and download it in Settings. You can still export a regular PDF.",
      );
    throw e;
  } finally {
    signal?.removeEventListener("abort", abort);
    await worker?.terminate();
  }
}
