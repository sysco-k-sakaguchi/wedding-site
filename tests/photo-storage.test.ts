import assert from "node:assert/strict";
import test from "node:test";
import type { R2Bucket, R2ListOptions, R2Objects } from "../worker/photo-runtime";
import { R2PhotoObjectStorage, type PhotoRow } from "../worker/photo-storage";

const id = "11111111-1111-4111-8111-111111111111";
const otherId = "11111111-1111-4111-8111-111111111112";
const photo: PhotoRow = {
  id,
  batch_id: "22222222-2222-4222-8222-222222222222",
  file_index: 0,
  original_name: "original.jpg",
  object_key: `originals/${id}.jpg`,
  thumbnail_key: `thumbnails/light-v1/${id}-current.jpg`,
  display_key: `display/light-v1/${id}-current.jpg`,
  mime_type: "image/jpeg",
  file_size: 1,
  width: 960,
  height: 640,
  category: "reception",
  uploader_name: null,
  comment: null,
  created_at: "2026-10-07T00:00:00.000Z",
  is_visible: 0,
  sha256: "test-original-hash",
};

class MockR2 implements R2Bucket {
  readonly objects = new Map<string, Uint8Array>();
  readonly events: Array<"list" | "delete"> = [];
  readonly listings: R2ListOptions[] = [];
  readonly deletions: string[][] = [];
  constructor(keys: string[], private readonly pageSize = 1000) {
    keys.forEach((key, index) => this.objects.set(key, new Uint8Array([index % 256])));
  }
  async put() { throw new Error("Deletion must not write objects"); }
  async get() { return null; }
  async list(options: R2ListOptions = {}): Promise<R2Objects> {
    this.events.push("list");
    this.listings.push(options);
    const matches = [...this.objects.keys()].filter((key) => key.startsWith(options.prefix ?? "")).sort();
    const offset = options.cursor ? Number(options.cursor.slice("offset:".length)) : 0;
    const end = offset + Math.min(options.limit ?? 1000, this.pageSize);
    return {
      objects: matches.slice(offset, end).map((key) => ({ key })),
      truncated: end < matches.length,
      ...(end < matches.length ? { cursor: `offset:${end}` } : {}),
    };
  }
  async delete(keys: string | string[]) {
    const batch = typeof keys === "string" ? [keys] : keys;
    this.events.push("delete");
    this.deletions.push([...batch]);
    batch.forEach((key) => this.objects.delete(key));
  }
}

test("明示的な削除は非公開写真の原本・旧派生・現派生・失敗orphanを全て削除し、他写真のデータを保持する", async () => {
  const ownKeys = [
    photo.object_key, photo.thumbnail_key, photo.display_key,
    `originals/${id}.png`,
    `thumbnails/${id}.jpg`, `display/${id}.jpg`,
    `thumbnails/light-v1/${id}.jpg`, `display/light-v1/${id}.jpg`,
    `thumbnails/light-v1/${id}-older.jpg`, `display/light-v1/${id}-older.jpg`,
    `thumbnails/light-v1/${id}-orphan.jpg`, `display/light-v1/${id}-orphan.jpg`,
  ];
  const retainedKeys = [
    `originals/${otherId}.jpg`, `thumbnails/${otherId}.jpg`, `display/${otherId}.jpg`,
    `thumbnails/light-v1/${otherId}.jpg`, `display/light-v1/${otherId}-old.jpg`,
    `thumbnails/light-v1/${id}0.jpg`,
    `thumbnails/light-v1/${id}-nested/other.jpg`,
    "assets/banner.jpg",
  ];
  const bucket = new MockR2([...ownKeys, ...retainedKeys], 2);
  const retained = new Map(retainedKeys.map((key) => [key, bucket.objects.get(key)]));
  await new R2PhotoObjectStorage(bucket).deletePhotoObjects(photo);
  assert.deepEqual([...bucket.objects.keys()].sort(), [...retainedKeys].sort());
  for (const [key, bytes] of retained) assert.deepEqual(bucket.objects.get(key), bytes);
  const deleted = bucket.deletions.flat();
  assert.deepEqual([...deleted].sort(), [...ownKeys].sort());
  assert.equal(new Set(deleted).size, ownKeys.length, "Current keys must be deduplicated against listing results");
  assert.ok(bucket.listings.some((options) => options.cursor), "Truncated listings must be followed");
  assert.ok(bucket.listings.every((options) => options.limit === 1000));
  assert.ok(bucket.events.lastIndexOf("list") < bucket.events.indexOf("delete"));
});

