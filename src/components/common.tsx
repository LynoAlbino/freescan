import { useEffect, useRef, useState, type ReactNode } from "react";
import { X, LoaderCircle, ScanLine } from "lucide-react";
import { useI18n } from "../lib/i18n";
export function useBlobURL(blob?: Blob) {
  const [url, setURL] = useState("");
  useEffect(() => {
    if (!blob) {
      setURL("");
      return;
    }
    const url = URL.createObjectURL(blob);
    setURL(url);
    return () => URL.revokeObjectURL(url);
  }, [blob]);
  return url;
}
export function BlobImage({
  blob,
  alt,
  className = "",
}: {
  blob?: Blob;
  alt: string;
  className?: string;
}) {
  const url = useBlobURL(blob);
  return url ? <img src={url} alt={alt} className={className} /> : null;
}
export function Logo() {
  return (
    <span className="brand">
      <span className="brand-icon">
        <ScanLine size={23} strokeWidth={1.8} />
      </span>
      FreeScan<span className="brand-dot">.</span>
    </span>
  );
}
export function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const { t } = useI18n();
  useEffect(() => {
    const el = ref.current;
    el?.showModal();
    return () => el?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? "wide" : ""}`}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          const rect = e.currentTarget.getBoundingClientRect();
          if (
            e.clientX < rect.left ||
            e.clientX > rect.right ||
            e.clientY < rect.top ||
            e.clientY > rect.bottom
          )
            onClose();
        }
      }}
    >
      <div className="modal-head">
        <h2>{t(title)}</h2>
        <button
          className="icon-button"
          aria-label={t("Close")}
          onClick={onClose}
        >
          <X />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Busy({
  label,
  progress,
  onCancel,
}: {
  label: string;
  progress?: number;
  onCancel?: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="busy" role="status" aria-live="polite">
      <LoaderCircle className="spin" size={20} />
      <div>
        <strong>{label}</strong>
        {progress !== undefined && <progress max={1} value={progress} />}
      </div>
      {onCancel && (
        <button className="text-button" onClick={onCancel}>
          {t("Cancel")}
        </button>
      )}
    </div>
  );
}
