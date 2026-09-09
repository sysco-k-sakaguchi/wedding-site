import type { PhotoEnv } from "./photo-runtime";
import {
  ADMIN_COOKIE,
  CSRF_COOKIE,
  GUEST_COOKIE,
  clearCookie,
  createCsrfToken,
  createSessionToken,
  getPhotoRuntimeConfig,
  makeCookie,
  readPhotoSession,
  secureCredentialEqual,
  type PhotoRuntimeConfig,
} from "./photo-auth";
import {
  createPhotoServices,
  type PhotoObjectStorage,
  type PhotoRepository,
  type PhotoRow,
} from "./photo-storage";
import { persistPhotoRecord } from "./photo-persistence";
import {
  PHOTO_CATEGORIES,
  PhotoValidationError,
  inspectImage,
  isPhotoCategory,
  isSameOriginRequest,
  normalizeOptionalText,
  normalizeImageDownloadName,
  sha256Hex,
  type DecodedImageInfo,
  type SupportedImageMime,
} from "./photo-utils";
import { createPhotoZipStream, getPhotoZipCapacityIssue } from "./photo-zip";

const API_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  "Referrer-Policy": "no-referrer",
} as const;

class PhotoApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "PhotoApiError";
  }
}

function jsonResponse(
  value: unknown,
  status = 200,
  headers?: Headers,
) {
  const responseHeaders = headers ?? new Headers();
  responseHeaders.set("Content-Type", "application/json; charset=utf-8");
  for (const [key, value] of Object.entries(API_HEADERS)) {
    responseHeaders.set(key, value);
  }

  return new Response(JSON.stringify(value), {
    status,
    headers: responseHeaders,
  });
}

function errorResponse(error: unknown) {
  if (error instanceof PhotoApiError) {
    return jsonResponse(
      { error: { code: error.code, message: error.message } },
      error.status,
    );
  }
  if (error instanceof PhotoValidationError) {
    return jsonResponse(
      { error: { code: "invalid_photo", message: error.message } },
      error.status,
    );
  }

  console.error("[photos] Unexpected API error", error);
  return jsonResponse(
    {
      error: {
        code: "internal_error",
        message: "処理を完了できませんでした。時間をおいてもう一度お試しください。",
      },
    },
    500,
  );
}

function assertConfigured(config: PhotoRuntimeConfig) {
  if (!config.configured) {
    throw new PhotoApiError(
      503,
      "not_configured",
      "写真ページのアクセス設定がまだ完了していません。管理者へお知らせください。",
    );
  }
}

function assertMethod(request: Request, methods: string[]) {
  if (!methods.includes(request.method)) {
    throw new PhotoApiError(405, "method_not_allowed", "この操作は利用できません。");
  }
}

function assertSameOrigin(request: Request) {
  if (!isSameOriginRequest(request)) {
    throw new PhotoApiError(403, "invalid_origin", "安全のため操作を中止しました。");
  }
}

function assertCsrf(
  request: Request,
  session: { csrfToken: string | null },
) {
  assertSameOrigin(request);
  const provided = request.headers.get("x-csrf-token");
  if (!provided || !session.csrfToken || provided !== session.csrfToken) {
    throw new PhotoApiError(
      403,
      "invalid_csrf",
      "画面の有効期限が切れました。ページを再読み込みしてください。",
    );
  }
}

function assertGuest(session: { guest: boolean }) {
  if (!session.guest) {
    throw new PhotoApiError(
      401,
      "authentication_required",
      "共有コードを入力してください。",
    );
  }
}

function assertAdmin(session: { admin: boolean }) {
  if (!session.admin) {
    throw new PhotoApiError(
      403,
      "admin_required",
      "管理者コードが必要です。",
    );
  }
}

async function readJson(request: Request) {
  try {
    const bytes = await readLimitedBody(request, 32_000, "json");
    return JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
  } catch (error) {
    if (error instanceof PhotoApiError) throw error;
    throw new PhotoApiError(400, "invalid_json", "入力内容を確認してください。");
  }
}

