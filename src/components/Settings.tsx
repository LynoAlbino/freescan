import { useEffect, useRef, useState } from "react";
import {
  Download,
  HardDrive,
  ShieldCheck,
  Languages,
  Palette,
  WifiOff,
  Trash2,
  Check,
} from "lucide-react";
import { backupDocuments, clearDocuments, restoreBackup } from "../lib/storage";
import { download, errorMessage, formatBytes } from "../lib/files";
import { cachedLanguages, cacheLanguage, type usePWA } from "../lib/pwa";
import { LANGUAGES } from "../lib/ocr";
import { useI18n, type Locale } from "../lib/i18n";
import { Busy, Modal } from "./common";
export function Settings({
  theme,
  setTheme,
  setLocale,
  pwa,
  onRefresh,
}: {
  theme: string;
  setTheme: (s: string) => void;
  setLocale: (s: Locale) => void;
  pwa: ReturnType<typeof usePWA>;
  onRefresh: () => Promise<void>;
}) {
  const { t, locale } = useI18n(),
    [storage, setStorage] = useState<StorageEstimate>(),
    [cached, setCached] = useState<string[]>([]),
    [busy, setBusy] = useState(""),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [clear, setClear] = useState(false),
    restore = useRef<HTMLInputElement>(null);
  async function refresh() {
    setStorage(await navigator.storage?.estimate());
    setCached(await cachedLanguages());
  }
  useEffect(() => {
    void refresh().catch(() => {});
  }, [pwa.offlineReady]);
  async function action(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setError("");
    setMessage("");
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy("");
    }
  }
  return (
    <section className="page-content settings-page">
      <div className="page-heading">
        <span className="eyebrow"> {t("MAKE YOURSELF AT HOME")} </span>
        <h1>{t("Settings")}</h1>
        <p> {t("A simple space, set up your way.")} </p>
      </div>
      {busy && <Busy label={busy} />}
      <div aria-live="polite">
        {message && <p className="notice success">{message}</p>}
        {error && <p className="notice error">{error}</p>}
      </div>
      <div className="settings-grid">
        <section className="settings-card">
          <h2>
            <Palette size={21} />
            {t("Appearance")}
          </h2>
          <label>
            {t("Appearance")}
            <select
              aria-label={t("Appearance")}
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
            >
              <option value="system">{t("System")}</option>
              <option value="light">{t("Light")}</option>
              <option value="dark">{t("Dark")}</option>
            </select>
          </label>
          <label>
            {t("Language")}
            <select
              aria-label={t("Language")}
              value={locale}
              onChange={(e) => setLocale(e.target.value as Locale)}
            >
              <option value="en">English</option>
              <option value="he">עברית</option>
            </select>
          </label>
        </section>
        <section className="settings-card">
          <h2>
            <WifiOff size={21} />
            {t("Offline & installation")}
          </h2>
          <p>
            {pwa.offlineReady
              ? "The app, image engine, PDF tools, and English OCR are cached on this device. Other languages are available after downloading them below."
              : import.meta.env.DEV
                ? "Offline caching is enabled in the production build. Run npm run build and npm run preview to test it."
                : "Preparing the app and scanning engines for offline use. Keep this page open while the first download finishes."}
          </p>
          {pwa.cacheError && <p className="error">{pwa.cacheError}</p>}
          {pwa.canInstall ? (
            <button
              className="button primary"
              onClick={() => void pwa.install()}
            >
              <Download size={18} />
              {t("Install FreeScan")}
            </button>
          ) : (
            <p className="small muted">
              {" "}
              {t(
                "On iPhone or iPad: open in Safari, tap Share, then Add to Home Screen. On Android: browser menu → Install app. Installation and camera access require HTTPS.",
              )}{" "}
            </p>
          )}
          {pwa.update && (
            <button className="button" onClick={pwa.applyUpdate}>
              {t("Apply update")}
            </button>
          )}
        </section>
        <section className="settings-card">
          <h2>
            <Languages size={21} />
            {t("Available languages")}
          </h2>
          <p>
            {" "}
            {t(
              "Download once, recognize offline. All language data is free and served from this app.",
            )}{" "}
          </p>
          <div className="language-downloads">
            {LANGUAGES.map(([id, label]) => (
              <div key={id}>
                <span>{label}</span>
                {cached.includes(id) ? (
                  <span className="downloaded">
                    <Check size={15} /> {t("Offline")}{" "}
                  </span>
                ) : (
                  <button
                    className="text-button"
                    disabled={!!busy}
                    aria-label={`${t("Download language")} ${label}`}
                    onClick={() =>
                      void action(`Downloading ${label}…`, async () => {
                        await cacheLanguage(id);
                        setMessage(`${label} is ready offline.`);
                      })
                    }
                  >
                    <Download size={16} />
                    {t("Download")}
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
        <section className="settings-card">
          <h2>
            <HardDrive size={21} />
            {t("Storage & backups")}
          </h2>
          <div className="storage-summary">
            <strong>{formatBytes(storage?.usage || 0)}</strong>
            <span>
              {" "}
              {t("used by this app")}{" "}
              {storage?.quota
                ? ` of ${formatBytes(storage.quota)} available`
                : ""}
            </span>
          </div>
          <progress value={storage?.usage || 0} max={storage?.quota || 1} />
          <p className="small muted">
            {" "}
            {t(
              "Browser storage is not a permanent backup. Clearing site data or uninstalling may remove your documents. Export important files regularly.",
            )}{" "}
          </p>
          <div className="button-row">
            <button
              className="button"
              disabled={!!busy}
              onClick={() =>
                void action("Creating a local backup…", async () => {
                  download(
                    await backupDocuments(),
                    `FreeScan-backup-${new Date().toISOString().slice(0, 10)}.zip`,
                  );
                  setMessage(
                    "Backup downloaded. Keep this file somewhere safe.",
                  );
                })
              }
            >
              {t("Export backup")}
            </button>
            <button
              className="button"
              disabled={!!busy}
              onClick={() => restore.current?.click()}
            >
              {t("Restore backup")}
            </button>
            <input
              ref={restore}
              type="file"
              accept=".zip,application/zip"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f)
                  void action("Restoring documents…", async () => {
                    const count = await restoreBackup(f);
                    await onRefresh();
                    setMessage(
                      `Restored ${count} documents. Existing documents were kept.`,
                    );
                  });
                e.target.value = "";
              }}
            />
          </div>
          <button
            className="text-button"
            onClick={() =>
              void action("Requesting persistent storage…", async () => {
                const ok = await navigator.storage?.persist?.();
                setMessage(
                  ok
                    ? "Persistent storage granted. Keep a backup too."
                    : "Your browser did not grant persistent storage. Keep a backup of important documents.",
                );
              })
            }
          >
            {t("Keep storage persistent")}
          </button>
          <button className="text-button danger" onClick={() => setClear(true)}>
            <Trash2 size={16} />
            {t("Clear all local data")}
          </button>
        </section>
        <section className="settings-card privacy-card">
          <h2>
            <ShieldCheck size={21} />
            {t("Privacy")}
          </h2>
          <p>
            {" "}
            {t(
              "Your photos, PDFs, and recognized text are processed on this device. FreeScan has no accounts, advertisements, analytics, or tracking. The app only requests camera access when you scan. No microphone or location permission is requested.",
            )}{" "}
          </p>
          <p className="small muted">
            {" "}
            {t(
              "Local document storage is not encrypted by FreeScan. Anyone with access to your browser profile or device may be able to read it. Your hosting provider can receive ordinary requests for app assets; document content is never included.",
            )}{" "}
          </p>
          <p className="small muted">
            {" "}
            {t("FreeScan 1.0 · MIT open-source license")}{" "}
          </p>
        </section>
      </div>
      {clear && (
        <Modal title="Clear all local data" onClose={() => setClear(false)}>
          <p>
            {" "}
            {t(
              "This permanently deletes every saved document, recovered draft, preference, and cached language on this browser. Export a backup first.",
            )}{" "}
          </p>
          <div className="button-row">
            <button className="button" onClick={() => setClear(false)}>
              {t("Cancel")}
            </button>
            <button
              className="button danger-button"
              onClick={() =>
                void action("Clearing local data…", async () => {
                  await clearDocuments();
                  localStorage.removeItem("freescan-theme");
                  localStorage.removeItem("freescan-locale");
                  if ("caches" in window)
                    for (const key of await caches.keys())
                      if (key.startsWith("freescan-")) await caches.delete(key);
                  if ("serviceWorker" in navigator)
                    for (const registration of await navigator.serviceWorker.getRegistrations())
                      if (
                        registration.scope ===
                        new URL(import.meta.env.BASE_URL, document.baseURI).href
                      )
                        await registration.unregister();
                  indexedDB.deleteDatabase("tesseract.js");
                  await onRefresh();
                  location.reload();
                })
              }
            >
              {t("Clear all local data")}
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
