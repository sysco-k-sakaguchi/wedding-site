function drawScratchSurface(context, width, height) {
  const gradient = context.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#f5e2b6");
  gradient.addColorStop(0.4, "#cea760");
  gradient.addColorStop(0.72, "#a27834");
  gradient.addColorStop(1, "#7f5a22");

  context.clearRect(0, 0, width, height);
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  for (let index = 0; index < 15; index += 1) {
    context.strokeStyle = `rgba(255, 255, 255, ${0.05 + (index % 4) * 0.03})`;
    context.lineWidth = 1;
    context.beginPath();
    context.arc(width / 2, height / 2, width * (0.18 + index * 0.026), 0, Math.PI * 2);
    context.stroke();
  }

  for (let index = 0; index < 140; index += 1) {
    context.fillStyle = `rgba(255, 255, 255, ${Math.random() * 0.16})`;
    context.beginPath();
    context.arc(Math.random() * width, Math.random() * height, Math.random() * 1.8, 0, Math.PI * 2);
    context.fill();
  }
}

function getPointFromEvent(event, canvas) {
  const rect = canvas.getBoundingClientRect();

  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top
  };
}

function eraseCircle(context, point, size) {
  context.save();
  context.globalCompositeOperation = "destination-out";
  context.beginPath();
  context.arc(point.x, point.y, size, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function eraseStroke(context, from, to, size) {
  context.save();
  context.globalCompositeOperation = "destination-out";
  context.lineCap = "round";
  context.lineJoin = "round";
  context.lineWidth = size * 2;
  context.beginPath();
  context.moveTo(from.x, from.y);
  context.lineTo(to.x, to.y);
  context.stroke();
  context.restore();
}

function getClearedRatio(context, canvas) {
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  let transparentPixels = 0;
  let sampledPixels = 0;

  for (let index = 3; index < pixels.length; index += 40) {
    sampledPixels += 1;

    if (pixels[index] === 0) {
      transparentPixels += 1;
    }
  }

  return transparentPixels / sampledPixels;
}

export function setupScratch({
  completeRatio = 0.08,
  brushSize = 34,
  gestureDistance = 28,
  revealDelay = 260,
  onReveal
} = {}) {
  const seal = document.querySelector("[data-scratch-seal]");
  const canvas = document.querySelector("[data-scratch-canvas]");
  const status = document.querySelector("[data-scratch-status]");

  if (!seal || !canvas) {
    return;
  }

  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (!context) {
    return;
  }

  let drawing = false;
  let queued = false;
  let revealed = false;
  let travelled = 0;
  let sampleCounter = 0;
  let lastPoint = null;

  function revealDate() {
    if (revealed) {
      return;
    }

    revealed = true;
    queued = false;
    seal.classList.remove("is-clearing");
    seal.classList.add("is-revealed");
    context.clearRect(0, 0, canvas.width, canvas.height);

    if (status) {
      status.textContent = "日付が明かされました。続けてご案内をご覧ください。";
    }

    onReveal?.();
  }

  function queueReveal() {
    if (revealed || queued) {
      return;
    }

    queued = true;
    seal.classList.add("is-clearing");

    if (status) {
      status.textContent = "金のシールがほどけて、日付が現れます。";
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

  function handlePointerDown(event) {
    if (revealed) {
      return;
    }

    drawing = true;
    travelled = 0;
    sampleCounter = 0;
    lastPoint = getPointFromEvent(event, canvas);
    eraseCircle(context, lastPoint, brushSize * 0.72);

    if (seal.setPointerCapture) {
      seal.setPointerCapture(event.pointerId);
    }

    if (status) {
      status.textContent = "軽くなぞるか、そのまま離してください。";
    }
  }

  function handlePointerMove(event) {
    if (!drawing || !lastPoint || revealed) {
      return;
    }

    const point = getPointFromEvent(event, canvas);
    const distance = Math.hypot(point.x - lastPoint.x, point.y - lastPoint.y);

    if (distance === 0) {
      return;
    }

    travelled += distance;
    sampleCounter += 1;
    eraseStroke(context, lastPoint, point, brushSize);
    lastPoint = point;

    if (travelled >= gestureDistance) {
      queueReveal();
      return;
    }

    if (sampleCounter % 2 === 0 && getClearedRatio(context, canvas) >= completeRatio) {
      queueReveal();
    }
  }

  function handlePointerUp(event) {
    drawing = false;
    lastPoint = null;

    if (seal.hasPointerCapture?.(event.pointerId)) {
      seal.releasePointerCapture(event.pointerId);
    }

    if (!revealed) {
      queueReveal();
    }
  }

  function handleKeyDown(event) {
    if (revealed) {
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
  seal.addEventListener("pointercancel", () => {
    drawing = false;
    lastPoint = null;
  });
  seal.addEventListener("keydown", handleKeyDown);
  seal.addEventListener("click", () => {
    if (!revealed) {
      queueReveal();
    }
  });

  window.addEventListener("resize", resizeCanvas);

  return {
    refresh: resizeCanvas
  };
}
