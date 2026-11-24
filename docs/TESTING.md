# Validation record

Validated on 24 November 2026. Run the commands in README to reproduce.

## Automated results

- Strict TypeScript checks pass for the application **and both workers**.
- The Vite production build succeeds with all engines, fonts, icons, OCR packs, manifest, CSP and a generated service worker. No remote runtime CDN dependency is used.
- **19 unit/integration tests pass:** corner ordering and invalid crops; aspect-ratio-preserving placement; ordered/descending PDF ranges; safe filenames; real PDF generation, metadata, text-layer embedding, merge/split/reorder/rotation; malformed-file and cancellation handling; persistent draft recovery; binary backups and additive restoration; live guidance and capture gates for distance, receipts, clipped corners, motion, focus, light and tilt.
- **19 browser tests pass across five projects.** The import/edit/export/recovery and interface/fallback scenarios run in every project. The detector regression runs in Chromium and mobile WebKit; camera-guidance, engine and heavier workflow scenarios run once in Chromium. The 31 project-level skips are intentional deduplication, not unsupported browser features.

| Browser project | Real image import → editable scan → PDF → draft recovery | Hebrew UI / dark mode / camera denial recovery |
| --- | --- | --- |
| Chromium desktop | Pass | Pass |
| Chromium, Pixel 7 emulation | Pass | Pass |
| WebKit desktop | Pass | Pass |
| WebKit, iPhone 13 emulation | Pass | Pass |
| Firefox desktop | Pass | Pass |

The full workflow exercises crop correction by keyboard, eight-mode controls, undo/redo, duplicate/reorder/rotate, real PDF download and parsing, and reload recovery. It also checks horizontal overflow and records unexpected browser errors and external network requests. No external document request was observed.

Additional Chromium checks exercise OpenCV on angled paper against light/dark surfaces, verify that all eight modes produce distinct pixel outputs, and confirm grayscale/threshold outputs have no color channels while clean mode retains colored marks. A controlled shadow gradient and small text are included. These are reproducible synthetic fixtures, **not a claim of universal accuracy on real photographs**.

Camera testing uses Chromium's built-in virtual camera, then calls the real MediaDevices API, captures its frame, processes it with OpenCV, exports a PDF, and asserts all media tracks are stopped. The application has no virtual-camera, fake OCR or simulated PDF mode. Only the permission-denial test replaces the browser permission result.

The live-guidance regression additionally supplies a deterministic canvas MediaStream to test the real detection/overlay/capture path. It checks that a distant document blocks auto capture, moving closer updates guidance, a landscape feed aligns correctly on a portrait viewport, and the captured output matches the document dimensions. This controlled stream is test-only. Warm detection of 480×640 synthetic scenes took roughly 7–23ms in local Chromium/WebKit runs; complete live-guidance changes took 119–363ms. Cold engine startup took roughly 0.5–1.1s. These are development-machine measurements, not physical-iPhone speed guarantees.

Six known-boundary fixtures cover a dark desk, faint edges, an inner printed border, heavy side shadow, a narrow receipt and colored paper, plus an empty frame. The regression measures corner error, checks rejection of the empty frame, verifies the shadowed blank margin is brightened, and records before/after crop images. The previous detector incorrectly selected the whole image, the printed box, or part of a shadow, and missed the receipt.

English OCR is recognized with the real local Tesseract engine. The app is then disconnected, reloaded, edited, recognized again and exported entirely offline. The downloaded PDF is independently readable by Poppler `pdftotext`. Hebrew and Arabic fixtures are recognized locally and exported with the genuine positioned Tesseract text layer; RTL logical Unicode metadata supplements the glyph layer. Recognition errors, especially numbers and complex layouts, still require review. Viewer-specific RTL selection grouping may vary.

One full-suite run stalled during image import in mobile WebKit. The unchanged final build then passed the complete import/edit/export/recovery workflow in three consecutive focused mobile-WebKit runs (6.6s, 6.7s and 5.9s). This intermittent timeout remains recorded; it is not evidence of a physical-iPhone performance guarantee.

## Compatibility fixes found during testing

- OpenCV's self-returning legacy thenable caused an infinite promise resolution loop when awaited directly. Initialization now resolves a separate no-value readiness promise.
- PDF-lib accepted a header-only malformed input. Import validation now requires a valid page tree.
- Mobile icon-only export and several control labels needed explicit accessible names.
- WebKit rejected native Blob/File values in IndexedDB. Storage now falls back to exact ArrayBuffer bytes and hydrates them on read. Originals remain intact.
- Root theme colors are token-based, so dark surfaces and text switch together.
- A last-page deletion is persisted; navigating away clears the active editor reference so later preference changes cannot recreate a deleted document.

## Physical-device release checklist — not yet performed

Browser emulation does not validate camera optics or the actual iOS/Android OS. Before declaring a production release, perform these checks on target devices:

- Rear/front camera switching, native high-resolution capture versus video-frame fallback, tap-to-focus and torch where available; all tracks stop after exit, app backgrounding and error recovery.
- Automatic capture with a real stable document, movement between consecutive pages, blurred photos, dim light and positioning at frame edges.
- White paper on light/dark desks; angled, folded, curled and heavily shadowed pages; long receipts; real handwriting; colored paper, stamps, signatures and fine print. Four-corner correction cannot unwarp curled paper or reconstruct obscured text.
- Actual iOS Safari/Android installation, standalone launch, safe-area layout, cached-language OCR after airplane-mode restart, OS share targets and printing.
- Browser storage eviction, full disk, low-memory interruption, very large PDFs, long multipage scans, cancellation during every expensive operation, and restoring a large real backup.
- VoiceOver and TalkBack; keyboard-only interaction; text scaling, reduced motion, RTL reading order and contrast against target accessibility standards.

The app is deployable and the automated workflows above are verified. Physical-device release certification and broad photographic quality benchmarking remain outstanding.
