import { setupPhotoLightbox } from "./modules/photo-lightbox.js";

const GALLERY_NAVIGATION_PROOF_KEY = "weddingGalleryNavigationProof:v1";
const GALLERY_NAVIGATION_PROOF_PARAM = "returnToken";
const GALLERY_NAVIGATION_PROOF_MAX_AGE = 2 * 60 * 1000;
const galleryParams = new URLSearchParams(window.location.search);
const requestedLanguage = galleryParams.get("lang");
const openedFromMain = galleryParams.get("from") === "main";
const returnToken = galleryParams.get(GALLERY_NAVIGATION_PROOF_PARAM);

function consumeGalleryNavigationProof() {
  let storedProof = null;

  try {
    storedProof = window.sessionStorage.getItem(GALLERY_NAVIGATION_PROOF_KEY);
    window.sessionStorage.removeItem(GALLERY_NAVIGATION_PROOF_KEY);
  } catch {
    return false;
  }

  if (!openedFromMain || !returnToken || !storedProof || window.history.length < 2) {
    return false;
  }

  try {
    const proof = JSON.parse(storedProof);
    const createdAt = Number(proof.createdAt);
    const proofAge = Date.now() - createdAt;
    const currentUrl = new URL(window.location.href);
    const referrerUrl = new URL(document.referrer);

    currentUrl.searchParams.delete(GALLERY_NAVIGATION_PROOF_PARAM);
    currentUrl.hash = "";
    referrerUrl.hash = "";

    return (
      proof.token === returnToken &&
      proof.source === referrerUrl.href &&
      proof.target === currentUrl.href &&
      Number.isFinite(createdAt) &&
      proofAge >= 0 &&
      proofAge <= GALLERY_NAVIGATION_PROOF_MAX_AGE
    );
  } catch {
    return false;
  }
}

let canReturnWithHistory = consumeGalleryNavigationProof();

if (returnToken) {
  const sanitizedUrl = new URL(window.location.href);

  sanitizedUrl.searchParams.delete(GALLERY_NAVIGATION_PROOF_PARAM);
  window.history.replaceState(window.history.state, "", sanitizedUrl);
}

document.querySelectorAll("[data-gallery-back]").forEach((link) => {
  link.setAttribute(
    "href",
    requestedLanguage === "en"
      ? "./?lang=en&from=gallery#okinawa"
      : "./?lang=ja&from=gallery#okinawa"
  );

  link.addEventListener("click", (event) => {
    if (!canReturnWithHistory) {
      return;
    }

    event.preventDefault();
    canReturnWithHistory = false;
    window.history.back();
  });
});

if (requestedLanguage === "en") {
  document.title = "Photo Gallery | Masato & Haruka";
}

if (requestedLanguage === "en") {
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
