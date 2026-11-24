import { useEffect, useRef, useState } from "react";
import {
  Download,
  Share2,
  Printer,
  CheckCircle2,
  FileText,
} from "lucide-react";
import {
  DEFAULT_EXPORT,
  type ScanDocument,
  type ExportOptions,
} from "../types";
import { exportPDF } from "../lib/pdf";
import {
  download,
  errorMessage,
  filename,
  formatBytes,
  printPDF,
  share,
} from "../lib/files";
import { recognize, LANGUAGES } from "../lib/ocr";
import { BlobImage, Busy, Modal } from "./common";
import { useI18n } from "../lib/i18n";
export function ExportDialog({
  doc,
  onClose,
  onSave,
}: {
  doc: ScanDocument;
  onClose: () => void;
  onSave: (doc: ScanDocument) => void;
}) {
  const { t } = useI18n(),
    [options, setOptions] = useState<ExportOptions>(DEFAULT_EXPORT),
    [name, setName] = useState(doc.name),
    [result, setResult] = useState<Blob>(),
    [busy, setBusy] = useState(""),
    [progress, setProgress] = useState(0),
    [error, setError] = useState(""),
    [lang, setLang] = useState("eng"),
    controller = useRef<AbortController | undefined>(undefined);
  useEffect(() => () => controller.current?.abort(), []);
  function change<K extends keyof ExportOptions>(
    key: K,
    value: ExportOptions[K],
  ) {
    setOptions((o) => ({ ...o, [key]: value }));
    setResult(undefined);
  }
  async function generate() {
    const abort = new AbortController();
    controller.current = abort;
    setError("");
    setResult(undefined);
    let next = { ...doc, name: name.trim() || "Document" };
    try {
      if (options.searchable) {
        const pages = [...doc.pages];
        for (let i = 0; i < pages.length; i++) {
          if (pages[i].ocr) continue;
          setBusy(`Recognizing page ${i + 1} of ${pages.length}…`);
          pages[i] = {
            ...pages[i],
            ocr: await recognize(
              pages[i].processed,
              [lang],
              (n) => setProgress(n),
              abort.signal,
            ),
          };
        }
        next = { ...next, pages };
        onSave(next);
      }
      setBusy("Generating your PDF…");
      setProgress(0);
      const pdf = await exportPDF(next, options, setProgress, abort.signal);
      setResult(pdf);
      onSave({ ...next, pdf, modified: Date.now() });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy("");
    }
  }
  const estimate =
    doc.pages.reduce((n, p) => n + p.processed.size, 0) *
    (options.quality === "high"
      ? 1
      : options.quality === "compressed"
        ? 0.12
        : 0.32);
  return (
    <Modal
      title="Export PDF"
      onClose={() => {
        controller.current?.abort();
        onClose();
      }}
      wide
    >
      <div className="export-layout">
        <div className="export-summary">
          <div className="export-paper">
            <BlobImage blob={doc.pages[0]?.thumbnail} alt="Document preview" />
          </div>
          <h3>{name}</h3>
          <p>
            {doc.pages.length} {t(doc.pages.length === 1 ? "page" : "pages")} ·
            PDF
          </p>
          <div className="privacy-pill">
            <CheckCircle2 size={14} />
            {t("Local processing")}
          </div>
        </div>
        <div className="export-form">
          <label>
            {t("Filename")}
            <input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setResult(undefined);
              }}
              disabled={!!busy}
            />
          </label>
          <div className="form-grid">
            <label>
              {t("Page size")}
              <select
                value={options.size}
                disabled={!!busy}
                onChange={(e) =>
                  change("size", e.target.value as ExportOptions["size"])
                }
              >
                {[
                  "A4",
                  "A3",
                  "A5",
                  "Letter",
                  "Legal",
                  "Original",
                  "Custom",
                ].map((s) => (
                  <option key={s} value={s}>
                    {t(s)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("Orientation")}
              <select
                value={options.orientation}
                disabled={!!busy || options.size === "Original"}
                onChange={(e) =>
                  change(
                    "orientation",
                    e.target.value as ExportOptions["orientation"],
                  )
                }
              >
                <option value="portrait">{t("Portrait")}</option>
                <option value="landscape">{t("Landscape")}</option>
              </select>
            </label>
            {options.size === "Custom" && (
              <>
                <label>
                  {t("Width (mm)")}
                  <input
                    type="number"
                    min={13}
                    max={5080}
                    value={options.width}
                    onChange={(e) => change("width", +e.target.value)}
                  />
                </label>
                <label>
                  {t("Height (mm)")}
                  <input
                    type="number"
                    min={13}
                    max={5080}
                    value={options.height}
                    onChange={(e) => change("height", +e.target.value)}
                  />
                </label>
              </>
            )}
          </div>
          <label>
            {t("Margins (mm)")}
            <input
              type="number"
              value={options.margin}
              min={0}
              max={100}
              disabled={!!busy}
              onChange={(e) => change("margin", +e.target.value)}
            />
          </label>
          <fieldset>
            <legend>{t("Quality")}</legend>
            <div className="quality-options">
              {(
                [
                  ["high", "High Quality"],
                  ["standard", "Standard"],
                  ["compressed", "Compressed"],
                  ["custom", "Custom"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  disabled={!!busy}
                  className={options.quality === id ? "selected" : ""}
                  onClick={() => change("quality", id)}
                >
                  {t(label)}
                </button>
              ))}
            </div>
          </fieldset>
          {options.quality === "custom" && (
            <div className="form-grid">
              <label>
                {t("JPEG quality")}
                <input
                  type="number"
                  min={30}
                  max={100}
                  value={Math.round(options.jpegQuality * 100)}
                  onChange={(e) =>
                    change(
                      "jpegQuality",
                      Math.max(0.3, Math.min(1, +e.target.value / 100)),
                    )
                  }
                />
              </label>
              <label>
                {t("Resolution (DPI)")}
                <input
                  type="number"
                  min={72}
                  max={600}
                  value={options.dpi}
                  onChange={(e) =>
                    change("dpi", Math.max(72, Math.min(600, +e.target.value)))
                  }
                />
              </label>
            </div>
          )}
          <label className="check-label">
            <input
              type="checkbox"
              disabled={!!busy}
              checked={options.searchable}
              onChange={(e) => change("searchable", e.target.checked)}
            />
            <div>
              <strong>{t("Searchable PDF")}</strong>
              <span className="small muted">
                {" "}
                {t("Add an invisible, selectable OCR text layer.")}{" "}
              </span>
            </div>
          </label>
          {options.searchable && doc.pages.some((p) => !p.ocr) && (
            <label>
              {t("OCR languages")}
              <select value={lang} onChange={(e) => setLang(e.target.value)}>
                {LANGUAGES.map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
              <span className="small muted">
                {" "}
                {t(
                  "Multi-language recognition is available in the editor.",
                )}{" "}
              </span>
            </label>
          )}
          <div className="size-estimate">
            <FileText size={18} />
            {result
              ? `Actual file size: ${formatBytes(result.size)}`
              : `Estimated ${formatBytes(Math.round(estimate))} · final size may vary`}
          </div>
          {error && (
            <p className="notice error" role="alert">
              {error}
            </p>
          )}
          {busy ? (
            <Busy
              label={busy}
              progress={progress}
              onCancel={() => controller.current?.abort()}
            />
          ) : result ? (
            <>
              <div className="success-note">
                <CheckCircle2 size={18} />{" "}
                {t("Your PDF is ready and saved on this device.")}{" "}
              </div>
              <div className="button-row">
                <button
                  className="button primary"
                  onClick={() => download(result, filename(name))}
                >
                  <Download size={18} />
                  {t("Download PDF")}
                </button>
                <button
                  className="button"
                  onClick={() =>
                    void share(result, name).catch((e) =>
                      setError(errorMessage(e)),
                    )
                  }
                >
                  <Share2 size={18} />
                  {t("Share")}
                </button>
                <button
                  className="icon-button"
                  aria-label={t("Print")}
                  onClick={() => printPDF(result)}
                >
                  <Printer size={20} />
                </button>
              </div>
            </>
          ) : (
            <button
              className="button primary full"
              onClick={() => void generate()}
            >
              <FileText size={18} />
              {t("Generate PDF")}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
