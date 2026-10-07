import { inspectImage, PhotoValidationError } from "./photo-utils";

export const PHOTO_VARIANT_VERSION = "light-v1";
export const PHOTO_VARIANT_LIMITS = {
  thumbnail: { edge: 480, bytes: 200_000, quality: 0.72 },
  display: { edge: 1600, bytes: 900_000, quality: 0.8 },
} as const;

export function variantDimensions(width: number, height: number, edge: number) {
  const scale = Math.min(1, edge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export function validatePhotoVariant(bytes: Uint8Array, kind: keyof typeof PHOTO_VARIANT_LIMITS, source: { width: number; height: number }) {
  const limit = PHOTO_VARIANT_LIMITS[kind];
  if (!bytes.length || bytes.length > limit.bytes) throw new PhotoValidationError("表示用画像の容量を確認してください。");
  const image = inspectImage(bytes, { maxPixels: limit.edge * limit.edge });
  if (image.mimeType !== "image/jpeg" || image.orientation !== 1 || Math.max(image.width, image.height) > limit.edge) {
    throw new PhotoValidationError("表示用画像の形式・大きさを確認してください。");
  }
  // Allow only rounding to whole pixels, including very wide panoramas.
  const expected = variantDimensions(source.width, source.height, Math.max(image.width, image.height));
  if (Math.abs(image.width - expected.width) > 1 || Math.abs(image.height - expected.height) > 1) {
    throw new PhotoValidationError("表示用画像の縦横比が原本と一致しません。");
  }
  return { bytes, mimeType: "image/jpeg" as const, extension: "jpg" as const };
}
