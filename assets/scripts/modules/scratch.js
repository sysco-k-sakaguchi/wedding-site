function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function createSeededRandom(seed) {
  let state = seed >>> 0;

  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function drawScratchSurface(context, width, height, seed = 1) {
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) * 0.49;
  const random = createSeededRandom(seed);
  const base = context.createRadialGradient(
    width * 0.28,
    height * 0.2,
    width * 0.04,
    centerX,
    centerY,
    radius
  );

  context.clearRect(0, 0, width, height);
  base.addColorStop(0, "#fff4d8");
  base.addColorStop(0.24, "#e4c47f");
  base.addColorStop(0.58, "#b88a3f");
  base.addColorStop(0.82, "#8f6428");
  base.addColorStop(1, "#6f4819");

  context.save();
  context.beginPath();
  context.arc(centerX, centerY, radius, 0, Math.PI * 2);
  context.clip();
  context.fillStyle = base;
  context.fillRect(0, 0, width, height);

  const sheen = context.createLinearGradient(0, 0, width, height);
  sheen.addColorStop(0, "rgba(255, 255, 255, 0.38)");
  sheen.addColorStop(0.32, "rgba(255, 249, 226, 0.04)");
  sheen.addColorStop(0.56, "rgba(91, 54, 13, 0.16)");
  sheen.addColorStop(0.78, "rgba(255, 244, 210, 0.18)");
  sheen.addColorStop(1, "rgba(75, 43, 10, 0.2)");
  context.fillStyle = sheen;
  context.fillRect(0, 0, width, height);

  for (let index = 0; index < 110; index += 1) {
    const y = random() * height;
    const alpha = 0.025 + random() * 0.07;

    context.strokeStyle = `rgba(255, 250, 231, ${alpha})`;
    context.lineWidth = 0.4 + random() * 0.8;
    context.beginPath();
    context.moveTo(-8, y);
    context.bezierCurveTo(
      width * 0.28,
      y + (random() - 0.5) * 5,
      width * 0.72,
      y + (random() - 0.5) * 5,
      width + 8,
      y + (random() - 0.5) * 3
    );
    context.stroke();
  }

  for (let index = 0; index < 92; index += 1) {
    const angle = random() * Math.PI * 2;
    const distance = Math.sqrt(random()) * radius * 0.92;
    const dotRadius = 0.35 + random() * 1.1;

    context.fillStyle = `rgba(255, 250, 235, ${0.04 + random() * 0.12})`;
    context.beginPath();
    context.arc(
      centerX + Math.cos(angle) * distance,
      centerY + Math.sin(angle) * distance,
      dotRadius,
      0,
      Math.PI * 2
    );
    context.fill();
  }

  context.lineWidth = Math.max(1.5, width * 0.014);
  context.strokeStyle = "rgba(255, 245, 214, 0.38)";
  context.beginPath();
  context.arc(centerX, centerY, radius * 0.9, 0, Math.PI * 2);
  context.stroke();

  context.lineWidth = Math.max(0.8, width * 0.006);
  context.strokeStyle = "rgba(87, 49, 10, 0.24)";
  context.beginPath();
  context.arc(centerX, centerY, radius * 0.82, 0, Math.PI * 2);
  context.stroke();

  const headlineSize = clamp(width * 0.105, 12, 21);
  const detailSize = clamp(width * 0.052, 8, 11);

  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = "rgba(75, 43, 10, 0.78)";
  context.font = `600 ${headlineSize}px "Zen Kaku Gothic New", sans-serif`;
  context.fillText("SCRATCH", centerX, centerY - height * 0.02);
  context.fillStyle = "rgba(75, 43, 10, 0.6)";
  context.font = `500 ${detailSize}px "Zen Kaku Gothic New", sans-serif`;
  context.fillText("RUB TO OPEN", centerX, centerY + height * 0.115);
  context.restore();
}

function getPointFromEvent(event, canvas) {
  const rect = canvas.getBoundingClientRect();

  return {
    x: clamp(event.clientX - rect.left, 0, rect.width),
    y: clamp(event.clientY - rect.top, 0, rect.height)
  };
}

function eraseStamp(context, point, size) {
  context.save();
  context.globalCompositeOperation = "destination-out";

  for (let index = 0; index < 3; index += 1) {
    const radius = size * (0.46 + Math.random() * 0.2);
    const offsetX = (Math.random() - 0.5) * size * 0.26;
    const offsetY = (Math.random() - 0.5) * size * 0.26;

    context.beginPath();
    context.arc(point.x + offsetX, point.y + offsetY, radius, 0, Math.PI * 2);
    context.fill();
  }

  context.restore();
}

function eraseStroke(context, from, to, size) {
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const step = Math.max(2, size * 0.2);

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
  const step = Math.max(4, Math.round(Math.min(width, height) / 72));
  let cleared = 0;
  let sampled = 0;

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const offsetX = x - centerX;
      const offsetY = y - centerY;

      if (offsetX * offsetX + offsetY * offsetY > radiusSquared) {
        continue;
      }

      sampled += 1;

      if (pixels[(y * width + x) * 4 + 3] <= 96) {
        cleared += 1;
      }
    }
  }

  return sampled === 0 ? 0 : cleared / sampled;
}

