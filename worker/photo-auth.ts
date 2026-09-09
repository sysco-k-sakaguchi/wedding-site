import type { PhotoEnv } from "./photo-runtime";
import {
  decodeBase64Url,
  encodeBase64Url,
  parseCookieHeader,
} from "./photo-utils";

export const GUEST_COOKIE = "wedding_photo_guest";
export const ADMIN_COOKIE = "wedding_photo_admin";
export const CSRF_COOKIE = "wedding_photo_csrf";

export type PhotoRole = "guest" | "admin";

export interface PhotoRuntimeConfig {
  configured: boolean;
  accessCode: string;
  adminCode: string;
  sessionSecret: string;
  maxFileBytes: number;
  maxFilesPerBatch: number;
  maxPixels: number;
  uploadsPerHour: number;
  variantMode: "transform" | "original";
}

function parsePositiveInteger(
  value: string | undefined,
  fallback: number,
  maximum: number,
) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }

  return Math.min(parsed, maximum);
}

export function getPhotoRuntimeConfig(env: PhotoEnv): PhotoRuntimeConfig {
  const accessCode = env.PHOTO_ACCESS_CODE?.trim() ?? "";
  const adminCode = env.PHOTO_ADMIN_CODE?.trim() ?? "";
  const sessionSecret = env.PHOTO_SESSION_SECRET?.trim() ?? "";

  return {
    configured:
      accessCode.length > 0 &&
      adminCode.length > 0 &&
      accessCode !== adminCode &&
      sessionSecret.length >= 32,
    accessCode,
    adminCode,
    sessionSecret,
    maxFileBytes: parsePositiveInteger(
      env.PHOTO_MAX_FILE_BYTES,
      20_000_000,
      20_000_000,
    ),
    maxFilesPerBatch: parsePositiveInteger(
      env.PHOTO_MAX_FILES_PER_BATCH,
      20,
      50,
    ),
    maxPixels: parsePositiveInteger(
      env.PHOTO_MAX_PIXELS,
      100_000_000,
      160_000_000,
    ),
    uploadsPerHour: parsePositiveInteger(
      env.PHOTO_UPLOADS_PER_HOUR,
      60,
      1_000,
    ),
    variantMode:
      env.PHOTO_VARIANT_MODE?.trim() === "original" ? "original" : "transform",
  };
}

async function importHmacKey(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function createSessionToken(
  role: PhotoRole,
  secret: string,
  options: { now?: number; maxAgeSeconds?: number } = {},
) {
  const now = options.now ?? Date.now();
  const expiresAt = Math.floor(now / 1000) + (options.maxAgeSeconds ?? 24 * 60 * 60);
  const nonce = encodeBase64Url(crypto.getRandomValues(new Uint8Array(12)));
  const payload = `${role}.${expiresAt}.${nonce}`;
  const key = await importHmacKey(secret);
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );

  return `${payload}.${encodeBase64Url(new Uint8Array(signature))}`;
}

export async function verifySessionToken(
  token: string | undefined,
  role: PhotoRole,
  secret: string,
  now = Date.now(),
) {
  if (!token || !secret) {
    return false;
  }

  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== role) {
    return false;
  }

  const expiresAt = Number.parseInt(parts[1], 10);
  if (!Number.isFinite(expiresAt) || expiresAt <= Math.floor(now / 1000)) {
    return false;
  }

  try {
    const payload = `${parts[0]}.${parts[1]}.${parts[2]}`;
    const key = await importHmacKey(secret);
    return crypto.subtle.verify(
      "HMAC",
      key,
      decodeBase64Url(parts[3]),
      new TextEncoder().encode(payload),
    );
  } catch {
    return false;
  }
}

export async function secureCredentialEqual(actual: string, expected: string) {
  const [actualDigest, expectedDigest] = await Promise.all([
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(actual)),
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(expected)),
  ]);
  const left = new Uint8Array(actualDigest);
  const right = new Uint8Array(expectedDigest);
  let difference = left.length ^ right.length;

  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }

  return difference === 0;
}

export async function readPhotoSession(request: Request, config: PhotoRuntimeConfig) {
  if (!config.configured) {
    return { guest: false, admin: false, csrfToken: null as string | null };
  }

  const cookies = parseCookieHeader(request.headers.get("cookie"));
  const guestCookie = cookies.get(GUEST_COOKIE);
  const adminCookie = cookies.get(ADMIN_COOKIE);
  const [guest, admin] = await Promise.all([
    verifySessionToken(guestCookie, "guest", config.sessionSecret),
    verifySessionToken(adminCookie, "admin", config.sessionSecret),
  ]);

  return {
    guest: guest || admin,
    admin,
    csrfToken: cookies.get(CSRF_COOKIE) ?? null,
    rateIdentity: admin ? adminCookie ?? null : guest ? guestCookie ?? null : null,
  };
}

export function createCsrfToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return encodeBase64Url(bytes);
}

export function makeCookie(
  request: Request,
  name: string,
  value: string,
  options: { httpOnly?: boolean; maxAge?: number } = {},
) {
  const secure = new URL(request.url).protocol === "https:";
  const attributes = [
    `${name}=${value}`,
    "Path=/",
    "SameSite=Strict",
    `Max-Age=${options.maxAge ?? 24 * 60 * 60}`,
  ];

  if (options.httpOnly) {
    attributes.push("HttpOnly");
  }
  if (secure) {
    attributes.push("Secure");
  }

  return attributes.join("; ");
}

export function clearCookie(request: Request, name: string, httpOnly = false) {
  return makeCookie(request, name, "", { httpOnly, maxAge: 0 });
}
