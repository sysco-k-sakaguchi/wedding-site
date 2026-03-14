import { EXPERIENCE_CONFIG, EXPERIENCE_SETTINGS, PLACEHOLDER_URL } from "./config.js";
import { bindContent, setupPlaceholderLinks } from "./modules/content.js";
import { setupCurtain } from "./modules/curtain.js";
import { setupScratch } from "./modules/scratch.js";
import { setupCountdown } from "./modules/countdown.js";
import { setupRevealObserver } from "./modules/reveal.js";

// app.js は全体の進行管理だけを担当し、
// 個別演出の中身は modules 配下へ分けています。
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const floatingNav = document.querySelector("[data-floating-nav]");
const invitationSection = document.querySelector("#invitation");
const countdownSection = document.querySelector("#countdown");
const detailsSection = document.querySelector("#details");
const rsvpSection = document.querySelector("#rsvp");

// hidden で隠していた次のシーンを表示して、必要ならそこまでスクロールします。
function unlockSection(section, options = {}) {
  if (!section) {
    return;
  }

  if (section.hidden) {
    section.hidden = false;
    section.classList.remove("is-locked");
  }

  if (options.scroll) {
    window.setTimeout(() => {
      section.scrollIntoView({
        behavior: prefersReducedMotion ? "auto" : "smooth",
        block: "start"
      });
    }, options.delay ?? 120);
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

  setupCurtain({
    threshold: EXPERIENCE_SETTINGS.curtainOpenThreshold,
    onComplete: () => {
      unlockSection(invitationSection, { scroll: true, delay: 180 });
      revealController.observeAll(invitationSection?.querySelectorAll("[data-reveal]") ?? []);

      window.requestAnimationFrame(() => {
        scratchController?.refresh?.();
      });
    }
  });

  const scratchController = setupScratch({
    completeRatio: EXPERIENCE_SETTINGS.scratchCompleteRatio,
    brushSize: EXPERIENCE_SETTINGS.scratchBrushSize,
    onReveal: () => {
      showFloatingNav();
      unlockSection(countdownSection);
      unlockSection(detailsSection);
      unlockSection(rsvpSection);

      revealController.observeAll(countdownSection?.querySelectorAll("[data-reveal]") ?? []);
      revealController.observeAll(detailsSection?.querySelectorAll("[data-reveal]") ?? []);
      revealController.observeAll(rsvpSection?.querySelectorAll("[data-reveal]") ?? []);

      window.setTimeout(() => {
        countdownSection?.scrollIntoView({
          behavior: prefersReducedMotion ? "auto" : "smooth",
          block: "start"
        });
      }, 220);
    }
  });

  window.requestAnimationFrame(() => {
    scratchController?.refresh?.();
  });

  setupCountdown(EXPERIENCE_CONFIG);
}

initializeExperience();
