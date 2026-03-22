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
    const radius = 0.4 + Math.random() * 1.6;

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

  for (let index = 0; index < 3; index += 1) {
    const radius = size * (0.56 + Math.random() * 0.26);
    const offsetX = (Math.random() - 0.5) * size * 0.45;
    const offsetY = (Math.random() - 0.5) * size * 0.45;

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

    if (force || combinedProgress < 0.18) {
      status.textContent = "まだ封印されています。円を描くように削ってください。";
      return;
    }

    if (combinedProgress < 0.46) {
      status.textContent = "封印が少しずつほどけています。もう少し削ってください。";
      return;
    }

    if (combinedProgress < 0.78) {
      status.textContent = "半分ほど封印がほどけています。続けて削ってください。";
      return;
    }

    if (combinedProgress < 0.94) {
      status.textContent = "あと少しで日付が現れます。最後をやさしく削ってください。";
      return;
    }

    status.textContent = "まもなく日付が現れます。";
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
      status.textContent = "封印がほどけ、日付が現れました。";
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
      status.textContent = "封印がほどけ、日付が現れます。";
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

    if (status) {
      status.textContent = "封印をゆっくり削ってください。";
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
