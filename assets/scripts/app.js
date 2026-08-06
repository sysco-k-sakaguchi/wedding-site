import { EXPERIENCE_CONFIG, EXPERIENCE_SETTINGS, PLACEHOLDER_URL } from "./config.js";
import { bindContent, getLocaleConfig, setupPlaceholderLinks } from "./modules/content.js";
import { setupCurtain } from "./modules/curtain.js";
import { setupPhotoGallery } from "./modules/photo-gallery.js";
import { setupPhotoLightbox } from "./modules/photo-lightbox.js";
import { setupRevealObserver } from "./modules/reveal.js";
import { setupScratch } from "./modules/scratch.js";

function initializeExperience() {
  const supportedLocales = Object.keys(EXPERIENCE_CONFIG.locales);
  const requestedLocale = new URLSearchParams(window.location.search).get("lang");
  let currentLocale = supportedLocales.includes(requestedLocale)
    ? requestedLocale
    : EXPERIENCE_CONFIG.defaultLocale;

  function setLocale(locale, { updateUrl = true } = {}) {
    currentLocale = supportedLocales.includes(locale)
      ? locale
      : EXPERIENCE_CONFIG.defaultLocale;

    bindContent(EXPERIENCE_CONFIG, currentLocale);

    if (updateUrl) {
      const url = new URL(window.location.href);

      url.searchParams.set("lang", currentLocale);
      window.history.replaceState({}, "", url);
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

  const scratchController = setupScratch({
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

  setupCurtain({
    introDelay: EXPERIENCE_SETTINGS.curtainIntroDelay,
    preludeDuration: EXPERIENCE_SETTINGS.curtainPreludeDuration,
    openDuration: EXPERIENCE_SETTINGS.curtainOpenDuration,
    holdDuration: EXPERIENCE_SETTINGS.curtainOpenHoldDuration,
    onComplete() {
      scratchController.activate(currentLocale);
    }
  });
}

initializeExperience();
