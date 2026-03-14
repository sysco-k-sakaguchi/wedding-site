function drawScratchSurface(context, width, height) {
  const gradient = context.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#f3deb2");
  gradient.addColorStop(0.5, "#c9a45f");
  gradient.addColorStop(1, "#8a6426");

  context.clearRect(0, 0, width, height);
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  for (let index = 0; index < 16; index += 1) {
    const radius = width * (0.34 + (index % 4) * 0.035);
    context.strokeStyle = `rgba(255, 255, 255, ${0.1 + (index % 3) * 0.05})`;
    context.lineWidth = 1.2;
    context.beginPath();
    context.arc(width / 2, height / 2, radius, 0, Math.PI * 2);
    context.stroke();
  }

  for (let index = 0; index < 90; index += 1) {
    context.fillStyle = `rgba(255, 255, 255, ${Math.random() * 0.18})`;
    context.beginPath();
    context.arc(Math.random() * width, Math.random() * height, Math.random() * 2.2, 0, Math.PI * 2);
    context.fill();
  }
}

export function setupScratch({ completeRatio = 0.42, brushSize = 22, onReveal } = {}) {
  const seal = document.querySelector("[data-scratch-seal]");
  const canvas = document.querySelector("[data-scratch-canvas]");
  const fallbackButton = document.querySelector("[data-scratch-reveal]");
  const status = document.querySelector("[data-scratch-status]");

  if (!seal || !canvas) {
    return;
  }

  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (!context) {
    return;
  }

  let drawing = false;
  let revealed = false;
  let sampleCounter = 0;

  function revealDate() {
    if (revealed) {
      return;
    }

    revealed = true;
    seal.classList.add("is-revealed");
    context.clearRect(0, 0, canvas.width, canvas.height);

    if (status) {
      status.textContent = "日付が明かされました。続けて詳細をご覧ください。";
    }

    if (fallbackButton) {
      fallbackButton.hidden = true;
    }

    onReveal?.();
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

  function scratchAt(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    context.save();
    context.globalCompositeOperation = "destination-out";
    context.beginPath();
    context.arc(x, y, brushSize, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  function getScratchedRatio() {
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let transparentPixels = 0;
    let sampledPixels = 0;

    for (let index = 3; index < pixels.length; index += 32) {
      sampledPixels += 1;

      if (pixels[index] === 0) {
        transparentPixels += 1;
      }
    }

    return transparentPixels / sampledPixels;
  }

  function handlePointerDown(event) {
    if (revealed) {
      return;
    }

    drawing = true;
    canvas.setPointerCapture(event.pointerId);
    scratchAt(event.clientX, event.clientY);

    if (status) {
      status.textContent = "そのまま指で円をこするように動かしてください。";
    }
  }

  function handlePointerMove(event) {
    if (!drawing || revealed) {
      return;
    }

    scratchAt(event.clientX, event.clientY);
    sampleCounter += 1;

    if (sampleCounter % 8 === 0 && getScratchedRatio() >= completeRatio) {
      revealDate();
    }
  }

  function handlePointerUp(event) {
    drawing = false;

    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }

    if (!revealed && getScratchedRatio() >= completeRatio) {
      revealDate();
    }
  }

  resizeCanvas();

  canvas.addEventListener("pointerdown", handlePointerDown);
  canvas.addEventListener("pointermove", handlePointerMove);
  canvas.addEventListener("pointerup", handlePointerUp);
  canvas.addEventListener("pointercancel", () => {
    drawing = false;
  });

  fallbackButton?.addEventListener("click", revealDate);
  window.addEventListener("resize", resizeCanvas);

  return {
    refresh: resizeCanvas
  };
}
