import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { createPhotoImageCache, PhotoImageError } from "../app/photos/photo-image-cache";

type CacheOptions = Parameters<typeof createPhotoImageCache>[0];

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function imageBlob(size = 3) {
  return new Blob([new Uint8Array(size)], { type: "image/jpeg" });
}

function createHarness(t: TestContext, overrides: Partial<CacheOptions> = {}) {
  const requests: Array<ReturnType<typeof deferred<Blob>> & { key: string; signal: AbortSignal }> = [];
  const created: Array<{ url: string; blob: Blob }> = [];
  const revoked: string[] = [];
  const decoded: string[] = [];
  let authExpired = 0;
  const cache = createPhotoImageCache({
    fetchImage(key, signal) {
      const request = { ...deferred<Blob>(), key, signal };
      requests.push(request);
      return request.promise;
    },
    createUrl(blob) {
      const url = `blob:test-${created.length + 1}`;
      created.push({ url, blob });
      return url;
    },
    revokeUrl(url) { revoked.push(url); },
    async decode(url) { decoded.push(url); },
    onAuthExpired() { authExpired++; },
    ...overrides,
  });
  t.after(() => cache.clear());
  return {
    cache, requests, created, revoked, decoded,
    authExpired: () => authExpired,
    acquire(key: string, priority = 0) {
      const lease = cache.acquire(key, priority);
      // Cleanup can reject pending leases; keep those rejections observed even after a failed assertion.
      void lease.promise.catch(() => {});
      return lease;
    },
  };
}

