#!/usr/bin/env node
// Usage: PHOTO_OPTIMIZE_BASE_URL=... PHOTO_ADMIN_CODE=... \
//   node scripts/optimize-photos.mjs [--dry-run | --apply] [--audit metadata.json]
// Dry run performs authenticated reads and local conversion, but never PUTs.
import { createHash } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import sharp from "sharp";

const VERSION = "light-v1";
const MAX_ORIGINAL_BYTES = 20_000_000;
const MAX_PIXELS = 160_000_000;
const LIMITS = {
  thumbnail: { edge: 480, bytes: 200_000, quality: 72 },
  display: { edge: 1600, bytes: 900_000, quality: 80 },
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MIME_FORMAT = { "image/jpeg": "jpeg", "image/png": "png", "image/webp": "webp" };
const STABLE_FIELDS = ["id", "sourceSha256", "originalName", "mimeType", "fileSize", "width", "height", "category", "uploaderName", "comment", "createdAt", "isVisible", "originalUrl", "downloadUrl"];

class OptimizationError extends Error {
  constructor(code, status) {
    super(code);
    this.code = code;
    this.status = status;
  }
}
const fail = (code, status) => { throw new OptimizationError(code, status); };
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const safeError = (error) => error instanceof OptimizationError
  ? { error: error.code, ...(error.status ? { httpStatus: error.status } : {}), ...(UUID.test(error.photoId ?? "") ? { id: error.photoId } : {}) }
  : { error: "processing_failed" };

export function parseOptions(args) {
  const options = { apply: false, auditPath: null, help: false };
  let mode = null;
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument === "--help" || argument === "-h") options.help = true;
    else if (argument === "--apply" || argument === "--dry-run") {
      if (mode && mode !== argument) fail("conflicting_modes");
      mode = argument;
      options.apply = argument === "--apply";
    } else if (argument === "--audit" || argument === "--output") {
      if (options.auditPath || !args[index + 1] || args[index + 1].startsWith("--")) fail("invalid_audit_option");
      options.auditPath = resolve(args[++index]);
    } else fail("unknown_option");
  }
  return options;
}

function baseOrigin(value) {
  let url;
  try { url = new URL(value); } catch { fail("invalid_base_url"); }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/" ||
      !(url.protocol === "https:" || local && url.protocol === "http:")) fail("invalid_base_url");
  return url.origin;
}

async function readBytes(response, maximum) {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maximum) fail("response_too_large");
  const reader = response.body?.getReader();
  if (!reader) fail("empty_response");
  const chunks = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximum) { await reader.cancel(); fail("response_too_large"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks, total);
}

function createClient(origin, fetchImpl) {
  const cookies = new Map();
  function rememberCookies(response) {
    const values = response.headers.getSetCookie?.() ?? [response.headers.get("set-cookie") ?? ""];
    for (const value of values.flatMap((header) => header.split(/,\s*(?=[^;,]+=)/))) {
      const pair = value.split(";", 1)[0];
      const separator = pair.indexOf("=");
      if (separator < 1) continue;
      const name = pair.slice(0, separator);
      const contents = pair.slice(separator + 1);
      if (contents) cookies.set(name, contents); else cookies.delete(name);
    }
  }
  async function request(path, init, consume) {
    const url = new URL(path, origin);
    if (url.origin !== origin || !url.pathname.startsWith("/api/")) fail("invalid_api_url");
    const headers = new Headers(init?.headers);
    headers.set("Origin", origin);
    if (cookies.size) headers.set("Cookie", [...cookies].map(([name, value]) => `${name}=${value}`).join("; "));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120_000);
    try {
      const response = await fetchImpl(url, { ...init, headers, signal: controller.signal, redirect: "manual", cache: "no-store" });
      rememberCookies(response);
      if (!response.ok) {
        await response.body?.cancel().catch(() => {});
        fail("http_error", response.status);
      }
      return await consume(response);
    } catch (error) {
      if (error instanceof OptimizationError) throw error;
      fail(controller.signal.aborted ? "request_timeout" : "request_failed");
    } finally { clearTimeout(timeout); }
  }
  return {
    json: (path, init) => request(path, init, async (response) => {
      const bytes = await readBytes(response, 32_000_000);
      try { return JSON.parse(bytes.toString("utf8")); } catch { fail("invalid_json_response"); }
    }),
    image: (path, maximum) => request(path, undefined, async (response) => {
      const mime = (response.headers.get("content-type") ?? "").split(";", 1)[0].trim().toLowerCase();
      if (!MIME_FORMAT[mime]) { await response.body?.cancel(); fail("invalid_image_response"); }
      return { bytes: await readBytes(response, maximum), mime };
    }),
  };
}

