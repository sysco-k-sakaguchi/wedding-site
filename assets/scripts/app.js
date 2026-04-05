import { EXPERIENCE_CONFIG, PLACEHOLDER_URL } from "./config.js";
import { bindContent, setupPlaceholderLinks } from "./modules/content.js";
import { setupRevealObserver } from "./modules/reveal.js";

function initializeExperience() {
  bindContent(EXPERIENCE_CONFIG);
  setupPlaceholderLinks({
    placeholderValue: PLACEHOLDER_URL
  });

  const revealController = setupRevealObserver();
  revealController.observeAll(document.querySelectorAll("[data-reveal]"));
}

initializeExperience();
