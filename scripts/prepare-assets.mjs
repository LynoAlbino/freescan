import {
  mkdir,
  copyFile,
  readdir,
  readFile,
  writeFile,
  access,
} from "node:fs/promises";
import { build } from "esbuild";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
const vendor = "public/vendor";
await import("./create-icons.mjs");
await mkdir(vendor, { recursive: true });
await mkdir("public/tessdata", { recursive: true });
await copyFile(
  "node_modules/@techstark/opencv-js/dist/opencv.js",
  `${vendor}/opencv.js`,
);
await copyFile(
  "node_modules/tesseract.js/dist/worker.min.js",
  `${vendor}/tesseract-worker.min.js`,
);
await mkdir(`${vendor}/tesseract`, { recursive: true });
for (const name of await readdir("node_modules/tesseract.js-core"))
  if (name.endsWith(".wasm.js") || name.endsWith(".wasm"))
    await copyFile(
      `node_modules/tesseract.js-core/${name}`,
      `${vendor}/tesseract/${name}`,
    );
await copyFile(
  "node_modules/pdfjs-dist/build/pdf.worker.min.mjs",
  `${vendor}/pdf.worker.min.mjs`,
);
await build({
  entryPoints: ["src/workers/processor.ts"],
  outfile: `${vendor}/processor.js`,
  bundle: true,
  format: "iife",
  target: "es2020",
  minify: true,
});
let lock;
try {
  lock = JSON.parse(await readFile("scripts/language-assets.json", "utf8"));
} catch {
  const res = await fetch(
    "https://api.github.com/repos/tesseract-ocr/tessdata_fast/commits/main",
  );
  if (!res.ok) throw new Error("Cannot resolve language data revision.");
  const info = await res.json();
  lock = { revision: info.sha, files: {} };
}
const languages = [
  "eng",
  "heb",
  "ara",
  "rus",
  "fra",
  "deu",
  "spa",
  "ita",
  "por",
  "nld",
  "ukr",
];
for (const lang of languages) {
  const path = `public/tessdata/${lang}.traineddata.gz`;
  try {
    await access(path);
  } catch {
    console.log(`Downloading self-hosted ${lang} OCR data…`);
    const response = await fetch(
      `https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/${lock.revision}/${lang}.traineddata`,
    );
    if (!response.ok) throw new Error(`Language download failed: ${lang}`);
    await writeFile(path, gzipSync(Buffer.from(await response.arrayBuffer())));
  }
  const checksum = createHash("sha256")
    .update(await readFile(path))
    .digest("hex");
  if (lock.files[lang] && lock.files[lang] !== checksum)
    throw new Error(`Language checksum mismatch: ${lang}`);
  lock.files[lang] = checksum;
}
await writeFile(
  "scripts/language-assets.json",
  JSON.stringify(lock, null, 2) + "\n",
);
console.log("All processing assets are self-hosted.");
