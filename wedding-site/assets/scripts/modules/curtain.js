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
  introDelay = 900,
  openDuration = 2100,
  revealDelay = 220,
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

    stage.classList.remove("is-opening");
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

  function playSequence() {
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

    stage.classList.add("is-opening");
    updateCaption("幕がほどけて、招待状が現れます。");

    const startTime = performance.now();
    let highlightedReveal = false;

    function settleMotion() {
      const settleStart = performance.now();
      const settleDuration = 760;

      function settleFrame(now) {
        const progress = clamp((now - settleStart) / settleDuration);
        const residue = Math.sin(progress * Math.PI * 2.4) * Math.pow(1 - progress, 2.1) * 0.05;

        applyState({
          open: 1,
          reveal: 1,
          glow: 1,
          leftSway: residue,
          rightSway: -residue * 0.9
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
      const reveal = easeOutCubic(clamp((progress - 0.18) / 0.82));
      const resonance = Math.sin(progress * Math.PI * 5.2) * Math.pow(1 - progress, 1.5) * 0.095;

      applyState({
        open,
        reveal,
        glow: 0.32 + reveal * 0.68,
        leftSway: resonance,
        rightSway: -resonance * 0.88
      });

      if (!highlightedReveal && progress > 0.58) {
        highlightedReveal = true;
        updateCaption("もうすぐ、招待状が届きます。");
      }

      if (progress < 1) {
        animationFrameId = window.requestAnimationFrame(step);
        return;
      }

      settleMotion();
    }

    animationFrameId = window.requestAnimationFrame(step);
  }

  function setPressedState(isPressed) {
    if (completed) {
      return;
    }

    stage.style.setProperty("--press", isPressed ? "1" : "0");
  }

  function handleActivate() {
    if (!started) {
      playSequence();
      return;
    }

    if (!completed) {
      finishCurtain();
    }
  }

  stage.addEventListener("pointerdown", () => {
    setPressedState(true);
  });

  ["pointerup", "pointercancel", "pointerleave", "blur"].forEach((eventName) => {
    stage.addEventListener(eventName, () => {
      setPressedState(false);
    });
  });

  stage.addEventListener("click", handleActivate);
  stage.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleActivate();
    }
  });

  applyState({
    open: 0,
    reveal: 0,
    glow: 0.32,
    leftSway: 0,
    rightSway: 0
  });

  updateCaption(prefersReducedMotion ? "タップで招待状を表示します。" : "指先を添えると、幕がほどけます。");

  autoStartTimer = window.setTimeout(() => {
    playSequence();
  }, introDelay);

  return {
    finish: finishCurtain
  };
}
