import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { unzipSync } from "fflate";

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

const createdIds: string[] = [];
let adminCsrf = "";

try {
  const initialSession = await json<{
    configured: boolean;
    limits: { maxFileBytes: number };
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

  const tooMany = await createBatch(guest.csrfToken, 21);
  assert.equal(tooMany.response.status, 400);

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

  const duplicateBatch = await createBatch(guest.csrfToken, 1);
  const duplicate = await upload(
    guest.csrfToken,
    duplicateBatch.body.batchId!,
    0,
    firstBytes,
    "duplicate.jpeg",
  );
  assert.equal(duplicate.status, 409);

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
  for (const suffix of ["", "/thumbnail", "/view", "/download"]) {
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
    "Integration checks passed: auth/CSRF separation, persistence, raw size/decode/MIME checks, idempotency, canonical names, derivatives/originals, atomic streamed ZIP jobs, hidden-resource boundaries, admin visibility/delete.",
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
