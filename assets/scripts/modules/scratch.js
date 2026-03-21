function drawScratchSurface(context, width, height) {
  const gradient = context.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#f7e4b8");
  gradient.addColorStop(0.34, "#d7ab5d");
  gradient.addColorStop(0.62, "#9c6f2e");
  gradient.addColorStop(1, "#7a531d");

  context.clearRect(0, 0, width, height);
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  const highlight = context.createRadialGradient(
    width * 0.3,
    height * 0.26,
    width * 0.05,
    width * 0.36,
    height * 0.34,
    width * 0.7
  );
  highlight.addColorStop(0, "rgba(255, 252, 241, 0.92)");
  highlight.addColorStop(0.28, "rgba(255, 237, 196, 0.48)");
  highlight.addColorStop(1, "rgba(255, 226, 175, 0)");

  context.fillStyle = highlight;
  context.beginPath();
  context.arc(width / 2, height / 2, width * 0.48, 0, Math.PI * 2);
  context.fill();

  context.save();
  context.strokeStyle = "rgba(255, 246, 216, 0.08)";

  for (let index = 0; index < 140; index += 1) {
    const y = (height / 140) * index;

    context.lineWidth = 0.8 + (index % 3) * 0.35;
    context.beginPath();
    context.moveTo(-12, y);
    context.bezierCurveTo(
      width * 0.22,
      y + Math.sin(index * 0.42) * 3,
      width * 0.74,
      y - Math.cos(index * 0.35) * 3,
      width + 12,
      y + Math.sin(index * 0.2) * 2
    );
    context.stroke();
  }

  context.restore();

  for (let index = 0; index < 220; index += 1) {
    const alpha = 0.04 + Math.random() * 0.12;
    const radius = 0.4 + Math.random() * 1.8;

    context.fillStyle = `rgba(255, 250, 237, ${alpha})`;
    context.beginPath();
    context.arc(Math.random() * width, Math.random() * height, radius, 0, Math.PI * 2);
    context.fill();
  }

  context.save();
  context.globalCompositeOperation = "multiply";
  context.fillStyle = "rgba(122, 83, 29, 0.16)";
  context.beginPath();
  context.arc(width * 0.56, height * 0.64, width * 0.5, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function getPointFromEvent(event, canvas) {
  const rect = canvas.getBoundingClientRect();

  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top
  };
}

function eraseStamp(context, point, size) {
  context.save();
  context.globalCompositeOperation = "destination-out";

  for (let index = 0; index < 4; index += 1) {
    const radius = size * (0.55 + Math.random() * 0.3);
    const offsetX = (Math.random() - 0.5) * size * 0.55;
    const offsetY = (Math.random() - 0.5) * size * 0.55;

    context.beginPath();
    context.arc(point.x + offsetX, point.y + offsetY, radius, 0, Math.PI * 2);
    context.fill();
  }

  context.restore();
}

function eraseStroke(context, from, to, size) {
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const step = Math.max(2, size * 0.24);

  for (let offset = 0; offset <= distance; offset += step) {
    const progress = distance === 0 ? 0 : offset / distance;

    eraseStamp(
      context,
      {
        x: from.x + (to.x - from.x) * progress,
        y: from.y + (to.y - from.y) * progress
      },
      size
    );
  }
}

function getClearedRatio(context, canvas) {
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  let transparentPixels = 0;
  let sampledPixels = 0;

  for (let index = 3; index < pixels.length; index += 64) {
    sampledPixels += 1;

    if (pixels[index] === 0) {
      transparentPixels += 1;
    }
  }

  return transparentPixels / sampledPixels;
}

function setTilt(seal, point, bounds) {
  if (!seal || !bounds) {
    return;
  }

  const centerX = bounds.width / 2;
  const centerY = bounds.height / 2;
  const tiltX = ((point.x - centerX) / centerX) * 7;
  const tiltY = ((centerY - point.y) / centerY) * 7;

  seal.style.setProperty("--tilt-x", tiltX.toFixed(2));
  seal.style.setProperty("--tilt-y", tiltY.toFixed(2));
}

function resetTilt(seal) {
  if (!seal) {
    return;
  }

  seal.style.setProperty("--tilt-x", "0");
  seal.style.setProperty("--tilt-y", "0");
}

export function setupScratch({
  completeRatio = 0.16,
  brushSize = 24,
  gestureDistance = 42,
  revealDelay = 300,
  onReveal
} = {}) {
  const seal = document.querySelector("[data-scratch-seal]");
  const canvas = document.querySelector("[data-scratch-canvas]");
  const status = document.querySelector("[data-scratch-status]");
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (!seal || !canvas) {
    return;
  }

  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (!context) {
    return;
  }

  let drawing = false;
  let revealed = false;
  let queued = false;
  let travelled = 0;
  let sampleCounter = 0;
  let lastPoint = null;
  let sweepFrameId = 0;

  function revealDate() {
    if (revealed) {
      return;
    }

    revealed = true;
    queued = false;
    window.cancelAnimationFrame(sweepFrameId);

    seal.classList.remove("is-pressed");
    seal.classList.add("is-revealed");
    context.clearRect(0, 0, canvas.width, canvas.height);
    resetTilt(seal);

    if (status) {
      status.textContent = "封印がほどけ、日付が現れました。";
    }

    onReveal?.();
  }

  function queueReveal() {
    if (revealed || queued) {
      return;
    }

    queued = true;

    if (status) {
      status.textContent = "封印がほどけています。";
    }

    window.setTimeout(revealDate, revealDelay);
  }

  function resizeCanvas() {
    const rect = seal.getBoundingClientRect();

    if (rect.width === 0 || rect.height === 0) {
      return;
    }

    const ratio = window.devicePixelRatio || 1;

    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    drawScratchSurface(context, rect.width, rect.height);

    if (revealed) {
      context.clearRect(0, 0, rect.width, rect.height);
    }
  }

  function playTapSweep(origin) {
    if (revealed || queued) {
      return;
    }

    const rect = seal.getBoundingClientRect();
    const anchor = origin ?? {
      x: rect.width * 0.44,
      y: rect.height * 0.46
    };
    const radius = rect.width * 0.16;
    let frame = 0;
    const totalFrames = 8;

    function step() {
      const progress = frame / totalFrames;
      const angle = -Math.PI * 0.92 + progress * Math.PI * 0.7;
      const point = {
        x: anchor.x + Math.cos(angle) * radius,
        y: anchor.y + Math.sin(angle) * radius * 0.68
      };

      eraseStamp(context, point, brushSize * 1.08);

      if (frame < totalFrames) {
        frame += 1;
        sweepFrameId = window.requestAnimationFrame(step);
        return;
      }

      queueReveal();
    }

    sweepFrameId = window.requestAnimationFrame(step);
  }

  function handlePointerDown(event) {
    if (revealed || queued) {
      return;
    }

    event.preventDefault();
    seal.classList.add("is-pressed");

    if (prefersReducedMotion) {
      queueReveal();
      return;
    }

    drawing = true;
    travelled = 0;
    sampleCounter = 0;
    lastPoint = getPointFromEvent(event, canvas);
    setTilt(seal, lastPoint, seal.getBoundingClientRect());
    eraseStamp(context, lastPoint, brushSize * 0.8);

    if (seal.setPointerCapture) {
      seal.setPointerCapture(event.pointerId);
    }

    if (status) {
      status.textContent = "そのまま、やさしくなぞってください。";
    }
  }

  function handlePointerMove(event) {
    if (!drawing || !lastPoint || revealed || queued) {
      return;
    }

    event.preventDefault();

    const point = getPointFromEvent(event, canvas);
    const distance = Math.hypot(point.x - lastPoint.x, point.y - lastPoint.y);

    if (distance === 0) {
      return;
    }

    travelled += distance;
    sampleCounter += 1;
    eraseStroke(context, lastPoint, point, brushSize);
    lastPoint = point;

    setTilt(seal, point, seal.getBoundingClientRect());

    if (travelled >= gestureDistance) {
      queueReveal();
      return;
    }

    if (sampleCounter % 3 === 0 && getClearedRatio(context, canvas) >= completeRatio) {
      queueReveal();
    }
  }

  function handlePointerUp(event) {
    if (seal.hasPointerCapture?.(event.pointerId)) {
      seal.releasePointerCapture(event.pointerId);
    }

    drawing = false;
    seal.classList.remove("is-pressed");

    if (revealed || queued) {
      lastPoint = null;
      resetTilt(seal);
      return;
    }

    const releasePoint = lastPoint ?? getPointFromEvent(event, canvas);
    lastPoint = null;

    if (travelled < 12) {
      playTapSweep(releasePoint);
    } else if (getClearedRatio(context, canvas) >= completeRatio * 0.55) {
      queueReveal();
    }

    resetTilt(seal);
  }

  function handlePointerCancel(event) {
    if (seal.hasPointerCapture?.(event.pointerId)) {
      seal.releasePointerCapture(event.pointerId);
    }

    drawing = false;
    lastPoint = null;
    seal.classList.remove("is-pressed");
    resetTilt(seal);
  }

  function handleKeyDown(event) {
    if (revealed || queued) {
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      queueReveal();
    }
  }

  resizeCanvas();

  seal.addEventListener("pointerdown", handlePointerDown);
  seal.addEventListener("pointermove", handlePointerMove);
  seal.addEventListener("pointerup", handlePointerUp);
  seal.addEventListener("pointercancel", handlePointerCancel);
  seal.addEventListener("keydown", handleKeyDown);

  window.addEventListener("resize", resizeCanvas, { passive: true });

  return {
    refresh: resizeCanvas
  };
}
