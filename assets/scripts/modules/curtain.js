function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function easeInOutCubic(value) {
  if (value < 0.5) {
    return 4 * value * value * value;
  }

  return 1 - Math.pow(-2 * value + 2, 3) / 2;
}

function easeOutCubic(value) {
  return 1 - Math.pow(1 - value, 3);
}

export function setupCurtain({
  introDelay = 1500,
  preludeDuration = 760,
  openDuration = 2550,
  revealDelay = 320,
  onComplete
} = {}) {
  const stage = document.querySelector("[data-curtain-stage]");
  const caption = document.querySelector("[data-curtain-caption]");
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (!stage) {
    return;
  }

  let started = false;
  let completed = false;
  let animationFrameId = 0;
  let autoStartTimer = 0;

  function updateCaption(text) {
    if (caption) {
      caption.textContent = text;
    }
  }

  function applyState({
    open = 0,
    reveal = 0,
    glow = 0.32,
    leftSway = 0,
    rightSway = 0
  }) {
    stage.style.setProperty("--curtain-open", open.toFixed(4));
    stage.style.setProperty("--curtain-reveal", reveal.toFixed(4));
    stage.style.setProperty("--curtain-glow", glow.toFixed(4));
    stage.style.setProperty("--left-sway", leftSway.toFixed(4));
    stage.style.setProperty("--right-sway", rightSway.toFixed(4));
  }

  function finishCurtain() {
    if (completed) {
      return;
    }

    completed = true;
    window.clearTimeout(autoStartTimer);
    window.cancelAnimationFrame(animationFrameId);

    stage.classList.remove("is-anticipating", "is-opening");
    stage.classList.add("is-open");
    stage.style.setProperty("--press", "0");

    applyState({
      open: 1,
      reveal: 1,
      glow: 1,
      leftSway: 0,
      rightSway: 0
    });

    updateCaption("招待状が静かに届きました。");

    window.setTimeout(() => {
      onComplete?.();
    }, revealDelay);
  }

  function runOpening() {
    stage.classList.remove("is-anticipating");
    stage.classList.add("is-opening");
    updateCaption("幕がゆっくりほどけ、招待状が現れます。");

    const startTime = performance.now();
    let highlightedReveal = false;

    function settleMotion() {
      const settleStart = performance.now();
      const settleDuration = 920;

      function settleFrame(now) {
        const progress = clamp((now - settleStart) / settleDuration);
        const residue = Math.sin(progress * Math.PI * 2.2) * Math.pow(1 - progress, 2.2) * 0.05;

        applyState({
          open: 1,
          reveal: 1,
          glow: 1,
          leftSway: residue,
          rightSway: -residue * 0.92
        });

        if (progress < 1) {
          animationFrameId = window.requestAnimationFrame(settleFrame);
          return;
        }

        finishCurtain();
      }

      animationFrameId = window.requestAnimationFrame(settleFrame);
    }

    function step(now) {
      const progress = clamp((now - startTime) / openDuration);
      const open = easeInOutCubic(progress);
      const reveal = easeOutCubic(clamp((progress - 0.24) / 0.76));
      const resonance = Math.sin(progress * Math.PI * 4.4) * Math.pow(1 - progress, 1.7) * 0.085;

      applyState({
        open,
        reveal,
        glow: 0.34 + reveal * 0.66,
        leftSway: resonance,
        rightSway: -resonance * 0.9
      });

      if (!highlightedReveal && progress > 0.62) {
        highlightedReveal = true;
        updateCaption("その先に、招待状が静かに現れます。");
      }

      if (progress < 1) {
        animationFrameId = window.requestAnimationFrame(step);
        return;
      }

      settleMotion();
    }

    animationFrameId = window.requestAnimationFrame(step);
  }

  function startSequence({ manual = false } = {}) {
    if (started || completed) {
      return;
    }

    started = true;
    window.clearTimeout(autoStartTimer);

    if (prefersReducedMotion) {
      updateCaption("招待状を表示します。");
      finishCurtain();
      return;
    }

    stage.classList.add("is-anticipating");
    updateCaption(manual ? "静けさのあと、幕がほどけます。" : "まもなく、幕が静かにほどけます。");

    const preludeStart = performance.now();

    function preludeStep(now) {
      const progress = clamp((now - preludeStart) / preludeDuration);
      const hush = Math.sin(progress * Math.PI) * 0.018;
      const glow = 0.26 + Math.sin(progress * Math.PI) * 0.1;

      applyState({
        open: 0,
        reveal: 0,
        glow,
        leftSway: hush,
        rightSway: -hush
      });

      if (progress < 1) {
        animationFrameId = window.requestAnimationFrame(preludeStep);
        return;
      }

      runOpening();
    }

    animationFrameId = window.requestAnimationFrame(preludeStep);
  }

  function setPressedState(isPressed) {
    if (completed || started) {
      return;
    }

    stage.style.setProperty("--press", isPressed ? "1" : "0");
  }

  stage.addEventListener("pointerdown", () => {
    setPressedState(true);
  });

  ["pointerup", "pointercancel", "pointerleave", "blur"].forEach((eventName) => {
    stage.addEventListener(eventName, () => {
      setPressedState(false);
    });
  });

  stage.addEventListener("click", () => {
    startSequence({ manual: true });
  });

  stage.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      startSequence({ manual: true });
    }
  });

  applyState({
    open: 0,
    reveal: 0,
    glow: 0.28,
    leftSway: 0,
    rightSway: 0
  });

  updateCaption(prefersReducedMotion ? "タップで招待状を表示します。" : "静かに、お待ちください。");

  autoStartTimer = window.setTimeout(() => {
    startSequence();
  }, introDelay);

  return {
    finish: finishCurtain
  };
}
