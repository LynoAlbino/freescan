import { useRef, useState } from "react";
import type { Corners, ScanPage } from "../types";
import { fullCorners } from "../types";
import { validCorners } from "../lib/geometry";
import { useBlobURL } from "./common";
import { useI18n } from "../lib/i18n";
export function CropEditor({
  page,
  onSave,
  onCancel,
}: {
  page: ScanPage;
  onSave: (corners: Corners) => void;
  onCancel: () => void;
}) {
  const { t } = useI18n(),
    url = useBlobURL(page.original),
    [corners, setCorners] = useState<Corners>(page.edits.corners),
    drag = useRef<number | null>(null),
    ref = useRef<HTMLDivElement>(null);
  const names = ["Top left", "Top right", "Bottom right", "Bottom left"];
  function update(i: number, x: number, y: number) {
    setCorners(
      (c) =>
        c.map((p, n) =>
          n === i
            ? { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) }
            : p,
        ) as Corners,
    );
  }
  return (
    <div className="crop-editor">
      <p>
        {" "}
        {t(
          "Drag each corner to the edge of your document. Arrow keys move a focused corner.",
        )}{" "}
      </p>
      <div
        className="crop-canvas"
        ref={ref}
        style={{ aspectRatio: page.originalWidth / page.originalHeight }}
        onPointerMove={(e) => {
          if (drag.current === null) return;
          const r = ref.current!.getBoundingClientRect();
          update(
            drag.current,
            (e.clientX - r.left) / r.width,
            (e.clientY - r.top) / r.height,
          );
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
      >
        <img
          src={url}
          alt="Original document for corner adjustment"
          draggable={false}
        />
        <svg viewBox="0 0 100 100" preserveAspectRatio="none">
          <polygon
            points={corners.map((p) => `${p.x * 100},${p.y * 100}`).join(" ")}
            fill="#05966918"
            stroke={validCorners(corners) ? "#10b981" : "#ef4444"}
            strokeWidth=".5"
          />
        </svg>
        {corners.map((p, i) => (
          <button
            key={i}
            className="crop-handle"
            style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
            aria-label={`${names[i]} corner`}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              drag.current = i;
            }}
            onKeyDown={(e) => {
              const step = e.shiftKey ? 0.02 : 0.003;
              const delta: Record<string, [number, number]> = {
                ArrowLeft: [-step, 0],
                ArrowRight: [step, 0],
                ArrowUp: [0, -step],
                ArrowDown: [0, step],
              };
              if (delta[e.key]) {
                e.preventDefault();
                update(i, p.x + delta[e.key][0], p.y + delta[e.key][1]);
              }
            }}
          />
        ))}
      </div>
      {!validCorners(corners) && (
        <p className="error">
          {" "}
          {t("Corners cannot cross. Keep a little space between them.")}{" "}
        </p>
      )}
      <div className="button-row">
        <button className="button" onClick={() => setCorners(fullCorners())}>
          {t("Full image")}
        </button>
        <button className="button" onClick={onCancel}>
          {t("Cancel")}
        </button>
        <button
          className="button primary"
          disabled={!validCorners(corners)}
          onClick={() => onSave(corners)}
        >
          {t("Save crop")}
        </button>
      </div>
    </div>
  );
}