async function readLimitedBody(
  request: Request,
  maximumBytes: number,
  kind: "photo" | "json" = "photo",
) {
  const tooLargeMessage =
    kind === "photo"
      ? `1枚あたり${Math.floor(maximumBytes / 1_000_000)}MBまでです。`
      : "入力内容が大きすぎます。";
  const emptyMessage = kind === "photo" ? "写真を選んでください。" : "入力内容を確認してください。";
  const declaredLength = request.headers.get("content-length");
  if (declaredLength) {
    const parsedLength = Number(declaredLength);
    if (!Number.isSafeInteger(parsedLength) || parsedLength < 0) {
      throw new PhotoApiError(400, "invalid_length", "写真のサイズを確認できませんでした。");
    }
    if (parsedLength > maximumBytes) {
      throw new PhotoApiError(
        413,
        kind === "photo" ? "file_too_large" : "body_too_large",
        tooLargeMessage,
      );
    }
  }

  const reader = request.body?.getReader();
  if (!reader) {
    throw new PhotoApiError(
      400,
      kind === "photo" ? "missing_file" : "invalid_json",
      emptyMessage,
    );
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maximumBytes) {
      await reader.cancel().catch(() => undefined);
      throw new PhotoApiError(
        413,
        kind === "photo" ? "file_too_large" : "body_too_large",
        tooLargeMessage,
      );
    }
    chunks.push(value);
  }

  if (total < 1) {
    throw new PhotoApiError(
      400,
      kind === "photo" ? "missing_file" : "invalid_json",
      emptyMessage,
    );
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function photoPayload(photo: PhotoRow, admin = false) {
  return {
    id: photo.id,
    originalName: photo.original_name,
    mimeType: photo.mime_type,
    fileSize: photo.file_size,
    width: photo.width,
    height: photo.height,
    category: photo.category,
    uploaderName: photo.uploader_name,
    comment: photo.comment,
    createdAt: photo.created_at,
    thumbnailUrl: `/api/photos/${photo.id}/thumbnail`,
    viewUrl: `/api/photos/${photo.id}/view`,
    downloadUrl: `/api/photos/${photo.id}/download`,
    ...(admin ? { isVisible: photo.is_visible === 1 } : {}),
  };
}

async function rateLimit(
  repository: PhotoRepository,
  request: Request,
  config: PhotoRuntimeConfig,
  options: { kind: string; windowMs: number; limit: number; identity?: string },
) {
  const clientAddress =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-real-ip") ??
    "local";
  const bucket = await sha256Hex(
    `${config.sessionSecret}:${options.kind}:${options.identity ?? clientAddress}`,
  );
  const windowStart =
    Math.floor(Date.now() / options.windowMs) * options.windowMs;
  const allowed = await repository.consumeRateLimit({
    bucketKey: `${options.kind}:${bucket}`,
    windowStart,
    limit: options.limit,
  });

  if (!allowed) {
    throw new PhotoApiError(
      429,
      "rate_limited",
      "操作が続いたため、しばらく待ってからもう一度お試しください。",
    );
  }
}

async function rateLimitState(
  request: Request,
  config: PhotoRuntimeConfig,
  options: { kind: string; windowMs: number; limit: number; identity?: string },
) {
  const clientAddress =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-real-ip") ??
    "local";
  const bucket = await sha256Hex(
    `${config.sessionSecret}:${options.kind}:${options.identity ?? clientAddress}`,
  );
  return {
    bucketKey: `${options.kind}:${bucket}`,
    windowStart: Math.floor(Date.now() / options.windowMs) * options.windowMs,
    limit: options.limit,
  };
}

async function processVariant(
  env: PhotoEnv,
  bytes: Uint8Array,
  image: Pick<DecodedImageInfo, "mimeType" | "extension">,
  variantMode: PhotoRuntimeConfig["variantMode"],
  options: { width: number; quality: number },
) {
  if (variantMode === "original") {
    return {
      bytes,
      mimeType: image.mimeType,
      extension: image.extension,
    };
  }

  if (!env.IMAGES || typeof env.IMAGES.input !== "function") {
    console.error("[photos] IMAGES binding unavailable");
    throw new PhotoApiError(
      503,
      "image_processing_unavailable",
      "写真の処理機能を利用できません。時間をおいてもう一度お試しください。",
    );
  }

  try {
    const source = new Response(bytes.buffer as ArrayBuffer).body;
    if (!source) {
      throw new Error("Image source stream is unavailable.");
    }

    const transformed = await env.IMAGES.input(source)
      .transform({
        width: options.width,
        fit: "scale-down",
        metadata: "none",
      })
      .output({ format: "image/webp", quality: options.quality });
    const response = transformed.response();

    if (!response.ok) {
      throw new Error(`Image transform returned ${response.status}.`);
    }

    const output = new Uint8Array(await response.arrayBuffer());
    if (output.length === 0) {
      throw new Error("Image transform produced an empty body.");
    }

    return {
      bytes: output,
      mimeType: "image/webp" as SupportedImageMime,
      extension: "webp" as const,
    };
  } catch (error) {
    console.error(
      "[photos] Image transform failed",
      error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    );
    throw new PhotoValidationError(
      "画像を正しく読み込めませんでした。ファイルが壊れていないか確認してください。",
    );
  }
}

async function handleSession(request: Request, env: PhotoEnv) {
  assertMethod(request, ["GET"]);
  const config = getPhotoRuntimeConfig(env);
  const session = await readPhotoSession(request, config);
  const headers = new Headers();
  let csrfToken = session.csrfToken;

  if ((session.guest || session.admin) && !csrfToken) {
    csrfToken = createCsrfToken();
    headers.append(
      "Set-Cookie",
      makeCookie(request, CSRF_COOKIE, csrfToken, { httpOnly: false }),
    );
  }

  return jsonResponse(
    {
      configured: config.configured,
      authenticated: session.guest,
      admin: session.admin,
      csrfToken,
      categories: PHOTO_CATEGORIES,
      limits: {
        maxFileBytes: config.maxFileBytes,
        maxFilesPerBatch: config.maxFilesPerBatch,
      },
      supportedTypes: ["image/jpeg", "image/png", "image/webp"],
    },
    200,
    headers,
  );
}

async function handleAccess(
  request: Request,
  env: PhotoEnv,
  repository: PhotoRepository,
  admin: boolean,
) {
  assertMethod(request, ["POST"]);
  assertSameOrigin(request);
  const config = getPhotoRuntimeConfig(env);
  assertConfigured(config);
  const accessLimitOptions = {
    kind: admin ? "admin-access-failure" : "guest-access-failure",
    windowMs: 15 * 60 * 1000,
    limit: 10,
  };
  const accessLimit = await rateLimitState(request, config, accessLimitOptions);
  if (await repository.isRateLimited(accessLimit)) {
    throw new PhotoApiError(
      429,
      "rate_limited",
      "操作が続いたため、しばらく待ってからもう一度お試しください。",
    );
  }
  const body = await readJson(request);
  const code = typeof body.code === "string" ? body.code : "";
  const expected = admin ? config.adminCode : config.accessCode;
  if (!(await secureCredentialEqual(code, expected))) {
    await rateLimit(repository, request, config, {
      ...accessLimitOptions,
    });
    throw new PhotoApiError(
      401,
      "invalid_access_code",
      admin ? "管理者コードが正しくありません。" : "共有コードが正しくありません。",
    );
  }

  const csrfToken = createCsrfToken();
  const headers = new Headers();
  const guestToken = await createSessionToken("guest", config.sessionSecret);
  headers.append(
    "Set-Cookie",
    makeCookie(request, GUEST_COOKIE, guestToken, { httpOnly: true }),
  );

  if (admin) {
    const adminToken = await createSessionToken("admin", config.sessionSecret, {
      maxAgeSeconds: 8 * 60 * 60,
    });
    headers.append(
      "Set-Cookie",
      makeCookie(request, ADMIN_COOKIE, adminToken, {
        httpOnly: true,
        maxAge: 8 * 60 * 60,
      }),
    );
  }

  headers.append(
    "Set-Cookie",
    makeCookie(request, CSRF_COOKIE, csrfToken, { httpOnly: false }),
  );

  return jsonResponse(
    { authenticated: true, admin, csrfToken },
    200,
    headers,
  );
}

async function handleLogout(request: Request, env: PhotoEnv) {
  assertMethod(request, ["DELETE"]);
  assertSameOrigin(request);
  const config = getPhotoRuntimeConfig(env);
  const session = await readPhotoSession(request, config);
  if (session.csrfToken) {
    assertCsrf(request, session);
  }

  const headers = new Headers();
  headers.append("Set-Cookie", clearCookie(request, GUEST_COOKIE, true));
  headers.append("Set-Cookie", clearCookie(request, ADMIN_COOKIE, true));
  headers.append("Set-Cookie", clearCookie(request, CSRF_COOKIE));
  return jsonResponse({ authenticated: false }, 200, headers);
}

async function handleCreateBatch(
  request: Request,
  config: PhotoRuntimeConfig,
  repository: PhotoRepository,
  session: Awaited<ReturnType<typeof readPhotoSession>>,
) {
  assertMethod(request, ["POST"]);
  assertGuest(session);
  assertCsrf(request, session);
  await rateLimit(repository, request, config, {
    kind: "batch-session",
    windowMs: 60 * 60 * 1000,
    limit: 120,
    identity: session.rateIdentity ?? undefined,
  });
  await rateLimit(repository, request, config, {
    kind: "batch-ip",
    windowMs: 60 * 60 * 1000,
    limit: 2_000,
  });
  const body = await readJson(request);
  const count = Number(body.count);
  const category = typeof body.category === "string" ? body.category : "";

  if (!Number.isInteger(count) || count < 1 || count > config.maxFilesPerBatch) {
    throw new PhotoApiError(
      400,
      "invalid_file_count",
      `写真は1回につき${config.maxFilesPerBatch}枚まで選べます。`,
    );
  }
  if (!isPhotoCategory(category)) {
    throw new PhotoApiError(400, "invalid_category", "場面を選んでください。");
  }

  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + 2 * 60 * 60 * 1000);
  const batch = {
    id: crypto.randomUUID(),
    category,
    uploader_name: normalizeOptionalText(body.uploaderName, 60, "投稿者名"),
    comment: normalizeOptionalText(body.comment, 300, "コメント"),
    expected_count: count,
    created_at: createdAt.toISOString(),
    expires_at: expiresAt.toISOString(),
  };
  await repository.createBatch(batch);

  return jsonResponse({ batchId: batch.id, expiresAt: batch.expires_at }, 201);
}