function checkPhoto(photo) {
  if (!photo || !UUID.test(photo.id) || !/^[0-9a-f]{64}$/i.test(photo.sourceSha256 ?? "") ||
      !MIME_FORMAT[photo.mimeType] || !Number.isSafeInteger(photo.fileSize) || photo.fileSize < 1 || photo.fileSize > MAX_ORIGINAL_BYTES ||
      !Number.isSafeInteger(photo.width) || !Number.isSafeInteger(photo.height) || photo.width < 1 || photo.height < 1 ||
      photo.width * photo.height > MAX_PIXELS || typeof photo.isVisible !== "boolean" || typeof photo.optimized !== "boolean") fail("invalid_photo_manifest");
  const path = `/api/photos/${photo.id}`;
  if (photo.originalUrl !== `${path}/original` || photo.downloadUrl !== `${path}/download` ||
      photo.thumbnailUrl !== `${path}/thumbnail${photo.optimized ? `?v=${VERSION}` : ""}` ||
      photo.viewUrl !== `${path}/view${photo.optimized ? `?v=${VERSION}` : ""}`) fail("unexpected_photo_urls");
  return photo;
}

async function listPhotos(client) {
  const payload = await client.json("/api/admin/photos");
  if (!Array.isArray(payload.photos)) fail("invalid_photo_manifest");
  const photos = payload.photos.map(checkPhoto);
  if (new Set(photos.map((photo) => photo.id)).size !== photos.length) fail("duplicate_photo_ids");
  return photos;
}

function assertPreserved(before, after) {
  if (before.length !== after.length) fail("collection_changed");
  const current = new Map(after.map((photo) => [photo.id, photo]));
  for (const photo of before) {
    const updated = current.get(photo.id);
    if (!updated || STABLE_FIELDS.some((field) => updated[field] !== photo[field])) fail("photo_metadata_changed");
  }
}

async function originalBytes(client, photo) {
  const original = await client.image(photo.originalUrl, photo.fileSize);
  if (original.mime !== photo.mimeType || original.bytes.length !== photo.fileSize || hash(original.bytes) !== photo.sourceSha256.toLowerCase()) fail("original_integrity_failed");
  return original.bytes;
}

async function sourceMetadata(bytes, photo) {
  let metadata;
  try { metadata = await sharp(bytes, { failOn: "error", limitInputPixels: MAX_PIXELS }).metadata(); }
  catch { fail("source_decode_failed"); }
  const rotated = (metadata.orientation ?? 1) >= 5 && (metadata.orientation ?? 1) <= 8;
  const dimensions = metadata.autoOrient ?? { width: rotated ? metadata.height : metadata.width, height: rotated ? metadata.width : metadata.height };
  if (metadata.format !== MIME_FORMAT[photo.mimeType] || (metadata.pages ?? 1) !== 1 || dimensions.width !== photo.width || dimensions.height !== photo.height) fail("source_dimensions_mismatch");
}

export async function validateJPEG(bytes, kind, source) {
  const limit = LIMITS[kind];
  if (!limit || bytes.length < 1 || bytes.length > limit.bytes) fail("variant_size_invalid");
  let metadata, decoded;
  try {
    const image = sharp(bytes, { failOn: "error", limitInputPixels: limit.edge ** 2 });
    metadata = await image.metadata();
    decoded = await image.raw().toBuffer({ resolveWithObject: true });
  } catch { fail("variant_decode_failed"); }
  const { width, height } = metadata;
  if (metadata.format !== "jpeg" || (metadata.orientation ?? 1) !== 1 || metadata.exif || metadata.icc || metadata.iptc || metadata.xmp ||
      !width || !height || Math.max(width, height) > limit.edge || width > source.width || height > source.height ||
      decoded.info.width !== width || decoded.info.height !== height) fail("variant_metadata_invalid");
  const scale = Math.min(1, Math.max(width, height) / Math.max(source.width, source.height));
  if (Math.abs(width - Math.max(1, Math.round(source.width * scale))) > 1 || Math.abs(height - Math.max(1, Math.round(source.height * scale))) > 1) fail("variant_aspect_ratio_invalid");
  return { bytes: bytes.length, width, height, sha256: hash(bytes) };
}

