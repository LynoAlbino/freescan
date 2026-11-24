import { useState } from "react";
import {
  FileText,
  Search,
  MoreHorizontal,
  Check,
  Download,
  Share2,
  Copy,
  Trash2,
  Pencil,
  FolderOpen,
} from "lucide-react";
import type { ScanDocument } from "../types";
import { documentBytes } from "../lib/storage";
import { formatBytes } from "../lib/files";
import { BlobImage, Modal } from "./common";
import { useI18n } from "../lib/i18n";
export function DocumentCard({
  doc,
  onOpen,
  onMenu,
  select,
  selected,
}: {
  doc: ScanDocument;
  onOpen: () => void;
  onMenu: () => void;
  select?: () => void;
  selected?: boolean;
}) {
  const { t, locale } = useI18n();
  return (
    <article className={`document-card ${selected ? "selected" : ""}`}>
      <button
        className="document-cover"
        onClick={select || onOpen}
        aria-label={`Open ${doc.name}`}
      >
        {doc.pages[0] ? (
          <BlobImage blob={doc.pages[0].thumbnail} alt="" />
        ) : (
          <FileText size={48} strokeWidth={1} />
        )}
        <span className="file-badge">PDF</span>
        {select && (
          <span className={`select-check ${selected ? "checked" : ""}`}>
            {selected && <Check size={14} />}
          </span>
        )}
      </button>
      <div className="document-info">
        <button onClick={select || onOpen}>
          <h3>{doc.name}</h3>
          <p>
            {doc.pdfOnly ? doc.pdfPageCount : doc.pages.length} {t("pages")}{" "}
            <span>·</span>{" "}
            {new Date(doc.modified).toLocaleDateString(
              locale === "he" ? "he-IL" : "en-US",
              { month: "short", day: "numeric" },
            )}
          </p>
        </button>
        <button
          className="icon-button"
          aria-label={`Actions for ${doc.name}`}
          onClick={onMenu}
        >
          <MoreHorizontal size={19} />
        </button>
      </div>
    </article>
  );
}
export function Library({
  docs,
  onOpen,
  onAction,
  onScan,
}: {
  docs: ScanDocument[];
  onOpen: (d: ScanDocument) => void;
  onAction: (
    action: string,
    docs: ScanDocument[],
    name?: string,
  ) => Promise<void>;
  onScan: () => void;
}) {
  const { t } = useI18n(),
    [search, setSearch] = useState(""),
    [sort, setSort] = useState("modified"),
    [selecting, setSelecting] = useState(false),
    [selected, setSelected] = useState<string[]>([]),
    [menu, setMenu] = useState<ScanDocument>(),
    [rename, setRename] = useState(""),
    [confirm, setConfirm] = useState<ScanDocument[]>();
  const filtered = docs
    .filter((d) =>
      d.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
    )
    .sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name)
        : sort === "size"
          ? documentBytes(b) - documentBytes(a)
          : sort === "created"
            ? b.created - a.created
            : b.modified - a.modified,
    );
  const chosen = docs.filter((d) => selected.includes(d.id));
  return (
    <section className="page-content">
      <div className="page-heading">
        <span className="eyebrow"> {t("A LITTLE ORDER, A LOT OF CALM")} </span>
        <h1>{t("My Documents")}</h1>
        <p>{t("Everything you’ve saved, right here on your device.")}</p>
      </div>
      <div className="library-controls">
        <label className="search-field">
          <Search size={18} />
          <input
            placeholder={t("Search documents")}
            aria-label={t("Search documents")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <select
          aria-label="Sort documents"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          <option value="modified">{t("Recently modified")}</option>
          <option value="created">{t("Date created")}</option>
          <option value="name">{t("Name")}</option>
          <option value="size">{t("Size")}</option>
        </select>
        <button
          className="button"
          onClick={() => {
            setSelecting(!selecting);
            setSelected([]);
          }}
        >
          {t(selecting ? "Cancel" : "Select")}
        </button>
      </div>
      {selecting && (
        <div className="bulk-bar">
          <span>
            {selected.length} {t("selected")}{" "}
          </span>
          <button
            className="text-button"
            onClick={() => setSelected(filtered.map((d) => d.id))}
          >
            {t("Select all")}
          </button>
          <button
            className="button small"
            disabled={!chosen.length}
            onClick={() => void onAction("download", chosen)}
          >
            <Download size={16} />
            {t("Download")}
          </button>
          <button
            className="button small"
            disabled={!chosen.length}
            onClick={() => void onAction("duplicate", chosen)}
          >
            <Copy size={16} />
            {t("Duplicate")}
          </button>
          <button
            className="button small danger"
            disabled={!chosen.length}
            onClick={() => setConfirm(chosen)}
          >
            <Trash2 size={16} />
            {t("Delete")}
          </button>
        </div>
      )}
      {filtered.length ? (
        <div className="documents-grid">
          {filtered.map((d) => (
            <DocumentCard
              key={d.id}
              doc={d}
              onOpen={() => onOpen(d)}
              onMenu={() => {
                setMenu(d);
                setRename(d.name);
              }}
              select={
                selecting
                  ? () =>
                      setSelected((s) =>
                        s.includes(d.id)
                          ? s.filter((id) => id !== d.id)
                          : [...s, d.id],
                      )
                  : undefined
              }
              selected={selected.includes(d.id)}
            />
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <FolderOpen size={42} strokeWidth={1.4} />
          <h2>{t(search ? "No matching documents" : "No documents yet")}</h2>
          <p>
            {search
              ? "Try another name."
              : "Your scans will be right here when you need them."}
          </p>
          {!search && (
            <button className="button primary" onClick={onScan}>
              {t("Scan Document")}
            </button>
          )}
        </div>
      )}
      {menu && (
        <Modal title={menu.name} onClose={() => setMenu(undefined)}>
          <label>
            {t("Document name")}
            <input value={rename} onChange={(e) => setRename(e.target.value)} />
          </label>
          <button
            className="button"
            onClick={() => {
              void onAction("rename", [menu], rename);
              setMenu(undefined);
            }}
          >
            <Pencil size={17} />
            {t("Rename")}
          </button>
          <p className="muted small">
            {" "}
            {t("Created")} {new Date(menu.created).toLocaleString()}
            <br /> {t("Modified")} {new Date(menu.modified).toLocaleString()}
            <br />
            {formatBytes(documentBytes(menu))} {t("stored locally")}{" "}
          </p>
          <div className="menu-actions">
            {[
              { id: "download", label: "Download", icon: Download },
              { id: "share", label: "Share", icon: Share2 },
              { id: "duplicate", label: "Duplicate", icon: Copy },
            ].map((a) => (
              <button
                className="button"
                key={a.id}
                onClick={() => {
                  void onAction(a.id, [menu]);
                  setMenu(undefined);
                }}
              >
                <a.icon size={18} />
                {t(a.label)}
              </button>
            ))}
            <button
              className="button danger"
              onClick={() => {
                setConfirm([menu]);
                setMenu(undefined);
              }}
            >
              <Trash2 size={18} />
              {t("Delete")}
            </button>
          </div>
        </Modal>
      )}
      {confirm && (
        <Modal title="Delete" onClose={() => setConfirm(undefined)}>
          <p>
            {" "}
            {t("Permanently delete")} {confirm.length} {t("document")}{" "}
            {confirm.length === 1 ? "" : "s"}{" "}
            {t("from this device? Download a copy first if you need it.")}{" "}
          </p>
          <div className="button-row">
            <button className="button" onClick={() => setConfirm(undefined)}>
              {t("Cancel")}
            </button>
            <button
              className="button danger-button"
              onClick={() => {
                void onAction("delete", confirm);
                setConfirm(undefined);
                setSelected([]);
              }}
            >
              {t("Delete")}
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
