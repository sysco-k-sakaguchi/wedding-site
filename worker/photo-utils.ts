export const PHOTO_CATEGORIES = [
  { id: "ceremony", label: "挙式" },
  { id: "reception", label: "披露宴" },
  { id: "other", label: "その他" },
] as const;

export type PhotoCategory = (typeof PHOTO_CATEGORIES)[number]["id"];

export const PHOTO_CATEGORY_LABELS: Record<PhotoCategory, string> =
  Object.fromEntries(
    PHOTO_CATEGORIES.map((category) => [category.id, category.label]),
  ) as Record<PhotoCategory, string>;

export type SupportedImageMime = "image/jpeg" | "image/png" | "image/webp";

export interface DecodedImageInfo {
  mimeType: SupportedImageMime;
  extension: "jpg" | "png" | "webp";
  width: number;
  height: number;
  orientation: number;
}

export class PhotoValidationError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "PhotoValidationError";
    this.status = status;
  }
}

function readUint16(bytes: Uint8Array, offset: number, littleEndian: boolean) {
  if (offset < 0 || offset + 2 > bytes.length) {
    throw new PhotoValidationError("画像データが途中で壊れています。");
  }

  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint16(
    offset,
    littleEndian,
  );
}

function readUint32(bytes: Uint8Array, offset: number, littleEndian: boolean) {
  if (offset < 0 || offset + 4 > bytes.length) {
    throw new PhotoValidationError("画像データが途中で壊れています。");
  }

  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(
    offset,
    littleEndian,
  );
}

function parseExifOrientation(bytes: Uint8Array, start: number, length: number) {
  const end = Math.min(bytes.length, start + length);

  if (
    end - start < 14 ||
    String.fromCharCode(...bytes.slice(start, start + 4)) !== "Exif" ||
    bytes[start + 4] !== 0 ||
    bytes[start + 5] !== 0
  ) {
    return 1;
  }

  const tiff = start + 6;
  const byteOrder = String.fromCharCode(bytes[tiff], bytes[tiff + 1]);
  const littleEndian = byteOrder === "II";

  if (!littleEndian && byteOrder !== "MM") {
    return 1;
  }

  if (readUint16(bytes, tiff + 2, littleEndian) !== 42) {
    return 1;
  }

  const ifdOffset = readUint32(bytes, tiff + 4, littleEndian);
  const ifd = tiff + ifdOffset;

  if (ifd + 2 > end) {
    return 1;
  }

  const entryCount = readUint16(bytes, ifd, littleEndian);

  for (let index = 0; index < entryCount; index += 1) {
    const entry = ifd + 2 + index * 12;

    if (entry + 12 > end) {
      break;
    }

    if (readUint16(bytes, entry, littleEndian) === 0x0112) {
      const value = readUint16(bytes, entry + 8, littleEndian);
      return value >= 1 && value <= 8 ? value : 1;
    }
  }

  return 1;
}

function parseJpeg(bytes: Uint8Array): DecodedImageInfo | null {
  if (
    bytes.length < 4 ||
    bytes[0] !== 0xff ||
    bytes[1] !== 0xd8 ||
    bytes[2] !== 0xff
  ) {
    return null;
  }
  if (bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) {
    throw new PhotoValidationError("JPEG画像が途中で壊れています。");
  }

  let offset = 2;
  let orientation = 1;

  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    let marker = bytes[offset + 1];
    while (marker === 0xff && offset + 2 < bytes.length) {
      offset += 1;
      marker = bytes[offset + 1];
    }

    if (marker === 0xd9 || marker === 0xda) {
      break;
    }

    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }

    const segmentLength = readUint16(bytes, offset + 2, false);
    if (segmentLength < 2 || offset + 2 + segmentLength > bytes.length) {
      throw new PhotoValidationError("JPEG画像が途中で壊れています。");
    }

    const segmentStart = offset + 4;
    if (marker === 0xe1) {
      orientation = parseExifOrientation(
        bytes,
        segmentStart,
        segmentLength - 2,
      );
    }

    const isStartOfFrame =
      marker >= 0xc0 &&
      marker <= 0xcf &&
      ![0xc4, 0xc8, 0xcc].includes(marker);

    if (isStartOfFrame) {
      if (segmentLength < 7) {
        throw new PhotoValidationError("JPEG画像の寸法を確認できません。");
      }

      const rawHeight = readUint16(bytes, segmentStart + 1, false);
      const rawWidth = readUint16(bytes, segmentStart + 3, false);
      const rotated = orientation >= 5 && orientation <= 8;

      return {
        mimeType: "image/jpeg",
        extension: "jpg",
        width: rotated ? rawHeight : rawWidth,
        height: rotated ? rawWidth : rawHeight,
        orientation,
      };
    }

    offset += segmentLength + 2;
  }

  throw new PhotoValidationError("JPEG画像の寸法を確認できません。");
}

function parsePng(bytes: Uint8Array): DecodedImageInfo | null {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (
    bytes.length < 24 ||
    !signature.every((value, index) => bytes[index] === value)
  ) {
    return null;
  }

  const ihdr = String.fromCharCode(...bytes.slice(12, 16));
  if (ihdr !== "IHDR" || readUint32(bytes, 8, false) !== 13) {
    throw new PhotoValidationError("PNG画像のヘッダーが壊れています。");
  }

  return {
    mimeType: "image/png",
    extension: "png",
    width: readUint32(bytes, 16, false),
    height: readUint32(bytes, 20, false),
    orientation: 1,
  };
}

