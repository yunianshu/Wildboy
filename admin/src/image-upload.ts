import { ApiError, request } from "./api";

const MAX_BYTES = 4 * 1024 * 1024;
const MAX_PIXELS = 16_000_000;
const MAX_SIDE = 6000;
const SOURCE_BYTES = 32 * 1024 * 1024;
const SOURCE_PIXELS = 64_000_000;
// The server normalizes pixels to PNG; leave room for encoder differences.
const TARGET_BYTES = 2.8 * 1024 * 1024;
type Size = { width: number; height: number };
type Decoded = { source: CanvasImageSource; close: () => void };

function read<T>(blob: Blob, mode: "buffer" | "data"): Promise<T> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as T);
    reader.onerror = reader.onabort = () =>
      reject(new Error("读取图片失败，请重试。"));
    if (mode === "buffer") reader.readAsArrayBuffer(blob);
    else reader.readAsDataURL(blob);
  });
}

const invalid = () => new Error("无法识别图片，请选择有效的 JPG 或 PNG 文件。");

export function imageSize(buffer: ArrayBuffer, mime: string): Size {
  const b = new Uint8Array(buffer),
    v = new DataView(buffer);
  if (
    mime === "image/png" &&
    b.length >= 24 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every((byte, i) => b[i] === byte) &&
    v.getUint32(8) === 13 &&
    v.getUint32(12) === 0x49484452
  ) {
    return { width: v.getUint32(16), height: v.getUint32(20) };
  }
  if (mime === "image/jpeg" && b[0] === 0xff && b[1] === 0xd8) {
    let pos = 2;
    while (pos + 3 < b.length && b[pos++] === 0xff) {
      while (b[pos] === 0xff) pos++;
      const marker = b[pos++];
      if (marker === 0xda || marker === 0xd9 || pos + 1 >= b.length) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      const len = v.getUint16(pos);
      if (len < 2 || pos + len > b.length) break;
      if (
        marker >= 0xc0 &&
        marker <= 0xcf &&
        ![0xc4, 0xc8, 0xcc].includes(marker) &&
        len >= 8
      ) {
        return { width: v.getUint16(pos + 5), height: v.getUint16(pos + 3) };
      }
      pos += len;
    }
  }
  throw invalid();
}

export function uploadSize(width: number, height: number, factor = 1): Size {
  const scale =
    Math.min(
      1,
      MAX_SIDE / Math.max(width, height),
      Math.sqrt(MAX_PIXELS / (width * height)),
    ) * factor;
  return {
    width: Math.max(1, Math.floor(width * scale)),
    height: Math.max(1, Math.floor(height * scale)),
  };
}

async function decode(file: File): Promise<Decoded> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      return { source: bitmap, close: () => bitmap.close() };
    } catch {
      // Some browsers do not decode all supported formats with ImageBitmap.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(invalid());
      img.src = url;
    });
    return { source: img, close: () => URL.revokeObjectURL(url) };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}

async function shrink(file: File, factor: number, isCurrent: () => boolean) {
  const decoded = await decode(file);
  const canvas = document.createElement("canvas");
  try {
    const src = decoded.source as ImageBitmap | HTMLImageElement;
    const width = "naturalWidth" in src ? src.naturalWidth : src.width;
    const height = "naturalHeight" in src ? src.naturalHeight : src.height;
    if (!width || !height || width * height > SOURCE_PIXELS) throw invalid();
    for (let attempt = 0; attempt < 10 && isCurrent(); attempt++) {
      const size = uploadSize(width, height, factor);
      canvas.width = size.width;
      canvas.height = size.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) break;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(src, 0, 0, size.width, size.height);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/png"),
      );
      if (blob && blob.size > 0 && blob.size <= TARGET_BYTES) return blob;
      factor *= 0.76;
    }
    if (!isCurrent()) return null;
    throw new Error("图片无法压缩到上传限制内，请裁剪后重试。");
  } finally {
    decoded.close();
    canvas.width = canvas.height = 1;
  }
}

export async function uploadAdminImage(file: File, isCurrent: () => boolean) {
  if (!["image/jpeg", "image/png"].includes(file.type) || file.size === 0)
    throw invalid();
  if (file.size > SOURCE_BYTES)
    throw new Error("原图超过 32 MB，请先裁剪后再上传。");
  const header = file.type === "image/png" ? file.slice(0, 24) : file;
  const { width, height } = imageSize(
    await read<ArrayBuffer>(header, "buffer"),
    file.type,
  );
  if (
    !width ||
    !height ||
    width * height > SOURCE_PIXELS ||
    Math.max(width, height) > 16_000
  ) {
    throw new Error("原图尺寸过大，请先缩小后再上传。");
  }
  if (!isCurrent()) return;
  const fits =
    width * height <= MAX_PIXELS &&
    Math.max(width, height) <= MAX_SIDE &&
    file.size <= MAX_BYTES;
  const upload = async (blob: Blob) => {
    const dataBase64 = (await read<string>(blob, "data")).split(",")[1];
    if (!isCurrent()) return;
    return request<{ url: string }>("/admin/media", {
      method: "POST",
      body: JSON.stringify({ dataBase64 }),
    });
  };
  try {
    const prepared = fits ? file : await shrink(file, 1, isCurrent);
    if (prepared) return await upload(prepared);
  } catch (e) {
    // INVALID_IMAGE is returned before storage; do not retry authentication,
    // network, or ambiguous server failures.
    if (
      !(
        e instanceof ApiError &&
        e.status === 400 &&
        e.code === "INVALID_IMAGE"
      ) ||
      !isCurrent()
    )
      throw e;
    const smaller = await shrink(file, 0.65, isCurrent);
    if (smaller) return upload(smaller);
  }
}
