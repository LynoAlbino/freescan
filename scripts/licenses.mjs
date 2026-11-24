import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
const lock = JSON.parse(await readFile("package-lock.json", "utf8")),
  rows = [],
  notices = [];
for (const [path, entry] of Object.entries(lock.packages)) {
  if (!path) continue;
  let pkg;
  try {
    pkg = JSON.parse(await readFile(`${path}/package.json`, "utf8"));
  } catch {
    continue;
  }
  const license =
    typeof pkg.license === "string"
      ? pkg.license
      : pkg.license?.type || entry.license || "UNKNOWN";
  if (license === "UNKNOWN") throw new Error(`Missing license: ${pkg.name}`);
  rows.push({
    name: pkg.name,
    version: pkg.version,
    license,
    dev: !!entry.dev,
  });
  let found = false;
  for (const file of await readdir(path)) {
    if (/^(licen[cs]e|copying|notice|ofl)(\.|$)/i.test(file)) {
      try {
        notices.push(
          `\n${"=".repeat(78)}\n${pkg.name} ${pkg.version} — ${license}\n${file}\n${"=".repeat(78)}\n${await readFile(`${path}/${file}`, "utf8")}`,
        );
        found = true;
      } catch {}
    }
  }
  if (!found)
    notices.push(
      `\n${pkg.name} ${pkg.version}\nSPDX license: ${license}\nRepository: ${typeof pkg.repository === "string" ? pkg.repository : pkg.repository?.url || ""}\n`,
    );
}
rows.sort((a, b) => a.name.localeCompare(b.name));
await mkdir("docs", { recursive: true });
await writeFile(
  "docs/DEPENDENCY-LICENSES.md",
  `# Dependency licenses\n\nGenerated from the installed lockfile by \`npm run licenses\`. Versions are pinned. Runtime distributions and development dependencies are listed separately. These permissive licenses allow free distribution; retain the bundled third-party notices. FreeScan source uses MIT; dependency licenses are not replaced by MIT.\n\nOCR traineddata is from [tesseract-ocr/tessdata_fast](https://github.com/tesseract-ocr/tessdata_fast), Apache-2.0, pinned in \`scripts/language-assets.json\`. OpenCV and Tesseract include WebAssembly binaries. Tesseract/Leptonica upstream attribution is retained in the packaged notices where supplied. Inter is OFL-1.1; Lucide/idb are ISC.\n\n| Package | Version | License | Scope |\n| --- | --- | --- | --- |\n${rows.map((r) => `| ${r.name} | ${r.version} | ${r.license} | ${r.dev ? "Development" : "Runtime"} |`).join("\n")}\n`,
);
await writeFile(
  "public/third-party-notices.txt",
  `FreeScan third-party notices\nFreeScan application source: MIT (see LICENSE)\n\nOCR language data: tesseract-ocr/tessdata_fast, Apache License 2.0.\n${notices.join("\n")}\n`,
);
console.log(
  `Verified ${rows.length} installed package licenses. Notices generated.`,
);
