/** Private photos are retained only in this page's memory, never browser storage. */
export interface ImageLease {
  promise: Promise<string>;
  release: () => void;
}

interface CacheOptions {
  fetchImage: (url: string, signal: AbortSignal) => Promise<Blob>;
  createUrl: (blob: Blob) => string;
  revokeUrl: (url: string) => void;
  decode: (url: string) => Promise<void>;
  maxBytes?: number;
  maxEntries?: number;
  concurrency?: number;
  timeoutMs?: number;
  onAuthExpired?: () => void;
}

export class PhotoImageError extends Error {
  constructor(public status: number, message = "Photo could not be loaded") { super(message); }
}

interface Entry {
  key: string;
  refs: number;
  priority: number;
  touched: number;
  epoch: number;
  controller: AbortController;
  promise: Promise<string>;
  resolve: (value: string) => void;
  reject: (reason: unknown) => void;
  objectUrl?: string;
  bytes: number;
  started: boolean;
}

export function createPhotoImageCache(options: CacheOptions) {
  const entries = new Map<string, Entry>();
  const queued: Entry[] = [];
  const maxBytes = options.maxBytes ?? 12_000_000;
  const maxEntries = options.maxEntries ?? 40;
  let bytes = 0;
  let active = 0;
  let activeThumbnails = 0;
  let epoch = 0;
  let clock = 0;

  function trim() {
    const unused = [...entries.values()].filter((entry) => entry.objectUrl && entry.refs === 0)
      .sort((a, b) => a.touched - b.touched);
    while ((bytes > maxBytes || entries.size > maxEntries) && unused.length) {
      const entry = unused.shift()!;
      entries.delete(entry.key);
      bytes -= entry.bytes;
      options.revokeUrl(entry.objectUrl!);
    }
  }

  function clear() {
    epoch++;
    for (const entry of entries.values()) {
      entry.controller.abort();
      entry.reject(new DOMException("Image session ended", "AbortError"));
      if (entry.objectUrl) options.revokeUrl(entry.objectUrl);
    }
    entries.clear(); queued.length = 0; bytes = 0;
  }

  function pump() {
    queued.sort((a, b) => b.priority - a.priority || a.touched - b.touched);
    while (active < (options.concurrency ?? 3) && queued.length) {
      const available = queued.findIndex((item) => item.priority > 0 || activeThumbnails < Math.max(1, (options.concurrency ?? 3) - 1));
      if (available < 0) break; // Keep a slot available when the guest opens a photo.
      const entry = queued.splice(available, 1)[0];
      if (entry.epoch !== epoch || !entries.has(entry.key)) continue;
      active++; entry.started = true;
      void run(entry);
    }
  }

  async function run(entry: Entry) {
    let objectUrl: string | undefined;
    const thumbnail = entry.priority === 0;
    if (thumbnail) activeThumbnails++;
    const timer = setTimeout(() => entry.controller.abort(), options.timeoutMs ?? 60_000);
    let aborted!: () => void;
    try {
      const abort = new Promise<never>((_, reject) => {
        aborted = () => reject(new DOMException("Cancelled", "AbortError"));
        entry.controller.signal.addEventListener("abort", aborted, { once: true });
      });
      const blob = await Promise.race([options.fetchImage(entry.key, entry.controller.signal), abort]);
      if (entry.controller.signal.aborted || entry.epoch !== epoch) throw new DOMException("Cancelled", "AbortError");
      objectUrl = options.createUrl(blob);
      await Promise.race([options.decode(objectUrl), abort]);
      if (entry.controller.signal.aborted || entry.epoch !== epoch) throw new DOMException("Cancelled", "AbortError");
      entry.objectUrl = objectUrl; entry.bytes = blob.size; bytes += blob.size;
      entry.resolve(objectUrl); trim();
    } catch (error) {
      if (objectUrl) options.revokeUrl(objectUrl);
      if (entries.get(entry.key) === entry) entries.delete(entry.key);
      entry.reject(error);
      if (entry.epoch === epoch && error instanceof PhotoImageError && (error.status === 401 || error.status === 403)) {
        clear(); options.onAuthExpired?.();
      }
    } finally {
      clearTimeout(timer); entry.controller.signal.removeEventListener("abort", aborted);
      if (thumbnail) activeThumbnails--;
      active--; pump();
    }
  }

  return {
    acquire(key: string, priority = 0): ImageLease {
      let entry = entries.get(key);
      if (!entry) {
        let resolve!: Entry["resolve"], reject!: Entry["reject"];
        const promise = new Promise<string>((yes, no) => { resolve = yes; reject = no; });
        entry = { key, refs: 0, priority, touched: ++clock, epoch, controller: new AbortController(),
          promise, resolve, reject, bytes: 0, started: false };
        entries.set(key, entry); queued.push(entry);
      }
      entry.refs++; entry.priority = Math.max(entry.priority, priority); entry.touched = ++clock;
      const retained = entry;
      pump();
      let released = false;
      return { promise: entry.promise, release() {
        if (released) return;
        released = true; retained.refs--; retained.touched = ++clock;
        if (!retained.refs && !retained.objectUrl && entries.get(key) === retained) {
          entries.delete(key);
          const index = queued.indexOf(retained);
          if (index >= 0) queued.splice(index, 1);
          retained.controller.abort(); retained.reject(new DOMException("Image no longer visible", "AbortError"));
        }
        trim();
      } };
    },
    clear,
    stats: () => ({ entries: entries.size, bytes, active, queued: queued.length }),
  };
}

async function fetchPhoto(url: string, signal: AbortSignal) {
  const response = await fetch(url, { credentials: "same-origin", cache: "no-store", signal });
  if (!response.ok) throw new PhotoImageError(response.status);
  const mime = response.headers.get("content-type")?.split(";")[0].trim();
  if (!mime || !["image/jpeg", "image/png", "image/webp"].includes(mime)) throw new PhotoImageError(0);
  const max = 6_000_000; // Also permits the existing, unoptimized 5 MB photos during migration.
  if (Number(response.headers.get("content-length")) > max) throw new PhotoImageError(0);
  const reader = response.body?.getReader();
  if (!reader) throw new PhotoImageError(0);
  const parts: Uint8Array<ArrayBuffer>[] = [];
  let total = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      total += part.value.byteLength;
      if (total > max) throw new PhotoImageError(0);
      parts.push(new Uint8Array(part.value));
    }
  } catch (error) { await reader.cancel().catch(() => {}); throw error; }
  if (!total) throw new PhotoImageError(0);
  return new Blob(parts, { type: mime });
}

export const PHOTO_AUTH_EXPIRED = "wedding-photo-auth-expired";
export const photoImageCache = createPhotoImageCache({
  fetchImage: fetchPhoto,
  createUrl: (blob) => URL.createObjectURL(blob),
  revokeUrl: (url) => URL.revokeObjectURL(url),
  decode: (url) => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => { if (image.naturalWidth) resolve(); else reject(new PhotoImageError(0)); };
    image.onerror = () => reject(new PhotoImageError(0));
    image.src = url;
  }),
  onAuthExpired: () => window.dispatchEvent(new Event(PHOTO_AUTH_EXPIRED)),
});
