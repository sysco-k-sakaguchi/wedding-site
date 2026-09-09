import { PHOTO_SCHEMA_STATEMENTS } from "../db/schema";
import type {
  D1Database,
  PhotoEnv,
  R2Bucket,
  R2ObjectBody,
} from "./photo-runtime";
import type { PhotoCategory, SupportedImageMime } from "./photo-utils";

export interface PhotoRow {
  id: string;
  batch_id: string;
  file_index: number;
  original_name: string;
  object_key: string;
  thumbnail_key: string;
  display_key: string;
  mime_type: SupportedImageMime;
  file_size: number;
  width: number;
  height: number;
  category: PhotoCategory;
  uploader_name: string | null;
  comment: string | null;
  created_at: string;
  is_visible: number;
  sha256: string;
}

export interface PhotoUploadBatch {
  id: string;
  category: PhotoCategory;
  uploader_name: string | null;
  comment: string | null;
  expected_count: number;
  created_at: string;
  expires_at: string;
}

export interface PhotoDownloadJob {
  id: string;
  photo_ids: string;
  created_at: string;
  expires_at: string;
}

export interface NewPhotoRecord {
  id: string;
  batchId: string;
  fileIndex: number;
  originalName: string;
  objectKey: string;
  thumbnailKey: string;
  displayKey: string;
  mimeType: SupportedImageMime;
  fileSize: number;
  width: number;
  height: number;
  category: PhotoCategory;
  uploaderName: string | null;
  comment: string | null;
  createdAt: string;
  sha256: string;
}

let schemaPromise: Promise<void> | null = null;

export function ensurePhotoSchema(database: D1Database) {
  if (!schemaPromise) {
    schemaPromise = database
      .batch(PHOTO_SCHEMA_STATEMENTS.map((sql) => database.prepare(sql)))
      .then(() => undefined)
      .catch((error) => {
        schemaPromise = null;
        throw error;
      });
  }

  return schemaPromise;
}

export class PhotoRepository {
  constructor(private readonly database: D1Database) {}

  async ready() {
    await ensurePhotoSchema(this.database);
  }

