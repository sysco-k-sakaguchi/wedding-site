import type { Photo } from "./PhotosApp";
import { preparePhoto } from "./photo-prepare";

export type UploadStatus = "queued" | "uploading" | "saving" | "success" | "duplicate" | "error";
export interface UploadDetails {
  category: string;
  uploaderName: string;
  comment: string;
}
export interface UploadItem {
  id: string;
  file: File;
  previewUrl: string;
  progress: number;
  status: UploadStatus;
  message: string;
  batchId?: string;
  fileIndex?: number;
  photo?: Photo;
}

export class PhotoUploadError extends Error {
  constructor(public code: string, message: string) { super(message); }
}

// The circle reaches 100 only after the server confirms that the photo is saved.
export function uploadProgress(loaded: number, total: number) {
  return total > 0 ? Math.min(95, Math.max(0, Math.floor(loaded / total * 95))) : 0;
}

export async function sendPhoto(
  item: UploadItem,
  csrfToken: string,
  onProgress: (progress: number) => void,
  signal: AbortSignal,
  prepare: typeof preparePhoto = preparePhoto,
): Promise<{ photo?: Photo; duplicate?: boolean }> {
  const prepared = await prepare(item.file, signal);
  const body = new FormData();
  body.append("original", item.file);
  body.append("thumbnail", prepared.thumbnail, "thumbnail.jpg");
  body.append("display", prepared.display, "display.jpg");
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    const abort = () => request.abort();
    const finish = (action: () => void) => {
      signal.removeEventListener("abort", abort);
      action();
    };
    request.open("POST", `/api/photos?${new URLSearchParams({ batchId: item.batchId!, fileIndex: String(item.fileIndex) })}`);
    request.withCredentials = true;
    request.timeout = 120_000;
    request.setRequestHeader("X-CSRF-Token", csrfToken);
    request.setRequestHeader("X-Photo-Filename", encodeURIComponent(item.file.name));
    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) onProgress(uploadProgress(event.loaded, event.total));
    });
    request.addEventListener("load", () => finish(() => {
      let payload: { photo?: Photo; duplicate?: boolean; error?: { code?: string; message?: string } } = {};
      try { payload = JSON.parse(request.responseText); } catch {}
      if (request.status >= 200 && request.status < 300 && payload.photo) resolve(payload);
      else if (request.status === 409 && payload.error?.code === "duplicate_photo") {
        if (payload.photo) resolve({ duplicate: true, photo: payload.photo });
        else reject(new PhotoUploadError("photo_hidden", ""));
      }
      else reject(new PhotoUploadError(payload.error?.code ?? "upload_failed", payload.error?.message ?? ""));
    }));
    for (const event of ["error", "timeout", "abort"]) {
      request.addEventListener(event, () => finish(() => reject(new PhotoUploadError("connection_lost", ""))));
    }
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) {
      finish(() => reject(new PhotoUploadError("connection_lost", "")));
      return;
    }
    request.send(body);
  });
}

export interface UploadQueueOptions {
  items: UploadItem[];
  batchSize: number;
  createBatch: (count: number) => Promise<string>;
  send: (item: UploadItem, onProgress: (progress: number) => void) => Promise<{ photo?: Photo; duplicate?: boolean }>;
  update: (id: string, patch: Partial<UploadItem>) => void;
  onPhoto: (photo: Photo) => void;
  errorMessage: (error: unknown) => string;
  signal: AbortSignal;
}

export async function runUploadQueue(options: UploadQueueOptions) {
  const { items, update, signal } = options;
  const pending = items.filter((item) => item.status === "queued" || item.status === "error");
  const size = Math.max(1, options.batchSize);
  // Create each internal batch only when needed, so a large selection does not
  // expire while earlier photos are still being sent. Retain assignments on retry.
  for (let offset = 0; offset < pending.length && !signal.aborted; offset += size) {
    const group = pending.slice(offset, offset + size);
    const unassigned = group.filter((item) => !item.batchId);
    if (unassigned.length) {
      const batchId = await options.createBatch(unassigned.length);
      unassigned.forEach((item, fileIndex) => {
        item.batchId = batchId;
        item.fileIndex = fileIndex;
        update(item.id, { batchId, fileIndex });
      });
    }
    let cursor = 0;
    async function worker() {
      while (cursor < group.length && !signal.aborted) {
        const item = group[cursor++];
        update(item.id, { status: "uploading", progress: 0, message: "" });
        try {
          const result = await options.send(item, (progress) => update(item.id, {
            progress, status: progress >= 95 ? "saving" : "uploading",
          }));
          update(item.id, {
            status: result.duplicate ? "duplicate" : "success",
            progress: 100, photo: result.photo,
          });
          if (result.photo) options.onPhoto(result.photo);
        } catch (error) {
          update(item.id, {
            status: "error", progress: 0, message: options.errorMessage(error),
            ...(error instanceof PhotoUploadError && error.code === "invalid_batch" ? { batchId: undefined, fileIndex: undefined } : {}),
          });
        }
      }
    }
    await Promise.all([worker(), worker()]);
  }
}