function setupCard(card, {
  cardIndex,
  completeRatio,
  brushSize,
  gestureDistance,
  onProgress,
  onComplete,
  isLocked
}) {
  const canvas = card.querySelector("[data-scratch-canvas]");
  const zone = card.querySelector("[data-scratch-zone]");
  const context = canvas?.getContext("2d", { willReadFrequently: true });

  if (!canvas || !zone || !context) {
    return null;
  }

  let drawing = false;
  let complete = false;
  let pointerId = null;
  let lastPoint = null;
  let totalDistance = 0;
  let clearedRatio = 0;
  let sampleCounter = 0;
  let cssWidth = 0;
  let cssHeight = 0;

  function progressValue() {
    const distanceProgress = Math.min(totalDistance / gestureDistance, 1);
    const areaProgress = Math.min(clearedRatio / completeRatio, 1);

    return Math.min(areaProgress * 0.88 + distanceProgress * 0.12, 1);
  }

  function updateProgress() {
    const progress = progressValue();

    card.style.setProperty("--scratch-progress", progress.toFixed(4));
    card.classList.toggle("is-scratching", progress > 0.04 && !complete);
    card.classList.toggle("is-nearing", progress > 0.72 && !complete);
    onProgress(progress, card.dataset.language);
  }

  function checkCompletion(force = false) {
    if (complete || isLocked()) {
      return;
    }

    if (force || sampleCounter % 3 === 0) {
      clearedRatio = getClearedRatio(context, canvas);
    }

    updateProgress();

    const distanceProgress = Math.min(totalDistance / gestureDistance, 1);
    const assistedThreshold = Math.max(completeRatio - 0.055, completeRatio * 0.84);

    if (
      clearedRatio >= completeRatio ||
      (clearedRatio >= assistedThreshold && distanceProgress >= 0.58)
    ) {
      complete = true;
      onComplete(card);
    }
  }

  function resize() {
    const rect = zone.getBoundingClientRect();

    if (!rect.width || !rect.height) {
      return;
    }

    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const hadScratchProgress = totalDistance > 0 && canvas.width > 0 && canvas.height > 0;
    const previousSurface = hadScratchProgress
      ? document.createElement("canvas")
      : null;

    if (previousSurface) {
      previousSurface.width = canvas.width;
      previousSurface.height = canvas.height;
      previousSurface.getContext("2d")?.drawImage(canvas, 0, 0);
    }

    cssWidth = rect.width;
    cssHeight = rect.height;
    canvas.width = Math.round(cssWidth * ratio);
    canvas.height = Math.round(cssHeight * ratio);
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    drawScratchSurface(context, cssWidth, cssHeight, 2026 + cardIndex * 101);

    if (complete) {
      context.clearRect(0, 0, cssWidth, cssHeight);
      return;
    }

    if (previousSurface) {
      context.save();
      context.globalCompositeOperation = "destination-in";
      context.drawImage(
        previousSurface,
        0,
        0,
        previousSurface.width,
        previousSurface.height,
        0,
        0,
        cssWidth,
        cssHeight
      );
      context.restore();
      clearedRatio = getClearedRatio(context, canvas);
    } else {
      totalDistance = 0;
      clearedRatio = 0;
      sampleCounter = 0;
    }

    updateProgress();
  }

  function endPointer(event) {
    if (pointerId !== null && canvas.hasPointerCapture?.(pointerId)) {
      canvas.releasePointerCapture(pointerId);
    }

    drawing = false;
    pointerId = null;
    lastPoint = null;
    card.classList.remove("is-pressed");

    if (!complete) {
      checkCompletion(true);
    }

    event?.preventDefault();
  }

  canvas.addEventListener("pointerdown", (event) => {
    if (complete || isLocked()) {
      return;
    }

    event.preventDefault();
    drawing = true;
    pointerId = event.pointerId;
    lastPoint = getPointFromEvent(event, canvas);
    card.classList.add("is-pressed");
    canvas.setPointerCapture?.(pointerId);

    const responsiveBrush = Math.max(brushSize, Math.min(cssWidth, cssHeight) * 0.095);
    eraseStamp(context, lastPoint, responsiveBrush * 0.76);
    sampleCounter += 1;
    checkCompletion(true);
  });

  canvas.addEventListener("pointermove", (event) => {
    if (!drawing || !lastPoint || complete || isLocked()) {
      return;
    }

    event.preventDefault();
    const point = getPointFromEvent(event, canvas);
    const distance = Math.hypot(point.x - lastPoint.x, point.y - lastPoint.y);

    if (!distance) {
      return;
    }

    const responsiveBrush = Math.max(brushSize, Math.min(cssWidth, cssHeight) * 0.095);

    totalDistance += distance;
    sampleCounter += 1;
    eraseStroke(context, lastPoint, point, responsiveBrush);
    lastPoint = point;
    checkCompletion();
  });

  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);
  canvas.addEventListener("lostpointercapture", () => {
    drawing = false;
    pointerId = null;
    lastPoint = null;
    card.classList.remove("is-pressed");
  });

  card.addEventListener("keydown", (event) => {
    if (complete || isLocked()) {
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      complete = true;
      onComplete(card);
    }
  });

  card.addEventListener("click", (event) => {
    event.preventDefault();

    if (event.detail === 0 && !complete && !isLocked()) {
      complete = true;
      onComplete(card);
    }
  });

  const resizeObserver = "ResizeObserver" in window
    ? new ResizeObserver(resize)
    : null;

  resizeObserver?.observe(zone);
  window.addEventListener("resize", resize, { passive: true });
  resize();

  return {
    clear() {
      complete = true;
      context.clearRect(0, 0, cssWidth, cssHeight);
      card.style.setProperty("--scratch-progress", "1");
    }
  };
}

