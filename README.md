# FreeScan

A free, local-first document scanner and PDF toolbox. React + TypeScript + Vite, real OpenCV WebAssembly image processing, Tesseract OCR, PDF-lib, IndexedDB, and an offline service worker. No account, backend, paid API, telemetry, document upload, watermark, subscription, or application page-count limit.

## Start locally

Requires Node.js 22+ and npm. The lockfile pins all packages.

```sh
npm ci
npm run dev
```

Processing assets and eleven compressed language packs are included under `public/`. `npm run assets` regenerates the processing worker and checks language checksums, downloading any missing language packs from the pinned upstream revision. It needs the network only if a pack is absent. Normal app use never contacts a CDN.

```sh
npm run build       # production files and offline service worker in dist/
npm run preview     # http://127.0.0.1:4173
npm test            # geometry, PDF, storage and backup integration tests
npm run test:e2e    # Chromium, Firefox, WebKit, mobile Chrome / Safari emulation
npm run check      # strict TypeScript validation
npm run licenses   # dependency inventory and bundled attribution notices
```

For E2E testing on a new machine, install the matching browsers once with `npx playwright install`. Offline mode is tested against the **production build**, not Vite development mode. `localhost` is a secure context for camera testing; a phone opening an HTTP LAN address is not. Use HTTPS for device testing and production.

## Scan and export

1. Select **Scan Document** or **Import Images**. Multiple images become consecutive pages. Files are validated and processed sequentially; successfully imported pages are kept if a later file fails.
2. Automatic boundary detection selects a quadrilateral and corrects perspective. Use **Crop** to refine all four corners, including by keyboard. The original photograph is preserved.
3. Choose Automatic, Clean Document, Black & White, Grayscale, Enhanced Color, Original, Receipt, or Whiteboard. Change brightness, contrast and sharpness, rotate, compare, duplicate, reorder, or undo edits. Editing always reprocesses the original.
4. Add more pages. Changes are saved to IndexedDB. Reopen the app to recover an interrupted draft.
5. Optionally recognize text. English, Hebrew, Arabic, Russian, French, German, Spanish and Italian are included, plus Portuguese, Dutch and Ukrainian. Select multiple languages or the automatic multilingual profile. Review OCR output; it is not guaranteed accurate.
6. Export a genuine PDF with the chosen physical size, orientation, margins and quality. Searchable export adds Tesseract's invisible text layer at the corresponding image position. Ordinary PDF export works without OCR. Download, share, print, or export an individual PNG/JPG/TXT.

PDF tools merge, split into a ZIP, extract/reorder/duplicate pages, rotate pages and compress PDFs locally. A range such as `3, 1, 5-4` defines the output order. Structural compression preserves page content. Optional rasterization is explicitly lossy and removes existing OCR text, forms, links and vectors. If a result is not smaller, the original is kept.

## Installation and offline use

Wait for **Ready offline**. Initial installation caches the app, all processing engines (including OpenCV's embedded WASM), and English OCR. Approximately 45 MB is needed for these assets. Other language packs are cached after recognition or by using **Settings → Available languages**. They are free and served from the same site. All cached features work with the network disconnected. Install with the browser's install menu, or Safari → Share → Add to Home Screen on iOS.

Updates are downloaded in the background and wait for **Settings → Apply update**. The old cache is retained until the new version has installed successfully. Downloaded language packs survive app updates. Storage may be evicted by the browser; persistent-storage permission is a best-effort browser decision.

## Backups and privacy

Use **Settings → Export backup** for a ZIP containing originals, processed images, editable state, OCR, and saved PDFs. **Restore backup** validates the archive and restores copies without replacing existing documents. Bulk PDF downloads also produce a ZIP.

Documents are **not encrypted by FreeScan**. Clearing browser data or uninstalling the PWA may delete them. Keep exported copies. See [Privacy](docs/PRIVACY.md).

## Static deployment

The entire `dist/` directory is the deployable application. No API, database server, edge function or account is required. Serve `.wasm` as `application/wasm`, `.mjs`/`.js` as JavaScript, and use HTTPS. Do not use a host-wide SPA fallback to replace missing binary assets with HTML. See [deployment examples](docs/DEPLOYMENT.md).

- **Cloudflare Pages:** build `npm ci && npm run build`, publish `dist`, Node 22 or newer. No Functions are needed.
- **GitHub Pages:** build with `BASE_PATH=/your-repository/ npm run build`, upload `dist` as the Pages artifact, and deploy with the official Pages action. The included workflow is ready after Pages is enabled for GitHub Actions.
- **Static hosting:** copy `dist/` into the site root or a subdirectory. Default asset URLs are relative, including workers, OCR assets and service-worker scope.

The optional Sites hosting metadata does not affect self-hosting. A private Sites preview may be gated by its hosting provider; the static app itself contains no authentication or sign-in flow. Use public static hosting for unrestricted end-user access.

## Practical limits

- Torch, tap-to-focus, camera switching, full-resolution still capture, automatic capture and Web Share depend on device/browser support. A device-camera file input and normal import/download are always available. Camera tracks stop on exit.
- A four-corner transform corrects planar perspective. It cannot unbend curled pages, reconstruct hidden text, or guarantee results on heavily folded or poorly lit documents. Retake images that are too blurry; clean/color modes retain color stamps better than thresholded modes.
- Maximum processing size is 30 megapixels per image to bound WASM memory. Oversize imports are rejected with an explicit resizing instruction; originals are never silently downsized. There is no application page-count quota. Large document exports and backup restoration remain bounded by device memory. Backup restore rejects archives expanding beyond 512 MB at once; split large backups before restoring on constrained devices.
- Original paper size uses 300 DPI as a physical-size convention because camera pixel dimensions do not establish real-world millimeters.
- Automatic OCR means recognizing across the eight core language models, not perfect language classification. Multiple languages consume more memory. Handwriting, complex RTL layouts and rotated text need review. OCR results are invalidated when the corresponding page changes.
- HEIC/HEIF decoding depends on the browser; if unavailable, convert to JPG/PNG locally. PDF tools reject password-protected PDFs; unlock them locally first.
- WebKit mobile emulation is not a physical iPhone. Real-device camera, torch, focus, low-memory and OS share/installation checks remain necessary before a production release. See [testing evidence and checklist](docs/TESTING.md).

## Source and licenses

[Architecture](docs/ARCHITECTURE.md) describes worker boundaries and data flow. FreeScan source is MIT. Third-party dependencies retain MIT, ISC, Apache-2.0, BSD and OFL licenses; see [dependency inventory](docs/DEPENDENCY-LICENSES.md) and the included `public/third-party-notices.txt`. Do not remove their notices when distributing bundled assets.
