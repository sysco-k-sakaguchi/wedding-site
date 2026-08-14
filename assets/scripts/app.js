import { EXPERIENCE_CONFIG, EXPERIENCE_SETTINGS, PLACEHOLDER_URL } from "./config.js?v=20260814-4";
import { bindContent, getLocaleConfig, setupPlaceholderLinks } from "./modules/content.js?v=20260814-4";
import { setupCurtain } from "./modules/curtain.js?v=20260814-4";
import { setupPhotoGallery } from "./modules/photo-gallery.js?v=20260814-4";
import { setupPhotoLightbox } from "./modules/photo-lightbox.js?v=20260814-4";
import { setupRevealObserver } from "./modules/reveal.js?v=20260814-4";
import { setupScratch } from "./modules/scratch.js?v=20260814-4";

const GALLERY_RETURN_STATE_KEY = "weddingGalleryReturn";
const GALLERY_NAVIGATION_PROOF_KEY = "weddingGalleryNavigationProof:v1";
const GALLERY_NAVIGATION_PROOF_PARAM = "returnToken";

function createGalleryNavigationToken() {
  if (typeof window.crypto?.randomUUID === "function") {
    return window.crypto.randomUUID();
  }

  const randomValues = new Uint32Array(4);
  window.crypto?.getRandomValues?.(randomValues);

  return `${Date.now()}-${Array.from(randomValues, (value) => value.toString(36)).join("-")}`;
}

function rememberGalleryNavigation(galleryUrl) {
  galleryUrl.searchParams.delete(GALLERY_NAVIGATION_PROOF_PARAM);

  if (galleryUrl.origin !== window.location.origin) {
    return;
  }

  const token = createGalleryNavigationToken();
  const sourceUrl = new URL(window.location.href);
  const targetUrl = new URL(galleryUrl);

  sourceUrl.hash = "";
  targetUrl.hash = "";

  try {
    window.sessionStorage.setItem(
      GALLERY_NAVIGATION_PROOF_KEY,
      JSON.stringify({
        token,
        source: sourceUrl.href,
        target: targetUrl.href,
        createdAt: Date.now()
      })
    );
    galleryUrl.searchParams.set(GALLERY_NAVIGATION_PROOF_PARAM, token);
  } catch {
    // Storage can be unavailable in restricted browsing modes. The Gallery
    // back link will safely fall back to an explicit Wedding Top URL.
  }
}

function clearGalleryNavigationProof() {
  try {
    window.sessionStorage.removeItem(GALLERY_NAVIGATION_PROOF_KEY);
  } catch {
    // No cleanup is needed when sessionStorage itself is unavailable.
  }
}

