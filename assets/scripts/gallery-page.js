import { setupPhotoLightbox } from "./modules/photo-lightbox.js?v=20260814-5";

const GALLERY_NAVIGATION_PROOF_KEY = "weddingGalleryNavigationProof:v1";
const GALLERY_RETURN_REQUEST_KEY = "weddingGalleryReturnRequest:v1";
const GALLERY_NAVIGATION_PROOF_PARAM = "returnToken";
const GALLERY_RETURN_HISTORY_KEY = "weddingGalleryReturnProof:v1";
const GALLERY_NAVIGATION_PROOF_MAX_AGE = 24 * 60 * 60 * 1000;
const galleryParams = new URLSearchParams(window.location.search);
const requestedLanguage = galleryParams.get("lang");
const openedFromMain = galleryParams.get("from") === "main";
const returnToken = galleryParams.get(GALLERY_NAVIGATION_PROOF_PARAM);

function normalizeGalleryUrl(value) {
  const url = new URL(value, window.location.href);

  url.searchParams.delete(GALLERY_NAVIGATION_PROOF_PARAM);
  url.hash = "";
  return url;
}

function isValidReturnRecord(record, currentGalleryUrl, expectedToken = null) {
  if (!record || typeof record !== "object") {
    return false;
  }

  try {
    const createdAt = record.createdAt;
    const proofAge = Date.now() - createdAt;
    const scrollY = record.scrollY;
    const sourceUrl = new URL(record.source);
    const targetUrl = normalizeGalleryUrl(record.target);

    return (
      typeof record.token === "string" &&
      record.token.length > 0 &&
      (!expectedToken || record.token === expectedToken) &&
      typeof record.source === "string" &&
      typeof record.target === "string" &&
      sourceUrl.origin === window.location.origin &&
      targetUrl.origin === window.location.origin &&
      targetUrl.href === currentGalleryUrl.href &&
      typeof scrollY === "number" &&
      Number.isFinite(scrollY) &&
      scrollY >= 0 &&
      typeof createdAt === "number" &&
      Number.isFinite(createdAt) &&
      proofAge >= 0 &&
      proofAge <= GALLERY_NAVIGATION_PROOF_MAX_AGE
    );
  } catch {
    return false;
  }
}

function readStoredNavigationProof() {
  try {
    const storedProof = window.sessionStorage.getItem(GALLERY_NAVIGATION_PROOF_KEY);

    return storedProof ? JSON.parse(storedProof) : null;
  } catch {
    return null;
  }
}

function clearStoredNavigationProof() {
  try {
    window.sessionStorage.removeItem(GALLERY_NAVIGATION_PROOF_KEY);
  } catch {
    // No cleanup is needed when sessionStorage itself is unavailable.
  }
}

function readHistoryReturnRecord() {
  return window.history.state?.[GALLERY_RETURN_HISTORY_KEY] ?? null;
}

function getValidHistoryReturnRecord() {
  const record = readHistoryReturnRecord();

  return openedFromMain && isValidReturnRecord(record, currentGalleryUrl)
    ? record
    : null;
}

function storeReturnRequest(record) {
  try {
    window.sessionStorage.setItem(GALLERY_RETURN_REQUEST_KEY, JSON.stringify(record));
    return true;
  } catch {
    return false;
  }
}

function createVerifiedWeddingTopUrl(record) {
  if (!isValidReturnRecord(record, currentGalleryUrl)) {
    return null;
  }

  try {
    const url = new URL(record.source);

    if (url.origin !== window.location.origin) {
      return null;
    }

    url.searchParams.set("from", "gallery");
    url.searchParams.set(GALLERY_NAVIGATION_PROOF_PARAM, record.token);
    url.hash = "okinawa";
    return url;
  } catch {
    return null;
  }
}

const currentGalleryUrl = normalizeGalleryUrl(window.location.href);
const storedProof = readStoredNavigationProof();
const hasValidStoredProof = Boolean(
  openedFromMain &&
  returnToken &&
  isValidReturnRecord(storedProof, currentGalleryUrl, returnToken)
);

if (hasValidStoredProof) {
  window.history.replaceState(
    {
      ...(window.history.state ?? {}),
      [GALLERY_RETURN_HISTORY_KEY]: storedProof
    },
    "",
    currentGalleryUrl
  );
} else if (returnToken) {
  window.history.replaceState(window.history.state, "", currentGalleryUrl);
}

clearStoredNavigationProof();

let returnNavigationPending = false;

function getWeddingTopHref() {
  return requestedLanguage === "en"
    ? "./index.html?lang=en&from=gallery#okinawa"
    : "./index.html?lang=ja&from=gallery#okinawa";
}

function isPlainPrimaryNavigation(event, link) {
  const target = link.getAttribute("target")?.toLowerCase();

  return (
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey &&
    (!target || target === "_self") &&
    !link.hasAttribute("download")
  );
}

document.querySelectorAll("[data-gallery-back]").forEach((link) => {
  link.setAttribute("href", getWeddingTopHref());

  link.addEventListener("click", (event) => {
    if (!isPlainPrimaryNavigation(event, link)) {
      return;
    }

    if (returnNavigationPending) {
      event.preventDefault();
      return;
    }

    const returnRecord = getValidHistoryReturnRecord();
    const verifiedReturnUrl = createVerifiedWeddingTopUrl(returnRecord);
    const destinationUrl = verifiedReturnUrl && storeReturnRequest(returnRecord)
      ? verifiedReturnUrl.href
      : link.href;

    event.preventDefault();
    returnNavigationPending = true;
    window.location.replace(destinationUrl);
  });
});

window.addEventListener("pageshow", () => {
  returnNavigationPending = false;
});

if (requestedLanguage === "en") {
  document.title = "Photo Gallery | Masato & Haruka";
  document.documentElement.lang = "en";

  document.querySelectorAll("[data-gallery-copy-ja]").forEach((element) => {
    element.hidden = true;
  });

  document.querySelectorAll("[data-gallery-copy-en]").forEach((element) => {
    element.hidden = false;
  });

  document.querySelectorAll("[data-photo-image]").forEach((image) => {
    if (image.dataset.photoAltEn) {
      image.alt = image.dataset.photoAltEn;
    }

    const trigger = image.closest("[data-photo-expand]");
    if (trigger) {
      trigger.setAttribute("aria-label", `Enlarge photo: ${image.alt}`);
    }
  });

  document.querySelector("[data-photo-lightbox]")?.setAttribute("aria-label", "Enlarged photo view");
  document.querySelector("[data-photo-lightbox-close]")?.setAttribute("aria-label", "Close enlarged photo");
  document.querySelector("[data-photo-lightbox-previous]")?.setAttribute("aria-label", "Show previous photo");
  document.querySelector("[data-photo-lightbox-next]")?.setAttribute("aria-label", "Show next photo");
  document.querySelector("[data-gallery-grid]")?.setAttribute("aria-label", "17 wedding photos");
}

setupPhotoLightbox();
