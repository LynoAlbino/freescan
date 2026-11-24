import { useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  Undo2,
  Redo2,
  Plus,
  Crop,
  RotateCw,
  SlidersHorizontal,
  ScanText,
  Columns2,
  Maximize2,
  Copy,
  Trash2,
  ChevronUp,
  ChevronDown,
  Check,
  Download,
} from "lucide-react";
import {
  MODES,
  defaultEdits,
  type Edits,
  type ScanDocument,
  type ScanPage,
} from "../types";
import { cancelProcessing, processImage } from "../lib/processing";
import { download, errorMessage, filename, resizeBlob } from "../lib/files";
import { LANGUAGES, recognize } from "../lib/ocr";
import { BlobImage, Busy, Modal } from "./common";
import { CropEditor } from "./CropEditor";
import { useI18n } from "../lib/i18n";
export function Editor({
  doc,
  onChange,
  onBack,
  onAdd,
  onExport,
  saveStatus,
}: {
  doc: ScanDocument;
  onChange: (doc: ScanDocument) => void;
  onBack: () => void;
  onAdd: () => void;
  onExport: () => void;
  saveStatus: string;
}) {
  const { t } = useI18n(),
    [index, setIndex] = useState(0),
    [panel, setPanel] = useState<"adjust" | "text">("adjust"),
    [crop, setCrop] = useState(false),
    [compare, setCompare] = useState(false),
    [full, setFull] = useState(false),
    [busy, setBusy] = useState(""),
    [progress, setProgress] = useState(0),
    [error, setError] = useState(""),
    [languages, setLanguages] = useState(["eng"]),
    [automatic, setAutomatic] = useState(false),
    [past, setPast] = useState<ScanDocument[]>([]),
    [future, setFuture] = useState<ScanDocument[]>([]),
    [sliders, setSliders] = useState<Edits>(),
    drag = useRef<number | undefined>(undefined),
    abort = useRef<AbortController | undefined>(undefined);
  const page = doc.pages[Math.min(index, doc.pages.length - 1)];
  useEffect(() => setSliders(page?.edits), [page?.id, page?.edits]);
  useEffect(
    () => () => {
      abort.current?.abort();
    },
    [],
  );
  function commit(next: ScanDocument) {
    setPast((p) => [...p, doc].slice(-30));
    setFuture([]);
    onChange({ ...next, modified: Date.now(), pdf: undefined });
  }
  function updatePage(next: ScanPage) {
    commit({
      ...doc,
      pages: doc.pages.map((p) => (p.id === next.id ? next : p)),
    });
  }
  async function edit(edits: Edits) {
    if (!page) return;
    setBusy("Enhancing your page…");
    setError("");
    try {
      const result = await processImage(page.original, edits);
      updatePage({ ...page, ...result, edits, ocr: undefined });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy("");
    }
  }
  function undo() {
    const d = past.at(-1);
    if (d) {
      setPast(past.slice(0, -1));
      setFuture([doc, ...future]);
      onChange(d);
    }
  }
  function redo() {
    const d = future[0];
    if (d) {
      setFuture(future.slice(1));
      setPast([...past, doc]);
      onChange(d);
    }
  }
  function move(from: number, to: number) {
    if (to < 0 || to >= doc.pages.length) return;
    const pages = [...doc.pages];
    pages.splice(to, 0, pages.splice(from, 1)[0]);
    commit({ ...doc, pages });
    setIndex(to);
  }
  async function ocr(all = false) {
    const controller = new AbortController();
    abort.current = controller;
    setError("");
    try {
      const targets = all ? doc.pages : [page];
      const updated = [...doc.pages];
      for (let i = 0; i < targets.length; i++) {
        setBusy(`Recognizing page ${i + 1} of ${targets.length}…`);
        const target = targets[i];
        const result = await recognize(
          target.processed,
          automatic ? LANGUAGES.slice(0, 8).map((l) => l[0]) : languages,
          (n, status) => {
            setProgress((i + n) / targets.length);
            setBusy(`${status} · ${i + 1}/${targets.length}`);
          },
          controller.signal,
        );
        updated[updated.findIndex((p) => p.id === target.id)] = {
          ...target,
          ocr: result,
        };
      }
      commit({ ...doc, pages: updated });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy("");
    }
  }
  async function exportImage(type: "jpg" | "png") {
    try {
      const blob =
        type === "png"
          ? page.processed
          : await resizeBlob(
              page.processed,
              Math.max(page.width, page.height),
              "image/jpeg",
              0.98,
            );
      download(blob, filename(`${doc.name} - page ${index + 1}`, type));
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  if (!page)
    return (
      <div className="empty-state">
        <h2>{t("No documents yet")}</h2>
        <button className="button primary" onClick={onAdd}>
          {t("Add page")}
        </button>
        <button className="button" onClick={onBack}>
          {t("Back")}
        </button>
      </div>
    );
  return (
    <section className="editor">
      <header className="editor-header">
        <button
          className="icon-button"
          aria-label={t("Back")}
          onClick={onBack}
          disabled={!!busy}
        >
          <ChevronLeft />
        </button>
        <div className="document-heading">
          <input
            aria-label={t("Document name")}
            value={doc.name}
            onChange={(e) =>
              onChange({
                ...doc,
                name: e.target.value,
                modified: Date.now(),
                pdf: undefined,
              })
            }
          />
          <span>
            <Check size={13} />
            {saveStatus}
          </span>
        </div>
        <div className="history-buttons">
          <button
            className="icon-button"
            onClick={undo}
            aria-label={t("Undo")}
            disabled={!past.length || !!busy}
          >
            <Undo2 />
          </button>
          <button
            className="icon-button"
            onClick={redo}
            aria-label={t("Redo")}
            disabled={!future.length || !!busy}
          >
            <Redo2 />
          </button>
        </div>
        <button
          className="button primary"
          aria-label={t("Export PDF")}
          onClick={onExport}
          disabled={!!busy}
        >
          <Download size={17} />
          <span>{t("Export PDF")}</span>
        </button>
      </header>
      {error && (
        <div className="notice error" role="alert">
          {error}
          <button onClick={() => setError("")} aria-label={t("Dismiss")}>
            ×
          </button>
        </div>
      )}
      {busy && (
        <Busy
          label={busy}
          progress={progress || undefined}
          onCancel={() => {
            abort.current?.abort();
            cancelProcessing();
          }}
        />
      )}
      <div className="editor-layout">
        <aside className="page-strip">
          <div className="strip-heading">
            {doc.pages.length} {t(doc.pages.length === 1 ? "page" : "pages")}
          </div>
          {doc.pages.map((p, i) => (
            <div
              className={`thumbnail-item ${i === index ? "selected" : ""}`}
              key={p.id}
              draggable={!busy}
              onDragStart={() => (drag.current = i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (drag.current !== undefined) move(drag.current, i);
                drag.current = undefined;
              }}
            >
              <button
                onClick={() => setIndex(i)}
                disabled={!!busy}
                aria-label={`Page ${i + 1}`}
              >
                <BlobImage blob={p.thumbnail} alt={`Page ${i + 1}`} />
                <span>{i + 1}</span>
              </button>
              {i === index && (
                <div className="page-move">
                  <button
                    aria-label={t("Move earlier")}
                    disabled={i === 0 || !!busy}
                    onClick={() => move(i, i - 1)}
                  >
                    <ChevronUp size={15} />
                  </button>
                  <button
                    aria-label={t("Move later")}
                    disabled={i === doc.pages.length - 1 || !!busy}
                    onClick={() => move(i, i + 1)}
                  >
                    <ChevronDown size={15} />
                  </button>
                </div>
              )}
            </div>
          ))}
          <button className="add-thumbnail" disabled={!!busy} onClick={onAdd}>
            <Plus size={24} />
            <span>{t("Add page")}</span>
          </button>
        </aside>
        <div className="preview-area">
          <div className="preview-top">
            <span>
              {t("Preview")} <span className="muted">/ {index + 1}</span>
            </span>
            <div>
              <button
                className={`text-button ${compare ? "active" : ""}`}
                onClick={() => setCompare(!compare)}
              >
                <Columns2 size={16} />
                {t("Compare original")}
              </button>
              <button
                className="icon-button"
                onClick={() => setFull(true)}
                aria-label="Full-screen preview"
              >
                <Maximize2 size={17} />
              </button>
            </div>
          </div>
          <div className={`document-stage ${compare ? "comparison" : ""}`}>
            {compare && (
              <figure>
                <BlobImage blob={page.original} alt="Original photograph" />
                <figcaption>{t("Original")}</figcaption>
              </figure>
            )}
            <figure>
              <BlobImage blob={page.processed} alt="Processed document" />
              <figcaption>
                {t(MODES.find((m) => m.id === page.edits.mode)!.label)}
              </figcaption>
            </figure>
          </div>
          {page.warning && <p className="quality-note">{page.warning}</p>}
          <div className="editor-toolbar">
            <button onClick={() => setCrop(true)} disabled={!!busy}>
              <Crop size={20} />
              {t("Crop")}
            </button>
            <button
              onClick={() =>
                void edit({
                  ...page.edits,
                  rotation: (page.edits.rotation + 90) % 360,
                })
              }
              disabled={!!busy}
            >
              <RotateCw size={20} />
              {t("Rotate")}
            </button>
            <button
              className={panel === "adjust" ? "active" : ""}
              onClick={() => setPanel("adjust")}
            >
              <SlidersHorizontal size={20} />
              {t("Adjust")}
            </button>
            <button
              className={panel === "text" ? "active" : ""}
              onClick={() => setPanel("text")}
            >
              <ScanText size={20} />
              {t("Text")}
            </button>
            <span className="toolbar-divider" />
            <button
              onClick={() => {
                const pages = [...doc.pages];
                pages.splice(index + 1, 0, {
                  ...page,
                  id: crypto.randomUUID(),
                });
                commit({ ...doc, pages });
                setIndex(index + 1);
              }}
              disabled={!!busy}
              aria-label={t("Duplicate")}
            >
              <Copy size={20} />
              <span>{t("Duplicate")}</span>
            </button>
            <button
              onClick={() => {
                commit({
                  ...doc,
                  pages: doc.pages.filter((p) => p.id !== page.id),
                });
                setIndex(Math.max(0, index - 1));
              }}
              disabled={!!busy}
              aria-label={t("Delete")}
            >
              <Trash2 size={20} />
              <span>{t("Delete")}</span>
            </button>
          </div>
        </div>
        <aside className="edit-panel">
          {panel === "adjust" ? (
            <>
              <h3>{t("Processing mode")}</h3>
              <p className="muted small">
                {" "}
                {t("A little polish for your paperwork.")}{" "}
              </p>
              <div className="mode-grid">
                {MODES.map((m) => (
                  <button
                    key={m.id}
                    disabled={!!busy}
                    className={page.edits.mode === m.id ? "selected" : ""}
                    onClick={() =>
                      void edit({
                        ...page.edits,
                        mode: m.id,
                        ...(m.id === "original"
                          ? { brightness: 0, contrast: 0, sharpness: 0 }
                          : {}),
                      })
                    }
                  >
                    <span aria-hidden="true" className={`mode-swatch ${m.id}`}>
                      <span>Aa</span>
                    </span>
                    {t(m.label)}
                    {page.edits.mode === m.id && <Check size={14} />}
                  </button>
                ))}
              </div>
              <div className="adjustments">
                {(["brightness", "contrast", "sharpness"] as const).map(
                  (key) => (
                    <label key={key}>
                      <span>
                        {t(key[0].toUpperCase() + key.slice(1))}
                        <output>{sliders?.[key]}</output>
                      </span>
                      <input
                        aria-label={key}
                        type="range"
                        min={key === "sharpness" ? 0 : -70}
                        max={key === "sharpness" ? 100 : 70}
                        value={sliders?.[key] ?? 0}
                        disabled={!!busy}
                        onChange={(e) =>
                          setSliders({
                            ...page.edits,
                            ...sliders,
                            [key]: Number(e.target.value),
                          })
                        }
                        onPointerUp={() => {
                          if (sliders) void edit(sliders);
                        }}
                        onKeyUp={(e) => {
                          if (
                            ["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                              e.key,
                            ) &&
                            sliders
                          )
                            void edit(sliders);
                        }}
                      />
                    </label>
                  ),
                )}
              </div>
              <button
                className="text-button"
                disabled={!!busy}
                onClick={() => void edit(defaultEdits())}
              >
                {t("Reset edits")}
              </button>
              <div className="export-image">
                <button
                  className="button small"
                  onClick={() => void exportImage("jpg")}
                >
                  {t("Export JPG")}
                </button>
                <button
                  className="button small"
                  onClick={() => void exportImage("png")}
                >
                  {t("Export PNG")}
                </button>
              </div>
            </>
          ) : (
            <>
              <h3>{t("Recognize text")}</h3>
              <p className="muted small">
                {" "}
                {t(
                  "Private, on-device OCR. Review the result; recognition can make mistakes.",
                )}{" "}
              </p>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={automatic}
                  onChange={(e) => setAutomatic(e.target.checked)}
                />
                {t("Automatic languages")}
              </label>
              {automatic ? (
                <p className="small muted">
                  {" "}
                  {t(
                    "Recognizes across all eight core languages. Uses more memory and takes longer.",
                  )}{" "}
                </p>
              ) : (
                <fieldset className="language-list">
                  <legend>{t("OCR languages")}</legend>
                  {LANGUAGES.map(([code, name]) => (
                    <label key={code}>
                      <input
                        type="checkbox"
                        checked={languages.includes(code)}
                        onChange={() =>
                          setLanguages((l) =>
                            l.includes(code)
                              ? l.filter((v) => v !== code)
                              : [...l, code],
                          )
                        }
                      />
                      {name}
                    </label>
                  ))}
                </fieldset>
              )}
              <button
                className="button primary full"
                disabled={!!busy || (!languages.length && !automatic)}
                onClick={() => void ocr()}
              >
                <ScanText size={18} />
                {t("Recognize text")}
              </button>
              {doc.pages.length > 1 && (
                <button
                  className="text-button"
                  disabled={!!busy || (!languages.length && !automatic)}
                  onClick={() => void ocr(true)}
                >
                  {t("Recognize all pages")}
                </button>
              )}
              {page.ocr && (
                <>
                  <p
                    className={
                      page.ocr.confidence < 70 ? "quality-note" : "small muted"
                    }
                  >
                    {" "}
                    {t("OCR confidence:")} {page.ocr.confidence.toFixed(0)}%.{" "}
                    {page.ocr.confidence < 70
                      ? "Review this text carefully."
                      : ""}
                  </p>
                  <textarea
                    className="ocr-text"
                    dir="auto"
                    aria-label="Extracted text"
                    value={page.ocr.text}
                    readOnly
                  />
                  <div className="button-row">
                    <button
                      className="button small"
                      onClick={() =>
                        void navigator.clipboard
                          .writeText(page.ocr!.text)
                          .catch(() =>
                            setError(
                              "Copy is unavailable. Select the text or download it instead.",
                            ),
                          )
                      }
                    >
                      {t("Copy text")}
                    </button>
                    <button
                      className="button small"
                      onClick={() =>
                        download(
                          new Blob([page.ocr!.text], {
                            type: "text/plain;charset=utf-8",
                          }),
                          filename(doc.name, "txt"),
                        )
                      }
                    >
                      {t("Download text")}
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </aside>
      </div>
      {crop && (
        <Modal title="Crop" onClose={() => setCrop(false)} wide>
          <CropEditor
            page={page}
            onCancel={() => setCrop(false)}
            onSave={(corners) => {
              setCrop(false);
              void edit({ ...page.edits, corners });
            }}
          />
        </Modal>
      )}
      {full && (
        <Modal title="Preview" onClose={() => setFull(false)} wide>
          <BlobImage
            blob={page.processed}
            alt="Full document preview"
            className="fullscreen-image"
          />
        </Modal>
      )}
    </section>
  );
}