export async function createVariants(original, photo) {
  await sourceMetadata(original, photo);
  const variants = {};
  for (const [kind, limit] of Object.entries(LIMITS)) {
    let quality = limit.quality;
    for (;;) {
      let bytes;
      try {
        // Sharp strips metadata by default. Apply EXIF orientation before
        // resizing; white preserves transparent PNG/WebP appearances as JPEG.
        bytes = await sharp(original, { failOn: "error", limitInputPixels: MAX_PIXELS })
          .autoOrient().resize({ width: limit.edge, height: limit.edge, fit: "inside", withoutEnlargement: true })
          .flatten({ background: "#ffffff" }).toColourspace("srgb")
          .jpeg({ quality, mozjpeg: true, chromaSubsampling: "4:2:0" }).toBuffer();
      } catch { fail("variant_processing_failed"); }
      if (bytes.length <= limit.bytes) {
        variants[kind] = { bytes, metadata: { ...await validateJPEG(bytes, kind, photo), quality } };
        break;
      }
      if (quality === 1) fail("variant_size_limit_unreachable");
      quality = Math.max(1, quality - 5);
    }
  }
  return variants;
}

async function verifyVariants(client, photo, planned) {
  if (!photo.optimized) fail("variants_not_committed");
  const result = {};
  for (const kind of ["thumbnail", "display"]) {
    const response = await client.image(kind === "thumbnail" ? photo.thumbnailUrl : photo.viewUrl, LIMITS[kind].bytes);
    if (response.mime !== "image/jpeg") fail("variant_mime_invalid");
    result[kind] = await validateJPEG(response.bytes, kind, photo);
    if (result[kind].sha256 !== planned[kind].metadata.sha256) fail("variant_integrity_failed");
  }
  return result;
}

async function writeAudit(path, audit) {
  if (!path) return;
  const temporary = `${path}.tmp-${process.pid}`;
  try {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(temporary, `${JSON.stringify(audit, null, 2)}\n`, { mode: 0o600, flag: "wx" });
    await rename(temporary, path);
  } catch { fail("audit_write_failed"); }
  finally { await rm(temporary, { force: true }).catch(() => {}); }
}

