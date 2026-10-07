import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { unzipSync } from "fflate";
import sharp from "sharp";

const baseUrl = process.env.PHOTO_TEST_BASE_URL ?? "http://localhost:3000";
const guestCode = process.env.PHOTO_ACCESS_CODE;
const adminCode = process.env.PHOTO_ADMIN_CODE;
const variantMode = process.env.PHOTO_VARIANT_MODE === "original" ? "original" : "transform";
const parsedBaseUrl = new URL(baseUrl);

if (!guestCode || !adminCode) {
  throw new Error("PHOTO_ACCESS_CODE and PHOTO_ADMIN_CODE are required for integration tests.");
}
if (
  !["localhost", "127.0.0.1", "::1"].includes(parsedBaseUrl.hostname) &&
  process.env.PHOTO_TEST_ALLOW_REMOTE !== "1"
) {
  throw new Error("Integration tests write data and only run against localhost by default.");
}

type CookieJar = Map<string, string>;
const anonymousCookies: CookieJar = new Map();
const guestCookies: CookieJar = new Map();
const adminCookies: CookieJar = new Map();

function rememberCookies(response: Response, jar: CookieJar) {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  const values = headers.getSetCookie?.() ?? [headers.get("set-cookie") ?? ""];
  for (const value of values.flatMap((header) => header.split(/,\s*(?=[^;,]+=)/))) {
    const pair = value.split(";", 1)[0];
    const separator = pair.indexOf("=");
    if (separator > 0) jar.set(pair.slice(0, separator), pair.slice(separator + 1));
  }
}

function cookieHeader(jar: CookieJar) {
  return [...jar].map(([key, value]) => `${key}=${value}`).join("; ");
}

async function request(
  path: string,
  init: RequestInit = {},
  jar: CookieJar = anonymousCookies,
) {
  const headers = new Headers(init.headers);
  headers.set("Origin", baseUrl);
  if (jar.size > 0) headers.set("Cookie", cookieHeader(jar));
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers,
    redirect: "manual",
  });
  rememberCookies(response, jar);
  return response;
}

async function json<T>(response: Response) {
  return (await response.json()) as T;
}

async function errorCode(response: Response) {
  return (await json<{ error?: { code?: string } }>(response)).error?.code;
}

async function authenticate(path: string, code: string, jar: CookieJar) {
  const response = await request(
    path,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    },
    jar,
  );
  assert.equal(response.status, 200);
  return json<{ csrfToken: string }>(response);
}

async function createBatch(
  csrfToken: string,
  count: number,
  category = "reception",
  jar: CookieJar = guestCookies,
) {
  const response = await request(
    "/api/photos/batches",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": csrfToken,
      },
      body: JSON.stringify({ count, category, uploaderName: "", comment: "" }),
    },
    jar,
  );
  return {
    response,
    body: await json<{ batchId?: string; error?: { code: string } }>(response),
  };
}

async function upload(
  csrfToken: string,
  batchId: string,
  fileIndex: number,
  bytes: Uint8Array,
  name: string,
  type = "image/jpeg",
  jar: CookieJar = guestCookies,
) {
  const copiedBytes = new Uint8Array(bytes.byteLength);
  copiedBytes.set(bytes);
  const query = new URLSearchParams({ batchId, fileIndex: String(fileIndex) });
  return request(
    `/api/photos?${query}`,
    {
      method: "POST",
      headers: {
        "Content-Type": type,
        "X-CSRF-Token": csrfToken,
        "X-Photo-Filename": encodeURIComponent(name),
      },
      body: copiedBytes,
    },
    jar,
  );
}

function uniqueJpeg(bytes: Uint8Array) {
  assert.deepEqual([...bytes.slice(0, 2)], [0xff, 0xd8]);
  const payload = new TextEncoder().encode(`integration-${crypto.randomUUID()}`);
  const segmentLength = payload.byteLength + 2;
  const result = new Uint8Array(bytes.byteLength + payload.byteLength + 4);
  result.set(bytes.slice(0, 2), 0);
  result.set([0xff, 0xfe, segmentLength >> 8, segmentLength & 0xff], 2);
  result.set(payload, 6);
  result.set(bytes.slice(2), 6 + payload.byteLength);
  return result;
}

