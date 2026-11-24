export type Point = { x: number; y: number };
export type Corners = [Point, Point, Point, Point];
export type Mode =
  | "auto"
  | "clean"
  | "bw"
  | "gray"
  | "color"
  | "original"
  | "receipt"
  | "whiteboard";
export const MODES: { id: Mode; label: string }[] = [
  { id: "auto", label: "Automatic" },
  { id: "clean", label: "Clean Document" },
  { id: "bw", label: "Black & White" },
  { id: "gray", label: "Grayscale" },
  { id: "color", label: "Enhanced Color" },
  { id: "original", label: "Original" },
  { id: "receipt", label: "Receipt" },
  { id: "whiteboard", label: "Whiteboard" },
];
export interface Edits {
  corners: Corners;
  rotation: number;
  mode: Mode;
  brightness: number;
  contrast: number;
  sharpness: number;
}
export interface OCRResult {
  text: string;
  confidence: number;
  languages: string[];
  pdf: Uint8Array;
}
export interface ScanPage {
  id: string;
  original: Blob;
  processed: Blob;
  thumbnail: Blob;
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
  edits: Edits;
  ocr?: OCRResult;
  warning?: string;
}
export interface ScanDocument {
  id: string;
  name: string;
  created: number;
  modified: number;
  pages: ScanPage[];
  pdf?: Blob;
  pdfOnly?: boolean;
  pdfPageCount?: number;
}
export type PaperSize =
  | "A4"
  | "A3"
  | "A5"
  | "Letter"
  | "Legal"
  | "Original"
  | "Custom";
export interface ExportOptions {
  size: PaperSize;
  orientation: "portrait" | "landscape";
  margin: number;
  quality: "high" | "standard" | "compressed" | "custom";
  jpegQuality: number;
  dpi: number;
  width: number;
  height: number;
  searchable: boolean;
}
export const DEFAULT_EXPORT: ExportOptions = {
  size: "A4",
  orientation: "portrait",
  margin: 8,
  quality: "standard",
  jpegQuality: 0.85,
  dpi: 200,
  width: 210,
  height: 297,
  searchable: false,
};
export const fullCorners = (): Corners => [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
];
export const defaultEdits = (corners = fullCorners()): Edits => ({
  corners,
  rotation: 0,
  mode: "auto",
  brightness: 0,
  contrast: 0,
  sharpness: 12,
});
export const newDocument = (): ScanDocument => ({
  id: crypto.randomUUID(),
  name: `Scan ${new Date().toLocaleDateString()}`,
  created: Date.now(),
  modified: Date.now(),
  pages: [],
});
