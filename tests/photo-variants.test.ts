import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { validatePhotoVariant, variantDimensions } from "../worker/photo-variants";
import { PhotoValidationError } from "../worker/photo-utils";

const source = { width: 960, height: 640 };

async function jpeg(width: number, height: number, orientation?: number) {
  const image = sharp({ create: {
    width, height, channels: 3, background: "#e2b859",
  } });
  if (orientation !== undefined) image.withMetadata({ orientation });
  return image.jpeg().toBuffer();
}

test("派生画像の寸法は縦長・横長・パノラマでも長辺を制限し、小さい原本を拡大しない", () => {
  assert.deepEqual(variantDimensions(960, 640, 480), { width: 480, height: 320 });
  assert.deepEqual(variantDimensions(640, 960, 480), { width: 320, height: 480 });
  assert.deepEqual(variantDimensions(12_000, 1, 480), { width: 480, height: 1 });
  assert.deepEqual(variantDimensions(1, 12_000, 480), { width: 1, height: 480 });
  assert.deepEqual(variantDimensions(100, 75, 480), { width: 100, height: 75 });
});

test("実際のJPEGの派生画像を受け入れ、縮小時の1pxの丸めを許容する", async () => {
  const bytes = await jpeg(480, 320);
  const accepted = validatePhotoVariant(bytes, "thumbnail", source);
  assert.equal(accepted.bytes, bytes);
  assert.equal(accepted.mimeType, "image/jpeg");
  assert.equal(accepted.extension, "jpg");
  assert.doesNotThrow(() => validatePhotoVariant(bytes, "thumbnail", { width: 959, height: 640 }));
  const portrait = await jpeg(320, 480);
  assert.doesNotThrow(() => validatePhotoVariant(portrait, "thumbnail", { width: 640, height: 960 }));
});

test("原本と異なる縦横比・上限を超える長辺・未補正EXIF回転を拒否する", async () => {
  for (const bytes of [await jpeg(240, 240), await jpeg(481, 321), await jpeg(320, 480, 6)]) {
    assert.throws(() => validatePhotoVariant(bytes, "thumbnail", source), PhotoValidationError);
  }
  const display = await jpeg(1601, 1067);
  assert.throws(() => validatePhotoVariant(display, "display", source), PhotoValidationError);
});

test("JPEGと宣言したPNG・壊れたデータ・個別容量上限超過を拒否する", async () => {
  const png = await sharp({ create: {
    width: 480, height: 320, channels: 3, background: "#e2b859",
  } }).png().toBuffer();
  for (const bytes of [png, new Uint8Array(), new TextEncoder().encode("not a JPEG"), new Uint8Array(200_001)]) {
    assert.throws(() => validatePhotoVariant(bytes, "thumbnail", source), PhotoValidationError);
  }
  assert.throws(() => validatePhotoVariant(new Uint8Array(900_001), "display", source), PhotoValidationError);
});
