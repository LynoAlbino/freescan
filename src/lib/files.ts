export const assetURL = (path: string) =>
  new URL(`${import.meta.env.BASE_URL}${path}`, document.baseURI).href;
export function filename(name: string, extension = "pdf") {
  return (
    (name
      .normalize("NFKC")
      .replace(/[\u0000-\u001f\u007f/\\:*?"<>|]/g, "")
      .replace(/\.(pdf|png|jpg|jpeg|txt|zip)$/i, "")
      .trim()
      .slice(0, 160) || "Document") +
    "." +
    extension
  );
}
export const formatBytes = (n: number) =>
  n < 1024
    ? `${n} B`
    : n < 1048576
      ? `${(n / 1024).toFixed(0)} KB`
      : `${(n / 1048576).toFixed(1)} MB`;
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
export async function share(blob: Blob, name: string) {
  const file = new File([blob], filename(name), { type: "application/pdf" });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) throw e;
    }
  } else download(blob, file.name);
}
export function printPDF(blob: Blob) {
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank");
  if (!win) {
    URL.revokeObjectURL(url);
    download(blob, "document.pdf");
    return;
  }
  win.addEventListener("load", () => win.print(), { once: true });
  setTimeout(() => URL.revokeObjectURL(url), 120000);
}
export async function validateImage(blob: Blob) {
  if (!blob.size)
    throw new Error(
      "This image is empty. Choose a JPG, PNG, WebP, or supported camera image.",
    );
  const b = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
  const raster =
    (b[0] === 255 && b[1] === 216) ||
    (b[0] === 137 && b[1] === 80 && b[2] === 78 && b[3] === 71) ||
    (String.fromCharCode(...b.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...b.slice(8, 12)) === "WEBP") ||
    String.fromCharCode(...b.slice(0, 3)) === "GIF" ||
    String.fromCharCode(...b.slice(4, 8)) === "ftyp";
  if (!raster)
    throw new Error(
      "Unsupported image. Use JPG, PNG, WebP, or convert this file on your device first.",
    );
}
export async function decodeImage(
  blob: Blob,
): Promise<ImageBitmap | HTMLImageElement> {
  try {
    return await createImageBitmap(blob, { imageOrientation: "from-image" });
  } catch {
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } catch {
      throw new Error(
        "This image cannot be decoded. Try exporting it as JPG or PNG.",
      );
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}
export function releaseImage(img: ImageBitmap | HTMLImageElement) {
  if ("close" in img) img.close();
}
export function canvasBlob(
  canvas: HTMLCanvasElement,
  type = "image/jpeg",
  quality = 0.94,
): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) =>
        b
          ? resolve(b)
          : reject(
              new Error(
                "Not enough memory to encode this page. Try a smaller image.",
              ),
            ),
      type,
      quality,
    ),
  );
}
export async function resizeBlob(
  blob: Blob,
  maxEdge: number,
  type = "image/jpeg",
  quality = 0.85,
) {
  const img = await decodeImage(blob);
  try {
    const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(img.width * scale));
    c.height = Math.max(1, Math.round(img.height * scale));
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return await canvasBlob(c, type, quality);
  } finally {
    releaseImage(img);
  }
}
export function errorMessage(e: unknown) {
  if (e instanceof DOMException && e.name === "QuotaExceededError")
    return "Device storage is full. Export a backup and remove older documents, then try again.";
  return e instanceof Error
    ? e.message
    : "Something went wrong. Your saved documents are still on this device.";
}
export function checkAbort(signal?: AbortSignal) {
  if (signal?.aborted)
    throw new DOMException("Operation canceled.", "AbortError");
}
