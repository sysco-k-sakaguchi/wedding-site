import assert from "node:assert/strict";
import test from "node:test";
import {
  PhotoValidationError,
  inspectImage,
  isSameOriginRequest,
  makeZipPath,
  normalizeImageDownloadName,
  parseCookieHeader,
  sanitizeDownloadName,
} from "../worker/photo-utils";

function pngHeader(width: number, height: number) {
  const bytes = new Uint8Array(24);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
  new DataView(bytes.buffer).setUint32(8, 13, false);
  bytes.set([73, 72, 68, 82], 12);
  new DataView(bytes.buffer).setUint32(16, width, false);
  new DataView(bytes.buffer).setUint32(20, height, false);
  return bytes;
}

function orientedJpeg(rawWidth: number, rawHeight: number, orientation: number) {
  const exif = new Uint8Array([
    69, 120, 105, 102, 0, 0,
    73, 73, 42, 0, 8, 0, 0, 0,
    1, 0,
    0x12, 0x01, 3, 0, 1, 0, 0, 0, orientation, 0, 0, 0,
    0, 0, 0, 0,
  ]);
  const appLength = exif.length + 2;
  return new Uint8Array([
    0xff, 0xd8,
    0xff, 0xe1, appLength >> 8, appLength & 0xff, ...exif,
    0xff, 0xc0, 0, 11, 8,
    rawHeight >> 8, rawHeight & 0xff,
    rawWidth >> 8, rawWidth & 0xff,
    1, 1, 0x11, 0,
    0xff, 0xd9,
  ]);
}

function vp8xWebp(width: number, height: number) {
  const bytes = new Uint8Array(30);
  bytes.set([82, 73, 70, 70], 0);
  new DataView(bytes.buffer).setUint32(4, 22, true);
  bytes.set([87, 69, 66, 80, 86, 80, 56, 88], 8);
  new DataView(bytes.buffer).setUint32(16, 10, true);
  const encodedWidth = width - 1;
  const encodedHeight = height - 1;
  bytes.set([
    encodedWidth & 0xff,
    (encodedWidth >> 8) & 0xff,
    (encodedWidth >> 16) & 0xff,
    encodedHeight & 0xff,
    (encodedHeight >> 8) & 0xff,
    (encodedHeight >> 16) & 0xff,
  ], 24);
  return bytes;
}

test("PNGの実データ署名と寸法を読み取る", () => {
  assert.deepEqual(inspectImage(pngHeader(1200, 800), { maxPixels: 2_000_000 }), {
    mimeType: "image/png",
    extension: "png",
    width: 1200,
    height: 800,
    orientation: 1,
  });
});

test("JPEGのEXIF Orientationで縦横を補正する", () => {
  const result = inspectImage(orientedJpeg(100, 200, 6), { maxPixels: 100_000 });
  assert.equal(result.mimeType, "image/jpeg");
  assert.equal(result.width, 200);
  assert.equal(result.height, 100);
  assert.equal(result.orientation, 6);
});

test("末尾が欠けたJPEGを拒否する", () => {
  const complete = orientedJpeg(100, 200, 1);
  assert.throws(
    () => inspectImage(complete.slice(0, -2), { maxPixels: 100_000 }),
    /途中で壊れています/,
  );
});

test("WebP VP8Xの寸法を読み取る", () => {
  const result = inspectImage(vp8xWebp(640, 480), { maxPixels: 1_000_000 });
  assert.equal(result.mimeType, "image/webp");
  assert.equal(result.width, 640);
  assert.equal(result.height, 480);
});

test("画像でないデータと画素上限超過を拒否する", () => {
  assert.throws(
    () => inspectImage(new TextEncoder().encode("not an image"), { maxPixels: 100 }),
    PhotoValidationError,
  );
  assert.throws(
    () => inspectImage(pngHeader(100, 100), { maxPixels: 9_999 }),
    /大きすぎます/,
  );
});

test("ダウンロード名とZIPパスから危険な文字を除く", () => {
  const safe = sanitizeDownloadName("../../danger\\photo\r\n.jpg", "photo.jpg");
  assert.equal(safe.includes(".."), false);
  assert.equal(/[\\/\r\n]/.test(safe), false);

  assert.equal(
    normalizeImageDownloadName("payload.exe", "photo-id", "jpg"),
    "payload.jpg",
  );

  const path = makeZipPath("ceremony", "../same.jpg", "12345678-abcd-1234-abcd-123456789012", 0);
  assert.match(path, /^挙式\/001-/);
  assert.equal(path.includes(".."), false);
});

test("Cookieを安全に分割し、Originを検証する", () => {
  const cookies = parseCookieHeader("one=1; token=a=b=c; ignored");
  assert.equal(cookies.get("one"), "1");
  assert.equal(cookies.get("token"), "a=b=c");

  assert.equal(
    isSameOriginRequest(new Request("https://example.test/api/photos", {
      method: "POST",
      headers: { origin: "https://example.test", "sec-fetch-site": "same-origin" },
    })),
    true,
  );
  assert.equal(
    isSameOriginRequest(new Request("https://example.test/api/photos", {
      method: "POST",
      headers: { origin: "https://evil.test", "sec-fetch-site": "cross-site" },
    })),
    false,
  );
});
