function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function easeOutCubic(value) {
  return 1 - Math.pow(1 - value, 3);
}

function easeInOutSine(value) {
  return -(Math.cos(Math.PI * value) - 1) / 2;
}

export function setupCurtain({
  introDelay = 180,
  openDuration = 1180,
  revealDelay = 140,
  onComplete
} = {}) {
  const hero = document.querySelector("[data-curtain-root]");
  const stage = hero?.querySelector("[data-curtain-stage]");
  const heroTargets = hero?.querySelectorAll(".hero__content, .hero__summary") ?? [];
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (!hero || !stage) {
    return;
  }

  let animationFrameId = 0;
  let startTimerId = 0;
  let finished = false;

  function applyState({
    open = 0,
    glow = 0,
    lift = 0
  }) {
    hero.style.setProperty("--intro-open", open.toFixed(4));
    hero.style.setProperty("--intro-glow", glow.toFixed(4));
    hero.style.setProperty("--intro-lift", lift.toFixed(4));
  }

  function revealHero() {
    heroTargets.forEach((target) => {
      target.classList.add("is-visible");
    });
  }

  function finishIntro({ immediate = false } = {}) {
    if (finished) {
      return;
    }

    finished = true;
    window.clearTimeout(startTimerId);
    window.cancelAnimationFrame(animationFrameId);
    applyState({
      open: 1,
      glow: 0,
      lift: 1
    });
    revealHero();
    hero.classList.remove("is-intro-active");
    stage.classList.add("is-complete");

    const hideDelay = immediate ? 0 : Math.max(revealDelay, 320);

    window.setTimeout(() => {
      stage.hidden = true;
      onComplete?.();
    }, hideDelay);
  }

  function playIntro() {
    const startTime = performance.now();

    function step(now) {
      const progress = clamp((now - startTime) / openDuration);
      const open = easeInOutSine(progress);
      const glow = clamp(Math.sin(progress * Math.PI) * 0.72 + (1 - open) * 0.18);
      const lift = easeOutCubic(progress);

      applyState({
        open,
        glow,
        lift
      });

      if (progress < 1) {
        animationFrameId = window.requestAnimationFrame(step);
        return;
      }

      finishIntro();
    }

    animationFrameId = window.requestAnimationFrame(step);
  }

  stage.hidden = false;
  hero.classList.add("is-intro-active");
  applyState({
    open: 0,
    glow: 0.22,
    lift: 0
  });
  revealHero();

  if (prefersReducedMotion) {
    finishIntro({
      immediate: true
    });
    return {
      finish: finishIntro
    };
  }

  startTimerId = window.setTimeout(playIntro, introDelay);

  return {
    finish: finishIntro
  };
}
