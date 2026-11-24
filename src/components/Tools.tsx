import { useRef, useState } from "react";
import { Upload, Download, Save, GripVertical, X } from "lucide-react";
import {
  compressPDF,
  editPDF,
  loadPDF,
  mergePDFs,
  splitPDF,
} from "../lib/pdf-tools";
import { download, errorMessage, filename, formatBytes } from "../lib/files";
import type { ScanDocument } from "../types";
import { Busy } from "./common";
import { useI18n } from "../lib/i18n";
import { TOOL_ITEMS } from "./tool-items";
export function Tools({
  onImport,
  onSave,
  initial,
}: {
  onImport: () => void;
  onSave: (doc: ScanDocument) => Promise<void>;
  initial?: string;
}) {
  const { t } = useI18n(),
    [tool, setTool] = useState(initial || ""),
    [files, setFiles] = useState<File[]>([]),
    [counts, setCounts] = useState<number[]>([]),
    [range, setRange] = useState(""),
    [angle, setAngle] = useState(90),
    [rasterize, setRasterize] = useState(false),
    [dpi, setDpi] = useState(150),
    [quality, setQuality] = useState(0.8),
    [busy, setBusy] = useState(""),
    [progress, setProgress] = useState(0),
    [error, setError] = useState(""),
    [result, setResult] = useState<Blob>(),
    [note, setNote] = useState(""),
    input = useRef<HTMLInputElement>(null),
    abort = useRef<AbortController | undefined>(undefined),
    drag = useRef<number | undefined>(undefined);
  const selected = TOOL_ITEMS.find((x) => x.id === tool);
  function choose(id: string) {
    if (id === "images") {
      onImport();
      return;
    }
    setTool(id);
    setFiles([]);
    setCounts([]);
    setResult(undefined);
    setError("");
    setNote("");
    setRange("");
  }
  async function addFiles(list: FileList | null) {
    if (!list) return;
    setBusy("Reading PDFs…");
    setError("");
    try {
      const incoming = Array.from(list);
      const incomingCounts = [];
      for (const f of incoming)
        incomingCounts.push((await loadPDF(f)).getPageCount());
      setFiles(
        tool === "merge" ? [...files, ...incoming] : incoming.slice(0, 1),
      );
      setCounts(
        tool === "merge"
          ? [...counts, ...incomingCounts]
          : incomingCounts.slice(0, 1),
      );
      setResult(undefined);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy("");
      if (input.current) input.current.value = "";
    }
  }
  async function run() {
    if (!files.length) return;
    setBusy("Working on your PDF…");
    setProgress(0);
    setError("");
    setResult(undefined);
    setNote("");
    abort.current = new AbortController();
    const signal = abort.current.signal;
    try {
      let output: Blob;
      if (tool === "merge")
        output = await mergePDFs(files, setProgress, signal);
      else if (tool === "split")
        output = await splitPDF(files[0], setProgress, signal);
      else if (tool === "compress") {
        output = await compressPDF(
          files[0],
          rasterize,
          dpi,
          quality,
          setProgress,
          signal,
        );
        if (output.size >= files[0].size) {
          setNote(
            "This file is already efficiently compressed. Keeping the original avoids a larger or unnecessarily degraded file.",
          );
          output = files[0];
        } else
          setNote(
            `${Math.round((1 - output.size / files[0].size) * 100)}% smaller. ${rasterize ? "Pages were rasterized; text layers, links, and forms are removed. Check readability before replacing the original." : "Page content preserved without rasterizing."}`,
          );
      } else
        output = await editPDF(files[0], range, tool === "rotate" ? angle : 0);
      if (signal.aborted) throw new DOMException("Canceled.", "AbortError");
      setResult(output);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy("");
    }
  }
  function move(from: number, to: number) {
    const a = [...files],
      b = [...counts];
    a.splice(to, 0, a.splice(from, 1)[0]);
    b.splice(to, 0, b.splice(from, 1)[0]);
    setFiles(a);
    setCounts(b);
    setResult(undefined);
  }
  const resultName = filename(
    `${files[0]?.name.replace(/\.pdf$/i, "") || "Document"} - ${tool}`,
    tool === "split" ? "zip" : "pdf",
  );
  return (
    <section className="page-content">
      <div className="page-heading">
        <span className="eyebrow"> {t("A SMALL PAPERWORK SUPERPOWER")} </span>
        <h1>{t("Document tools")}</h1>
        <p>{t("Simple tools. Powerful possibilities. All on your device.")}</p>
      </div>
      <div className="tools-grid">
        {TOOL_ITEMS.map((item) => (
          <button
            key={item.id}
            className={`tool-card ${tool === item.id ? "selected" : ""}`}
            onClick={() => choose(item.id)}
            disabled={!!busy}
          >
            <span className={`tool-icon ${item.id}`}>
              <item.icon size={23} />
            </span>
            <h3>{t(item.name)}</h3>
            <p>{t(item.description)}</p>
          </button>
        ))}
      </div>
      {selected && (
        <div className="tool-workspace">
          <h2>{t(selected.name)}</h2>
          <input
            ref={input}
            type="file"
            accept="application/pdf,.pdf"
            multiple={tool === "merge"}
            hidden
            onChange={(e) => void addFiles(e.target.files)}
          />
          <button
            className="upload-zone"
            onClick={() => input.current?.click()}
            disabled={!!busy}
          >
            <Upload size={26} />
            <strong>
              {t(tool === "merge" ? "Choose PDF files" : "Choose PDF")}
            </strong>
            <span> {t("Processed privately on this device")} </span>
          </button>
          {files.length > 0 && (
            <>
              <div className="pdf-file-list">
                {files.map((f, i) => (
                  <div
                    className="pdf-file"
                    key={`${i}-${f.name}`}
                    draggable={!busy && tool === "merge"}
                    onDragStart={() => (drag.current = i)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      if (drag.current !== undefined) move(drag.current, i);
                    }}
                  >
                    <GripVertical size={18} />
                    <div>
                      <strong>{f.name}</strong>
                      <span>
                        {counts[i]} {t("pages")} · {formatBytes(f.size)}
                      </span>
                    </div>
                    {tool === "merge" && (
                      <>
                        <button
                          className="icon-button"
                          aria-label={`Move ${f.name} earlier`}
                          disabled={i === 0}
                          onClick={() => move(i, i - 1)}
                        >
                          ↑
                        </button>
                        <button
                          className="icon-button"
                          aria-label={`Move ${f.name} later`}
                          disabled={i === files.length - 1}
                          onClick={() => move(i, i + 1)}
                        >
                          ↓
                        </button>
                      </>
                    )}
                    <button
                      className="icon-button"
                      aria-label={`Remove ${f.name}`}
                      onClick={() => {
                        setFiles(files.filter((_, n) => n !== i));
                        setCounts(counts.filter((_, n) => n !== i));
                        setResult(undefined);
                      }}
                    >
                      <X size={18} />
                    </button>
                  </div>
                ))}
              </div>
              {["extract", "reorder", "rotate"].includes(tool) && (
                <label>
                  {t("Page order / range")}
                  <input
                    placeholder="1, 3-5, 2"
                    value={range}
                    onChange={(e) => {
                      setRange(e.target.value);
                      setResult(undefined);
                    }}
                  />
                  <span className="small muted">
                    {" "}
                    {t(
                      "Blank = all pages. Ranges can descend (5-1); repeated pages duplicate them.",
                    )}{" "}
                    {tool === "rotate"
                      ? " Only the listed pages are included in the result."
                      : ""}
                  </span>
                </label>
              )}
              {tool === "rotate" && (
                <label>
                  {" "}
                  {t("Rotation")}{" "}
                  <select
                    value={angle}
                    onChange={(e) => {
                      setAngle(+e.target.value);
                      setResult(undefined);
                    }}
                  >
                    <option value={90}> {t("90° clockwise")} </option>
                    <option value={180}>180°</option>
                    <option value={270}> {t("90° counterclockwise")} </option>
                  </select>
                </label>
              )}
              {tool === "compress" && (
                <>
                  <label className="check-label">
                    <input
                      type="checkbox"
                      checked={rasterize}
                      onChange={(e) => {
                        setRasterize(e.target.checked);
                        setResult(undefined);
                      }}
                    />
                    <div>
                      <strong> {t("Rasterize scanned pages")} </strong>
                      <span className="small muted">
                        {" "}
                        {t(
                          "Lossy compression. Removes searchable text, links, forms and vector content. Keep your original.",
                        )}{" "}
                      </span>
                    </div>
                  </label>
                  {rasterize && (
                    <div className="form-grid">
                      <label>
                        {t("Resolution (DPI)")}
                        <select
                          value={dpi}
                          onChange={(e) => {
                            setDpi(+e.target.value);
                            setResult(undefined);
                          }}
                        >
                          {[120, 150, 200, 300].map((n) => (
                            <option key={n}>{n}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        {t("JPEG quality")}
                        <input
                          type="range"
                          min={0.5}
                          max={0.95}
                          step={0.05}
                          value={quality}
                          onChange={(e) => {
                            setQuality(+e.target.value);
                            setResult(undefined);
                          }}
                        />
                        <output>{Math.round(quality * 100)}%</output>
                      </label>
                    </div>
                  )}
                  <p className="small muted">
                    {" "}
                    {t(
                      "Without rasterization, only PDF structure is optimized. Some PDFs cannot become smaller without quality loss.",
                    )}{" "}
                  </p>
                </>
              )}
              {busy ? (
                <Busy
                  label={busy}
                  progress={progress}
                  onCancel={() => abort.current?.abort()}
                />
              ) : (
                <button className="button primary" onClick={() => void run()}>
                  {t("Run tool")}
                </button>
              )}
            </>
          )}
          {error && (
            <p className="notice error" role="alert">
              {error}
            </p>
          )}
          {result && (
            <div className="tool-result">
              <h3>
                {formatBytes(result.size)} {t("· Ready to save")}{" "}
              </h3>
              {note && <p>{note}</p>}
              <div className="button-row">
                <button
                  className="button primary"
                  onClick={() => download(result, resultName)}
                >
                  <Download size={18} />
                  {t("Download result")}
                </button>
                {tool !== "split" && (
                  <button
                    className="button"
                    onClick={() =>
                      void (async () => {
                        try {
                          const pdf = await loadPDF(result);
                          await onSave({
                            id: crypto.randomUUID(),
                            name: resultName.replace(/\.pdf$/, ""),
                            created: Date.now(),
                            modified: Date.now(),
                            pages: [],
                            pdf: result,
                            pdfOnly: true,
                            pdfPageCount: pdf.getPageCount(),
                          });
                          setNote("Saved to My Documents.");
                        } catch (e) {
                          setError(errorMessage(e));
                        }
                      })()
                    }
                  >
                    <Save size={18} />
                    {t("Save to Documents")}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
