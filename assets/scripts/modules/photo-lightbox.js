function mod(value, divisor) {
  return ((value % divisor) + divisor) % divisor;
}

function formatIndex(value) {
  return String(value).padStart(2, "0");
}

export function setupPhotoLightbox() {
  const dialog = document.querySelector("[data-photo-lightbox]");
  const image = dialog?.querySelector("[data-photo-lightbox-image]");
  const closeButton = dialog?.querySelector("[data-photo-lightbox-close]");
  const previousButton = dialog?.querySelector("[data-photo-lightbox-previous]");
  const nextButton = dialog?.querySelector("[data-photo-lightbox-next]");
  const current = dialog?.querySelector("[data-photo-lightbox-current]");
  const total = dialog?.querySelector("[data-photo-lightbox-total]");
  const status = dialog?.querySelector("[data-photo-lightbox-status]");
  const triggers = Array.from(document.querySelectorAll("[data-photo-expand]"))
    .filter((trigger) => !trigger.closest("[data-photo-clone]"));

  if (!dialog || !image || !closeButton || triggers.length === 0) {
    return;
  }

  const sources = triggers.map((trigger) => {
    const preview = trigger.querySelector("img");

    return {
      altJa: preview?.dataset.photoAltJa ?? preview?.alt ?? "",
      altEn: preview?.dataset.photoAltEn ?? preview?.alt ?? "",
      fallback: trigger.dataset.photoFullSrc ?? preview?.currentSrc ?? preview?.src ?? "",
      srcset: trigger.dataset.photoFullSrcset ?? ""
    };
  });

  let activeIndex = 0;
  let returnFocus = null;
  let pointerId = null;
  let pointerStartX = 0;
  let pointerStartY = 0;
  let mouseSwipeActive = false;
  let mouseStartX = 0;
  let mouseStartY = 0;
  let lastSwipeAt = 0;

  if (total) {
    total.textContent = formatIndex(sources.length);
  }

  function preloadAdjacent() {
    if (sources.length < 2) {
      return;
    }

    [-1, 1].forEach((offset) => {
      const source = sources[mod(activeIndex + offset, sources.length)];
      const preload = new Image();

      preload.decoding = "async";
      if (source.srcset) {
        preload.srcset = source.srcset;
        preload.sizes = "100vw";
      }
      preload.src = source.fallback;
    });
  }

  function showPhoto(nextIndex, { announce = true } = {}) {
    activeIndex = mod(nextIndex, sources.length);
    const source = sources[activeIndex];

    const locale = document.documentElement.lang.toLowerCase().startsWith("en") ? "en" : "ja";

    image.alt = locale === "en" ? source.altEn : source.altJa;
    image.src = source.fallback;
    if (source.srcset) {
      image.srcset = source.srcset;
      image.sizes = "100vw";
    } else {
      image.removeAttribute("srcset");
      image.removeAttribute("sizes");
    }

    if (current) {
      current.textContent = formatIndex(activeIndex + 1);
    }

    if (status) {
      status.textContent = announce
        ? `${formatIndex(activeIndex + 1)} / ${formatIndex(sources.length)} — ${image.alt}`
        : "";
    }

    const hasMultiplePhotos = sources.length > 1;
    previousButton?.toggleAttribute("hidden", !hasMultiplePhotos);
    nextButton?.toggleAttribute("hidden", !hasMultiplePhotos);
    window.setTimeout(preloadAdjacent, 0);
  }

  function closeLightbox() {
    if (dialog.open) {
      dialog.close();
    }
  }

  function openLightbox(trigger) {
    const requestedIndex = triggers.indexOf(trigger);

    if (requestedIndex < 0) {
      return;
    }

    returnFocus = trigger;
    showPhoto(requestedIndex, { announce: false });
    document.body.classList.add("is-photo-lightbox-open");

    if (typeof dialog.showModal === "function") {
      dialog.showModal();
    } else {
      dialog.setAttribute("open", "");
    }

    closeButton.focus({ preventScroll: true });
  }

  function handleSwipe(deltaX, deltaY) {
    if (Math.abs(deltaX) < 48 || Math.abs(deltaX) <= Math.abs(deltaY) * 1.2) {
      return false;
    }

    lastSwipeAt = performance.now();
    showPhoto(activeIndex + (deltaX < 0 ? 1 : -1));
    return true;
  }

  document.addEventListener("click", (event) => {
    const trigger = event.target.closest?.("[data-photo-expand]");

    if (trigger && !trigger.closest("[data-photo-clone]")) {
      openLightbox(trigger);
    }
  });

  closeButton.addEventListener("click", closeLightbox);
  previousButton?.addEventListener("click", () => showPhoto(activeIndex - 1));
  nextButton?.addEventListener("click", () => showPhoto(activeIndex + 1));

  dialog.addEventListener("click", (event) => {
    const keepOpenTarget = event.target.closest?.(
      "[data-photo-lightbox-image], [data-photo-lightbox-previous], [data-photo-lightbox-next], [data-photo-lightbox-close]"
    );

    if (keepOpenTarget || performance.now() - lastSwipeAt < 250) {
      return;
    }

    closeLightbox();
  });

  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeLightbox();
  });

  dialog.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeLightbox();
      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      showPhoto(activeIndex - 1);
      return;
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      showPhoto(activeIndex + 1);
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      showPhoto(0);
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      showPhoto(sources.length - 1);
    }
  });

  dialog.addEventListener("pointerdown", (event) => {
    if (event.target.closest?.("button")) {
      return;
    }

    pointerId = event.pointerId;
    pointerStartX = event.clientX;
    pointerStartY = event.clientY;
  });

  dialog.addEventListener("pointerup", (event) => {
    if (event.pointerId !== pointerId) {
      return;
    }

    const deltaX = event.clientX - pointerStartX;
    const deltaY = event.clientY - pointerStartY;
    pointerId = null;

    handleSwipe(deltaX, deltaY);
  });

  dialog.addEventListener("pointercancel", () => {
    pointerId = null;
  });

  dialog.addEventListener("mousedown", (event) => {
    if (event.target.closest?.("button")) {
      return;
    }

    mouseSwipeActive = true;
    mouseStartX = event.clientX;
    mouseStartY = event.clientY;
  });

  dialog.addEventListener("mouseup", (event) => {
    if (!mouseSwipeActive) {
      return;
    }

    mouseSwipeActive = false;
    if (performance.now() - lastSwipeAt < 100) {
      return;
    }

    handleSwipe(event.clientX - mouseStartX, event.clientY - mouseStartY);
  });

  dialog.addEventListener("close", () => {
    document.body.classList.remove("is-photo-lightbox-open");
    image.removeAttribute("src");
    image.removeAttribute("srcset");
    image.removeAttribute("sizes");
    image.alt = "";
    if (returnFocus?.isConnected) {
      returnFocus.focus({ preventScroll: true });
    }

    returnFocus = null;
  });
}