interface PreparedVariants {
  thumbnail: Uint8Array;
  display: Uint8Array;
}

function imageBlob(bytes: Uint8Array, type = "image/jpeg") {
  return new Blob([new Uint8Array(bytes)], { type });
}

async function prepareVariants(bytes: Uint8Array): Promise<PreparedVariants> {
  const thumbnail = await sharp(bytes).rotate()
    .resize({ width: 480, height: 480, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 72 }).toBuffer();
  const display = await sharp(bytes).rotate()
    .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 80 }).toBuffer();
  return { thumbnail, display };
}

function variantsForm(variants: PreparedVariants, sourceSha256?: string) {
  const form = new FormData();
  form.append("thumbnail", imageBlob(variants.thumbnail), "thumbnail.jpg");
  form.append("display", imageBlob(variants.display), "display.jpg");
  if (sourceSha256 !== undefined) form.append("sourceSha256", sourceSha256);
  return form;
}

async function updateVariants(
  id: string,
  form: FormData,
  csrfToken: string,
  jar: CookieJar = adminCookies,
) {
  return request(`/api/admin/photos/${id}/variants`, {
    method: "PUT",
    headers: { "X-CSRF-Token": csrfToken },
    body: form,
  }, jar);
}

async function uploadMultipart(
  csrfToken: string,
  batchId: string,
  form: FormData,
  jar: CookieJar = guestCookies,
) {
  return request(`/api/photos?${new URLSearchParams({ batchId, fileIndex: "0" })}`, {
    method: "POST",
    headers: {
      "X-CSRF-Token": csrfToken,
      "X-Photo-Filename": encodeURIComponent("multipart-original.png"),
    },
    body: form,
  }, jar);
}

async function assertServedVariants(
  photo: { thumbnailUrl: string; viewUrl: string },
  expected: PreparedVariants,
) {
  for (const [path, bytes, edge, maximum] of [
    [photo.thumbnailUrl, expected.thumbnail, 480, 200_000],
    [photo.viewUrl, expected.display, 1600, 900_000],
  ] as const) {
    const response = await request(path, {}, guestCookies);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "image/jpeg");
    const actual = new Uint8Array(await response.arrayBuffer());
    assert.deepEqual(actual, new Uint8Array(bytes), `Stored derivative changed at ${path}`);
    assert.ok(actual.byteLength <= maximum);
    const metadata = await sharp(actual).metadata();
    const wanted = await sharp(bytes).metadata();
    assert.equal(metadata.format, "jpeg");
    assert.deepEqual([metadata.width, metadata.height], [wanted.width, wanted.height]);
    assert.ok(Math.max(metadata.width!, metadata.height!) <= edge);
    // Metadata parsing alone does not prove that JPEG scan data is readable.
    const decoded = await sharp(actual).raw().toBuffer({ resolveWithObject: true });
    assert.equal(decoded.info.width, metadata.width);
    assert.equal(decoded.info.height, metadata.height);
    assert.ok(decoded.data.byteLength > 0);
  }
}

const createdIds: string[] = [];
let adminCsrf = "";