async function flushTasks() {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

test("同じ画像の取得とデコードを共有し、解放済みの画像も再利用する", async (t) => {
  const h = createHarness(t);
  const first = h.acquire("/one");
  const second = h.acquire("/one", 1);
  assert.equal(first.promise, second.promise);
  assert.equal(h.requests.length, 1);

  const blob = imageBlob();
  h.requests[0].resolve(blob);
  const [firstUrl, secondUrl] = await Promise.all([first.promise, second.promise]);
  assert.equal(firstUrl, secondUrl);
  assert.deepEqual(h.created, [{ url: firstUrl, blob }]);
  assert.deepEqual(h.decoded, [firstUrl]);

  first.release();
  first.release();
  second.release();
  const third = h.acquire("/one");
  assert.equal(third.promise, first.promise);
  assert.equal(await third.promise, firstUrl);
  assert.equal(h.requests.length, 1);
  assert.deepEqual(h.revoked, []);
  third.release();
});

test("バイト上限を超えても表示中のObjectURLを保持し、最後の解放で回収する", async (t) => {
  const h = createHarness(t, { maxBytes: 2 });
  const first = h.acquire("/large");
  const second = h.acquire("/large");
  h.requests[0].resolve(imageBlob(4));
  const url = await first.promise;
  assert.equal(h.cache.stats().bytes, 4);
  assert.deepEqual(h.revoked, []);

  first.release();
  first.release();
  assert.equal(h.cache.stats().bytes, 4);
  assert.deepEqual(h.revoked, []);
  second.release();
  assert.deepEqual(h.revoked, [url]);
  assert.deepEqual(h.cache.stats(), { entries: 0, bytes: 0, active: 0, queued: 0 });
});

test("件数上限では表示中の画像を保護し、未使用画像をLRU順に回収する", async (t) => {
  const h = createHarness(t, { maxEntries: 2 });
  const first = h.acquire("/first");
  h.requests[0].resolve(imageBlob());
  const firstUrl = await first.promise;
  first.release();
  const second = h.acquire("/second");
  h.requests[1].resolve(imageBlob());
  const secondUrl = await second.promise;
  second.release();

  const revisited = h.acquire("/first");
  assert.equal(await revisited.promise, firstUrl);
  revisited.release();
  const third = h.acquire("/third");
  h.requests[2].resolve(imageBlob());
  const thirdUrl = await third.promise;
  assert.deepEqual(h.revoked, [secondUrl]);
  assert.equal(h.cache.stats().entries, 2);
  assert.equal(h.cache.stats().bytes, 6);

  const retained = h.acquire("/first");
  assert.equal(await retained.promise, firstUrl);
  assert.equal(h.requests.length, 3);
  const evicted = h.acquire("/second");
  assert.equal(h.requests.length, 4);
  assert.notEqual(evicted.promise, second.promise);
  assert.equal(h.revoked.includes(thirdUrl), false);
  retained.release();
  third.release();
  evicted.release();
  await assert.rejects(evicted.promise, { name: "AbortError" });
});

test("バイト上限で未使用画像だけを回収し、pin中のURLを失効させない", async (t) => {
  const h = createHarness(t, { maxBytes: 6, maxEntries: 10 });
  const first = h.acquire("/first");
  h.requests[0].resolve(imageBlob());
  const firstUrl = await first.promise;
  const second = h.acquire("/second");
  h.requests[1].resolve(imageBlob());
  const secondUrl = await second.promise;
  second.release();
  const third = h.acquire("/third");
  h.requests[2].resolve(imageBlob());
  const thirdUrl = await third.promise;
  assert.deepEqual(h.revoked, [secondUrl]);
  assert.equal(h.cache.stats().bytes, 6);
  assert.equal(await first.promise, firstUrl);
  assert.equal(h.revoked.includes(firstUrl), false);
  assert.equal(h.revoked.includes(thirdUrl), false);
  first.release();
  third.release();
});

test("共有取得は最後の利用者が離れた時だけabortし、再取得を妨げない", async (t) => {
  const h = createHarness(t);
  const first = h.acquire("/pending");
  const second = h.acquire("/pending");
  first.release();
  first.release();
  assert.equal(h.requests[0].signal.aborted, false);
  assert.equal(h.cache.stats().entries, 1);
  second.release();
  assert.equal(h.requests[0].signal.aborted, true);
  await assert.rejects(first.promise, { name: "AbortError" });
  assert.equal(h.cache.stats().entries, 0);

  const retry = h.acquire("/pending");
  assert.notEqual(retry.promise, first.promise);
  assert.equal(h.requests.length, 2);
  h.requests[1].resolve(imageBlob());
  const retryUrl = await retry.promise;
  h.requests[0].resolve(imageBlob()); // A transport that ignores abort must not overwrite the retry.
  await flushTasks();
  assert.equal(h.created.length, 1);
  assert.equal(await h.acquire("/pending").promise, retryUrl);
});

test("開始前に解放された画像を待ち行列から除き、取得を開始しない", async (t) => {
  const h = createHarness(t, { concurrency: 1 });
  const active = h.acquire("/active", 1);
  const queued = h.acquire("/queued", 1);
  assert.equal(h.requests.length, 1);
  assert.equal(h.cache.stats().queued, 1);
  queued.release();
  await assert.rejects(queued.promise, { name: "AbortError" });
  assert.equal(h.cache.stats().queued, 0);
  h.requests[0].resolve(imageBlob());
  await active.promise;
  assert.deepEqual(h.requests.map(({ key }) => key), ["/active"]);
});

test("取得失敗をキャッシュせず、同じ画像を次回再試行する", async (t) => {
  const h = createHarness(t);
  const first = h.acquire("/retry");
  const failure = new Error("offline");
  h.requests[0].reject(failure);
  await assert.rejects(first.promise, (error) => error === failure);
  assert.equal(h.cache.stats().entries, 0);
  assert.equal(h.authExpired(), 0);

  const retry = h.acquire("/retry");
  assert.notEqual(retry.promise, first.promise);
  assert.equal(h.requests.length, 2);
  h.requests[1].resolve(imageBlob());
  assert.equal(await retry.promise, "blob:test-1");
  first.release();
  assert.equal(h.cache.stats().entries, 1);
  retry.release();
});

test("デコード完了前にはURLを返さず、デコード失敗時に回収して再試行する", async (t) => {
  const decodes: Array<ReturnType<typeof deferred<void>>> = [];
  const h = createHarness(t, {
    decode() {
      const decode = deferred<void>();
      decodes.push(decode);
      return decode.promise;
    },
  });
  const first = h.acquire("/decode");
  let resolved = false;
  void first.promise.then(() => { resolved = true; }, () => {});
  h.requests[0].resolve(imageBlob());
  await flushTasks();
  assert.equal(decodes.length, 1);
  assert.equal(resolved, false);
  assert.equal(h.cache.stats().bytes, 0);
  const failure = new PhotoImageError(0, "invalid image");
  decodes[0].reject(failure);
  await assert.rejects(first.promise, (error) => error === failure);
  assert.deepEqual(h.revoked, ["blob:test-1"]);
  assert.equal(h.cache.stats().entries, 0);

  const retry = h.acquire("/decode");
  h.requests[1].resolve(imageBlob());
  await flushTasks();
  decodes[1].resolve();
  assert.equal(await retry.promise, "blob:test-2");
  retry.release();
});

test("clearで保持URL・取得中・待機中を無効化し、遅い取得結果を登録しない", async (t) => {
  const h = createHarness(t, { concurrency: 1 });
  const ready = h.acquire("/ready", 1);
  h.requests[0].resolve(imageBlob());
  const readyUrl = await ready.promise;
  const pending = h.acquire("/pending", 1);
  const queued = h.acquire("/queued", 1);
  h.cache.clear();
  await Promise.all([
    assert.rejects(pending.promise, { name: "AbortError" }),
    assert.rejects(queued.promise, { name: "AbortError" }),
  ]);
  assert.equal(h.requests[1].signal.aborted, true);
  assert.deepEqual(h.revoked, [readyUrl]);
  assert.deepEqual(h.cache.stats(), { entries: 0, bytes: 0, active: 0, queued: 0 });

  const nextSession = h.acquire("/pending", 1);
  assert.equal(h.requests.length, 3);
  h.requests[2].resolve(imageBlob());
  const nextUrl = await nextSession.promise;
  h.requests[1].resolve(imageBlob());
  await flushTasks();
  assert.equal(h.created.length, 2);
  assert.equal(await h.acquire("/pending").promise, nextUrl);
  assert.deepEqual(h.revoked, [readyUrl]);
  ready.release();
  pending.release();
  queued.release();
  assert.equal(h.cache.stats().entries, 1);
});

test("clear後の遅いデコード完了でURLを再登録せず、作成済みURLを一度だけ回収する", async (t) => {
  const decode = deferred<void>();
  const h = createHarness(t, { decode: () => decode.promise });
  const lease = h.acquire("/decoding");
  h.requests[0].resolve(imageBlob());
  await flushTasks();
  assert.equal(h.created.length, 1);
  h.cache.clear();
  await assert.rejects(lease.promise, { name: "AbortError" });
  decode.resolve();
  await flushTasks();
  assert.deepEqual(h.revoked, ["blob:test-1"]);
  assert.deepEqual(h.cache.stats(), { entries: 0, bytes: 0, active: 0, queued: 0 });
  h.cache.clear();
  assert.deepEqual(h.revoked, ["blob:test-1"]);
});

for (const status of [401, 403]) {
  test(`HTTP ${status}でセッション全体を消去し、認証切れを一度通知する`, async (t) => {
    const h = createHarness(t, { concurrency: 2 });
    const ready = h.acquire("/ready", 1);
    h.requests[0].resolve(imageBlob());
    const readyUrl = await ready.promise;
    const denied = h.acquire("/denied", 1);
    const pending = h.acquire("/pending", 1);
    const queued = h.acquire("/queued", 1);
    const failure = new PhotoImageError(status);
    h.requests[1].reject(failure);
    await Promise.all([
      assert.rejects(denied.promise, (error) => error === failure),
      assert.rejects(pending.promise, { name: "AbortError" }),
      assert.rejects(queued.promise, { name: "AbortError" }),
    ]);
    await flushTasks();
    assert.equal(h.authExpired(), 1);
    assert.deepEqual(h.revoked, [readyUrl]);
    assert.equal(h.requests[2].signal.aborted, true);
    assert.deepEqual(h.cache.stats(), { entries: 0, bytes: 0, active: 0, queued: 0 });
    assert.equal(h.requests.some(({ key }) => key === "/queued"), false);
  });
}

test("同じセッションの並列認証エラーで認証切れ通知を重複させない", async (t) => {
  const h = createHarness(t, { concurrency: 2 });
  const first = h.acquire("/first-denied", 1);
  const second = h.acquire("/second-denied", 1);
  h.requests[0].reject(new PhotoImageError(401));
  h.requests[1].reject(new PhotoImageError(403));
  const results = await Promise.allSettled([first.promise, second.promise]);
  await flushTasks();
  assert.equal(results.every(({ status }) => status === "rejected"), true);
  assert.equal(h.authExpired(), 1);
  assert.deepEqual(h.cache.stats(), { entries: 0, bytes: 0, active: 0, queued: 0 });
});

test("旧セッションの遅い認証エラーが通知後に開始した新セッションを消去しない", async (t) => {
  let nextSession: ReturnType<ReturnType<typeof createHarness>["acquire"]> | undefined;
  let notifications = 0;
  const h: ReturnType<typeof createHarness> = createHarness(t, {
    concurrency: 2,
    onAuthExpired() {
      notifications++;
      nextSession ??= h.acquire("/same-key", 1);
    },
  });
  const first = h.acquire("/first-denied", 1);
  const second = h.acquire("/same-key", 1);
  h.requests[0].reject(new PhotoImageError(401));
  h.requests[1].reject(new PhotoImageError(403));
  await Promise.allSettled([first.promise, second.promise]);
  await flushTasks();
  assert.equal(notifications, 1);
  assert.ok(nextSession);
  assert.equal(h.requests.length, 3);
  assert.equal(h.requests[2].key, "/same-key");
  assert.equal(h.requests[2].signal.aborted, false);
  assert.deepEqual(h.cache.stats(), { entries: 1, bytes: 0, active: 1, queued: 0 });
  h.requests[2].resolve(imageBlob());
  const url = await nextSession.promise;
  assert.equal(await h.acquire("/same-key").promise, url);
  assert.equal(h.requests.length, 3);
  assert.deepEqual(h.revoked, []);
});

test("HTTP 500では失敗した画像だけを除き、他の保持画像と認証を維持する", async (t) => {
  const h = createHarness(t);
  const ready = h.acquire("/ready", 1);
  h.requests[0].resolve(imageBlob());
  const readyUrl = await ready.promise;
  const failed = h.acquire("/failed", 1);
  const failure = new PhotoImageError(500);
  h.requests[1].reject(failure);
  await assert.rejects(failed.promise, (error) => error === failure);
  assert.equal(h.authExpired(), 0);
  assert.deepEqual(h.revoked, []);
  assert.equal(await h.acquire("/ready").promise, readyUrl);
  assert.equal(h.requests.length, 2);
  assert.equal(h.cache.stats().entries, 1);
});

test("同時取得上限を守り、待機中は高優先度の画像から開始する", async (t) => {
  const h = createHarness(t, { concurrency: 2 });
  const first = h.acquire("/first", 1);
  const second = h.acquire("/second", 1);
  const lowerPriority = h.acquire("/lower", 1);
  const higherPriority = h.acquire("/higher", 2);
  assert.deepEqual(h.requests.map(({ key }) => key), ["/first", "/second"]);
  assert.equal(h.cache.stats().active, 2);
  assert.equal(h.cache.stats().queued, 2);

  h.requests[0].resolve(imageBlob());
  await first.promise;
  assert.deepEqual(h.requests.map(({ key }) => key), ["/first", "/second", "/higher"]);
  assert.equal(h.cache.stats().active, 2);
  h.requests[1].resolve(imageBlob());
  await second.promise;
  assert.equal(h.requests[3].key, "/lower");
  assert.equal(h.cache.stats().active, 2);
  h.requests[2].resolve(imageBlob());
  h.requests[3].resolve(imageBlob());
  await Promise.all([higherPriority.promise, lowerPriority.promise]);
  assert.equal(h.cache.stats().active, 0);
});

test("サムネイルで全枠を埋めず、写真を開く高優先度取得をすぐ開始する", async (t) => {
  const h = createHarness(t, { concurrency: 3 });
  const first = h.acquire("/thumb-1");
  const second = h.acquire("/thumb-2");
  const queued = h.acquire("/thumb-3");
  assert.deepEqual(h.requests.map(({ key }) => key), ["/thumb-1", "/thumb-2"]);
  assert.equal(h.cache.stats().active, 2);
  const opened = h.acquire("/display", 1);
  assert.equal(h.requests[2].key, "/display");
  assert.equal(h.cache.stats().active, 3);

  h.requests[2].resolve(imageBlob());
  await opened.promise;
  assert.equal(h.requests.length, 3);
  assert.equal(h.cache.stats().queued, 1);
  h.requests[0].resolve(imageBlob());
  await first.promise;
  assert.equal(h.requests[3].key, "/thumb-3");
  h.requests[1].resolve(imageBlob());
  h.requests[3].resolve(imageBlob());
  await Promise.all([second.promise, queued.promise]);
});

test("待機中サムネイルを高優先度で再取得すると、同じpromiseで予約枠を使う", async (t) => {
  const h = createHarness(t, { concurrency: 2 });
  const first = h.acquire("/thumb-1");
  const queued = h.acquire("/thumb-2");
  assert.equal(h.requests.length, 1);
  const promoted = h.acquire("/thumb-2", 1);
  assert.equal(promoted.promise, queued.promise);
  assert.deepEqual(h.requests.map(({ key }) => key), ["/thumb-1", "/thumb-2"]);
  h.requests[0].resolve(imageBlob());
  h.requests[1].resolve(imageBlob());
  await Promise.all([first.promise, queued.promise, promoted.promise]);
});

test("timeoutで応答しない取得をabortし、待機取得へ枠を渡して再試行可能にする", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const h = createHarness(t, { concurrency: 1, timeoutMs: 100 });
  const stalled = h.acquire("/stalled", 1);
  const queued = h.acquire("/queued", 1);
  t.mock.timers.tick(99);
  assert.equal(h.requests[0].signal.aborted, false);
  t.mock.timers.tick(1);
  await assert.rejects(stalled.promise, { name: "AbortError" });
  assert.equal(h.requests[0].signal.aborted, true);
  assert.equal(h.requests[1].key, "/queued");
  h.requests[1].resolve(imageBlob());
  await queued.promise;

  const retry = h.acquire("/stalled", 1);
  assert.equal(h.requests.length, 3);
  h.requests[2].resolve(imageBlob());
  assert.equal(await retry.promise, "blob:test-2");
  h.requests[0].resolve(imageBlob());
  await flushTasks();
  assert.equal(h.created.length, 2);
});

test("デコード中のtimeoutでも作成済みObjectURLを回収する", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const decode = deferred<void>();
  const h = createHarness(t, { timeoutMs: 100, decode: () => decode.promise });
  const lease = h.acquire("/stalled-decode");
  h.requests[0].resolve(imageBlob());
  await flushTasks();
  t.mock.timers.tick(100);
  await assert.rejects(lease.promise, { name: "AbortError" });
  assert.deepEqual(h.revoked, ["blob:test-1"]);
  decode.resolve();
  await flushTasks();
  assert.deepEqual(h.cache.stats(), { entries: 0, bytes: 0, active: 0, queued: 0 });
  assert.deepEqual(h.revoked, ["blob:test-1"]);
});
