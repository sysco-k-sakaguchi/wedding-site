import assert from "node:assert/strict";
import test from "node:test";
import {
  createSessionToken,
  getPhotoRuntimeConfig,
  secureCredentialEqual,
  verifySessionToken,
} from "../worker/photo-auth";

const secret = "a-session-secret-that-is-at-least-thirty-two-characters";

test("署名Cookieはrole・期限・改ざんを検証する", async () => {
  const now = Date.UTC(2026, 8, 1);
  const token = await createSessionToken("guest", secret, {
    now,
    maxAgeSeconds: 60,
  });
  assert.equal(await verifySessionToken(token, "guest", secret, now + 30_000), true);
  assert.equal(await verifySessionToken(token, "admin", secret, now + 30_000), false);
  assert.equal(await verifySessionToken(`${token}x`, "guest", secret, now + 30_000), false);
  assert.equal(await verifySessionToken(token, "guest", secret, now + 61_000), false);
});

test("アクセスコード比較と必須設定を確認する", async () => {
  assert.equal(await secureCredentialEqual("same-code", "same-code"), true);
  assert.equal(await secureCredentialEqual("same-code", "other-code"), false);

  const configured = getPhotoRuntimeConfig({
    PHOTO_ACCESS_CODE: "guest",
    PHOTO_ADMIN_CODE: "admin",
    PHOTO_SESSION_SECRET: secret,
  } as never);
  assert.equal(configured.configured, true);
  assert.equal(configured.maxFileBytes, 20_000_000);
  assert.equal(configured.maxFilesPerBatch, 20);
  assert.equal(configured.variantMode, "transform");

  const originalVariants = getPhotoRuntimeConfig({
    PHOTO_ACCESS_CODE: "guest",
    PHOTO_ADMIN_CODE: "admin",
    PHOTO_SESSION_SECRET: secret,
    PHOTO_VARIANT_MODE: "original",
  } as never);
  assert.equal(originalVariants.variantMode, "original");

  const missingSecret = getPhotoRuntimeConfig({
    PHOTO_ACCESS_CODE: "guest",
    PHOTO_ADMIN_CODE: "admin",
  } as never);
  assert.equal(missingSecret.configured, false);

  const sharedCredential = getPhotoRuntimeConfig({
    PHOTO_ACCESS_CODE: "same-code",
    PHOTO_ADMIN_CODE: "same-code",
    PHOTO_SESSION_SECRET: secret,
  } as never);
  assert.equal(sharedCredential.configured, false);
});
