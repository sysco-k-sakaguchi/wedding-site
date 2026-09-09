import assert from "node:assert/strict";
import test from "node:test";
import {
  persistPhotoRecord,
  type PhotoInsertRepository,
} from "../worker/photo-persistence";
import type { NewPhotoRecord, PhotoRow } from "../worker/photo-storage";

const attempt: NewPhotoRecord = {
  id: "11111111-1111-4111-8111-111111111111",
  batchId: "22222222-2222-4222-8222-222222222222",
  fileIndex: 0,
  originalName: "photo.jpg",
  objectKey: "originals/photo.jpg",
  thumbnailKey: "thumbnails/photo.webp",
  displayKey: "display/photo.webp",
  mimeType: "image/jpeg",
  fileSize: 3,
  width: 1,
  height: 1,
  category: "other",
  uploaderName: null,
  comment: null,
  createdAt: "2026-09-01T00:00:00.000Z",
  sha256: "hash",
};

const committed: PhotoRow = {
  id: attempt.id,
  batch_id: attempt.batchId,
  file_index: attempt.fileIndex,
  original_name: attempt.originalName,
  object_key: attempt.objectKey,
  thumbnail_key: attempt.thumbnailKey,
  display_key: attempt.displayKey,
  mime_type: attempt.mimeType,
  file_size: attempt.fileSize,
  width: attempt.width,
  height: attempt.height,
  category: attempt.category,
  uploader_name: attempt.uploaderName,
  comment: attempt.comment,
  created_at: attempt.createdAt,
  is_visible: 1,
  sha256: attempt.sha256,
};

test("D1がcommit後に応答失敗してもR2オブジェクトを削除しない", async () => {
  let deleted = false;
  const repository: PhotoInsertRepository = {
    async insertPhoto() {
      throw new Error("RPC response lost after commit");
    },
    async getPhoto() {
      return committed;
    },
    async findByHash() {
      throw new Error("should not be called");
    },
  };
  const result = await persistPhotoRecord(
    repository,
    {
      async deleteObjects() {
        deleted = true;
      },
    },
    attempt,
  );

  assert.equal(result.duplicate, false);
  assert.equal(result.photo.id, attempt.id);
  assert.equal(deleted, false);
});

test("D1の確定状態を照合できない場合は安全側でR2を保持する", async () => {
  const insertError = new Error("insert outcome unknown");
  let deleted = false;
  const repository: PhotoInsertRepository = {
    async insertPhoto() {
      throw insertError;
    },
    async getPhoto() {
      throw new Error("D1 unavailable");
    },
    async findByHash() {
      return null;
    },
  };

  await assert.rejects(
    persistPhotoRecord(
      repository,
      {
        async deleteObjects() {
          deleted = true;
        },
      },
      attempt,
    ),
    insertError,
  );
  assert.equal(deleted, false);
});

test("D1未保存を確認できた場合だけR2を補償削除する", async () => {
  const insertError = new Error("insert rejected");
  let deletedKeys: string[] = [];
  const repository: PhotoInsertRepository = {
    async insertPhoto() {
      throw insertError;
    },
    async getPhoto() {
      return null;
    },
    async findByHash() {
      return null;
    },
  };

  await assert.rejects(
    persistPhotoRecord(
      repository,
      {
        async deleteObjects(keys) {
          deletedKeys = keys;
        },
      },
      attempt,
    ),
    insertError,
  );
  assert.deepEqual(deletedKeys, [
    attempt.objectKey,
    attempt.thumbnailKey,
    attempt.displayKey,
  ]);
});
