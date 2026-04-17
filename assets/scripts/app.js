import { EXPERIENCE_CONFIG, EXPERIENCE_SETTINGS, PLACEHOLDER_URL } from "./config.js";
import { bindContent, setupPlaceholderLinks } from "./modules/content.js";
import { setupCurtain } from "./modules/curtain.js";
import { setupRevealObserver } from "./modules/reveal.js";

function initializeExperience() {
  bindContent(EXPERIENCE_CONFIG);
  setupPlaceholderLinks({
    placeholderValue: PLACEHOLDER_URL
  });

  const revealController = setupRevealObserver();
  revealController.observeAll(document.querySelectorAll("[data-reveal]"));

  setupCurtain({
    introDelay: EXPERIENCE_SETTINGS.curtainIntroDelay,
    preludeDuration: EXPERIENCE_SETTINGS.curtainPreludeDuration,
    openDuration: EXPERIENCE_SETTINGS.curtainOpenDuration,
    revealDelay: EXPERIENCE_SETTINGS.curtainRevealDelay
  });
}

initializeExperience();
