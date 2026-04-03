function drawScratchSurface(context, width, height) {
  context.clearRect(0, 0, width, height);
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) * 0.49;
  const base = context.createRadialGradient(
    width * 0.28,
    height * 0.22,
    width * 0.06,
    centerX,
    centerY,
    radius
  );
  base.addColorStop(0, "#f9e9bf");
  base.addColorStop(0.34, "#d7ab5d");
  base.addColorStop(0.68, "#9a6d2f");
  base.addColorStop(1, "#77501d");

  context.save();
  context.beginPath();
  context.arc(centerX, centerY, radius, 0, Math.PI * 2);
  context.clip();
  context.fillStyle = base;
  context.fillRect(0, 0, width, height);

  const highlight = context.createRadialGradient(
    width * 0.28,
    height * 0.24,
    width * 0.02,
    width * 0.34,
    height * 0.28,
    width * 0.54
  );
  highlight.addColorStop(0, "rgba(255, 252, 241, 0.95)");
  highlight.addColorStop(0.22, "rgba(255, 242, 206, 0.52)");
  highlight.addColorStop(1, "rgba(255, 226, 175, 0)");

  context.fillStyle = highlight;
  context.beginPath();
  context.arc(centerX, centerY, radius * 0.98, 0, Math.PI * 2);
  context.fill();

  context.save();
  context.strokeStyle = "rgba(255, 243, 213, 0.08)";

  for (let index = 0; index < 120; index += 1) {
    const y = (height / 120) * index;

    context.lineWidth = 0.5 + (index % 4) * 0.22;
    context.beginPath();
    context.moveTo(-10, y);
    context.bezierCurveTo(
      width * 0.22,
      y + Math.sin(index * 0.34) * 2,
      width * 0.74,
      y - Math.cos(index * 0.3) * 2,
      width + 10,
      y + Math.sin(index * 0.18) * 1.5
    );
    context.stroke();
  }

  context.restore();

  for (let index = 0; index < 84; index += 1) {
    const alpha = 0.03 + Math.random() * 0.05;
    const sparkRadius = 0.4 + Math.random() * 1.2;

    context.fillStyle = `rgba(255, 248, 232, ${alpha})`;
    context.beginPath();
    context.arc(Math.random() * width, Math.random() * height, sparkRadius, 0, Math.PI * 2);
    context.fill();
  }

  context.lineWidth = Math.max(2, width * 0.018);
  context.strokeStyle = "rgba(255, 241, 207, 0.3)";
  context.beginPath();
  context.arc(centerX, centerY, radius * 0.91, 0, Math.PI * 2);
  context.stroke();

  context.lineWidth = Math.max(1.5, width * 0.01);
  context.strokeStyle = "rgba(110, 73, 25, 0.18)";
  context.beginPath();
  context.arc(centerX, centerY, radius * 0.78, 0, Math.PI * 2);
  context.stroke();

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

  for (let index = 0; index < 2; index += 1) {
    const radius = size * (0.58 + Math.random() * 0.18);
    const offsetX = (Math.random() - 0.5) * size * 0.28;
    const offsetY = (Math.random() - 0.5) * size * 0.28;

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
  const width = canvas.width;
  const height = canvas.height;
  const pixels = context.getImageData(0, 0, width, height).data;
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) * 0.46;
  const radiusSquared = radius * radius;
  const step = Math.max(4, Math.round(Math.min(width, height) / 76));
  const alphaThreshold = 96;
  let clearedPixels = 0;
  let sampledPixels = 0;

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const offsetX = x - centerX;
      const offsetY = y - centerY;

      if (offsetX * offsetX + offsetY * offsetY > radiusSquared) {
        continue;
      }

      sampledPixels += 1;

      if (pixels[(y * width + x) * 4 + 3] <= alphaThreshold) {
        clearedPixels += 1;
      }
    }
  }

  return sampledPixels === 0 ? 0 : clearedPixels / sampledPixels;
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
  completeRatio = 0.46,
  brushSize = 18,
  gestureDistance = 170,
  revealDelay = 360,
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
  let totalDistance = 0;
  let sampleCounter = 0;
  let clearedRatio = 0;
  let lastPoint = null;
  const assistRatio = Math.max(completeRatio - 0.06, completeRatio * 0.86);

  function setProgressState(progress) {
    seal.style.setProperty("--scratch-progress", progress.toFixed(4));
    seal.classList.toggle("is-nearing", progress >= 0.72 && !revealed && !queued);
    seal.classList.toggle("is-ready", progress >= 0.9 && !revealed && !queued);
  }

  function getProgress() {
    const distanceProgress = Math.min(totalDistance / gestureDistance, 1);
    const scratchProgress = Math.min(clearedRatio / completeRatio, 1);

    return {
      distanceProgress,
      scratchProgress,
      combinedProgress: Math.min(scratchProgress * 0.84 + distanceProgress * 0.16, 1)
    };
  }

  function refreshStatus(force = false) {
    if (!status || revealed) {
      return;
    }

    const { combinedProgress } = getProgress();

    setProgressState(combinedProgress);

    if (force) {
      status.textContent = "日付の封印です。";
    }
  }

  function revealDate() {
    if (revealed) {
      return;
    }

    revealed = true;
    queued = false;
    seal.classList.remove("is-pressed", "is-nearing", "is-ready", "is-releasing");
    seal.classList.add("is-revealed");
    context.clearRect(0, 0, canvas.width, canvas.height);
    resetTilt(seal);
    setProgressState(1);

    if (status) {
      status.textContent = "日付を表示しました。";
    }

    onReveal?.();
  }

  function queueReveal() {
    if (revealed || queued) {
      return;
    }

    queued = true;
    seal.classList.remove("is-nearing", "is-ready");
    seal.classList.add("is-releasing");
    setProgressState(1);

    if (status) {
      status.textContent = "日付を表示しています。";
    }

    window.setTimeout(revealDate, prefersReducedMotion ? 0 : revealDelay);
  }

  function updateClearedRatio() {
    clearedRatio = getClearedRatio(context, canvas);
  }

  function checkReveal({ force = false } = {}) {
    if (revealed || queued) {
      return;
    }

    if (force || sampleCounter % 4 === 0) {
      updateClearedRatio();
    }

    const { distanceProgress, combinedProgress } = getProgress();
    const clearByArea = clearedRatio >= completeRatio;
    const clearByAssist = clearedRatio >= assistRatio && distanceProgress >= 0.62;
    const clearByNearFinish = force && clearedRatio >= assistRatio - 0.02 && combinedProgress >= 0.92;

    if (clearByArea || clearByAssist || clearByNearFinish) {
      queueReveal();
      return;
    }

    refreshStatus();
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
    } else {
      totalDistance = 0;
      sampleCounter = 0;
      clearedRatio = 0;
      seal.classList.remove("is-nearing", "is-ready", "is-releasing");
      setProgressState(0);
      refreshStatus(true);
    }
  }

  function handlePointerDown(event) {
    if (revealed || queued) {
      return;
    }

    event.preventDefault();
    drawing = true;
    lastPoint = getPointFromEvent(event, canvas);
    seal.classList.add("is-pressed");

    eraseStamp(context, lastPoint, brushSize * 0.72);
    sampleCounter += 1;
    checkReveal({ force: true });

    if (!prefersReducedMotion) {
      setTilt(seal, lastPoint, seal.getBoundingClientRect());
    }

    if (seal.setPointerCapture) {
      seal.setPointerCapture(event.pointerId);
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

    totalDistance += distance;
    sampleCounter += 1;

    eraseStroke(context, lastPoint, point, brushSize);
    lastPoint = point;

    if (!prefersReducedMotion) {
      setTilt(seal, point, seal.getBoundingClientRect());
    }

    checkReveal();
  }

  function handlePointerUp(event) {
    if (seal.hasPointerCapture?.(event.pointerId)) {
      seal.releasePointerCapture(event.pointerId);
    }

    drawing = false;
    lastPoint = null;
    seal.classList.remove("is-pressed");
    resetTilt(seal);

    if (revealed || queued) {
      return;
    }

    checkReveal({ force: true });
  }

  function handlePointerCancel(event) {
    if (seal.hasPointerCapture?.(event.pointerId)) {
      seal.releasePointerCapture(event.pointerId);
    }

    drawing = false;
    lastPoint = null;
    seal.classList.remove("is-pressed");
    resetTilt(seal);
    refreshStatus();
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
  setProgressState(0);

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
