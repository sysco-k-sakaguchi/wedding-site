import { EXPERIENCE_CONFIG, EXPERIENCE_SETTINGS, PLACEHOLDER_URL } from "./config.js";
import { bindContent, setupPlaceholderLinks } from "./modules/content.js";
import { setupCurtain } from "./modules/curtain.js";
import { setupScratch } from "./modules/scratch.js";
import { setupCountdown } from "./modules/countdown.js";
import { setupRevealObserver } from "./modules/reveal.js";

// app.js は全体の進行管理だけを担当し、
// 個別演出の中身は modules 配下へ分けています。
const floatingNav = document.querySelector("[data-floating-nav]");
const invitationSection = document.querySelector("#invitation");
const countdownSection = document.querySelector("#countdown");
const detailsSection = document.querySelector("#details");
const rsvpSection = document.querySelector("#rsvp");

// hidden で隠していた次のシーンを表示します。
function unlockSection(section) {
  if (!section) {
    return;
  }

  if (section.hidden) {
    section.hidden = false;
    section.classList.remove("is-locked");
  }
}

function showFloatingNav() {
  if (!floatingNav || !floatingNav.hidden) {
    return;
  }

  floatingNav.hidden = false;

  window.requestAnimationFrame(() => {
    floatingNav.classList.add("is-visible");
  });
}

function initializeExperience() {
  bindContent(EXPERIENCE_CONFIG);
  setupPlaceholderLinks({
    placeholderValue: PLACEHOLDER_URL
  });

  const revealController = setupRevealObserver();
  revealController.observeAll(document.querySelectorAll(".scene:not([hidden]) [data-reveal]"));

  const scratchController = setupScratch({
    completeRatio: EXPERIENCE_SETTINGS.scratchCompleteRatio,
    brushSize: EXPERIENCE_SETTINGS.scratchBrushSize,
    gestureDistance: EXPERIENCE_SETTINGS.scratchGestureDistance,
    revealDelay: EXPERIENCE_SETTINGS.scratchRevealDelay,
    onReveal: () => {
      showFloatingNav();
      unlockSection(countdownSection);
      unlockSection(detailsSection);
      unlockSection(rsvpSection);

      revealController.observeAll(countdownSection?.querySelectorAll("[data-reveal]") ?? []);
      revealController.observeAll(detailsSection?.querySelectorAll("[data-reveal]") ?? []);
      revealController.observeAll(rsvpSection?.querySelectorAll("[data-reveal]") ?? []);
    }
  });

  setupCurtain({
    introDelay: EXPERIENCE_SETTINGS.curtainIntroDelay,
    openDuration: EXPERIENCE_SETTINGS.curtainOpenDuration,
    revealDelay: EXPERIENCE_SETTINGS.curtainRevealDelay,
    onComplete: () => {
      unlockSection(invitationSection);
      revealController.observeAll(invitationSection?.querySelectorAll("[data-reveal]") ?? []);

      window.requestAnimationFrame(() => {
        scratchController?.refresh?.();
      });
    }
  });

  window.requestAnimationFrame(() => {
    scratchController?.refresh?.();
  });

  setupCountdown(EXPERIENCE_CONFIG);
}

initializeExperience();
