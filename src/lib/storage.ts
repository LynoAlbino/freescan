import { openDB, type DBSchema } from "idb";
import type { ScanDocument, ScanPage } from "../types";
import { MODES } from "../types";
import { validCorners } from "./geometry";
type StoredBlob = { buffer: ArrayBuffer; type: string };
type StoredPage = Omit<ScanPage, "original" | "processed" | "thumbnail"> & {
  original: Blob | StoredBlob;
  processed: Blob | StoredBlob;
  thumbnail: Blob | StoredBlob;
};
type StoredDocument = Omit<ScanDocument, "pages" | "pdf"> & {
  pages: StoredPage[];
  pdf?: Blob | StoredBlob;
};
const hydrateBlob = (value: Blob | StoredBlob) =>
  value instanceof Blob
    ? value
    : new Blob([value.buffer], { type: value.type });
function hydrate(doc: StoredDocument): ScanDocument {
  return {
    ...doc,
    pdf: doc.pdf ? hydrateBlob(doc.pdf) : undefined,
    pages: doc.pages.map((p) => ({
      ...p,
      original: hydrateBlob(p.original),
      processed: hydrateBlob(p.processed),
      thumbnail: hydrateBlob(p.thumbnail),
    })),
  };
}
async function serialize(doc: ScanDocument): Promise<StoredDocument> {
  const binary = async (b: Blob): Promise<StoredBlob> => ({
    type: b.type,
    buffer: await b.arrayBuffer(),
  });
  const pages: StoredPage[] = [];
  for (const p of doc.pages)
    pages.push({
      ...p,
      original: await binary(p.original),
      processed: await binary(p.processed),
      thumbnail: await binary(p.thumbnail),
    });
  return { ...doc, pages, pdf: doc.pdf ? await binary(doc.pdf) : undefined };
}
let binaryStorage = false;
interface Schema extends DBSchema {
  documents: { key: string; value: StoredDocument };
  meta: { key: string; value: unknown };
}
const db = () =>
  openDB<Schema>("freescan", 1, {
    upgrade(db) {
      db.createObjectStore("documents", { keyPath: "id" });
      db.createObjectStore("meta");
    },
  });
