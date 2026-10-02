import assert from "node:assert/strict";
import test from "node:test";
import { createPhotoFileCache, fetchPhotoFile, openPhotoSaveMenu, photoDevice, photoSaveMethod, photoSavePageUrl } from "../app/photos/photo-save";

const photo = (id: string) => ({ id, originalName: `${id}.jpg`, originalUrl: `/api/photos/${id}/original` });
const file = (id: string, bytes = 4) => new File(["x".repeat(bytes)], `${id}.jpg`, { type: "image/jpeg" });
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

test("iPhone・iPadのデスクトップ表示・Androidを判別する", () => {
  assert.equal(photoDevice("Mozilla iPhone", 5), "ios");
  assert.equal(photoDevice("Mozilla Macintosh", 5), "ios");
  assert.equal(photoDevice("Mozilla Android", 5), "android");
  assert.equal(photoDevice("Mozilla Macintosh", 0), "desktop");
});

test("iPhoneの通常保存はFile共有を通らず、長押し用の保存画面へ進む", () => {
  assert.equal(photoSaveMethod("ios", true), "image");
  assert.equal(photoSaveMethod("ios", false), "image");
  assert.equal(photoSaveMethod("ios", true, true), "share");
  assert.equal(photoSaveMethod("android", true), "share");
  assert.equal(photoSaveMethod("android", false), "image");
  assert.equal(photoSaveMethod("desktop", true), "download");
  assert.equal(photoSavePageUrl("photo-id", "en"), "/photos/save/photo-id?lang=en");
  assert.equal(photoSavePageUrl("a/b", "ja"), "/photos/save/a%2Fb?lang=ja");
});

test("原本取得を共有し、同時取得を2件に抑える。キャンセル後の同じIDは二重送信しない", async () => {
  const starts: string[] = [];
  const pending = new Map<string, (value: File) => void>();
  const cache = createPhotoFileCache((item) => new Promise((resolve) => { starts.push(item.id); pending.set(item.id, resolve); }));
  const first = cache.prepare(photo("a"));
  const same = cache.prepare(photo("a"));
  const second = cache.prepare(photo("b"));
  assert.equal(first.promise, same.promise);
  const cancelled = cache.prepare(photo("c"));
  const rejected = assert.rejects(cancelled.promise, { name: "AbortError" });
  cancelled.release();
  const replacement = cache.prepare(photo("c"));
  const last = cache.prepare(photo("d"));
  assert.deepEqual(starts, ["a", "b"]);
  pending.get("a")!(file("a")); pending.get("b")!(file("b"));
  await Promise.all([first.promise, same.promise, second.promise, rejected]); await tick();
  assert.deepEqual(starts, ["a", "b", "c", "d"]);
  pending.get("c")!(file("c")); pending.get("d")!(file("d"));
  await Promise.all([replacement.promise, last.promise]); cache.dispose();
});

test("StrictMode相当の破棄・再開で古い取得が新しいリクエストを消さない", async () => {
  const pending: ((value: File) => void)[] = [];
  const cache = createPhotoFileCache(() => new Promise((resolve) => pending.push(resolve)));
  const old = cache.prepare(photo("a"));
  const rejected = assert.rejects(old.promise, { name: "AbortError" });
  cache.dispose();
  await assert.rejects(cache.prepare(photo("b")).promise, { name: "AbortError" });
  cache.resume();
  const fresh = cache.prepare(photo("a"));
  pending[0](file("old")); await rejected; await tick();
  assert.equal(cache.prepare(photo("a")).promise, fresh.promise);
  pending[1](file("fresh"));
  assert.equal((await fresh.promise).name, "fresh.jpg"); cache.dispose();
});

test("原本キャッシュの枚数と容量を超えた写真を解放する", async () => {
  const cache = createPhotoFileCache(async (item) => file(item.id), 8, 2);
  for (const id of ["a", "b", "c"]) { await cache.prepare(photo(id)).promise; await tick(); }
  assert.equal(cache.peek("a"), undefined);
  assert.equal(cache.peek("b")?.name, "b.jpg");
  assert.equal(cache.peek("c")?.name, "c.jpg"); cache.dispose();
});

test("保存メニューは同期的に開き、連続タップは1回に抑える", async () => {
  let count = 0;
  let finish!: () => void;
  const lock = { current: false };
  const api = { canShare: () => true, share: () => { count++; return new Promise<void>((resolve) => { finish = resolve; }); } };
  const first = openPhotoSaveMenu(file("a"), api, lock, () => assert.fail("fallback"));
  assert.equal(count, 1); assert.equal(lock.current, true);
  await openPhotoSaveMenu(file("b"), api, lock, () => assert.fail("fallback"));
  assert.equal(count, 1); finish(); await first; assert.equal(lock.current, false);
});

test("メニューのキャンセルは静かに終了し、未対応・拒否・同期例外は原本表示へ戻る", async () => {
  let fallbacks = 0;
  const lock = { current: false };
  for (const name of ["AbortError", "InvalidStateError", "NotAllowedError", "DataError"]) {
    await openPhotoSaveMenu(file("a"), { canShare: () => true, share: () => Promise.reject(new DOMException("", name)) }, lock, () => fallbacks++);
    assert.equal(lock.current, false);
  }
  assert.equal(fallbacks, 2);
  await openPhotoSaveMenu(file("a"), { canShare: () => false, share: () => assert.fail("share") }, lock, () => fallbacks++);
  await openPhotoSaveMenu(file("a"), { canShare: () => { throw new TypeError(); }, share: () => assert.fail("share") }, lock, () => fallbacks++);
  await openPhotoSaveMenu(file("a"), { canShare: () => true, share: () => { throw new TypeError(); } }, lock, () => fallbacks++);
  assert.equal(fallbacks, 5); assert.equal(lock.current, false);
});

test("共有用Fileは原本の名前・MIMEを保持し、ログイン画面やエラーを画像として渡さない", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(url, "/api/photos/a/original"); assert.equal(options?.credentials, "same-origin");
      return new Response("image", { headers: { "Content-Type": "image/jpeg" } });
    };
    const result = await fetchPhotoFile(photo("a"), new AbortController().signal);
    assert.equal(result.name, "a.jpg"); assert.equal(result.type, "image/jpeg");
    globalThis.fetch = async () => new Response("login", { headers: { "Content-Type": "text/html" } });
    await assert.rejects(fetchPhotoFile(photo("a"), new AbortController().signal), /Invalid photo/);
    globalThis.fetch = async () => new Response("denied", { status: 401 });
    await assert.rejects(fetchPhotoFile(photo("a"), new AbortController().signal), /Photo unavailable/);
  } finally { globalThis.fetch = originalFetch; }
});
