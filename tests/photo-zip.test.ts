import assert from "node:assert/strict";
import test from "node:test";
import { unzipSync } from "fflate";
import {
  createPhotoZipStream,
  getPhotoZipCapacityIssue,
} from "../worker/photo-zip";
import type { PhotoObjectStorage, PhotoRow } from "../worker/photo-storage";

function photo(id: string, category: PhotoRow["category"], objectKey: string): PhotoRow {
  return {
    id,
    batch_id: "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa",
    file_index: 0,
    original_name: "same-name.jpg",
    object_key: objectKey,
    thumbnail_key: `thumb-${id}`,
    display_key: `display-${id}`,
    mime_type: "image/jpeg",
    file_size: 3,
    width: 1,
    height: 1,
    category,
    uploader_name: null,
    comment: null,
    created_at: "2026-09-01T00:00:00.000Z",
    is_visible: 1,
    sha256: id,
  };
}

test("同名写真をカテゴリー別の一意名でストリーミングZIP化する", async () => {
  const values = new Map([
    ["one", new Uint8Array([1, 2, 3])],
    ["two", new Uint8Array([4, 5, 6])],
  ]);
  const storage: PhotoObjectStorage = {
    async putOriginal() {},
    async putThumbnail() {},
    async putDisplayImage() {},
    async getOriginalStream(key) {
      const value = values.get(key);
      if (!value) return null;
      return {
        key,
        size: value.length,
        body: new Blob([value]).stream(),
        arrayBuffer: async () => value.buffer.slice(0) as ArrayBuffer,
      };
    },
    async getThumbnail() { return null; },
    async getDisplayImage() { return null; },
    async deleteObjects() {},
  };

  const stream = createPhotoZipStream([
    photo("11111111-1111-4111-8111-111111111111", "ceremony", "one"),
    photo("22222222-2222-4222-8222-222222222222", "reception", "two"),
  ], storage);
  const archive = new Uint8Array(await new Response(stream).arrayBuffer());
  const files = unzipSync(archive);
  const names = Object.keys(files).filter((name) => !name.endsWith("/"));

  assert.equal(names.length, 2);
  assert.equal(names.some((name) => name.startsWith("挙式/001-")), true);
  assert.equal(names.some((name) => name.startsWith("披露宴/002-")), true);
  assert.deepEqual([...files[names[0]]], [1, 2, 3]);
  assert.deepEqual([...files[names[1]]], [4, 5, 6]);
});

test("ZIP64非対応範囲では壊れたZIPを生成せず事前に拒否する", () => {
  const normal = photo("33333333-3333-4333-8333-333333333333", "other", "normal");
  assert.equal(getPhotoZipCapacityIssue([normal]), null);

  const oversized = { ...normal, file_size: 0xffff_ffff };
  assert.equal(getPhotoZipCapacityIssue([oversized]), "archive_too_large");

  assert.equal(
    getPhotoZipCapacityIssue(new Array(0x1_0000).fill(normal)),
    "too_many_entries",
  );
});