export async function listDocuments() {
  return (await (await db()).getAll("documents"))
    .map(hydrate)
    .sort((a, b) => b.modified - a.modified);
}
export async function saveDocument(doc: ScanDocument) {
  const connection = await db();
  if (binaryStorage) {
    await connection.put("documents", await serialize(doc));
    return;
  }
  try {
    await connection.put("documents", doc);
  } catch (error) {
    if (!/blob|clone/i.test(String(error))) throw error;
    // WebKit may reject Blob/File structured clones in IndexedDB. Persist the
    // exact bytes instead; hydrate them back to Blobs when the library opens.
    await connection.put("documents", await serialize(doc));
    binaryStorage = true;
  }
}
export async function deleteDocument(id: string) {
  const d = await db(),
    tx = d.transaction(["documents", "meta"], "readwrite");
  await tx.objectStore("documents").delete(id);
  if ((await tx.objectStore("meta").get("draft")) === id)
    await tx.objectStore("meta").delete("draft");
  await tx.done;
}
export async function setDraft(id: string | null) {
  const d = await db();
  if (id) await d.put("meta", id, "draft");
  else await d.delete("meta", "draft");
}
export async function recoverDraft() {
  const d = await db(),
    id = await d.get("meta", "draft");
  const doc = typeof id === "string" ? await d.get("documents", id) : undefined;
  return doc ? hydrate(doc) : undefined;
}
export async function clearDocuments() {
  const d = await db(),
    tx = d.transaction(["documents", "meta"], "readwrite");
  await tx.objectStore("documents").clear();
  await tx.objectStore("meta").clear();
  await tx.done;
}
export function documentBytes(doc: ScanDocument) {
  return (
    (doc.pdf?.size || 0) +
    doc.pages.reduce(
      (n, p) =>
        n +
        p.original.size +
        p.processed.size +
        p.thumbnail.size +
        (p.ocr?.pdf.byteLength || 0),
      0,
    )
  );
}
export async function backupDocuments() {
  const { zip, strToU8 } = await import("fflate");
  const docs = await listDocuments();
  const files: Record<string, Uint8Array> = {};
  const manifest = [];
  for (const d of docs) {
    const pages = [];
    for (const p of d.pages) {
      const base = `${d.id}/${p.id}`;
      files[base + "-original"] = new Uint8Array(
        await p.original.arrayBuffer(),
      );
      files[base + "-processed"] = new Uint8Array(
        await p.processed.arrayBuffer(),
      );
      files[base + "-thumb"] = new Uint8Array(await p.thumbnail.arrayBuffer());
      if (p.ocr) files[base + "-ocr.pdf"] = p.ocr.pdf;
      pages.push({
        ...p,
        original: p.original.type,
        processed: p.processed.type,
        thumbnail: p.thumbnail.type,
        ocr: p.ocr ? { ...p.ocr, pdf: base + "-ocr.pdf" } : undefined,
      });
    }
    if (d.pdf)
      files[d.id + "/document.pdf"] = new Uint8Array(await d.pdf.arrayBuffer());
    manifest.push({ ...d, pdf: !!d.pdf, pages });
  }
  files["manifest.json"] = strToU8(
    JSON.stringify({ version: 1, documents: manifest }),
  );
  return new Promise<Blob>((resolve, reject) =>
    zip(files, { level: 0 }, (e, b) =>
      e
        ? reject(e)
        : resolve(new Blob([new Uint8Array(b)], { type: "application/zip" })),
    ),
  );
}
export async function restoreBackup(blob: Blob) {
  const { unzip, strFromU8 } = await import("fflate");
  let size = 0;
  const data = await new Promise<Record<string, Uint8Array>>(
    (resolve, reject) => {
      void blob
        .arrayBuffer()
        .then((buffer) =>
          unzip(
            new Uint8Array(buffer),
            {
              filter: (file) => {
                size += file.originalSize;
                if (size > 512 * 1024 * 1024)
                  throw new Error(
                    "This backup needs more than 512 MB to restore at once. Restore smaller backups to protect device memory.",
                  );
                return true;
              },
            },
            (error, result) => (error ? reject(error) : resolve(result)),
          ),
        )
        .catch(reject);
    },
  );
  if (!data["manifest.json"]) throw new Error("This is not a FreeScan backup.");
  const manifest = JSON.parse(strFromU8(data["manifest.json"]));
  if (manifest.version !== 1 || !Array.isArray(manifest.documents))
    throw new Error("Unsupported backup version.");
  const restored: ScanDocument[] = [];
  for (const d of manifest.documents) {
    if (
      typeof d.id !== "string" ||
      typeof d.name !== "string" ||
      !Array.isArray(d.pages)
    )
      throw new Error("The backup contains an invalid document.");
    const pages = [];
    for (const p of d.pages) {
      const base = `${d.id}/${p.id}`;
      if (
        !data[base + "-original"] ||
        !data[base + "-processed"] ||
        !data[base + "-thumb"] ||
        !p.edits ||
        !Array.isArray(p.edits.corners) ||
        p.edits.corners.length !== 4 ||
        !validCorners(p.edits.corners) ||
        !MODES.some((mode) => mode.id === p.edits.mode) ||
        ![0, 90, 180, 270].includes(p.edits.rotation) ||
        ![p.edits.brightness, p.edits.contrast, p.edits.sharpness].every(
          (n) =>
            typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= 100,
        ) ||
        ![p.original, p.processed, p.thumbnail].every(
          (mime) =>
            typeof mime === "string" &&
            /^image\/(png|jpeg|webp|gif|heic|heif)$/.test(mime),
        ) ||
        ![p.width, p.height, p.originalWidth, p.originalHeight].every(
          (n) => typeof n === "number" && Number.isFinite(n) && n > 0,
        )
      )
        throw new Error("A page in this backup is incomplete.");
      pages.push({
        ...p,
        id: crypto.randomUUID(),
        original: new Blob([new Uint8Array(data[base + "-original"])], {
          type: p.original,
        }),
        processed: new Blob([new Uint8Array(data[base + "-processed"])], {
          type: p.processed,
        }),
        thumbnail: new Blob([new Uint8Array(data[base + "-thumb"])], {
          type: p.thumbnail,
        }),
        ocr:
          p.ocr && data[p.ocr.pdf]
            ? { ...p.ocr, pdf: data[p.ocr.pdf] }
            : undefined,
      });
    }
    restored.push({
      id: crypto.randomUUID(),
      name: d.name.slice(0, 160),
      created: Number(d.created) || Date.now(),
      modified: Date.now(),
      pages,
      pdf:
        d.pdf && data[d.id + "/document.pdf"]
          ? new Blob([new Uint8Array(data[d.id + "/document.pdf"])], {
              type: "application/pdf",
            })
          : undefined,
      pdfOnly: !!d.pdfOnly,
      pdfPageCount: Number(d.pdfPageCount) || undefined,
    });
  }
  const serialized: StoredDocument[] = [];
  for (const doc of restored) serialized.push(await serialize(doc));
  const connection = await db(),
    tx = connection.transaction("documents", "readwrite");
  for (const d of serialized) await tx.store.put(d);
  await tx.done;
  return restored.length;
}
