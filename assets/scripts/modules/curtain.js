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
  preludeDuration = 620,
  openDuration = 2360,
  revealDelay = 260,
  onComplete
} = {}) {
  const overlay = document.querySelector("[data-curtain-overlay]");
  const stage = document.querySelector("[data-curtain-stage]");
  const caption = document.querySelector("[data-curtain-caption]");
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (!stage || !overlay) {
    return;
  }

  let started = false;
  let completed = false;
  let animationFrameId = 0;
  let autoStartTimer = 0;
  let queuedManualStart = false;
  const holdUntil = performance.now() + introDelay;
  let currentState = {
    open: 0,
    reveal: 0,
    glow: 0.28,
    leftSway: 0,
    rightSway: 0,
    leftDrape: 0,
    rightDrape: 0,
    leftTail: 0,
    rightTail: 0,
    lift: 0,
    gather: 0,
    pinch: 0,
    tension: 0,
    stack: 0,
    breathe: 0
  };

  overlay.hidden = false;
  document.body.classList.add("is-curtain-active");

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
    leftDrape = 0,
    rightDrape = 0,
    leftTail = 0,
    rightTail = 0,
    lift = 0,
    gather = 0,
    pinch = 0,
    tension = 0,
    stack = 0,
    breathe = 0
  }) {
    currentState = {
      open,
      reveal,
      glow,
      leftSway,
      rightSway,
      leftDrape,
      rightDrape,
      leftTail,
      rightTail,
      lift,
      gather,
      pinch,
      tension,
      stack,
      breathe
    };

    stage.style.setProperty("--curtain-open", open.toFixed(4));
    stage.style.setProperty("--curtain-reveal", reveal.toFixed(4));
    stage.style.setProperty("--curtain-glow", glow.toFixed(4));
    stage.style.setProperty("--left-sway", leftSway.toFixed(4));
    stage.style.setProperty("--right-sway", rightSway.toFixed(4));
    stage.style.setProperty("--left-drape", leftDrape.toFixed(4));
    stage.style.setProperty("--right-drape", rightDrape.toFixed(4));
    stage.style.setProperty("--left-tail", leftTail.toFixed(4));
    stage.style.setProperty("--right-tail", rightTail.toFixed(4));
    stage.style.setProperty("--curtain-lift", lift.toFixed(4));
    stage.style.setProperty("--curtain-gather", gather.toFixed(4));
    stage.style.setProperty("--curtain-pinch", pinch.toFixed(4));
    stage.style.setProperty("--curtain-tension", tension.toFixed(4));
    stage.style.setProperty("--curtain-stack", stack.toFixed(4));
    stage.style.setProperty("--curtain-breathe", breathe.toFixed(4));
  }

  function hideOverlay() {
    document.body.classList.remove("is-curtain-active");
    document.body.classList.add("is-curtain-opened");
    overlay.classList.add("is-complete");

    const hideDelay = prefersReducedMotion ? 0 : Math.max(revealDelay, 360);

    window.setTimeout(() => {
      overlay.hidden = true;
      onComplete?.();
    }, hideDelay);
  }

  function startIdleMotion() {
    if (prefersReducedMotion) {
      return;
    }

    stage.classList.add("is-idling");

    const idleStart = performance.now();

    function idleFrame(now) {
      if (started || completed) {
        return;
      }

      const elapsed = now - idleStart;
      const leftSway =
        Math.sin(elapsed * 0.00102 + 0.42) * 0.0062 +
        Math.sin(elapsed * 0.00184 + 1.24) * 0.0033;
      const rightSway =
        Math.sin(elapsed * 0.00088 + 2.18) * 0.0057 +
        Math.sin(elapsed * 0.00167 + 0.62) * 0.0029;
      const leftDrape = leftSway * 1.9 + Math.sin(elapsed * 0.00153 + 1.08) * 0.0042;
      const rightDrape = rightSway * 1.82 + Math.sin(elapsed * 0.00139 + 2.36) * 0.0038;
      const leftTail = leftDrape * 1.34 + Math.sin(elapsed * 0.00191 + 0.74) * 0.0048;
      const rightTail = rightDrape * 1.38 + Math.sin(elapsed * 0.00175 + 1.88) * 0.0045;
      const breath = (Math.sin(elapsed * 0.00042 + 0.86) + 1) / 2;

      applyState({
        open: 0,
        reveal: 0,
        glow: 0.22 + breath * 0.08,
        leftSway,
        rightSway,
        leftDrape,
        rightDrape,
        leftTail,
        rightTail,
        lift: breath * 0.04,
        gather: 0.05 + breath * 0.05,
        pinch: 0.05 + breath * 0.08,
        tension: 0,
        stack: 0.04 + breath * 0.05,
        breathe: breath * 0.72
      });

      animationFrameId = window.requestAnimationFrame(idleFrame);
    }

    animationFrameId = window.requestAnimationFrame(idleFrame);
  }

  function finishCurtain() {
    if (completed) {
      return;
    }

    completed = true;
    queuedManualStart = false;
    window.clearTimeout(autoStartTimer);
    window.cancelAnimationFrame(animationFrameId);

    stage.classList.remove("is-idling", "is-anticipating", "is-opening");
    stage.classList.add("is-open");
    stage.style.setProperty("--press", "0");

    applyState({
      open: 1,
      reveal: 1,
      glow: 1,
      leftSway: 0,
      rightSway: 0,
      leftDrape: 0,
      rightDrape: 0,
      leftTail: 0,
      rightTail: 0,
      lift: 1,
      gather: 1,
      pinch: 0,
      tension: 0,
      stack: 1,
      breathe: 0
    });

    updateCaption("");
    hideOverlay();
  }

  function runOpening() {
    stage.classList.remove("is-anticipating");
    stage.classList.add("is-opening");
    updateCaption("");

    const startTime = performance.now();

    function settleMotion() {
      const settleStart = performance.now();
      const settleDuration = 1260;

      function settleFrame(now) {
        const progress = clamp((now - settleStart) / settleDuration);
        const residue = Math.sin(progress * Math.PI * 1.92 + 0.12) * Math.pow(1 - progress, 2.3) * 0.018;
        const tailResidue = Math.sin(progress * Math.PI * 2.5 + 0.88) * Math.pow(1 - progress, 2.05) * 0.022;

        applyState({
          open: 1,
          reveal: 1,
          glow: 1,
          leftSway: residue,
          rightSway: -residue * 0.88,
          leftDrape: residue * 1.26 + tailResidue,
          rightDrape: -residue * 1.12 - tailResidue * 0.84,
          leftTail: tailResidue * 1.18,
          rightTail: -tailResidue,
          lift: 1,
          gather: 1,
          pinch: (1 - progress) * 0.08,
          tension: (1 - progress) * 0.06,
          stack: 1,
          breathe: (1 - progress) * 0.12
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
      const tensionPhase = easeOutCubic(clamp(progress / 0.18));
      const open = easeInOutCubic(clamp((progress - 0.08) / 0.92));
      const reveal = easeOutCubic(clamp((progress - 0.24) / 0.76));
      const lift = easeOutCubic(clamp((progress - 0.1) / 0.9));
      const gather = clamp(0.16 + tensionPhase * 0.1 + easeOutCubic(clamp((progress - 0.06) / 0.94)) * 0.74);
      const stack = clamp(0.08 + easeOutCubic(clamp((progress - 0.16) / 0.84)) * 0.92);
      const tension = clamp(tensionPhase * (1 - open * 0.62));
      const flutter = Math.sin(progress * Math.PI * 3.4 + 0.24) * Math.pow(1 - progress, 1.82) * 0.028;
      const drag = Math.sin(progress * Math.PI * 1.15 + 0.36) * Math.pow(1 - progress, 1.18) * 0.012;
      const tailLag = Math.sin(progress * Math.PI * 4.2 + 0.92) * Math.pow(1 - progress, 1.52) * 0.034;
      const leftDrape =
        tension * 0.028 +
        flutter * 1.42 +
        Math.sin(progress * Math.PI * 2.08 + 0.54) * Math.pow(1 - progress, 1.55) * 0.023;
      const rightDrape =
        -tension * 0.024 -
        flutter * 1.18 +
        Math.sin(progress * Math.PI * 1.92 + 1.08) * Math.pow(1 - progress, 1.52) * 0.021;

      applyState({
        open,
        reveal,
        glow: 0.26 + reveal * 0.62,
        leftSway: tension * 0.012 + flutter - drag,
        rightSway: -tension * 0.01 - flutter * 0.78 - drag * 0.72,
        leftDrape,
        rightDrape,
        leftTail: leftDrape * 1.14 + tailLag,
        rightTail: rightDrape * 1.12 - tailLag * 0.84,
        lift,
        gather,
        pinch: clamp(0.12 + tension * 0.52 + Math.sin(progress * Math.PI) * 0.22 - open * 0.18),
        tension,
        stack,
        breathe: (1 - open) * 0.18
      });

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
    queuedManualStart = false;
    window.clearTimeout(autoStartTimer);
    window.cancelAnimationFrame(animationFrameId);
    stage.classList.remove("is-idling");

    if (prefersReducedMotion) {
      updateCaption("");
      finishCurtain();
      return;
    }

    stage.classList.add("is-anticipating");
    updateCaption(manual ? "まもなく幕がひらきます。" : "");

    const preludeOrigin = { ...currentState };
    const preludeStart = performance.now();

    function preludeStep(now) {
      const progress = clamp((now - preludeStart) / preludeDuration);
      const pulse = easeInOutSine(progress);
      const leftSway = preludeOrigin.leftSway * (1 - progress) + pulse * 0.012;
      const rightSway = preludeOrigin.rightSway * (1 - progress) - pulse * 0.01;
      const leftDrape = preludeOrigin.leftDrape * (1 - progress * 0.64) + pulse * 0.018;
      const rightDrape = preludeOrigin.rightDrape * (1 - progress * 0.64) - pulse * 0.016;

      applyState({
        open: 0,
        reveal: 0,
        glow: 0.24 + pulse * 0.1,
        leftSway,
        rightSway,
        leftDrape,
        rightDrape,
        leftTail: preludeOrigin.leftTail * (1 - progress * 0.42) + pulse * 0.024,
        rightTail: preludeOrigin.rightTail * (1 - progress * 0.42) - pulse * 0.022,
        lift: pulse * 0.08,
        gather: 0.08 + pulse * 0.22,
        pinch: 0.08 + Math.sin(progress * Math.PI) * 0.16 + pulse * 0.18,
        tension: pulse,
        stack: 0.08 + pulse * 0.14,
        breathe: (1 - progress) * preludeOrigin.breathe * 0.5
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
    if (performance.now() < holdUntil && !started) {
      queuedManualStart = true;
      updateCaption("幕はまもなくひらきます。");
      return;
    }

    startSequence({
      manual: true
    });
  });

  stage.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (performance.now() < holdUntil && !started) {
        queuedManualStart = true;
        updateCaption("幕はまもなくひらきます。");
        return;
      }

      startSequence({
        manual: true
      });
    }
  });

  applyState(currentState);
  updateCaption("幕をひらいてご案内を表示します。");
  startIdleMotion();

  autoStartTimer = window.setTimeout(() => {
    startSequence({
      manual: queuedManualStart
    });
  }, introDelay);

  return {
    finish: finishCurtain
  };
}