export function setupScratch({
  completeRatio = 0.36,
  brushSize = 24,
  gestureDistance = 130,
  revealDelay = 260,
  onReveal
} = {}) {
  const gate = document.querySelector("[data-language-gate]");
  const cards = Array.from(document.querySelectorAll("[data-scratch-card]"));
  const status = document.querySelector("[data-language-status]");
  const siteContent = document.querySelector("[data-site-content]");
  const languageSwitch = document.querySelector("[data-language-switch]");
  const heroTitle = document.querySelector("#hero-title");
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (!gate || cards.length < 2) {
    return {
      activate() {}
    };
  }

  let selected = false;
  let active = false;
  const controllers = [];

  gate.hidden = false;
  gate.inert = true;
  siteContent?.setAttribute("aria-hidden", "true");

  if (siteContent) {
    siteContent.inert = true;
  }

  document.body.classList.add("is-language-active");

  function setStatus(message, language = "") {
    if (status) {
      if (status.textContent === message && status.lang === language) {
        return;
      }

      status.textContent = message;
      status.lang = language;
    }
  }

  function closeGate() {
    gate.classList.add("is-leaving");

    window.setTimeout(() => {
      gate.hidden = true;
      gate.inert = true;
      document.body.classList.remove("is-language-active");
      siteContent?.removeAttribute("aria-hidden");

      if (siteContent) {
        siteContent.inert = false;
      }

      if (languageSwitch) {
        languageSwitch.hidden = false;
      }

      if (heroTitle) {
        heroTitle.setAttribute("tabindex", "-1");
        heroTitle.focus({ preventScroll: true });
        heroTitle.addEventListener(
          "blur",
          () => {
            heroTitle.removeAttribute("tabindex");
          },
          { once: true }
        );
      }
    }, prefersReducedMotion ? 0 : 520);
  }

  function selectCard(card) {
    if (selected) {
      return;
    }

    selected = true;
    const language = card.dataset.language === "en" ? "en" : "ja";

    cards.forEach((item) => {
      item.disabled = true;
      item.classList.toggle("is-selected", item === card);
      item.classList.toggle("is-unselected", item !== card);
    });

    card.classList.add("is-releasing");
    setStatus(
      language === "ja"
        ? "日本語の招待状を開きます"
        : "Opening the English invitation",
      language
    );

    window.setTimeout(() => {
      const selectedIndex = cards.indexOf(card);

      controllers[selectedIndex]?.clear();
      card.classList.remove("is-releasing");
      card.classList.add("is-revealed");
      onReveal?.(language);

      window.setTimeout(closeGate, prefersReducedMotion ? 0 : 620);
    }, prefersReducedMotion ? 0 : revealDelay);
  }

  cards.forEach((card, index) => {
    const controller = setupCard(card, {
      cardIndex: index,
      completeRatio,
      brushSize,
      gestureDistance,
      isLocked: () => selected || !active,
      onProgress(progress, language) {
        if (progress < 0.08 || selected) {
          return;
        }

        setStatus(
          language === "ja"
            ? "そのまま、もう少し削ってください"
            : "Keep scratching — almost there",
          language
        );
      },
      onComplete: selectCard
    });

    controllers.push(controller);
  });

  gate.addEventListener("keydown", (event) => {
    if (event.key !== "Tab" || selected) {
      return;
    }

    const enabledCards = cards.filter((card) => !card.disabled);
    const first = enabledCards[0];
    const last = enabledCards[enabledCards.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  return {
    activate(preferredLanguage = "ja") {
      if (selected || active) {
        return;
      }

      active = true;
      gate.inert = false;
      gate.classList.add("is-active");
      cards.forEach((card) => {
        card.disabled = false;
      });
      window.requestAnimationFrame(() => {
        const preferredCard =
          cards.find((card) => card.dataset.language === preferredLanguage) ?? cards[0];

        preferredCard?.focus({ preventScroll: true });
      });
    }
  };
}
