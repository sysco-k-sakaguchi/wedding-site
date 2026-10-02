export type PhotoDevice = "ios" | "android" | "desktop";
export function photoDevice(userAgent: string, maxTouchPoints: number): PhotoDevice {
  if (/iPad|iPhone|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1)) return "ios";
  return /Android/.test(userAgent) ? "android" : "desktop";
}

interface SavePhoto {
  id: string;
  originalName: string;
  originalUrl: string;
}

// Only originals near the viewport are prepared. The cache has both a byte
// budget and an item budget; completed promises are not kept separately.
export function createPhotoFileCache(fetchFile: (photo: SavePhoto, signal: AbortSignal) => Promise<File>, maxBytes = 30_000_000, maxItems = 6) {
  const files = new Map<string, { file: File; created: number }>();
  const requests = new Map<string, {
    photo: SavePhoto; promise: Promise<File>; resolve: (file: File) => void; reject: (error: unknown) => void;
    users: number; started: boolean; controller: AbortController;
  }>();
  const waiting: string[] = [];
  let active = 0;
  let disposed = false;
  function peek(id: string) {
    const entry = files.get(id);
    if (!entry) return undefined;
    if (Date.now() - entry.created > 120_000) { files.delete(id); return undefined; }
    files.delete(id); files.set(id, entry);
    return entry.file;
  }
  function pump() {
    while (!disposed && active < 2 && waiting.length) {
      const id = waiting.shift()!;
      const request = requests.get(id);
      if (!request || request.users < 1 || request.started) continue;
      request.started = true;
      active++;
      const timeout = setTimeout(() => request.controller.abort(), 45_000);
      void fetchFile(request.photo, request.controller.signal).then((file) => {
        if (disposed || request.controller.signal.aborted) throw new DOMException("Cancelled", "AbortError");
        if (file.size <= maxBytes) {
          files.set(id, { file, created: Date.now() });
          while (files.size > maxItems || [...files.values()].reduce((sum, item) => sum + item.file.size, 0) > maxBytes) files.delete(files.keys().next().value!);
        }
        request.resolve(file);
      }).catch(request.reject).finally(() => {
        clearTimeout(timeout);
        if (requests.get(id) === request) requests.delete(id);
        active--;
        pump();
      });
    }
  }
  return {
    peek,
    resume() { disposed = false; pump(); },
    prepare(photo: SavePhoto) {
      if (disposed) return { promise: Promise.reject<File>(new DOMException("Cancelled", "AbortError")), release() {} };
      const ready = peek(photo.id);
      if (ready) return { promise: Promise.resolve(ready), release() {} };
      let request = requests.get(photo.id);
      if (!request) {
        let resolve!: (file: File) => void, reject!: (error: unknown) => void;
        const promise = new Promise<File>((yes, no) => { resolve = yes; reject = no; });
        request = { photo, promise, resolve, reject, users: 0, started: false, controller: new AbortController() };
        requests.set(photo.id, request); waiting.push(photo.id);
      }
      request.users++;
      pump();
      const held = request;
      let released = false;
      return { promise: request.promise, release() {
        if (released) return;
        released = true; held.users--;
        if (held.users < 1 && !held.started) {
          if (requests.get(photo.id) === held) requests.delete(photo.id);
          held.reject(new DOMException("Cancelled", "AbortError"));
        }
      } };
    },
    dispose() {
      disposed = true; files.clear();
      for (const request of requests.values()) {
        request.controller.abort();
        if (!request.started) request.reject(new DOMException("Cancelled", "AbortError"));
      }
      requests.clear(); waiting.length = 0;
    },
  };
}

// The native menu must open in the click event, before any asynchronous fetch.
// One menu at a time also protects taps on another card while it is open.
export function openPhotoSaveMenu(file: File | undefined, api: Pick<Navigator, "canShare" | "share">, sharing: { current: boolean }, onFallback: () => void): Promise<void> {
  if (sharing.current) return Promise.resolve();
  function fallback(error?: unknown) {
    const name = error && typeof error === "object" && "name" in error ? error.name : "";
    if (name !== "AbortError" && name !== "InvalidStateError") onFallback();
  }
  try {
    if (!file || !api.canShare({ files: [file] })) { onFallback(); return Promise.resolve(); }
    sharing.current = true;
    return Promise.resolve(api.share({ files: [file] })).catch(fallback).finally(() => { sharing.current = false; });
  } catch (error) {
    sharing.current = false;
    fallback(error);
    return Promise.resolve();
  }
}

export async function fetchPhotoFile(photo: SavePhoto, signal: AbortSignal) {
  const response = await fetch(photo.originalUrl, { credentials: "same-origin", signal });
  if (!response.ok) throw new Error("Photo unavailable");
  const blob = await response.blob();
  if (!["image/jpeg", "image/png", "image/webp"].includes(blob.type) || !blob.size) throw new Error("Invalid photo");
  return new File([blob], photo.originalName, { type: blob.type });
}