async function handleUpload(
  request: Request,
  env: PhotoEnv,
  config: PhotoRuntimeConfig,
  repository: PhotoRepository,
  objects: PhotoObjectStorage,
  session: Awaited<ReturnType<typeof readPhotoSession>>,
) {
  assertMethod(request, ["POST"]);
  assertGuest(session);
  assertCsrf(request, session);
  await rateLimit(repository, request, config, {
    kind: "upload-session",
    windowMs: 60 * 60 * 1000,
    limit: config.uploadsPerHour,
    identity: session.rateIdentity ?? undefined,
  });
  await rateLimit(repository, request, config, {
    kind: "upload-ip",
    windowMs: 60 * 60 * 1000,
    limit: Math.min(Math.max(config.uploadsPerHour * 10, 1_000), 10_000),
  });

  const uploadUrl = new URL(request.url);
  const batchId = uploadUrl.searchParams.get("batchId");
  const fileIndex = Number(uploadUrl.searchParams.get("fileIndex"));
  const encodedName = request.headers.get("x-photo-filename") ?? "";
  if (encodedName.length > 600) {
    throw new PhotoApiError(400, "invalid_filename", "ファイル名が長すぎます。");
  }
  let originalName = "";
  try {
    originalName = decodeURIComponent(encodedName);
  } catch {
    throw new PhotoApiError(400, "invalid_filename", "ファイル名を確認してください。");
  }
  if (!batchId) {
    throw new PhotoApiError(400, "invalid_batch", "アップロードをやり直してください。");
  }

  const batch = await repository.getBatch(batchId);
  if (
    !batch ||
    new Date(batch.expires_at).getTime() <= Date.now() ||
    !Number.isInteger(fileIndex) ||
    fileIndex < 0 ||
    fileIndex >= batch.expected_count
  ) {
    throw new PhotoApiError(
      400,
      "invalid_batch",
      "アップロードの有効期限が切れました。もう一度選び直してください。",
    );
  }

  const retried = await repository.findByBatchIndex(batchId, fileIndex);
  if (retried) {
    if (retried.is_visible !== 1 && !session.admin) {
      throw new PhotoApiError(
        409,
        "photo_hidden",
        "この写真は現在アルバムへ追加できません。",
      );
    }
    return jsonResponse({ photo: photoPayload(retried), duplicate: true }, 200);
  }

  const declaredMime = (request.headers.get("content-type") ?? "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();
  const allowedDeclared = ["", "application/octet-stream", "image/jpeg", "image/png", "image/webp"];
  if (!allowedDeclared.includes(declaredMime)) {
    throw new PhotoValidationError(
      declaredMime.includes("heic") || declaredMime.includes("heif")
        ? "HEIC／HEIFには現在対応していません。JPEGへ変換してから追加してください。"
        : "JPEG、PNG、WebPの画像を選んでください。",
      415,
    );
  }

  const bytes = await readLimitedBody(request, config.maxFileBytes);
  const image = inspectImage(bytes, { maxPixels: config.maxPixels });
  if (
    declaredMime !== "" &&
    declaredMime !== "application/octet-stream" &&
    declaredMime !== image.mimeType
  ) {
    throw new PhotoValidationError(
      "ファイルの種類と画像データが一致しません。別の画像を選んでください。",
      415,
    );
  }

  const hash = await sha256Hex(bytes);
  const duplicate = await repository.findByHash(hash);
  if (duplicate) {
    throw new PhotoApiError(
      409,
      "duplicate_photo",
      "同じ写真はすでにアルバムへ追加されています。",
    );
  }

  const thumbnail = await processVariant(
    env,
    bytes,
    image,
    config.variantMode,
    { width: 640, quality: 78 },
  );
  const displayImage = await processVariant(
    env,
    bytes,
    image,
    config.variantMode,
    { width: 1920, quality: 88 },
  );

  const id = crypto.randomUUID();
  const objectKey = `originals/${id}.${image.extension}`;
  const thumbnailKey = `thumbnails/${id}.${thumbnail.extension}`;
  const displayKey = `display/${id}.${displayImage.extension}`;

  const writes = await Promise.allSettled([
    objects.putOriginal(objectKey, bytes, image.mimeType),
    objects.putThumbnail(thumbnailKey, thumbnail.bytes, thumbnail.mimeType),
    objects.putDisplayImage(
      displayKey,
      displayImage.bytes,
      displayImage.mimeType,
    ),
  ]);
  const failedWrite = writes.find(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );
  if (failedWrite) {
    await objects
      .deleteObjects([objectKey, thumbnailKey, displayKey])
      .catch(() => undefined);
    throw failedWrite.reason;
  }

  const persisted = await persistPhotoRecord(repository, objects, {
    id,
    batchId,
    fileIndex,
    originalName: normalizeImageDownloadName(
      originalName,
      `photo-${id}`,
      image.extension,
    ),
    objectKey,
    thumbnailKey,
    displayKey,
    mimeType: image.mimeType,
    fileSize: bytes.byteLength,
    width: image.width,
    height: image.height,
    category: batch.category,
    uploaderName: batch.uploader_name,
    comment: batch.comment,
    createdAt: new Date().toISOString(),
    sha256: hash,
  });

  if (persisted.duplicate) {
    throw new PhotoApiError(
      409,
      "duplicate_photo",
      "同じ写真はすでにアルバムへ追加されています。",
    );
  }
  return jsonResponse({ photo: photoPayload(persisted.photo), duplicate: false }, 201);
}

function binaryHeaders(contentType: string, cacheControl: string) {
  const headers = new Headers(API_HEADERS);
  headers.set("Content-Type", contentType);
  headers.set("Cache-Control", cacheControl);
  return headers;
}

async function handlePhotoResource(
  request: Request,
  repository: PhotoRepository,
  objects: PhotoObjectStorage,
  session: Awaited<ReturnType<typeof readPhotoSession>>,
  id: string,
  resource?: string,
) {
  assertMethod(request, ["GET"]);
  assertGuest(session);
  const photo = await repository.getPhoto(id, session.admin);
  if (!photo) {
    throw new PhotoApiError(404, "photo_not_found", "写真が見つかりませんでした。");
  }

  if (!resource) {
    return jsonResponse({ photo: photoPayload(photo) });
  }

  if (resource === "thumbnail" || resource === "view") {
    const variantKey =
      resource === "thumbnail" ? photo.thumbnail_key : photo.display_key;
    const object =
      resource === "thumbnail"
        ? await objects.getThumbnail(variantKey)
        : await objects.getDisplayImage(variantKey);
    if (!object) {
      throw new PhotoApiError(404, "image_not_found", "画像を読み込めませんでした。");
    }

    const contentType =
      object.httpMetadata?.contentType ??
      (variantKey.endsWith(".webp") ? "image/webp" : photo.mime_type);
    return new Response(object.body, {
      headers: binaryHeaders(contentType, "private, no-store"),
    });
  }

  if (resource === "download") {
    const object = await objects.getOriginalStream(photo.object_key);
    if (!object) {
      throw new PhotoApiError(404, "image_not_found", "原本を読み込めませんでした。");
    }

    const extension =
      photo.mime_type === "image/png"
        ? "png"
        : photo.mime_type === "image/webp"
          ? "webp"
          : "jpg";
    const safeName = normalizeImageDownloadName(
      photo.original_name,
      `photo-${photo.id}`,
      extension,
    );
    const headers = binaryHeaders(photo.mime_type, "private, no-store");
    headers.set(
      "Content-Disposition",
      `attachment; filename="photo-${photo.id.slice(0, 8)}"; filename*=UTF-8''${encodeURIComponent(safeName)}`,
    );
    headers.set("Content-Length", String(object.size));
    return new Response(object.body, { headers });
  }

  throw new PhotoApiError(404, "route_not_found", "APIが見つかりませんでした。");
}

function zipResponse(photos: PhotoRow[], objects: PhotoObjectStorage) {
  if (photos.length === 0) {
    throw new PhotoApiError(
      409,
      "no_photos",
      "ダウンロードできる写真がまだありません。",
    );
  }

  if (getPhotoZipCapacityIssue(photos)) {
    throw new PhotoApiError(
      409,
      "zip_capacity_exceeded",
      "一度にZIPへまとめられる容量を超えました。管理者へ分割ダウンロードを依頼してください。",
    );
  }

  const date = new Date().toISOString().slice(0, 10);
  const headers = binaryHeaders("application/zip", "private, no-store");
  headers.set(
    "Content-Disposition",
    `attachment; filename="wedding-photos-${date}.zip"`,
  );
  return new Response(createPhotoZipStream(photos, objects), { headers });
}

function assertZipDownloadable(photos: PhotoRow[]) {
  if (photos.length === 0) {
    throw new PhotoApiError(
      409,
      "no_photos",
      "ダウンロードできる写真がまだありません。",
    );
  }
  if (getPhotoZipCapacityIssue(photos)) {
    throw new PhotoApiError(
      409,
      "zip_capacity_exceeded",
      "一度にZIPへまとめられる容量を超えました。管理者へ分割ダウンロードを依頼してください。",
    );
  }
}

async function createDownloadJob(
  repository: PhotoRepository,
  photos: PhotoRow[],
) {
  assertZipDownloadable(photos);
  const now = new Date();
  const jobId = crypto.randomUUID();
  await repository.createDownloadJob({
    id: jobId,
    photo_ids: JSON.stringify(photos.map((photo) => photo.id)),
    created_at: now.toISOString(),
    expires_at: new Date(now.getTime() + 10 * 60 * 1000).toISOString(),
  });
  return jsonResponse(
    { downloadUrl: `/api/photos/download/${jobId}` },
    201,
  );
}

async function handleSelectedDownload(
  request: Request,
  config: PhotoRuntimeConfig,
  repository: PhotoRepository,
  session: Awaited<ReturnType<typeof readPhotoSession>>,
) {
  assertMethod(request, ["POST"]);
  assertGuest(session);
  assertCsrf(request, session);
  await rateLimit(repository, request, config, {
    kind: "download-job-session",
    windowMs: 60 * 60 * 1000,
    limit: 120,
    identity: session.rateIdentity ?? undefined,
  });
  await rateLimit(repository, request, config, {
    kind: "download-job-ip",
    windowMs: 60 * 60 * 1000,
    limit: 2_000,
  });
  const body = await readJson(request);
  if (!Array.isArray(body.ids) || body.ids.length < 1 || body.ids.length > 500) {
    throw new PhotoApiError(
      400,
      "invalid_selection",
      "ダウンロードする写真を1枚以上選んでください。",
    );
  }

  const ids = new Set(
    body.ids.filter((id): id is string => typeof id === "string"),
  );
  const photos = (await repository.listPhotos()).filter((photo) => ids.has(photo.id));
  return createDownloadJob(repository, photos);
}

async function handleAllDownload(
  request: Request,
  config: PhotoRuntimeConfig,
  repository: PhotoRepository,
  session: Awaited<ReturnType<typeof readPhotoSession>>,
) {
  assertMethod(request, ["POST"]);
  assertGuest(session);
  assertCsrf(request, session);
  await rateLimit(repository, request, config, {
    kind: "download-job-session",
    windowMs: 60 * 60 * 1000,
    limit: 120,
    identity: session.rateIdentity ?? undefined,
  });
  await rateLimit(repository, request, config, {
    kind: "download-job-ip",
    windowMs: 60 * 60 * 1000,
    limit: 2_000,
  });
  return createDownloadJob(repository, await repository.listPhotos());
}

async function handleDownloadJob(
  request: Request,
  repository: PhotoRepository,
  objects: PhotoObjectStorage,
  session: Awaited<ReturnType<typeof readPhotoSession>>,
  id: string,
) {
  assertMethod(request, ["GET"]);
  assertGuest(session);
  // DELETE ... RETURNING consumes the token atomically, so simultaneous GETs
  // cannot both stream the same one-time download job.
  const job = await repository.consumeDownloadJob(id);
  if (!job) {
    throw new PhotoApiError(
      404,
      "download_expired",
      "ダウンロードの有効期限が切れました。もう一度選択してください。",
    );
  }

  let ids: string[];
  try {
    const parsed = JSON.parse(job.photo_ids) as unknown;
    ids = Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : [];
  } catch {
    ids = [];
  }
  const order = new Map(ids.map((photoId, index) => [photoId, index]));
  const photos = (await repository.listPhotos())
    .filter((photo) => order.has(photo.id))
    .sort((left, right) => (order.get(left.id) ?? 0) - (order.get(right.id) ?? 0));
  if (photos.length < 1) {
    throw new PhotoApiError(
      409,
      "no_photos",
      "ダウンロードできる写真がありません。",
    );
  }
  return zipResponse(photos, objects);
}

async function handleAdminCollection(
  request: Request,
  repository: PhotoRepository,
  session: Awaited<ReturnType<typeof readPhotoSession>>,
) {
  assertMethod(request, ["GET"]);
  assertAdmin(session);
  const photos = await repository.listPhotos({ includeHidden: true });
  return jsonResponse({ photos: photos.map((photo) => photoPayload(photo, true)) });
}

async function handleAdminPhoto(
  request: Request,
  repository: PhotoRepository,
  objects: PhotoObjectStorage,
  session: Awaited<ReturnType<typeof readPhotoSession>>,
  id: string,
) {
  assertAdmin(session);
  assertCsrf(request, session);
  const photo = await repository.getPhoto(id, true);
  if (!photo) {
    throw new PhotoApiError(404, "photo_not_found", "写真が見つかりませんでした。");
  }

  if (request.method === "PATCH") {
    const body = await readJson(request);
    if (typeof body.visible !== "boolean") {
      throw new PhotoApiError(400, "invalid_visibility", "表示状態を選んでください。");
    }
    await repository.setVisibility(id, body.visible);
    const updated = await repository.getPhoto(id, true);
    return jsonResponse({ photo: updated ? photoPayload(updated, true) : null });
  }

  if (request.method === "DELETE") {
    await repository.setVisibility(id, false);
    await objects.deleteObjects([
      photo.object_key,
      photo.thumbnail_key,
      photo.display_key,
    ]);
    const deleted = await repository.deletePhoto(id);
    if (!deleted) {
      throw new PhotoApiError(
        500,
        "delete_failed",
        "写真を非表示にしましたが、完全削除を完了できませんでした。",
      );
    }
    return jsonResponse({ deleted: true });
  }

  throw new PhotoApiError(405, "method_not_allowed", "この操作は利用できません。");
}

export async function handlePhotoApi(request: Request, env: PhotoEnv) {
  const url = new URL(request.url);
  const isPhotoApi =
    url.pathname.startsWith("/api/photos") ||
    url.pathname.startsWith("/api/admin/photos");
  if (!isPhotoApi) {
    return null;
  }

  try {
    const config = getPhotoRuntimeConfig(env);
    const { repository, objects } = createPhotoServices(env);

    if (url.pathname === "/api/photos/session") {
      return await handleSession(request, env);
    }
    if (url.pathname === "/api/photos/access") {
      return request.method === "DELETE"
        ? await handleLogout(request, env)
        : await handleAccess(request, env, repository, false);
    }
    if (url.pathname === "/api/photos/admin/access") {
      return await handleAccess(request, env, repository, true);
    }
    if (url.pathname === "/api/photos/categories") {
      assertMethod(request, ["GET"]);
      return jsonResponse({ categories: PHOTO_CATEGORIES });
    }
    assertConfigured(config);
    const session = await readPhotoSession(request, config);

    if (url.pathname === "/api/photos/logout") {
      return await handleLogout(request, env);
    }
    if (url.pathname === "/api/photos/batches") {
      return await handleCreateBatch(request, config, repository, session);
    }
    if (url.pathname === "/api/photos/download") {
      return await handleSelectedDownload(request, config, repository, session);
    }
    const downloadJobMatch = url.pathname.match(
      /^\/api\/photos\/download\/([0-9a-f-]{36})$/i,
    );
    if (downloadJobMatch) {
      return await handleDownloadJob(
        request,
        repository,
        objects,
        session,
        downloadJobMatch[1],
      );
    }
    if (url.pathname === "/api/photos/download-all") {
      return await handleAllDownload(request, config, repository, session);
    }
    if (url.pathname === "/api/photos") {
      if (request.method === "POST") {
        return await handleUpload(
          request,
          env,
          config,
          repository,
          objects,
          session,
        );
      }
      assertMethod(request, ["GET"]);
      assertGuest(session);
      const requestedCategory = url.searchParams.get("category");
      if (requestedCategory && !isPhotoCategory(requestedCategory)) {
        throw new PhotoApiError(400, "invalid_category", "場面を確認してください。");
      }
      const photos = await repository.listPhotos({
        category:
          requestedCategory && isPhotoCategory(requestedCategory)
            ? requestedCategory
            : undefined,
      });
      return jsonResponse({ photos: photos.map((photo) => photoPayload(photo)) });
    }
    if (url.pathname === "/api/admin/photos") {
      return await handleAdminCollection(request, repository, session);
    }

    const adminMatch = url.pathname.match(/^\/api\/admin\/photos\/([0-9a-f-]{36})$/i);
    if (adminMatch) {
      return await handleAdminPhoto(
        request,
        repository,
        objects,
        session,
        adminMatch[1],
      );
    }

    const photoMatch = url.pathname.match(
      /^\/api\/photos\/([0-9a-f-]{36})(?:\/(thumbnail|view|download))?$/i,
    );
    if (photoMatch) {
      return await handlePhotoResource(
        request,
        repository,
        objects,
        session,
        photoMatch[1],
        photoMatch[2],
      );
    }

    throw new PhotoApiError(404, "route_not_found", "APIが見つかりませんでした。");
  } catch (error) {
    return errorResponse(error);
  }
}
