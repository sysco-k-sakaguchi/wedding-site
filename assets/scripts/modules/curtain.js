export function setupCurtain({
  introDelay = 700,
  openDuration = 2200,
  revealDelay = 180,
  onComplete
} = {}) {
  const stage = document.querySelector("[data-curtain-stage]");
  const caption = document.querySelector("[data-curtain-caption]");
  const scrollHint = document.querySelector("[data-curtain-scroll]");
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (!stage) {
    return;
  }

  let completed = false;
  const timers = [];

  function queueTimer(callback, delay) {
    const timerId = window.setTimeout(callback, delay);
    timers.push(timerId);
  }

  function clearTimers() {
    timers.forEach((timerId) => {
      window.clearTimeout(timerId);
    });
    timers.length = 0;
  }

  function updateCaption(text) {
    if (caption) {
      caption.textContent = text;
    }
  }

  function showScrollHint() {
    if (!scrollHint) {
      return;
    }

    scrollHint.hidden = false;

    window.requestAnimationFrame(() => {
      scrollHint.classList.add("is-visible");
    });
  }

  function finishCurtain() {
    if (completed) {
      return;
    }

    completed = true;
    clearTimers();
    stage.classList.remove("is-waiting", "is-opening");
    stage.classList.add("is-open");
    updateCaption("招待状が開きました。続きを下へスクロールしてご覧ください。");
    showScrollHint();
    onComplete?.();
  }

  function startSequence() {
    stage.classList.add("is-waiting");
    updateCaption("短いオープニングのあとに、招待状が現れます。");

    if (prefersReducedMotion) {
      queueTimer(finishCurtain, 200);
      return;
    }

    queueTimer(() => {
      stage.classList.add("is-opening");
      updateCaption("幕がひらいています。");
    }, introDelay);

    queueTimer(() => {
      updateCaption("招待状が見えてきました。");
    }, introDelay + openDuration * 0.72);

    queueTimer(finishCurtain, introDelay + openDuration + revealDelay);
  }

  // 触れた場合だけ、演出をすぐ終えて次へ進める保険を残しています。
  stage.addEventListener("click", () => {
    if (!completed) {
      finishCurtain();
    }
  });

  window.requestAnimationFrame(startSequence);

  return {
    finish: finishCurtain
  };
}
