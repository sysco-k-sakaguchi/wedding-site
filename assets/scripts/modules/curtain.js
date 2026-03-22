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

function easeInOutSine(value) {
  return -(Math.cos(Math.PI * value) - 1) / 2;
}

export function setupCurtain({
  introDelay = 1750,
  preludeDuration = 1040,
  openDuration = 2920,
  revealDelay = 440,
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
    rightSway = 0,
    lift = 0,
    gather = 0,
    pinch = 0
  }) {
    stage.style.setProperty("--curtain-open", open.toFixed(4));
    stage.style.setProperty("--curtain-reveal", reveal.toFixed(4));
    stage.style.setProperty("--curtain-glow", glow.toFixed(4));
    stage.style.setProperty("--left-sway", leftSway.toFixed(4));
    stage.style.setProperty("--right-sway", rightSway.toFixed(4));
    stage.style.setProperty("--curtain-lift", lift.toFixed(4));
    stage.style.setProperty("--curtain-gather", gather.toFixed(4));
    stage.style.setProperty("--curtain-pinch", pinch.toFixed(4));
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
      rightSway: 0,
      lift: 1,
      gather: 1,
      pinch: 0
    });

    updateCaption("招待状が静かに届きました。");

    window.setTimeout(() => {
      onComplete?.();
    }, revealDelay);
  }

  function runOpening() {
    stage.classList.remove("is-anticipating");
    stage.classList.add("is-opening");
    updateCaption("中央から幕がほどけ、招待状が現れます。");

    const startTime = performance.now();
    let updatedMid = false;
    let updatedLate = false;

    function settleMotion() {
      const settleStart = performance.now();
      const settleDuration = 1080;

      function settleFrame(now) {
        const progress = clamp((now - settleStart) / settleDuration);
        const residue = Math.sin(progress * Math.PI * 2.15) * Math.pow(1 - progress, 2.25) * 0.038;

        applyState({
          open: 1,
          reveal: 1,
          glow: 1,
          leftSway: residue,
          rightSway: -residue * 0.88,
          lift: 1,
          gather: 1,
          pinch: (1 - progress) * 0.1
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
      const lift = easeOutCubic(clamp((progress - 0.06) / 0.94));
      const gather = clamp(0.22 + easeOutCubic(clamp((progress - 0.02) / 0.98)) * 0.78);
      const pinch = clamp(Math.sin(progress * Math.PI) * 0.72 + (1 - open) * 0.26);
      const resonance = Math.sin(progress * Math.PI * 4.1) * Math.pow(1 - progress, 1.9) * 0.06;
      const drag = Math.sin(progress * Math.PI * 1.18) * 0.018;

      applyState({
        open,
        reveal,
        glow: 0.3 + reveal * 0.68,
        leftSway: resonance - drag,
        rightSway: -resonance - drag * 0.8,
        lift,
        gather,
        pinch
      });

      if (!updatedMid && progress > 0.24) {
        updatedMid = true;
        updateCaption("中央に力がかかり、幕がゆっくりほどけていきます。");
      }

      if (!updatedLate && progress > 0.7) {
        updatedLate = true;
        updateCaption("幕の奥から、招待状が静かに現れます。");
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
    updateCaption(
      manual
        ? "静けさのあと、中央から幕がほどけます。"
        : "静けさのなかで、幕にそっと力がかかります。"
    );

    const preludeStart = performance.now();

    function preludeStep(now) {
      const progress = clamp((now - preludeStart) / preludeDuration);
      const pulse = easeInOutSine(progress);
      const hush = Math.sin(progress * Math.PI * 1.3) * Math.pow(1 - progress * 0.18, 1.15) * 0.018;

      applyState({
        open: 0,
        reveal: 0,
        glow: 0.24 + Math.sin(progress * Math.PI) * 0.12,
        leftSway: hush,
        rightSway: -hush,
        lift: pulse * 0.16,
        gather: pulse * 0.42,
        pinch: Math.sin(progress * Math.PI) * 0.72
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
    rightSway: 0,
    lift: 0,
    gather: 0,
    pinch: 0
  });

  updateCaption(prefersReducedMotion ? "タップで招待状を表示します。" : "静かに、お待ちください。");

  autoStartTimer = window.setTimeout(() => {
    startSequence();
  }, introDelay);

  return {
    finish: finishCurtain
  };
}
