import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Home,
  FolderOpen,
  ScanLine,
  LayoutGrid,
  Settings as SettingsIcon,
  Camera as CameraIcon,
  ImagePlus,
  ShieldCheck,
  WifiOff,
  Plus,
  Check,
  Leaf,
  FileText,
  Heart,
} from "lucide-react";
import { DEFAULT_EXPORT, newDocument, type ScanDocument } from "./types";
import {
  deleteDocument,
  listDocuments,
  recoverDraft,
  saveDocument,
  setDraft,
} from "./lib/storage";
import { cancelProcessing, importImage } from "./lib/processing";
import { download, errorMessage, filename, share } from "./lib/files";
import { I18n, useI18n, type Locale } from "./lib/i18n";
import { usePWA } from "./lib/pwa";
import { Busy, Logo, Modal } from "./components/common";
import { DocumentCard, Library } from "./components/Library";
import { TOOL_ITEMS } from "./components/tool-items";
const Editor = lazy(() =>
  import("./components/Editor").then((m) => ({ default: m.Editor })),
);
const Camera = lazy(() =>
  import("./components/Camera").then((m) => ({ default: m.Camera })),
);
const ExportDialog = lazy(() =>
  import("./components/ExportDialog").then((m) => ({
    default: m.ExportDialog,
  })),
);
const Tools = lazy(() =>
  import("./components/Tools").then((m) => ({ default: m.Tools })),
);
const Settings = lazy(() =>
  import("./components/Settings").then((m) => ({ default: m.Settings })),
);
type Screen = "home" | "documents" | "scan" | "tools" | "settings" | "editor";
function preference(key: string, fallback: string) {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}
export default function App() {
  const [locale, setLocale] = useState<Locale>(
    preference("freescan-locale", "en") === "he" ? "he" : "en",
  );
  return (
    <I18n locale={locale}>
      <Workspace locale={locale} setLocale={setLocale} />
    </I18n>
  );
}
function Workspace({
  locale,
  setLocale,
}: {
  locale: Locale;
  setLocale: (l: Locale) => void;
}) {
  const { t } = useI18n(),
    pwa = usePWA(),
    [screen, setScreen] = useState<Screen>("home"),
    [docs, setDocs] = useState<ScanDocument[]>([]),
    [doc, setDoc] = useState<ScanDocument>(),
    [draft, setRecovered] = useState<ScanDocument>(),
    [theme, setTheme] = useState(preference("freescan-theme", "system")),
    [exporting, setExporting] = useState(false),
    [add, setAdd] = useState(false),
    [busy, setBusy] = useState(""),
    [progress, setProgress] = useState(0),
    [error, setError] = useState(""),
    [saveStatus, setSaveStatus] = useState(t("Saved on this device")),
    [tool, setTool] = useState(""),
    [menuDoc, setMenuDoc] = useState<ScanDocument>(),
    fileInput = useRef<HTMLInputElement>(null),
    cameraInput = useRef<HTMLInputElement>(null),
    append = useRef(false),
    current = useRef(doc),
    saveQueue = useRef(Promise.resolve()),
    controller = useRef<AbortController | undefined>(undefined);
  current.current = doc;
  const refresh = useCallback(async () => {
    setDocs(await listDocuments());
  }, []);
  useEffect(() => {
    void refresh().catch((e) => setError(errorMessage(e)));
    void recoverDraft()
      .then(setRecovered)
      .catch(() => {});
  }, [refresh]);
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === "he" ? "rtl" : "ltr";
    try {
      localStorage.setItem("freescan-locale", locale);
    } catch {}
  }, [locale]);
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)"),
      apply = () =>
        (document.documentElement.dataset.theme =
          theme === "system" ? (media.matches ? "dark" : "light") : theme);
    apply();
    media.addEventListener("change", apply);
    try {
      localStorage.setItem("freescan-theme", theme);
    } catch {}
    return () => media.removeEventListener("change", apply);
  }, [theme]);
  useEffect(() => {
    if (!doc) return;
    setSaveStatus("Saving…");
    saveQueue.current = saveQueue.current
      .catch(() => {})
      .then(async () => {
        if (!doc.pages.length) {
          await deleteDocument(doc.id);
          await refresh();
          return;
        }
        await saveDocument(doc);
        await setDraft(doc.id);
        setSaveStatus(t("Saved on this device"));
        await refresh();
      })
      .catch((e) => {
        setSaveStatus("Not saved — storage error");
        setError(errorMessage(e));
      });
  }, [doc, refresh, t]);
  async function leave(next: Screen) {
    await saveQueue.current;
    await setDraft(null);
    setRecovered(undefined);
    setDoc(undefined);
    setScreen(next);
  }
  function openDocument(d: ScanDocument) {
    if (d.pdfOnly) {
      setMenuDoc(d);
      return;
    }
    setDoc(d);
    setScreen("editor");
  }
  function startScan(more = false) {
    if (!more) setDoc(newDocument());
    append.current = more;
    setAdd(false);
    setScreen("scan");
  }
  function chooseImages(more = false, capture = false) {
    append.current = more;
    setAdd(false);
    (capture ? cameraInput : fileInput).current?.click();
  }
  const capture = useCallback(async (blob: Blob) => {
    const page = await importImage(blob);
    const base = current.current || newDocument();
    const next = {
      ...base,
      pages: [...base.pages, page],
      modified: Date.now(),
      pdf: undefined,
    };
    current.current = next;
    setDoc(next);
  }, []);
  async function importFiles(files: FileList | null) {
    if (!files?.length) return;
    const incoming = Array.from(files);
    let next =
      append.current && current.current ? current.current : newDocument();
    if (!append.current && incoming[0])
      next = {
        ...next,
        name: incoming[0].name.replace(/\.[^.]+$/, "") || next.name,
      };
    controller.current = new AbortController();
    setError("");
    let imported = 0;
    const failed: string[] = [];
    try {
      for (let i = 0; i < incoming.length; i++) {
        if (controller.current.signal.aborted) break;
        setBusy(`Preparing page ${i + 1} of ${incoming.length}…`);
        setProgress(i / incoming.length);
        try {
          const page = await importImage(
            incoming[i],
            controller.current.signal,
          );
          next = {
            ...next,
            pages: [...next.pages, page],
            modified: Date.now(),
            pdf: undefined,
          };
          current.current = next;
          setDoc(next);
          imported++;
          await saveDocument(next);
          await setDraft(next.id);
        } catch (e) {
          if (controller.current.signal.aborted) break;
          failed.push(`${incoming[i].name}: ${errorMessage(e)}`);
        }
      }
      if (imported) setScreen("editor");
      if (failed.length) setError(failed.join("\n"));
      if (controller.current.signal.aborted)
        setError(
          `Import canceled. ${imported} completed page${imported === 1 ? "" : "s"} kept in your draft.`,
        );
    } finally {
      setBusy("");
      if (fileInput.current) fileInput.current.value = "";
      if (cameraInput.current) cameraInput.current.value = "";
      await refresh();
    }
  }
  async function action(kind: string, targets: ScanDocument[], name?: string) {
    setError("");
    setBusy(kind === "download" ? "Preparing files…" : "Updating documents…");
    try {
      for (const d of targets) {
        if (kind === "delete") await deleteDocument(d.id);
        else if (kind === "rename")
          await saveDocument({
            ...d,
            name: name?.trim().slice(0, 160) || "Document",
            modified: Date.now(),
            pdf: d.pdfOnly ? d.pdf : undefined,
          });
        else if (kind === "duplicate")
          await saveDocument({
            ...d,
            id: crypto.randomUUID(),
            name: `${d.name} (copy)`,
            created: Date.now(),
            modified: Date.now(),
            pages: d.pages.map((p) => ({ ...p, id: crypto.randomUUID() })),
          });
      }
      if (kind === "download" || kind === "share") {
        const { exportPDF } = await import("./lib/pdf");
        const files: Record<string, Uint8Array> = {};
        for (let i = 0; i < targets.length; i++) {
          const d = targets[i],
            pdf = d.pdf || (await exportPDF(d, DEFAULT_EXPORT));
          if (targets.length === 1) {
            if (kind === "share") await share(pdf, d.name);
            else download(pdf, filename(d.name));
          } else
            files[filename(`${i + 1} - ${d.name}`)] = new Uint8Array(
              await pdf.arrayBuffer(),
            );
        }
        if (targets.length > 1) {
          const { zip } = await import("fflate");
          const bytes = await new Promise<Uint8Array>((resolve, reject) =>
            zip(files, { level: 0 }, (e, b) => (e ? reject(e) : resolve(b))),
          );
          download(
            new Blob([new Uint8Array(bytes)], { type: "application/zip" }),
            "FreeScan-documents.zip",
          );
        }
      }
      await refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy("");
    }
  }
  const nav = [
    { id: "home" as const, label: "Home", icon: Home },
    { id: "documents" as const, label: "Documents", icon: FolderOpen },
    { id: "scan" as const, label: "Scan", icon: ScanLine },
    { id: "tools" as const, label: "Tools", icon: LayoutGrid },
    { id: "settings" as const, label: "Settings", icon: SettingsIcon },
  ];
  return (
    <div className={`app-shell ${screen === "editor" ? "editing" : ""}`}>
      <input
        ref={fileInput}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/gif"
        multiple
        hidden
        data-testid="image-import"
        onChange={(e) => void importFiles(e.target.files)}
      />
      <input
        ref={cameraInput}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => void importFiles(e.target.files)}
      />
      {screen !== "scan" && (
        <>
          <aside className="sidebar">
            <button className="brand-button" onClick={() => void leave("home")}>
              <Logo />
            </button>
            <div className="workspace-label">
              {" "}
              {t("YOUR PAPER, SIMPLIFIED")}{" "}
            </div>
            <nav aria-label="Main navigation">
              {nav
                .filter((n) => n.id !== "scan")
                .map((n) => (
                  <button
                    key={n.id}
                    className={
                      screen === n.id ||
                      (n.id === "documents" && screen === "editor")
                        ? "active"
                        : ""
                    }
                    onClick={() => void leave(n.id)}
                  >
                    <n.icon size={20} />
                    {t(n.label)}
                    {n.id === "documents" && docs.length > 0 && (
                      <span className="nav-count">{docs.length}</span>
                    )}
                  </button>
                ))}
            </nav>
            <button
              className="button primary sidebar-scan"
              onClick={() => startScan()}
            >
              <Plus size={19} />
              {t("New scan")}
            </button>
            <div className="sidebar-bottom">
              <div className="sidebar-privacy">
                <ShieldCheck size={24} />
                <strong>{t("Free. Private. Yours.")}</strong>
                <p>
                  {" "}
                  {t("Your documents belong to you.")} <br />{" "}
                  {t("Let’s keep it that way.")}{" "}
                </p>
              </div>
              <span className="version">
                FreeScan 1.0 <span> {t("MADE FOR EVERYONE")} </span>
              </span>
            </div>
          </aside>
          <div className="app-main">
            <header className="topbar">
              <div className="mobile-brand">
                <Logo />
              </div>
              <span className="desktop-greeting">
                {" "}
                {t("A clear space for your paperwork.")}{" "}
              </span>
              <div className="topbar-right">
                <span className="connection">
                  <span
                    className={pwa.offlineReady ? "status-dot" : "status-ring"}
                  />
                  {t(
                    pwa.offlineReady
                      ? "Ready offline"
                      : pwa.online
                        ? "Local processing"
                        : "Offline",
                  )}
                </span>
                <button
                  className="icon-button"
                  aria-label={t("Settings")}
                  onClick={() => void leave("settings")}
                >
                  <SettingsIcon size={19} />
                </button>
              </div>
            </header>
            {error && (
              <div className="global-notice notice error" role="alert">
                <span>{error}</span>
                <button onClick={() => setError("")} aria-label={t("Dismiss")}>
                  ×
                </button>
              </div>
            )}
            {busy && (
              <div className="global-notice">
                <Busy
                  label={busy}
                  progress={progress || undefined}
                  onCancel={() => {
                    controller.current?.abort();
                    cancelProcessing();
                  }}
                />
              </div>
            )}
            <Suspense fallback={<Busy label="Opening your workspace…" />}>
              {screen === "home" && (
                <main className="page-content home-page">
                  <div className="home-heading">
                    <div>
                      <span className="eyebrow">
                        <span /> {t("LESS PAPER. MORE POSSIBILITY.")}{" "}
                      </span>
                      <h1>{t("Your paper, simplified.")}</h1>
                      <p>
                        {t(
                          "Turn everyday documents into clean, beautiful PDFs.",
                        )}
                        <br />
                        {t("Free to use. Yours to keep.")}
                      </p>
                    </div>
                    <div className="home-decoration" aria-hidden="true">
                      <div className="paper-back" />
                      <div className="paper-front">
                        <div className="paper-check">
                          <Check size={22} />
                        </div>
                        <span />
                        <span />
                        <span />
                        <div className="paper-signature">
                          {" "}
                          {t("all in order.")}{" "}
                        </div>
                      </div>
                      <div className="deco-spark">✦</div>
                    </div>
                  </div>
                  <div className="start-actions">
                    <button className="scan-action" onClick={() => startScan()}>
                      <span className="action-icon">
                        <CameraIcon size={28} strokeWidth={1.6} />
                      </span>
                      <span>
                        <strong>{t("Scan Document")}</strong>
                        <small>{t("Use your camera")}</small>
                      </span>
                      <ScanLine className="action-end" size={23} />
                    </button>
                    <button
                      className="import-action"
                      onClick={() => chooseImages()}
                    >
                      <span className="action-icon">
                        <ImagePlus size={27} strokeWidth={1.5} />
                      </span>
                      <span>
                        <strong>{t("Import Images")}</strong>
                        <small>{t("JPG, PNG, WebP & more")}</small>
                      </span>
                      <Plus className="action-end" size={21} />
                    </button>
                  </div>
                  {draft && (
                    <div className="draft-banner">
                      <FileText size={22} />
                      <div>
                        <strong>{t("Recover your draft")}</strong>
                        <span>
                          {draft.name} · {draft.pages.length} {t("pages")}
                        </span>
                      </div>
                      <button
                        className="button small"
                        onClick={() => openDocument(draft)}
                      >
                        {t("Continue editing")}
                      </button>
                      <button
                        className="icon-button"
                        aria-label={t("Dismiss")}
                        onClick={() => {
                          setRecovered(undefined);
                          void setDraft(null);
                        }}
                      >
                        ×
                      </button>
                    </div>
                  )}
                  <section className="recent-section">
                    <div className="section-heading">
                      <h2>
                        {t("Recent documents")}
                        <span className="count-pill">{docs.length}</span>
                      </h2>
                      <button
                        className="text-button"
                        onClick={() => setScreen("documents")}
                      >
                        {t("View all")}
                      </button>
                    </div>
                    {docs.length ? (
                      <div className="documents-grid recent-grid">
                        {docs.slice(0, 3).map((d) => (
                          <DocumentCard
                            key={d.id}
                            doc={d}
                            onOpen={() => openDocument(d)}
                            onMenu={() => {
                              setScreen("documents");
                            }}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="first-scan">
                        <div className="empty-paper-icon">
                          <FileText size={32} strokeWidth={1.2} />
                          <span>
                            <Plus size={13} />
                          </span>
                        </div>
                        <h3>{t("Your next great scan starts here")}</h3>
                        <p>
                          {t(
                            "Scan a receipt, a handwritten note, or anything worth keeping.",
                          )}
                        </p>
                        <span className="empty-hint">
                          {" "}
                          {t("No paper trail. Just a clearer desk.")}{" "}
                        </span>
                      </div>
                    )}
                  </section>
                  <section className="home-tools">
                    <div className="section-heading">
                      <h2>{t("Made for your everyday paperwork")}</h2>
                      <button
                        className="text-button"
                        onClick={() => {
                          setTool("");
                          setScreen("tools");
                        }}
                      >
                        {t("All tools")}
                      </button>
                    </div>
                    <div className="quick-tools">
                      {TOOL_ITEMS.slice(0, 4).map((item) => (
                        <button
                          key={item.id}
                          onClick={() => {
                            if (item.id === "images") chooseImages();
                            else {
                              setTool(item.id);
                              setScreen("tools");
                            }
                          }}
                        >
                          <span className={`tool-icon ${item.id}`}>
                            <item.icon size={23} />
                          </span>
                          <span>
                            <strong>{t(item.name)}</strong>
                            <small>{t(item.description)}</small>
                          </span>
                        </button>
                      ))}
                    </div>
                  </section>
                  <div className="privacy-banner">
                    <div className="privacy-shield">
                      <ShieldCheck size={25} />
                    </div>
                    <div>
                      <strong>{t("Private by design")}</strong>
                      <p>
                        {t(
                          "Your documents never leave this device. No accounts, no uploads, no limits.",
                        )}
                      </p>
                    </div>
                    <Leaf size={21} className="privacy-leaf" />
                  </div>
                  <footer className="home-footer">
                    <span>
                      <Heart size={13} />
                      {t("Always free")}
                    </span>
                    <span>·</span>
                    <span>{t("Open source")}</span>
                    <span>·</span>
                    <span>
                      <WifiOff size={13} /> {t("Works offline")}{" "}
                    </span>
                  </footer>
                </main>
              )}
              {screen === "documents" && (
                <Library
                  docs={docs}
                  onOpen={openDocument}
                  onAction={action}
                  onScan={() => startScan()}
                />
              )}
              {screen === "editor" && doc && (
                <Editor
                  key={doc.id}
                  doc={doc}
                  onChange={setDoc}
                  onBack={() => void leave("documents")}
                  onAdd={() => setAdd(true)}
                  onExport={() => setExporting(true)}
                  saveStatus={saveStatus}
                />
              )}
              {screen === "tools" && (
                <Tools
                  key={tool}
                  initial={tool}
                  onImport={() => chooseImages()}
                  onSave={async (d) => {
                    await saveDocument(d);
                    await refresh();
                  }}
                />
              )}
              {screen === "settings" && (
                <Settings
                  theme={theme}
                  setTheme={setTheme}
                  setLocale={setLocale}
                  pwa={pwa}
                  onRefresh={async () => {
                    setDoc(undefined);
                    setRecovered(undefined);
                    await refresh();
                  }}
                />
              )}
            </Suspense>
          </div>
          <nav className="bottom-nav" aria-label="Mobile navigation">
            {nav.map((n) => (
              <button
                key={n.id}
                className={`${n.id === "scan" ? "scan-nav" : ""} ${screen === n.id ? "active" : ""}`}
                onClick={() =>
                  n.id === "scan" ? startScan() : void leave(n.id)
                }
              >
                <span>
                  <n.icon size={21} />
                </span>
                <small>{t(n.label)}</small>
              </button>
            ))}
          </nav>
        </>
      )}
      {screen === "scan" && (
        <Suspense fallback={<Busy label="Opening camera…" />}>
          <Camera
            onCapture={capture}
            onClose={() => {
              setScreen(doc?.pages.length ? "editor" : "home");
            }}
            onDone={() => setScreen("editor")}
            count={doc?.pages.length || 0}
            onFallback={() => {
              setScreen(doc?.pages.length ? "editor" : "home");
              chooseImages(true, true);
            }}
          />
        </Suspense>
      )}
      {add && (
        <Modal title="Add page" onClose={() => setAdd(false)}>
          <div className="add-page-options">
            <button className="button primary" onClick={() => startScan(true)}>
              <CameraIcon size={22} />
              {t("Scan Document")}
            </button>
            <button className="button" onClick={() => chooseImages(true)}>
              <ImagePlus size={22} />
              {t("Import Images")}
            </button>
          </div>
        </Modal>
      )}
      {exporting && doc && (
        <Suspense fallback={<Busy label="Preparing export…" />}>
          <ExportDialog
            doc={doc}
            onClose={() => setExporting(false)}
            onSave={setDoc}
          />
        </Suspense>
      )}
      {menuDoc && (
        <Modal title={menuDoc.name} onClose={() => setMenuDoc(undefined)}>
          <div className="pdf-document-summary">
            <FileText size={48} />
            <p>
              {menuDoc.pdfPageCount} {t("pages")} · PDF
            </p>
          </div>
          <div className="button-row">
            <button
              className="button primary"
              onClick={() => void action("download", [menuDoc])}
            >
              {t("Download PDF")}
            </button>
            <button
              className="button"
              onClick={() => void action("share", [menuDoc])}
            >
              {t("Share PDF")}
            </button>
          </div>
          <p className="small muted">
            {" "}
            {t(
              "Use Document Tools to split, rotate, reorder or compress this PDF.",
            )}{" "}
          </p>
        </Modal>
      )}
    </div>
  );
}