  async createBatch(batch: PhotoUploadBatch) {
    await this.ready();
    await this.database
      .prepare(
        `DELETE FROM photo_upload_batches
         WHERE expires_at <= ?
           AND NOT EXISTS (
             SELECT 1 FROM photos WHERE photos.batch_id = photo_upload_batches.id
           )`,
      )
      .bind(batch.created_at)
      .run();
    await this.database
      .prepare(
        `INSERT INTO photo_upload_batches
          (id, category, uploader_name, comment, expected_count, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        batch.id,
        batch.category,
        batch.uploader_name,
        batch.comment,
        batch.expected_count,
        batch.created_at,
        batch.expires_at,
      )
      .run();
  }

  async getBatch(id: string) {
    await this.ready();
    return this.database
      .prepare("SELECT * FROM photo_upload_batches WHERE id = ?")
      .bind(id)
      .first<PhotoUploadBatch>();
  }

  async findByBatchIndex(batchId: string, fileIndex: number) {
    await this.ready();
    return this.database
      .prepare("SELECT * FROM photos WHERE batch_id = ? AND file_index = ?")
      .bind(batchId, fileIndex)
      .first<PhotoRow>();
  }

  async findByHash(sha256: string) {
    await this.ready();
    return this.database
      .prepare("SELECT * FROM photos WHERE sha256 = ?")
      .bind(sha256)
      .first<PhotoRow>();
  }

  async insertPhoto(photo: NewPhotoRecord) {
    await this.ready();
    const result = await this.database
      .prepare(
        `INSERT INTO photos (
          id, batch_id, file_index, original_name, object_key, thumbnail_key,
          display_key, mime_type, file_size, width, height, category,
          uploader_name, comment, created_at, is_visible, sha256
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      )
      .bind(
        photo.id,
        photo.batchId,
        photo.fileIndex,
        photo.originalName,
        photo.objectKey,
        photo.thumbnailKey,
        photo.displayKey,
        photo.mimeType,
        photo.fileSize,
        photo.width,
        photo.height,
        photo.category,
        photo.uploaderName,
        photo.comment,
        photo.createdAt,
        photo.sha256,
      )
      .run();

    if (!result.success) {
      throw new Error("Photo metadata insertion failed.");
    }

    return {
      id: photo.id,
      batch_id: photo.batchId,
      file_index: photo.fileIndex,
      original_name: photo.originalName,
      object_key: photo.objectKey,
      thumbnail_key: photo.thumbnailKey,
      display_key: photo.displayKey,
      mime_type: photo.mimeType,
      file_size: photo.fileSize,
      width: photo.width,
      height: photo.height,
      category: photo.category,
      uploader_name: photo.uploaderName,
      comment: photo.comment,
      created_at: photo.createdAt,
      is_visible: 1,
      sha256: photo.sha256,
    } satisfies PhotoRow;
  }

  async listPhotos(options: {
    includeHidden?: boolean;
    category?: PhotoCategory;
  } = {}) {
    await this.ready();
    const conditions: string[] = [];
    const values: unknown[] = [];

    if (!options.includeHidden) {
      conditions.push("is_visible = 1");
    }
    if (options.category) {
      conditions.push("category = ?");
      values.push(options.category);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const result = await this.database
      .prepare(`SELECT * FROM photos ${where} ORDER BY created_at DESC, id DESC`)
      .bind(...values)
      .all<PhotoRow>();

    return result.results ?? [];
  }

  async getPhoto(id: string, includeHidden = false) {
    await this.ready();
    const query = includeHidden
      ? "SELECT * FROM photos WHERE id = ?"
      : "SELECT * FROM photos WHERE id = ? AND is_visible = 1";
    return this.database.prepare(query).bind(id).first<PhotoRow>();
  }

  async setVisibility(id: string, visible: boolean) {
    await this.ready();
    const result = await this.database
      .prepare("UPDATE photos SET is_visible = ? WHERE id = ?")
      .bind(visible ? 1 : 0, id)
      .run();

    return (result.meta?.changes ?? 0) > 0;
  }

  async deletePhoto(id: string) {
    await this.ready();
    const result = await this.database
      .prepare("DELETE FROM photos WHERE id = ?")
      .bind(id)
      .run();
    return (result.meta?.changes ?? 0) > 0;
  }

  async createDownloadJob(job: PhotoDownloadJob) {
    await this.ready();
    await this.database
      .prepare("DELETE FROM photo_download_jobs WHERE expires_at <= ?")
      .bind(job.created_at)
      .run();
    const result = await this.database
      .prepare(
        `INSERT INTO photo_download_jobs (id, photo_ids, created_at, expires_at)
         VALUES (?, ?, ?, ?)`,
      )
      .bind(job.id, job.photo_ids, job.created_at, job.expires_at)
      .run();
    if (!result.success) {
      throw new Error("Photo download job creation failed.");
    }
  }

  async consumeDownloadJob(id: string) {
    await this.ready();
    return this.database
      .prepare(
        `DELETE FROM photo_download_jobs
         WHERE id = ? AND expires_at > ?
         RETURNING id, photo_ids, created_at, expires_at`,
      )
      .bind(id, new Date().toISOString())
      .first<PhotoDownloadJob>();
  }

  async consumeRateLimit(options: {
    bucketKey: string;
    windowStart: number;
    limit: number;
  }) {
    await this.ready();
    const expiration = options.windowStart - 2 * 24 * 60 * 60 * 1000;
    await this.database
      .prepare("DELETE FROM photo_rate_limits WHERE window_start < ?")
      .bind(expiration)
      .run();

    const result = await this.database
      .prepare(
        `INSERT INTO photo_rate_limits (bucket_key, window_start, request_count)
         VALUES (?, ?, 1)
         ON CONFLICT(bucket_key, window_start) DO UPDATE
         SET request_count = request_count + 1
         WHERE request_count < ?
         RETURNING request_count`,
      )
      .bind(
        options.bucketKey,
        options.windowStart,
        options.limit,
      )
      .first<{ request_count: number }>();

    return Boolean(result);
  }

  async isRateLimited(options: {
    bucketKey: string;
    windowStart: number;
    limit: number;
  }) {
    await this.ready();
    const result = await this.database
      .prepare(
        `SELECT request_count FROM photo_rate_limits
         WHERE bucket_key = ? AND window_start = ?`,
      )
      .bind(options.bucketKey, options.windowStart)
      .first<{ request_count: number }>();
    return (result?.request_count ?? 0) >= options.limit;
  }
}

export interface PhotoObjectStorage {
  putOriginal(key: string, bytes: Uint8Array, mimeType: string): Promise<void>;
  putThumbnail(key: string, bytes: Uint8Array, mimeType: string): Promise<void>;
  putDisplayImage(key: string, bytes: Uint8Array, mimeType: string): Promise<void>;
  getOriginalStream(key: string): Promise<R2ObjectBody | null>;
  getThumbnail(key: string): Promise<R2ObjectBody | null>;
  getDisplayImage(key: string): Promise<R2ObjectBody | null>;
  deleteObjects(keys: string[]): Promise<void>;
}

export class R2PhotoObjectStorage implements PhotoObjectStorage {
  constructor(private readonly bucket: R2Bucket) {}

  async putOriginal(key: string, bytes: Uint8Array, mimeType: string) {
    await this.bucket.put(key, bytes, {
      httpMetadata: { contentType: mimeType },
    });
  }

  async putThumbnail(key: string, bytes: Uint8Array, mimeType: string) {
    await this.bucket.put(key, bytes, {
      httpMetadata: { contentType: mimeType },
    });
  }

  async putDisplayImage(key: string, bytes: Uint8Array, mimeType: string) {
    await this.bucket.put(key, bytes, {
      httpMetadata: { contentType: mimeType },
    });
  }

  getOriginalStream(key: string) {
    return this.bucket.get(key);
  }

  getThumbnail(key: string) {
    return this.bucket.get(key);
  }

  getDisplayImage(key: string) {
    return this.bucket.get(key);
  }

  async deleteObjects(keys: string[]) {
    if (keys.length > 0) {
      await this.bucket.delete(keys);
    }
  }
}

export function createPhotoServices(env: PhotoEnv) {
  return {
    repository: new PhotoRepository(env.DB),
    objects: new R2PhotoObjectStorage(env.PHOTOS),
  };
}