function isSameTabGalleryNavigation(event, link) {
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

function initializeExperience() {
  const supportedLocales = Object.keys(EXPERIENCE_CONFIG.locales);
  const initialUrl = new URL(window.location.href);
  const requestedLocale = initialUrl.searchParams.get("lang");
  const galleryReturnState = window.history.state?.[GALLERY_RETURN_STATE_KEY];
  const savedGalleryScroll = Number(galleryReturnState?.scrollY);
  const isGalleryReturn =
    initialUrl.searchParams.get("from") === "gallery" ||
    Boolean(galleryReturnState) ||
    Number.isFinite(savedGalleryScroll);
  let galleryReturnRestorationScheduled = false;
  let currentLocale = supportedLocales.includes(requestedLocale)
    ? requestedLocale
    : EXPERIENCE_CONFIG.defaultLocale;

  function restoreGalleryReturnScroll() {
    if (galleryReturnRestorationScheduled) {
      return;
    }

    const savedScroll = Number(window.history.state?.[GALLERY_RETURN_STATE_KEY]?.scrollY);

    if (!Number.isFinite(savedScroll) || savedScroll < 0) {
      return;
    }

    galleryReturnRestorationScheduled = true;
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const documentElement = document.documentElement;
        const previousInlineScrollBehavior = documentElement.style.scrollBehavior;

        documentElement.style.scrollBehavior = "auto";
        window.scrollTo({
          top: savedScroll,
          left: 0,
          behavior: "auto"
        });
        const nextHistoryState = { ...(window.history.state ?? {}) };

        nextHistoryState[GALLERY_RETURN_STATE_KEY] = { returned: true };
        window.history.replaceState(nextHistoryState, "", window.location.href);
        window.requestAnimationFrame(() => {
          if (previousInlineScrollBehavior) {
            documentElement.style.scrollBehavior = previousInlineScrollBehavior;
          } else {
            documentElement.style.removeProperty("scroll-behavior");
          }

          galleryReturnRestorationScheduled = false;
        });
      });
    });
  }

  function setLocale(locale, { updateUrl = true } = {}) {
    currentLocale = supportedLocales.includes(locale)
      ? locale
      : EXPERIENCE_CONFIG.defaultLocale;

    bindContent(EXPERIENCE_CONFIG, currentLocale);

    if (updateUrl) {
      const url = new URL(window.location.href);

      url.searchParams.set("lang", currentLocale);
      window.history.replaceState(window.history.state, "", url);
    }
  }

  setLocale(currentLocale, { updateUrl: false });
  setupPlaceholderLinks({
    placeholderValue: PLACEHOLDER_URL,
    getMessage() {
      return getLocaleConfig(EXPERIENCE_CONFIG, currentLocale).copy.placeholderAlert;
    }
  });

  const revealController = setupRevealObserver();
  revealController.observeAll(document.querySelectorAll("[data-reveal]"));

  setupPhotoGallery();
  setupPhotoLightbox();

  document.querySelector("[data-gallery-link]")?.addEventListener("click", (event) => {
    const link = event.currentTarget;
    const galleryUrl = new URL(link.href, window.location.href);
    const isSameTabNavigation = isSameTabGalleryNavigation(event, link);

    galleryUrl.searchParams.set("from", "main");
    clearGalleryNavigationProof();

    if (isSameTabNavigation) {
      rememberGalleryNavigation(galleryUrl);
      window.history.replaceState(
        {
          ...(window.history.state ?? {}),
          [GALLERY_RETURN_STATE_KEY]: { scrollY: window.scrollY }
        },
        "",
        window.location.href
      );
    } else {
      galleryUrl.searchParams.delete(GALLERY_NAVIGATION_PROOF_PARAM);
    }

    link.href = galleryUrl;
  });

  window.addEventListener("pageshow", () => {
    if (Number.isFinite(Number(window.history.state?.[GALLERY_RETURN_STATE_KEY]?.scrollY))) {
      restoreGalleryReturnScroll();
    }
  });

  const scratchController = isGalleryReturn
    ? null
    : setupScratch({
        completeRatio: EXPERIENCE_SETTINGS.scratchCompleteRatio,
        brushSize: EXPERIENCE_SETTINGS.scratchBrushSize,
        gestureDistance: EXPERIENCE_SETTINGS.scratchGestureDistance,
        revealDelay: EXPERIENCE_SETTINGS.scratchRevealDelay,
        onReveal(locale) {
          setLocale(locale);
        }
      });

  const languageSwitch = document.querySelector("[data-language-switch]");

  languageSwitch?.addEventListener("click", () => {
    setLocale(currentLocale === "ja" ? "en" : "ja");
  });

  window.addEventListener("popstate", () => {
    const historyLocale = new URLSearchParams(window.location.search).get("lang");

    if (supportedLocales.includes(historyLocale)) {
      setLocale(historyLocale, { updateUrl: false });
    }
  });

  if (isGalleryReturn) {
    document.body.classList.add("is-curtain-opened");

    if (languageSwitch) {
      languageSwitch.hidden = false;
    }

    initialUrl.searchParams.delete("from");
    const galleryReturnHistoryState = { ...(window.history.state ?? {}) };

    if (!galleryReturnHistoryState[GALLERY_RETURN_STATE_KEY]) {
      galleryReturnHistoryState[GALLERY_RETURN_STATE_KEY] = { returned: true };
    }

    window.history.replaceState(galleryReturnHistoryState, "", initialUrl);
    restoreGalleryReturnScroll();
  } else {
    setupCurtain({
      introDelay: EXPERIENCE_SETTINGS.curtainIntroDelay,
      preludeDuration: EXPERIENCE_SETTINGS.curtainPreludeDuration,
      openDuration: EXPERIENCE_SETTINGS.curtainOpenDuration,
      holdDuration: EXPERIENCE_SETTINGS.curtainOpenHoldDuration,
      onComplete() {
        scratchController?.activate(currentLocale);
      }
    });
  }
}

initializeExperience();