export async function runOptimization({ baseUrl, adminCode, apply = false, auditPath = null, fetchImpl = globalThis.fetch, logger = console }) {
  if (!baseUrl || !adminCode) fail("required_environment_missing");
  const client = createClient(baseOrigin(baseUrl), fetchImpl);
  const audit = { schemaVersion: 1, variantVersion: VERSION, mode: apply ? "apply" : "dry-run", startedAt: new Date().toISOString(), status: "running", before: [], results: [], summary: { total: 0, hidden: 0, skipped: 0, planned: 0, applied: 0, originalsVerified: 0, thumbnailBytes: 0, displayBytes: 0 } };
  let activeId = null;
  try {
    // Check audit writability before authenticating or modifying anything.
    await writeAudit(auditPath, audit);
    const access = await client.json("/api/photos/admin/access", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: adminCode }) });
    if (access.authenticated !== true || access.admin !== true || typeof access.csrfToken !== "string" || !access.csrfToken) fail("admin_authentication_failed");
    const before = await listPhotos(client);
    audit.before = before.map((photo) => ({ id: photo.id, sha256: photo.sourceSha256, fileSize: photo.fileSize, width: photo.width, height: photo.height, isVisible: photo.isVisible, optimized: photo.optimized }));
    audit.summary.total = before.length;
    audit.summary.hidden = before.filter((photo) => !photo.isVisible).length;
    logger.log(JSON.stringify({ mode: audit.mode, total: audit.summary.total, hidden: audit.summary.hidden, pending: before.filter((photo) => !photo.optimized).length }));
    await writeAudit(auditPath, audit);
    for (const photo of before) {
      activeId = photo.id;
      const original = await originalBytes(client, photo);
      audit.summary.originalsVerified++;
      if (photo.optimized) {
        audit.summary.skipped++;
        audit.results.push({ id: photo.id, outcome: "already_optimized", originalVerified: true });
        logger.log(JSON.stringify({ id: photo.id, outcome: "already_optimized" }));
        await writeAudit(auditPath, audit);
        continue;
      }
      const variants = await createVariants(original, photo);
      const record = { id: photo.id, outcome: "planned", originalVerified: true, thumbnail: variants.thumbnail.metadata, display: variants.display.metadata };
      audit.results.push(record);
      audit.summary.planned++;
      audit.summary.thumbnailBytes += record.thumbnail.bytes;
      audit.summary.displayBytes += record.display.bytes;
      // Persist the planned hashes first, so an interrupted PUT can be audited.
      await writeAudit(auditPath, audit);
      if (apply) {
        record.outcome = "applying";
        await writeAudit(auditPath, audit);
        const form = new FormData();
        form.append("thumbnail", new Blob([variants.thumbnail.bytes], { type: "image/jpeg" }), "thumbnail.jpg");
        form.append("display", new Blob([variants.display.bytes], { type: "image/jpeg" }), "display.jpg");
        form.append("sourceSha256", photo.sourceSha256);
        let putError = null;
        let updated = null;
        try {
          const result = await client.json(`/api/admin/photos/${photo.id}/variants`, { method: "PUT", headers: { "X-CSRF-Token": access.csrfToken }, body: form });
          updated = checkPhoto(result.photo);
        } catch (error) { putError = error; }
        // Read back a lost response instead of blindly repeating the mutation.
        if (!updated) {
          const current = await listPhotos(client);
          assertPreserved(before, current);
          updated = current.find((item) => item.id === photo.id);
          if (!updated?.optimized) throw putError ?? new OptimizationError("variants_not_committed");
        }
        assertPreserved([photo], [updated]);
        record.outcome = "committed";
        await writeAudit(auditPath, audit);
        await verifyVariants(client, updated, variants);
        await originalBytes(client, updated);
        record.outcome = "applied";
        record.originalVerifiedAfter = true;
        audit.summary.applied++;
      }
      logger.log(JSON.stringify({ id: photo.id, outcome: record.outcome }));
      await writeAudit(auditPath, audit);
    }
    activeId = null;
    const after = await listPhotos(client);
    assertPreserved(before, after);
    // Verify every original again after the batch, including skipped and hidden
    // photos. No original, visibility, metadata or collection mutation is used.
    if (apply) for (const photo of after) { activeId = photo.id; await originalBytes(client, photo); }
    activeId = null;
    audit.after = after.map((photo) => ({ id: photo.id, sha256: photo.sourceSha256, isVisible: photo.isVisible, optimized: photo.optimized }));
    audit.collectionPreserved = true;
    audit.originalsPreserved = apply ? true : null;
    audit.status = "complete";
    logger.log(JSON.stringify(audit.summary));
    return audit;
  } catch (error) {
    const failure = error instanceof OptimizationError ? error : new OptimizationError("processing_failed");
    if (activeId) failure.photoId = activeId;
    audit.status = "failed";
    audit.failure = safeError(failure);
    throw failure;
  } finally {
    audit.finishedAt = new Date().toISOString();
    await writeAudit(auditPath, audit);
  }
}

async function main() {
  try {
    const options = parseOptions(process.argv.slice(2));
    if (options.help) {
      console.log("Usage: node scripts/optimize-photos.mjs [--dry-run | --apply] [--audit metadata.json]\nRequired environment: PHOTO_OPTIMIZE_BASE_URL, PHOTO_ADMIN_CODE. Default: --dry-run. --output is an alias for --audit. Audit contains IDs, hashes and numeric metadata only.");
      return;
    }
    await runOptimization({ ...options, baseUrl: process.env.PHOTO_OPTIMIZE_BASE_URL, adminCode: process.env.PHOTO_ADMIN_CODE });
  } catch (error) {
    // Never print server error bodies, Sharp messages, URLs, cookies or codes.
    console.error(JSON.stringify(safeError(error)));
    process.exitCode = 1;
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) await main();
