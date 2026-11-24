# Architecture

## Modules

| Area | Location | Responsibility |
| --- | --- | --- |
| App and document state | `src/App.tsx`, `src/types.ts` | Navigation, import queue, draft persistence, document actions |
| Camera | `src/components/Camera.tsx` | Rear-camera preference, capabilities, capture, live quality feedback, stream cleanup |
| Detection / processing | `src/workers/processor.ts`, `src/lib/processing.ts` | A serialized classic worker with a self-hosted OpenCV/WASM runtime |
| Editor | `src/components/Editor.tsx`, `CropEditor.tsx` | Non-destructive editing, history, thumbnails, accessible crop points |
| OCR | `src/lib/ocr.ts` | Lazy Tesseract workers, language selection, progress, termination and recognition |
| PDF export | `src/lib/pdf.ts`, `pdf-engine.ts`, `src/workers/pdf.ts` | Incremental page preparation, PDF assembly off the UI thread, invisible text layers |
| PDF utilities | `src/lib/pdf-tools.ts`, `components/Tools.tsx` | Structural edits with PDF-lib, optional PDF.js rasterization |
| Library / storage | `src/lib/storage.ts`, `components/Library.tsx` | IndexedDB transactions, originals, processed blobs, backup import/export |
| PWA | `src/lib/pwa.ts`, `scripts/service-worker.mjs` | Content-versioned static cache, language cache, install and update state |
| Localization | `src/lib/i18n.tsx` | English/Hebrew controls and RTL document direction |

## Image pipeline

Images are decoded with EXIF orientation applied and validated by their file signatures. The source Blob is retained. Detection uses a separate maximum-720px image (640px live camera frames), grayscale, Gaussian smoothing, Canny, morphological closing, contours, convex quadrilateral approximation and a confidence score. An Otsu threshold contour pass helps when edge contrast is poor. Four ordered normalized corners map back to the full-resolution source.

Perspective correction uses a four-point projective transform with cubic interpolation. Width and height are estimated from opposing edges. Rotation is geometric. Clean/auto/color/whiteboard modes estimate low-frequency illumination with downsampling, morphological closing and Gaussian blur; normalize brightness per pixel; apply limited gray-world white balance; and preserve channels. Black-and-white uses Gaussian adaptive thresholding, receipt mode uses mean adaptive thresholding with a wider neighborhood, and grayscale uses normalized luminance. Brightness/contrast adjustments and an unsharp mask operate on pixel buffers, not CSS filters. Original mode skips enhancement, but honors explicit crop/rotation/adjustments.

All OpenCV matrices are tracked and released in `finally`. Pixel buffers are transferred to a worker. The legacy OpenCV thenable must **not** be awaited directly: its callback returns the module itself. Initialization wraps a no-value callback to avoid an infinite promise-assimilation loop. Cancellation terminates the worker and rejects outstanding jobs. Final processed pages are encoded losslessly as PNG; separate small JPEG thumbnails avoid full-resolution preview decoding in the library.

The camera samples one low-resolution frame at a time. Stability compares four normalized corners over successive frames, while blur uses Laplacian variance and light uses mean luminance. Auto-capture requires confident boundaries, sufficient light, sharpness and stability. It disarms after capture until movement/new positioning occurs. Manual capture remains available.

## Data and export

A `ScanDocument` contains ordered `ScanPage` values. Each page stores original, processed image, thumbnail, current edits, dimensions and optional OCR. An edit reprocesses the original and invalidates the old OCR/PDF, so repeated editing does not accumulate JPEG loss. A bounded in-memory undo history retains 30 document states; the latest state, not history, is persisted. Autosave writes are serialized. Completed import pages are also saved before the next page is processed.

Tesseract returns a real text-only PDF with glyph mappings and bounding boxes. PDF-lib embeds that PDF page over the corresponding scan with identical fit/placement. This avoids substituting fake text, losing non-Latin characters through WinAnsi fonts, or using a visible text overlay. UI extraction is direction-aware. Ordinary export is independent of OCR.

High quality embeds the lossless processed PNG without recompression. Standard/compressed/custom presets explicitly resample and encode JPEG. PDF construction runs in a separate worker and can be canceled by terminating it. The saved export Blob is invalidated by content edits. PDFs imported through utilities use a `pdfOnly` record, keeping native PDF content until the user explicitly selects rasterization.

## Offline and security boundaries

All application requests are same-origin static asset GETs. The CSP blocks external connections, object plugins and arbitrary scripts while allowing self-hosted workers, WASM, blob images and fonts. Imported documents never appear in a network request. File names are sanitized, malformed PDFs are checked for a valid page tree, encrypted PDFs are rejected, and image imports require recognized raster signatures. PDF.js is configured with `isEvalSupported: false`.

Service-worker installation caches complete application assets and English OCR before reporting ready. Additional languages use a separate cache. A waiting update activates only through a user control; old app caches are deleted on activation. No API or analytics is present. Origin-based browser storage is not application-level encryption.
