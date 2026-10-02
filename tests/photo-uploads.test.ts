import assert from "node:assert/strict";
import test from "node:test";
import { runUploadQueue, sendPhoto, uploadProgress, PhotoUploadError, type UploadItem } from "../app/photos/photo-uploads";
import type { Photo } from "../app/photos/PhotosApp";

function selection(count: number) {
  return Array.from({ length: count }, (_, index): UploadItem => ({
    id: `item-${index}`, file: new File([`photo-${index}`], `${index}.jpg`, { type: "image/jpeg" }),
    previewUrl: `blob:${index}`, status: "queued", progress: 0, message: "",
  }));
}

function queue(items: UploadItem[]) {
  return {
    items, batchSize: 10, signal: new AbortController().signal,
    update: (id: string, patch: Partial<UploadItem>) => Object.assign(items.find((item) => item.id === id)!, patch),
    onPhoto: (_photo: Photo) => {}, errorMessage: (error: unknown) => String(error),
  };
}

test("23枚を保持し10/10/3で送る。100%は保存確認後だけ", async () => {
  const items = selection(23);
  const counts: number[] = [];
  const sent: string[] = [];
  let active = 0, peak = 0;
  await runUploadQueue({ ...queue(items),
    createBatch: async (count) => { counts.push(count); return `batch-${counts.length}`; },
    send: async (item, progress) => {
      active++; peak = Math.max(peak, active);
      sent.push(`${item.batchId}:${item.fileIndex}`);
      progress(uploadProgress(100, 100));
      assert.equal(item.progress, 95);
      assert.equal(item.status, "saving");
      await Promise.resolve(); active--;
      return { photo: { id: item.id } as Photo };
    },
  });
  assert.deepEqual(counts, [10, 10, 3]);
  assert.equal(items.length, 23);
  assert.equal(new Set(sent).size, 23);
  assert.equal(peak, 2);
  assert.ok(items.every((item) => item.status === "success" && item.progress === 100));
});

test("通信失敗は残し再送だけ同じbatch/indexへ送る", async () => {
  const items = selection(12);
  let batches = 0;
  const send = async (item: UploadItem) => {
    if (item.id === "item-3") throw new PhotoUploadError("connection_lost", "");
    return { photo: { id: item.id } as Photo };
  };
  await runUploadQueue({ ...queue(items), createBatch: async () => `batch-${++batches}`, send });
  const failed = items[3];
  assert.equal(failed.status, "error");
  assert.equal(failed.progress, 0);
  const assignment = `${failed.batchId}:${failed.fileIndex}`;
  const resent: string[] = [];
  await runUploadQueue({ ...queue(items), createBatch: async () => { throw Error("must retain assignment"); },
    send: async (item) => { resent.push(`${item.batchId}:${item.fileIndex}`); return { duplicate: true, photo: { id: item.id } as Photo }; },
  });
  assert.deepEqual(resent, [assignment]);
  assert.equal(failed.status, "duplicate");
  assert.equal(batches, 2);
});

test("後続batch作成失敗でも完了分を守り、未送信分を再開する", async () => {
  const items = selection(23);
  let batches = 0;
  await assert.rejects(runUploadQueue({ ...queue(items),
    createBatch: async () => { if (++batches === 2) throw Error("offline"); return "first"; },
    send: async (item) => ({ photo: { id: item.id } as Photo }),
  }), /offline/);
  assert.equal(items.filter((item) => item.status === "success").length, 10);
  assert.equal(items.filter((item) => item.status === "queued").length, 13);
  const counts: number[] = [];
  await runUploadQueue({ ...queue(items), createBatch: async (count) => { counts.push(count); return `retry-${counts.length}`; },
    send: async (item) => ({ photo: { id: item.id } as Photo }),
  });
  assert.deepEqual(counts, [10, 3]);
  assert.equal(items.filter((item) => item.status === "success").length, 23);
});

test("期限切れの割当を解除し、次の再送でbatchを再作成する", async () => {
  const items = selection(1);
  await runUploadQueue({ ...queue(items), createBatch: async () => "expired",
    send: async () => { throw new PhotoUploadError("invalid_batch", "expired"); },
  });
  assert.equal(items[0].batchId, undefined);
  await runUploadQueue({ ...queue(items), createBatch: async () => "fresh",
    send: async (item) => { assert.equal(item.batchId, "fresh"); return { photo: { id: item.id } as Photo }; },
  });
  assert.equal(items[0].status, "success");
});

test("XHR送信終了だけでは完了せず、空JSON・HTTP失敗・非表示重複を成功にしない", async () => {
  const previous = globalThis.XMLHttpRequest;
  class TestRequest extends EventTarget {
    static current: TestRequest;
    upload = new EventTarget();
    status = 0;
    responseText = "";
    withCredentials = false;
    timeout = 0;
    constructor() { super(); TestRequest.current = this; }
    open() {}
    setRequestHeader() {}
    send() {}
    abort() { this.dispatchEvent(new Event("abort")); }
  }
  globalThis.XMLHttpRequest = TestRequest as unknown as typeof XMLHttpRequest;
  try {
    for (const [status, payload, errorCode] of [
      [200, {}, "upload_failed"],
      [500, { error: { code: "internal_error" } }, "internal_error"],
      [409, { error: { code: "duplicate_photo" } }, "photo_hidden"],
    ] as const) {
      const item = selection(1)[0]; item.batchId = "batch"; item.fileIndex = 0;
      const progress: number[] = [];
      const promise = sendPhoto(item, "csrf", (value) => progress.push(value), new AbortController().signal);
      const request = TestRequest.current;
      request.upload.dispatchEvent(Object.assign(new Event("progress"), { lengthComputable: true, loaded: 100, total: 100 }));
      assert.deepEqual(progress, [95]);
      request.status = status; request.responseText = JSON.stringify(payload);
      request.dispatchEvent(new Event("load"));
      await assert.rejects(promise, (error: unknown) => error instanceof PhotoUploadError && error.code === errorCode);
    }
  } finally {
    globalThis.XMLHttpRequest = previous;
  }
});
