import { EXPERIENCE_CONFIG, EXPERIENCE_SETTINGS, PLACEHOLDER_URL } from "./config.js";
import { bindContent, setupPlaceholderLinks } from "./modules/content.js";
import { setupCurtain } from "./modules/curtain.js";
import { setupScratch } from "./modules/scratch.js";
import { setupRevealObserver } from "./modules/reveal.js";

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const invitationSection = document.querySelector("#invitation");
const chaptersSection = document.querySelector("#chapters");
const okinawaSection = document.querySelector("#okinawa");
const ceremonySection = document.querySelector("#ceremony");
const partySection = document.querySelector("#party");
const datePanel = document.querySelector("[data-date-panel]");
const scrollWhisper = document.querySelector("[data-scroll-whisper]");
const postScratchSections = [chaptersSection, okinawaSection, ceremonySection, partySection].filter(Boolean);

function unlockSection(section) {
  if (!section) {
    return;
  }

  if (section.hidden) {
    section.hidden = false;
  }

  section.classList.remove("is-locked");
}

function revealDatePanel() {
  if (!datePanel || !datePanel.hidden) {
    return;
  }

  datePanel.hidden = false;

  window.requestAnimationFrame(() => {
    datePanel.classList.add("is-visible");
  });
}

function revealScrollWhisper() {
  if (!scrollWhisper || !scrollWhisper.hidden) {
    return;
  }

  scrollWhisper.hidden = false;

  window.requestAnimationFrame(() => {
    scrollWhisper.classList.add("is-visible");
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
      document.body.classList.add("is-revealed");
      revealDatePanel();
      revealScrollWhisper();

      postScratchSections.forEach((section) => {
        unlockSection(section);
        revealController.observeAll(section.querySelectorAll("[data-reveal]"));
      });
    }
  });

  setupCurtain({
    introDelay: EXPERIENCE_SETTINGS.curtainIntroDelay,
    preludeDuration: EXPERIENCE_SETTINGS.curtainPreludeDuration,
    openDuration: EXPERIENCE_SETTINGS.curtainOpenDuration,
    revealDelay: EXPERIENCE_SETTINGS.curtainRevealDelay,
    onComplete: () => {
      document.body.classList.add("is-opened");
      unlockSection(invitationSection);
      revealController.observeAll(invitationSection?.querySelectorAll("[data-reveal]") ?? []);

      window.requestAnimationFrame(() => {
        scratchController?.refresh?.();
      });

      window.setTimeout(() => {
        invitationSection?.scrollIntoView({
          behavior: prefersReducedMotion ? "auto" : "smooth",
          block: "start"
        });
      }, prefersReducedMotion ? 0 : EXPERIENCE_SETTINGS.curtainScrollDelay);
    }
  });
}

initializeExperience();