test("複数ページを全て列挙してから、1000keys以内のバッチで削除する", async () => {
  const oldCopies = Array.from({ length: 2501 }, (_, index) => `thumbnails/light-v1/${id}-${index}.jpg`);
  const bucket = new MockR2([photo.object_key, photo.thumbnail_key, photo.display_key, ...oldCopies], 137);
  await new R2PhotoObjectStorage(bucket).deletePhotoObjects(photo);
  assert.equal(bucket.objects.size, 0);
  assert.deepEqual(bucket.deletions.map((batch) => batch.length), [1000, 1000, 504]);
  assert.ok(bucket.listings.some((options) => options.cursor === "offset:137"));
  assert.ok(bucket.events.lastIndexOf("list") < bucket.events.indexOf("delete"));
});

test("不正UUIDと他写真を参照する現在キーはR2に触れる前に拒否する", async () => {
  for (const invalidId of ["", "../", id.slice(0, -1), `${id}.`, "11111111-1111-0111-8111-111111111111", "11111111-1111-4111-1111-111111111111"]) {
    const bucket = new MockR2([photo.object_key]);
    await assert.rejects(new R2PhotoObjectStorage(bucket).deletePhotoObjects({ ...photo, id: invalidId }), /invalid UUID/);
    assert.equal(bucket.events.length, 0);
    assert.ok(bucket.objects.has(photo.object_key));
  }
  const bucket = new MockR2([photo.object_key, `thumbnails/${otherId}.jpg`]);
  await assert.rejects(new R2PhotoObjectStorage(bucket).deletePhotoObjects({
    ...photo, thumbnail_key: `thumbnails/${otherId}.jpg`,
  }), /outside this photo/);
  assert.equal(bucket.events.length, 0);
  assert.equal(bucket.objects.size, 2);
});

test("listの失敗は削除を開始せずrejectし、deleteの失敗も成功扱いしない", async () => {
  const listingFailure = new MockR2([photo.object_key, photo.thumbnail_key, photo.display_key]);
  const list = listingFailure.list.bind(listingFailure);
  listingFailure.list = async (options) => {
    if (listingFailure.listings.length === 2) throw new Error("R2 list failed");
    return list(options);
  };
  await assert.rejects(new R2PhotoObjectStorage(listingFailure).deletePhotoObjects(photo), /R2 list failed/);
  assert.equal(listingFailure.deletions.length, 0);
  assert.equal(listingFailure.objects.size, 3);

  const deletionFailure = new MockR2([photo.object_key, photo.thumbnail_key, photo.display_key]);
  deletionFailure.delete = async () => { throw new Error("R2 delete failed"); };
  await assert.rejects(new R2PhotoObjectStorage(deletionFailure).deletePhotoObjects(photo), /R2 delete failed/);
  assert.equal(deletionFailure.objects.size, 3);
});

test("truncatedページのcursor欠落・同一cursor反復は削除前に拒否する", async () => {
  for (const cursor of [undefined, "repeated"]) {
    const bucket = new MockR2([photo.object_key, photo.thumbnail_key, photo.display_key]);
    bucket.list = async () => ({ objects: [], truncated: true, ...(cursor ? { cursor } : {}) });
    await assert.rejects(new R2PhotoObjectStorage(bucket).deletePhotoObjects(photo), /invalid R2 cursor/);
    assert.equal(bucket.deletions.length, 0);
    assert.equal(bucket.objects.size, 3);
  }
});

test("同写真のprefix以外のキーがlistに混ざっても削除しない", async () => {
  const retained = `originals/${otherId}.jpg`;
  const bucket = new MockR2([photo.object_key, photo.thumbnail_key, photo.display_key, retained]);
  const list = bucket.list.bind(bucket);
  bucket.list = async (options) => {
    const page = await list(options);
    return { ...page, objects: [...page.objects, { key: retained }] };
  };
  await new R2PhotoObjectStorage(bucket).deletePhotoObjects(photo);
  assert.deepEqual([...bucket.objects.keys()], [retained]);
});