try {
  const initialSession = await json<{
    configured: boolean;
    limits: { maxFileBytes: number; maxFilesPerBatch: number; uploadsPerHour: number };
  }>(
    await request("/api/photos/session"),
  );
  assert.equal(initialSession.configured, true);
  assert.ok(initialSession.limits.maxFileBytes > 0);

  const guest = await authenticate("/api/photos/access", guestCode, guestCookies);
  const admin = await authenticate("/api/photos/admin/access", adminCode, adminCookies);
  adminCsrf = admin.csrfToken;
  assert.ok(guest.csrfToken);
  assert.ok(adminCsrf);

  const guestAdminAttempt = await request(
    `/api/admin/photos/${crypto.randomUUID()}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": guest.csrfToken,
      },
      body: JSON.stringify({ visible: false }),
    },
    guestCookies,
  );
  assert.equal(guestAdminAttempt.status, 403);
  assert.equal(await errorCode(guestAdminAttempt), "admin_required");

  const invalidCsrf = await request(
    `/api/admin/photos/${crypto.randomUUID()}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": "invalid",
      },
      body: JSON.stringify({ visible: false }),
    },
    adminCookies,
  );
  assert.equal(invalidCsrf.status, 403);
  assert.equal(await errorCode(invalidCsrf), "invalid_csrf");

  const tooMany = await createBatch(guest.csrfToken, initialSession.limits.maxFilesPerBatch + 1);
  assert.equal(tooMany.response.status, 400);

  const boundaryBatch = await createBatch(guest.csrfToken, initialSession.limits.maxFilesPerBatch);
  assert.equal(boundaryBatch.response.status, 201);
  const invalidIndex = await upload(guest.csrfToken, boundaryBatch.body.batchId!, initialSession.limits.maxFilesPerBatch, new Uint8Array(), "out-of-range.jpg");
  assert.equal(invalidIndex.status, 400);
  assert.equal(await errorCode(invalidIndex), "invalid_batch");

  const firstBytes = uniqueJpeg(
    new Uint8Array(await readFile(resolve("images/01_beach_smile.jpeg"))),
  );
  const secondBytes = uniqueJpeg(
    new Uint8Array(await readFile(resolve("images/02_mirror_and_bouquet.jpeg"))),
  );
  const batch = await createBatch(guest.csrfToken, 2);
  assert.equal(batch.response.status, 201);
  assert.ok(batch.body.batchId);

  const firstUpload = await upload(
    guest.csrfToken,
    batch.body.batchId!,
    0,
    firstBytes,
    "same-name.exe",
  );
  assert.equal(firstUpload.status, 201, await firstUpload.clone().text());
  const firstPhoto = await json<{
    photo: { id: string; originalName: string };
  }>(firstUpload);
  assert.equal(firstPhoto.photo.originalName.endsWith(".jpg"), true);
  assert.equal(firstPhoto.photo.originalName.endsWith(".exe"), false);
  createdIds.push(firstPhoto.photo.id);

  const retryUpload = await upload(
    guest.csrfToken,
    batch.body.batchId!,
    0,
    firstBytes,
    "retry.jpeg",
  );
  assert.equal(retryUpload.status, 200);
  const retryBody = await json<{
    photo: { id: string };
    duplicate: boolean;
  }>(retryUpload);
  assert.equal(retryBody.duplicate, true);
  assert.equal(retryBody.photo.id, firstPhoto.photo.id);

  if (initialSession.limits.uploadsPerHour === 0) {
    // Exercise the former 60/hour barrier using idempotent requests: no extra
    // objects are created, and this test only cleans up its own photos.
    for (let index = 0; index < 65; index++) {
      const replay = await upload(guest.csrfToken, batch.body.batchId!, 0, new Uint8Array(), "replay.jpg");
      assert.equal(replay.status, 200, `request ${index + 1} must not hit a count quota`);
      assert.equal((await json<{ photo: { id: string } }>(replay)).photo.id, firstPhoto.photo.id);
    }
  }


  const secondUpload = await upload(
    guest.csrfToken,
    batch.body.batchId!,
    1,
    secondBytes,
    "same-name.jpeg",
  );
  assert.equal(secondUpload.status, 201, await secondUpload.clone().text());
  const secondPhoto = await json<{ photo: { id: string } }>(secondUpload);
  createdIds.push(secondPhoto.photo.id);

  const listing = await json<{ photos: Array<{ id: string; category: string }> }>(
    await request("/api/photos?category=reception", {}, guestCookies),
  );
  assert.equal(createdIds.every((id) => listing.photos.some((photo) => photo.id === id)), true);
  assert.equal(
    listing.photos.filter((photo) => createdIds.includes(photo.id)).every((photo) => photo.category === "reception"),
    true,
  );
  assert.equal(
    listing.photos.filter((photo) => photo.id === firstPhoto.photo.id).length,
    1,
  );

  const guestSession = await json<{ authenticated: boolean; admin: boolean }>(
    await request("/api/photos/session", {}, guestCookies),
  );
  const adminSession = await json<{ authenticated: boolean; admin: boolean }>(
    await request("/api/photos/session", {}, adminCookies),
  );
  assert.equal(guestSession.authenticated, true);
  assert.equal(guestSession.admin, false);
  assert.equal(adminSession.authenticated, true);
  assert.equal(adminSession.admin, true);

  const thumbnail = await request(
    `/api/photos/${createdIds[0]}/thumbnail`,
    {},
    guestCookies,
  );
  assert.equal(thumbnail.status, 200);
  assert.equal(
    thumbnail.headers.get("content-type"),
    variantMode === "original" ? "image/jpeg" : "image/webp",
  );
  assert.equal(thumbnail.headers.get("cache-control"), "private, no-store");
  assert.ok((await thumbnail.arrayBuffer()).byteLength > 0);

  const original = await request(
    `/api/photos/${createdIds[0]}/download`,
    {},
    guestCookies,
  );
  assert.equal(original.status, 200);
  assert.deepEqual(new Uint8Array(await original.arrayBuffer()), firstBytes);

  const inlineUrl = `/api/photos/${createdIds[0]}/original`;
  assert.equal((await request(inlineUrl, {}, anonymousCookies)).status, 401);
  const inlineOriginal = await request(inlineUrl, {}, guestCookies);
  assert.equal(inlineOriginal.status, 200);
  assert.equal(inlineOriginal.headers.get("content-type"), "image/jpeg");
  assert.match(inlineOriginal.headers.get("content-disposition") ?? "", /^inline;/);
  assert.match(inlineOriginal.headers.get("content-disposition") ?? "", /filename="photo-[a-f0-9-]+\.jpg";/);
  assert.equal(inlineOriginal.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(new Uint8Array(await inlineOriginal.arrayBuffer()), firstBytes);

  // Backfill an existing raw upload before ZIP checks. Its original must remain
  // byte-for-byte identical while only thumbnail/view move to lightweight JPEGs.
  const firstSourceHash = createHash("sha256").update(firstBytes).digest("hex");
  const firstVariants = await prepareVariants(firstBytes);
  const adminBeforeBackfill = await json<{
    photos: Array<{ id: string; sourceSha256: string; optimized: boolean }>;
  }>(await request("/api/admin/photos", {}, adminCookies));
  const existingPhoto = adminBeforeBackfill.photos.find((photo) => photo.id === firstPhoto.photo.id);
  assert.equal(existingPhoto?.sourceSha256, firstSourceHash);
  assert.equal(existingPhoto?.optimized, false);

  for (const jar of [anonymousCookies, guestCookies]) {
    const forbidden = await updateVariants(firstPhoto.photo.id,
      variantsForm(firstVariants, firstSourceHash), guest.csrfToken, jar);
    assert.equal(forbidden.status, 403);
    assert.equal(await errorCode(forbidden), "admin_required");
  }
  const invalidVariantCsrf = await updateVariants(firstPhoto.photo.id,
    variantsForm(firstVariants, firstSourceHash), "invalid");
  assert.equal(invalidVariantCsrf.status, 403);
  assert.equal(await errorCode(invalidVariantCsrf), "invalid_csrf");
  const wrongSource = await updateVariants(firstPhoto.photo.id,
    variantsForm(firstVariants, "0".repeat(64)), adminCsrf);
  assert.equal(wrongSource.status, 409);
  assert.equal(await errorCode(wrongSource), "source_changed");

  const squareJpeg = await sharp({ create: {
    width: 240, height: 240, channels: 3, background: "#e2b859",
  } }).jpeg().toBuffer();
  const wrongAspect = await updateVariants(firstPhoto.photo.id,
    variantsForm({ ...firstVariants, thumbnail: squareJpeg }, firstSourceHash), adminCsrf);
  assert.equal(wrongAspect.status, 400);
  assert.equal(await errorCode(wrongAspect), "invalid_photo");

  const oversizedEdgeJpeg = await sharp(firstBytes).resize(481, 321).jpeg().toBuffer();
  const invalidEdge = await updateVariants(firstPhoto.photo.id,
    variantsForm({ ...firstVariants, thumbnail: oversizedEdgeJpeg }, firstSourceHash), adminCsrf);
  assert.equal(invalidEdge.status, 400);
  const duplicateVariantPart = variantsForm(firstVariants, firstSourceHash);
  duplicateVariantPart.append("thumbnail", imageBlob(firstVariants.thumbnail), "second.jpg");
  const duplicatePartAttempt = await updateVariants(firstPhoto.photo.id, duplicateVariantPart, adminCsrf);
  assert.equal(duplicatePartAttempt.status, 400);
  const duplicateHashPart = variantsForm(firstVariants, firstSourceHash);
  duplicateHashPart.append("sourceSha256", firstSourceHash);
  assert.equal((await updateVariants(firstPhoto.photo.id, duplicateHashPart, adminCsrf)).status, 400);

  const pngThumbnail = await sharp(firstVariants.thumbnail).png().toBuffer();
  const pngVariantAttempt = await updateVariants(firstPhoto.photo.id,
    variantsForm({ ...firstVariants, thumbnail: pngThumbnail }, firstSourceHash), adminCsrf);
  assert.equal(pngVariantAttempt.status, 400);
  const invalidVariantSize = await updateVariants(firstPhoto.photo.id,
    variantsForm({ ...firstVariants, thumbnail: new Uint8Array(200_001) }, firstSourceHash), adminCsrf);
  assert.equal(invalidVariantSize.status, 400);

  const notBackfilled = await json<{ photo: { optimized: boolean } }>(
    await request(`/api/photos/${firstPhoto.photo.id}`, {}, guestCookies),
  );
  assert.equal(notBackfilled.photo.optimized, false, "Rejected variants must not change the row");
  const backfill = await updateVariants(firstPhoto.photo.id,
    variantsForm(firstVariants, firstSourceHash), adminCsrf);
  assert.equal(backfill.status, 200, await backfill.clone().text());
  const backfilled = await json<{ photo: {
    id: string; optimized: boolean; sourceSha256: string; thumbnailUrl: string; viewUrl: string;
  } }>(backfill);
  assert.equal(backfilled.photo.id, firstPhoto.photo.id);
  assert.equal(backfilled.photo.optimized, true);
  assert.equal(backfilled.photo.sourceSha256, firstSourceHash);
  await assertServedVariants(backfilled.photo, firstVariants);
  assert.deepEqual(new Uint8Array(await (
    await request(`/api/photos/${firstPhoto.photo.id}/download`, {}, guestCookies)
  ).arrayBuffer()), firstBytes);

  const differentVariants = {
    thumbnail: await sharp(firstVariants.thumbnail).jpeg({ quality: 45 }).toBuffer(),
    display: await sharp(firstVariants.display).jpeg({ quality: 45 }).toBuffer(),
  };
  const repeatedBackfill = await updateVariants(firstPhoto.photo.id,
    variantsForm(differentVariants, firstSourceHash), adminCsrf);
  assert.equal(repeatedBackfill.status, 200);
  assert.equal((await json<{ unchanged: boolean }>(repeatedBackfill)).unchanged, true);
  await assertServedVariants(backfilled.photo, firstVariants);

  const duplicateBatch = await createBatch(guest.csrfToken, 1);
  const duplicate = await upload(
    guest.csrfToken,
    duplicateBatch.body.batchId!,
    0,
    firstBytes,
    "duplicate.jpeg",
  );
  assert.equal(duplicate.status, 409);
  assert.equal((await json<{ photo: { id: string } }>(duplicate)).photo.id, firstPhoto.photo.id);

  const mismatchBatch = await createBatch(guest.csrfToken, 1);
  const mismatch = await upload(
    guest.csrfToken,
    mismatchBatch.body.batchId!,
    0,
    firstBytes,
    "photo.pdf",
    "application/pdf",
  );
  assert.equal(mismatch.status, 415);

  const allowedMismatchBatch = await createBatch(guest.csrfToken, 1);
  const allowedMismatch = await upload(
    guest.csrfToken,
    allowedMismatchBatch.body.batchId!,
    0,
    firstBytes,
    "declared-png.png",
    "image/png",
  );
  assert.equal(allowedMismatch.status, 415);

  const corruptBatch = await createBatch(guest.csrfToken, 1, "other");
  const corrupt = await upload(
    guest.csrfToken,
    corruptBatch.body.batchId!,
    0,
    new TextEncoder().encode("not an image"),
    "broken.jpg",
  );
  assert.equal(corrupt.status, 415);

  const fakeJpegBatch = await createBatch(guest.csrfToken, 1, "other");
  const fakeJpeg = new Uint8Array([
    0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x01, 0x00, 0x01,
    0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00,
  ]);
  const fakeJpegUpload = await upload(
    guest.csrfToken,
    fakeJpegBatch.body.batchId!,
    0,
    fakeJpeg,
    "fake-header.jpg",
  );
  assert.equal(fakeJpegUpload.status, 400);
  assert.equal(await errorCode(fakeJpegUpload), "invalid_photo");

  const oversizedBatch = await createBatch(guest.csrfToken, 1, "other");
  const oversized = new Uint8Array(initialSession.limits.maxFileBytes + 1);
  oversized.set([0xff, 0xd8, 0xff]);
  const oversizedUpload = await upload(
    guest.csrfToken,
    oversizedBatch.body.batchId!,
    0,
    oversized,
    "too-large.jpg",
  );
  assert.equal(oversizedUpload.status, 413);
  assert.equal(await errorCode(oversizedUpload), "file_too_large");

  const emptySelection = await request(
    "/api/photos/download",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": guest.csrfToken,
      },
      body: JSON.stringify({ ids: [] }),
    },
    guestCookies,
  );
  assert.equal(emptySelection.status, 400);

  const selectedJob = await request(
    "/api/photos/download",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": guest.csrfToken,
      },
      body: JSON.stringify({ ids: createdIds }),
    },
    guestCookies,
  );
  assert.equal(selectedJob.status, 201);
  const { downloadUrl } = await json<{ downloadUrl: string }>(selectedJob);
  const anonymousJobAttempt = await request(downloadUrl, {}, anonymousCookies);
  assert.equal(anonymousJobAttempt.status, 401);
  const [jobAttemptA, jobAttemptB] = await Promise.all([
    request(downloadUrl, {}, guestCookies),
    request(downloadUrl, {}, guestCookies),
  ]);
  assert.deepEqual(
    [jobAttemptA.status, jobAttemptB.status].sort((left, right) => left - right),
    [200, 404],
  );
  const selectedZip = jobAttemptA.status === 200 ? jobAttemptA : jobAttemptB;
  const expiredAttempt = jobAttemptA.status === 404 ? jobAttemptA : jobAttemptB;
  await expiredAttempt.text();
  assert.equal(selectedZip.status, 200);
  assert.equal(selectedZip.headers.get("content-type"), "application/zip");
  const selectedFiles = unzipSync(new Uint8Array(await selectedZip.arrayBuffer()));
  const selectedNames = Object.keys(selectedFiles).filter((name) => !name.endsWith("/"));
  assert.equal(selectedNames.length, 2);
  assert.equal(new Set(selectedNames).size, 2);
  assert.equal(selectedNames.every((name) => name.startsWith("披露宴/")), true);
  const firstZipName = selectedNames.find((name) => name.includes(createdIds[0].slice(0, 8)));
  const secondZipName = selectedNames.find((name) => name.includes(createdIds[1].slice(0, 8)));
  assert.ok(firstZipName);
  assert.ok(secondZipName);
  assert.deepEqual(selectedFiles[firstZipName], firstBytes);
  assert.deepEqual(selectedFiles[secondZipName], secondBytes);
  const reusedJob = await request(downloadUrl, {}, guestCookies);
  assert.equal(reusedJob.status, 404);

  const allJob = await request(
    "/api/photos/download-all",
    {
      method: "POST",
      headers: { "X-CSRF-Token": guest.csrfToken },
    },
    guestCookies,
  );
  assert.equal(allJob.status, 201);
  const allDownloadUrl = (await json<{ downloadUrl: string }>(allJob)).downloadUrl;
  const allZip = await request(allDownloadUrl, {}, guestCookies);
  assert.equal(allZip.status, 200);
  const allFiles = unzipSync(new Uint8Array(await allZip.arrayBuffer()));
  const allNames = Object.keys(allFiles).filter((name) => !name.endsWith("/"));
  assert.equal(allNames.some((name) => name.includes(createdIds[0].slice(0, 8))), true);
  assert.equal(allNames.some((name) => name.includes(createdIds[1].slice(0, 8))), true);

  // A PNG original exercises different MIME types for original and JPEG variants.
  const multipartBytes = await sharp(firstBytes).resize(960, 640).png().toBuffer();
  const multipartVariants = await prepareVariants(multipartBytes);
  const multipartForm = (variants = multipartVariants) => {
    const form = variantsForm(variants);
    form.append("original", imageBlob(multipartBytes, "image/png"), "original.png");
    return form;
  };
  const multipartBatch = await createBatch(guest.csrfToken, 1);
  assert.equal(multipartBatch.response.status, 201);
  const multipartBatchId = multipartBatch.body.batchId!;
  const anonymousMultipart = await uploadMultipart(guest.csrfToken, multipartBatchId,
    multipartForm(), anonymousCookies);
  assert.equal(anonymousMultipart.status, 401);
  const invalidMultipartCsrf = await uploadMultipart("invalid", multipartBatchId, multipartForm());
  assert.equal(invalidMultipartCsrf.status, 403);
  assert.equal(await errorCode(invalidMultipartCsrf), "invalid_csrf");

  const duplicateOriginalPart = multipartForm();
  duplicateOriginalPart.append("original", imageBlob(multipartBytes, "image/png"), "second.png");
  const invalidMultipartParts = await uploadMultipart(guest.csrfToken, multipartBatchId, duplicateOriginalPart);
  assert.equal(invalidMultipartParts.status, 400);
  const missingDisplay = multipartForm();
  missingDisplay.delete("display");
  assert.equal((await uploadMultipart(guest.csrfToken, multipartBatchId, missingDisplay)).status, 400);
  const unknownPart = multipartForm();
  unknownPart.append("unexpected", "value");
  assert.equal((await uploadMultipart(guest.csrfToken, multipartBatchId, unknownPart)).status, 400);
  const invalidMultipartAspect = await uploadMultipart(guest.csrfToken, multipartBatchId,
    multipartForm({ ...multipartVariants, thumbnail: squareJpeg }));
  assert.equal(invalidMultipartAspect.status, 400);

  const multipartUpload = await uploadMultipart(guest.csrfToken, multipartBatchId, multipartForm());
  assert.equal(multipartUpload.status, 201, await multipartUpload.clone().text());
  const multipartPhoto = await json<{ photo: {
    id: string; originalName: string; optimized: boolean; thumbnailUrl: string; viewUrl: string;
  } }>(multipartUpload);
  createdIds.push(multipartPhoto.photo.id);
  assert.equal(multipartPhoto.photo.optimized, true);
  assert.equal(multipartPhoto.photo.originalName.endsWith(".png"), true);
  await assertServedVariants(multipartPhoto.photo, multipartVariants);
  for (const suffix of ["original", "download"]) {
    const response = await request(`/api/photos/${multipartPhoto.photo.id}/${suffix}`, {}, guestCookies);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "image/png");
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()), new Uint8Array(multipartBytes));
  }
  const multipartReplay = await uploadMultipart(guest.csrfToken, multipartBatchId, multipartForm());
  assert.equal(multipartReplay.status, 200);
  const multipartReplayBody = await json<{ photo: { id: string }; duplicate: boolean }>(multipartReplay);
  assert.equal(multipartReplayBody.duplicate, true);
  assert.equal(multipartReplayBody.photo.id, multipartPhoto.photo.id);
  const secondMultipartBatch = await createBatch(guest.csrfToken, 1);
  const duplicateMultipart = await uploadMultipart(guest.csrfToken, secondMultipartBatch.body.batchId!, multipartForm());
  assert.equal(duplicateMultipart.status, 409);
  assert.equal(await errorCode(duplicateMultipart), "duplicate_photo");

  const multipartZipJob = await request("/api/photos/download", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": guest.csrfToken },
    body: JSON.stringify({ ids: [multipartPhoto.photo.id] }),
  }, guestCookies);
  assert.equal(multipartZipJob.status, 201);
  const multipartZipUrl = (await json<{ downloadUrl: string }>(multipartZipJob)).downloadUrl;
  const multipartZip = await request(multipartZipUrl, {}, guestCookies);
  assert.equal(multipartZip.status, 200);
  const multipartFiles = unzipSync(new Uint8Array(await multipartZip.arrayBuffer()));
  const multipartNames = Object.keys(multipartFiles).filter((name) => !name.endsWith("/"));
  assert.equal(multipartNames.length, 1);
  assert.equal(multipartNames[0].endsWith(".png"), true);
  assert.deepEqual(multipartFiles[multipartNames[0]], new Uint8Array(multipartBytes));

  const jobBeforeHide = await request(
    "/api/photos/download",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": guest.csrfToken,
      },
      body: JSON.stringify({ ids: [createdIds[0]] }),
    },
    guestCookies,
  );
  assert.equal(jobBeforeHide.status, 201);
  const hiddenJobUrl = (await json<{ downloadUrl: string }>(jobBeforeHide)).downloadUrl;

  const hide = await request(
    `/api/admin/photos/${createdIds[0]}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": adminCsrf,
      },
      body: JSON.stringify({ visible: false }),
    },
    adminCookies,
  );
  assert.equal(hide.status, 200);
  const guestAfterHide = await json<{ photos: Array<{ id: string }> }>(
    await request("/api/photos", {}, guestCookies),
  );
  assert.equal(guestAfterHide.photos.some((photo) => photo.id === createdIds[0]), false);
  for (const suffix of ["", "/thumbnail", "/view", "/download", "/original"]) {
    const hiddenResource = await request(
      `/api/photos/${createdIds[0]}${suffix}`,
      {},
      guestCookies,
    );
    assert.equal(hiddenResource.status, 404, `Hidden resource leaked at ${suffix || "detail"}`);
  }
  const hiddenJobDownload = await request(hiddenJobUrl, {}, guestCookies);
  assert.equal(hiddenJobDownload.status, 409);
  assert.equal(await errorCode(hiddenJobDownload), "no_photos");
  const hiddenRetry = await upload(
    guest.csrfToken,
    batch.body.batchId!,
    0,
    firstBytes,
    "retry-hidden.jpeg",
  );
  assert.equal(hiddenRetry.status, 409);
  assert.equal(await errorCode(hiddenRetry), "photo_hidden");

  const adminAfterHide = await json<{
    photos: Array<{ id: string; isVisible: boolean }>;
  }>(await request("/api/admin/photos", {}, adminCookies));
  assert.equal(
    adminAfterHide.photos.find((photo) => photo.id === createdIds[0])?.isVisible,
    false,
  );

  const show = await request(
    `/api/admin/photos/${createdIds[0]}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": adminCsrf,
      },
      body: JSON.stringify({ visible: true }),
    },
    adminCookies,
  );
  assert.equal(show.status, 200);
  const shownDetail = await request(`/api/photos/${createdIds[0]}`, {}, guestCookies);
  assert.equal(shownDetail.status, 200);

  const missing = await request(
    `/api/photos/${crypto.randomUUID()}`,
    {},
    guestCookies,
  );
  assert.equal(missing.status, 404);

  const explicitlyDeletedId = createdIds[0];
  const deleted = await request(
    `/api/admin/photos/${explicitlyDeletedId}`,
    {
      method: "DELETE",
      headers: { "X-CSRF-Token": adminCsrf },
    },
    adminCookies,
  );
  assert.equal(deleted.status, 200);
  assert.deepEqual(await json(deleted), { deleted: true });
  createdIds.splice(createdIds.indexOf(explicitlyDeletedId), 1);
  const deletedDetail = await request(
    `/api/photos/${explicitlyDeletedId}`,
    {},
    guestCookies,
  );
  assert.equal(deletedDetail.status, 404);

  console.log(
    "Integration checks passed: auth/CSRF separation, persistence, raw and multipart uploads, decoded JPEG variants, protected/idempotent backfill, hash/aspect/part validation, unchanged originals and ZIPs, atomic streamed ZIP jobs, hidden-resource boundaries, admin visibility/delete.",
  );
} finally {
  if (adminCsrf) {
    for (const id of createdIds) {
      const cleanup = await request(
        `/api/admin/photos/${id}`,
        {
          method: "DELETE",
          headers: { "X-CSRF-Token": adminCsrf },
        },
        adminCookies,
      );
      assert.equal(cleanup.status, 200, `Cleanup failed for ${id}: ${await cleanup.text()}`);
    }
  }
}
