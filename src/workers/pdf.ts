/// <reference lib="webworker" />
import { buildPDF } from "../lib/pdf-engine";
self.onmessage = async (event) => {
  try {
    const bytes = await buildPDF(
      event.data.pages,
      event.data.name,
      event.data.options,
      (progress) => self.postMessage({ progress }),
    );
    self.postMessage({ bytes }, [bytes.buffer]);
  } catch (e) {
    self.postMessage({
      error:
        e instanceof Error
          ? e.message
          : "PDF export failed. Try fewer pages at a time to reduce memory usage.",
    });
  }
};