function parseWebp(bytes: Uint8Array): DecodedImageInfo | null {
  if (
    bytes.length < 30 ||
    String.fromCharCode(...bytes.slice(0, 4)) !== "RIFF" ||
    String.fromCharCode(...bytes.slice(8, 12)) !== "WEBP"
  ) {
    return null;
  }

  const riffSize = readUint32(bytes, 4, true) + 8;
  if (riffSize > bytes.length) {
    throw new PhotoValidationError("WebP画像が途中で壊れています。");
  }

  const chunk = String.fromCharCode(...bytes.slice(12, 16));
  let width = 0;
  let height = 0;

  if (chunk === "VP8X") {
    width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16);
    height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16);
  } else if (chunk === "VP8L" && bytes[20] === 0x2f) {
    width = 1 + bytes[21] + ((bytes[22] & 0x3f) << 8);
    height =
      1 +
      (bytes[22] >> 6) +
      (bytes[23] << 2) +
      ((bytes[24] & 0x0f) << 10);
  } else if (
    chunk === "VP8 " &&
    bytes[23] === 0x9d &&
    bytes[24] === 0x01 &&
    bytes[25] === 0x2a
  ) {
    width = readUint16(bytes, 26, true) & 0x3fff;
    height = readUint16(bytes, 28, true) & 0x3fff;
  }

  if (width < 1 || height < 1) {
    throw new PhotoValidationError("WebP画像の寸法を確認できません。");
  }

  return {
    mimeType: "image/webp",
    extension: "webp",
    width,
    height,
    orientation: 1,
  };
}

export function inspectImage(
  bytes: Uint8Array,
  options: { maxPixels: number; maxDimension?: number },
): DecodedImageInfo {
  const image = parseJpeg(bytes) ?? parsePng(bytes) ?? parseWebp(bytes);

  if (!image) {
    throw new PhotoValidationError(
      "JPEG、PNG、WebPのいずれかの画像を選んでください。HEIC／HEIFには現在対応していません。",
      415,
    );
  }

  const maxDimension = options.maxDimension ?? 20_000;
  if (
    image.width < 1 ||
    image.height < 1 ||
    image.width > maxDimension ||
    image.height > maxDimension ||
    image.width * image.height > options.maxPixels
  ) {
    throw new PhotoValidationError(
      "画像の縦横サイズが大きすぎます。別の画像を選んでください。",
      413,
    );
  }

  return image;
}

export function isPhotoCategory(value: string): value is PhotoCategory {
  return PHOTO_CATEGORIES.some((category) => category.id === value);
}

export function normalizeOptionalText(
  value: unknown,
  maximumLength: number,
  label: string,
) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (typeof value !== "string") {
    throw new PhotoValidationError(`${label}の形式が正しくありません。`);
  }

  const normalized = value.normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  if (normalized.length > maximumLength) {
    throw new PhotoValidationError(`${label}は${maximumLength}文字以内で入力してください。`);
  }

  return normalized || null;
}

export function sanitizeDownloadName(value: string, fallback: string) {
  const normalized = value
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f]/g, "_")
    .replace(/[\\/]/g, "_")
    .replace(/\.{2,}/g, "_")
    .replace(/^\.+/, "")
    .replace(/[<>:"|?*]/g, "_")
    .replace(/\s+/g, " ")
    .trim();

  return (normalized || fallback).slice(0, 120);
}

export function normalizeImageDownloadName(
  value: string,
  fallbackBase: string,
  extension: "jpg" | "png" | "webp",
) {
  const safeName = sanitizeDownloadName(value, fallbackBase);
  const lastDot = safeName.lastIndexOf(".");
  const withoutExtension = (lastDot > 0 ? safeName.slice(0, lastDot) : safeName)
    .replace(/\.+$/g, "")
    .trim();
  const base = withoutExtension || fallbackBase;
  const suffix = `.${extension}`;
  return `${base.slice(0, 120 - suffix.length)}${suffix}`;
}

export function makeZipPath(
  category: PhotoCategory,
  originalName: string,
  id: string,
  index: number,
) {
  const safeName = sanitizeDownloadName(originalName, `photo-${id}.jpg`);
  const lastDot = safeName.lastIndexOf(".");
  const base = lastDot > 0 ? safeName.slice(0, lastDot) : safeName;
  const extension = lastDot > 0 ? safeName.slice(lastDot) : "";
  const sequence = String(index + 1).padStart(3, "0");
  return `${PHOTO_CATEGORY_LABELS[category]}/${sequence}-${base}-${id.slice(0, 8)}${extension}`;
}

export function parseCookieHeader(header: string | null) {
  const cookies = new Map<string, string>();

  for (const part of (header ?? "").split(";")) {
    const separator = part.indexOf("=");
    if (separator < 1) {
      continue;
    }

    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (key) {
      cookies.set(key, value);
    }
  }

  return cookies;
}

export function isSameOriginRequest(request: Request) {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");

  if (fetchSite && fetchSite !== "same-origin") {
    return false;
  }

  return Boolean(origin && origin === new URL(request.url).origin);
}

export function encodeBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(normalized + padding);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export async function sha256Hex(value: Uint8Array | string) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  const digest = await crypto.subtle.digest("SHA-256", bytes.slice().buffer);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
