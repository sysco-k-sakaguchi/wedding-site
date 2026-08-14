import { setupPhotoLightbox } from "./modules/photo-lightbox.js?v=20260814-4";

const GALLERY_NAVIGATION_PROOF_KEY = "weddingGalleryNavigationProof:v1";
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
    const createdAt = Number(record.createdAt);
    const proofAge = Date.now() - createdAt;
    const sourceUrl = new URL(record.source);
    const targetUrl = normalizeGalleryUrl(record.target);

    return (
      (!expectedToken || record.token === expectedToken) &&
      sourceUrl.origin === window.location.origin &&
      targetUrl.origin === window.location.origin &&
      targetUrl.href === currentGalleryUrl.href &&
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

function canUseHistoryReturn() {
  return (
    openedFromMain &&
    window.history.length >= 2 &&
    isValidReturnRecord(
      readHistoryReturnRecord(),
      normalizeGalleryUrl(window.location.href)
    )
  );
}

const currentGalleryUrl = normalizeGalleryUrl(window.location.href);
const storedProof = readStoredNavigationProof();
const hasValidStoredProof = Boolean(
  openedFromMain &&
  returnToken &&
  window.history.length >= 2 &&
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

let canReturnWithHistory = hasValidStoredProof || canUseHistoryReturn();
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

    if (!canReturnWithHistory) {
      return;
    }

    event.preventDefault();
    canReturnWithHistory = false;
    returnNavigationPending = true;

    const galleryUrlBeforeBack = window.location.href;
    const fallbackUrl = link.href;
    let fallbackTimer;
    const cancelFallback = () => {
      window.clearTimeout(fallbackTimer);
    };

    window.addEventListener("pagehide", cancelFallback, { once: true });
    fallbackTimer = window.setTimeout(() => {
      window.removeEventListener("pagehide", cancelFallback);

      if (window.location.href === galleryUrlBeforeBack) {
        window.location.replace(fallbackUrl);
      }
    }, 1500);

    window.history.back();
  });
});

window.addEventListener("pageshow", () => {
  canReturnWithHistory = canUseHistoryReturn();
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
