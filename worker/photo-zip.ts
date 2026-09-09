import { Zip, ZipPassThrough } from "fflate";
import type { PhotoObjectStorage, PhotoRow } from "./photo-storage";
import { makeZipPath } from "./photo-utils";

const CLASSIC_ZIP_MAX = BigInt(0xffff_ffff);
const CLASSIC_ZIP_MAX_ENTRIES = 0xffff;

export function getPhotoZipCapacityIssue(photos: PhotoRow[]) {
  if (photos.length > CLASSIC_ZIP_MAX_ENTRIES) {
    return "too_many_entries" as const;
  }

  // fflate writes classic (non-ZIP64) archives. Keep a conservative bound for
  // local headers, data descriptors, central-directory records and UTF-8 names
  // so its 32-bit offsets can never wrap into a corrupt archive.
  let estimatedArchiveBytes = BigInt(22);
  for (let index = 0; index < photos.length; index += 1) {
    const photo = photos[index];
    const pathBytes = new TextEncoder().encode(
      makeZipPath(photo.category, photo.original_name, photo.id, index),
    ).byteLength;
    const storedBytes = BigInt(Math.max(0, Math.trunc(photo.file_size)));
    estimatedArchiveBytes += storedBytes + BigInt(128 + pathBytes * 2);
    if (estimatedArchiveBytes > CLASSIC_ZIP_MAX) {
      return "archive_too_large" as const;
    }
  }

  return null;
}

export function createPhotoZipStream(
  photos: PhotoRow[],
  objects: PhotoObjectStorage,
) {
  let cancelled = false;
  let archive: Zip | null = null;
  let activeReader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  let resume: (() => void) | null = null;

  return new ReadableStream<Uint8Array>({
    start(controller) {
      let settled = false;
      const fail = (error: unknown) => {
        if (!settled) {
          settled = true;
          controller.error(error);
        }
      };

      archive = new Zip((error, data, final) => {
        if (error) {
          fail(error);
          return;
        }
        if (settled || cancelled) {
          return;
        }
        if (data.length > 0) {
          controller.enqueue(data);
        }
        if (final) {
          settled = true;
          controller.close();
        }
      });

      void (async () => {
        try {
          for (let index = 0; index < photos.length; index += 1) {
            if (cancelled) return;
            const photo = photos[index];
            const object = await objects.getOriginalStream(photo.object_key);
            if (!object) {
              throw new Error("A photo object required for the archive is missing.");
            }

            const entry = new ZipPassThrough(
              makeZipPath(photo.category, photo.original_name, photo.id, index),
            );
            archive?.add(entry);

            const reader = object.body.getReader();
            activeReader = reader;
            while (true) {
              while (!cancelled && (controller.desiredSize ?? 1) <= 0) {
                await new Promise<void>((resolve) => {
                  resume = resolve;
                });
              }
              if (cancelled) {
                await reader.cancel().catch(() => undefined);
                return;
              }
              const { done, value } = await reader.read();
              if (done) {
                entry.push(new Uint8Array(0), true);
                break;
              }
              entry.push(value, false);
            }
            activeReader = null;
          }

          archive?.end();
        } catch (error) {
          archive?.terminate();
          fail(error);
        }
      })();
    },
    pull() {
      resume?.();
      resume = null;
    },
    async cancel() {
      cancelled = true;
      resume?.();
      resume = null;
      archive?.terminate();
      await activeReader?.cancel().catch(() => undefined);
    },
  });
}
