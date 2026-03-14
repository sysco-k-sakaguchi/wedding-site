function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function setupCurtain({ threshold = 0.82, onComplete } = {}) {
  const stage = document.querySelector("[data-curtain-stage]");
  const frame = document.querySelector("[data-curtain-frame]");
  const handle = document.querySelector("[data-curtain-handle]");
  const hint = document.querySelector("[data-curtain-hint]");
  const skipButton = document.querySelector("[data-curtain-skip]");

  if (!stage || !frame || !handle) {
    return;
  }

  let progress = 0;
  let completed = false;
  let session = null;

  function applyProgress(nextProgress) {
    progress = clamp(nextProgress, 0, 1);
    stage.style.setProperty("--curtain-progress", progress.toFixed(3));
  }

  function finishCurtain() {
    if (completed) {
      return;
    }

    completed = true;
    applyProgress(1);
    stage.classList.add("is-open");

    if (hint) {
      hint.textContent = "招待状を開きました。";
    }

    onComplete?.();
  }

  function resetCurtain() {
    session = null;

    if (completed) {
      return;
    }

    applyProgress(0);

    if (hint) {
      hint.textContent = "中央を指で左右へ動かして、カーテンを開いてください。";
    }
  }

  function startDrag(event) {
    if (completed) {
      return;
    }

    session = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY
    };

    frame.setPointerCapture(event.pointerId);

    if (hint) {
      hint.textContent = "そのまま横へスワイプして開いてください。";
    }
  }

  function moveDrag(event) {
    if (!session || session.pointerId !== event.pointerId || completed) {
      return;
    }

    const deltaX = Math.abs(event.clientX - session.startX);
    const deltaY = Math.abs(event.clientY - session.startY);

    if (deltaY > deltaX * 1.25) {
      return;
    }

    const maxDistance = frame.clientWidth * 0.34;
    const nextProgress = deltaX / maxDistance;

    applyProgress(nextProgress);
  }

  function endDrag(event) {
    if (!session || session.pointerId !== event.pointerId) {
      return;
    }

    frame.releasePointerCapture(event.pointerId);

    if (progress >= threshold) {
      finishCurtain();
      return;
    }

    resetCurtain();
  }

  frame.addEventListener("pointerdown", startDrag);
  frame.addEventListener("pointermove", moveDrag);
  frame.addEventListener("pointerup", endDrag);
  frame.addEventListener("pointercancel", resetCurtain);

  handle.addEventListener("click", finishCurtain);
  skipButton?.addEventListener("click", finishCurtain);
}
