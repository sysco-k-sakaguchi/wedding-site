import { inspectImage } from "../../worker/photo-utils";
import { PHOTO_VARIANT_LIMITS, variantDimensions } from "../../worker/photo-variants";

export interface PreparedPhoto { thumbnail: Blob; display: Blob }
let preparation: Promise<unknown> = Promise.resolve();
function checkAbort(signal: AbortSignal) {
  if (signal.aborted) throw new DOMException("Photo preparation cancelled", "AbortError");
}

// Decode one original at a time; never allocate an original-size canvas.
export function preparePhoto(file: Blob, signal: AbortSignal): Promise<PreparedPhoto> {
  const run = preparation.catch(() => undefined).then(async () => {
    checkAbort(signal);
    const info = inspectImage(new Uint8Array(await file.arrayBuffer()), { maxPixels: 160_000_000 });
    const size = variantDimensions(info.width, info.height, PHOTO_VARIANT_LIMITS.display.edge);
    let source: ImageBitmap | HTMLImageElement | undefined;
    let objectUrl: string | undefined;
    try {
      if (typeof createImageBitmap === "function") {
        try { source = await createImageBitmap(file, { imageOrientation: "from-image", resizeWidth: size.width, resizeHeight: size.height, resizeQuality: "high" }); }
        catch { source = await loadImage(); }
      } else source = await loadImage();
      checkAbort(signal);
      async function encode(kind: keyof typeof PHOTO_VARIANT_LIMITS) {
        const limit = PHOTO_VARIANT_LIMITS[kind];
        const target = variantDimensions(info.width, info.height, limit.edge);
        const canvas = document.createElement("canvas");
        canvas.width = target.width; canvas.height = target.height;
        try {
          const context = canvas.getContext("2d");
          if (!context) throw new Error("Canvas unavailable");
          context.fillStyle = "#fff"; context.fillRect(0, 0, canvas.width, canvas.height);
          context.drawImage(source!, 0, 0, canvas.width, canvas.height);
          for (const quality of [limit.quality, 0.6, 0.45]) {
            checkAbort(signal);
            const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
            if (blob?.type === "image/jpeg" && blob.size <= limit.bytes) return blob;
          }
          throw new Error("Could not prepare photo");
        } finally { canvas.width = 1; canvas.height = 1; }
      }
      return { thumbnail: await encode("thumbnail"), display: await encode("display") };
    } finally {
      if (source && "close" in source) source.close();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    }
    async function loadImage() {
      objectUrl = URL.createObjectURL(file);
      const image = new Image();
      await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error("Could not decode photo")); image.src = objectUrl!; });
      return image;
    }
  });
  preparation = run;
  return run;
}
