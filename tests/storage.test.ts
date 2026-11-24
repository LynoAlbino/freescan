import "fake-indexeddb/auto";
import { beforeEach, expect, it } from "vitest";
import {
  backupDocuments,
  clearDocuments,
  deleteDocument,
  listDocuments,
  recoverDraft,
  restoreBackup,
  saveDocument,
  setDraft,
} from "../src/lib/storage";
import { defaultEdits, type ScanDocument } from "../src/types";
const fixture = (): ScanDocument => ({
  id: crypto.randomUUID(),
  name: "Local draft",
  created: 1,
  modified: 2,
  pages: [
    {
      id: crypto.randomUUID(),
      original: new Blob(["original"], { type: "image/png" }),
      processed: new Blob(["processed"], { type: "image/png" }),
      thumbnail: new Blob(["thumbnail"], { type: "image/jpeg" }),
      width: 100,
      height: 200,
      originalWidth: 100,
      originalHeight: 200,
      edits: defaultEdits(),
    },
  ],
});
beforeEach(async () => clearDocuments());
it("recovers the full draft with an untouched original after reopening storage", async () => {
  const d = fixture();
  await saveDocument(d);
  await setDraft(d.id);
  const result = await recoverDraft();
  expect(result?.name).toBe(d.name);
  expect(await result?.pages[0].original.text()).toBe("original");
});
it("backs up and restores binary pages without overwriting existing documents", async () => {
  await saveDocument(fixture());
  const backup = await backupDocuments();
  expect(await restoreBackup(backup)).toBe(1);
  const docs = await listDocuments();
  expect(docs).toHaveLength(2);
  expect(docs[0].id).not.toBe(docs[1].id);
  expect(await docs[0].pages[0].original.text()).toBe("original");
});
it("cleans up a deleted draft marker", async () => {
  const d = fixture();
  await saveDocument(d);
  await setDraft(d.id);
  await deleteDocument(d.id);
  expect(await recoverDraft()).toBeUndefined();
  expect(await listDocuments()).toHaveLength(0);
});
