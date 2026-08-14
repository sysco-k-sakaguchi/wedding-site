function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function mod(value, divisor) {
  return ((value % divisor) + divisor) % divisor;
}

function formatIndex(value) {
  return String(value).padStart(2, "0");
}

function createClone(slide, logicalIndex) {
  const clone = slide.cloneNode(true);

  clone.removeAttribute("id");
  clone.dataset.photoClone = "true";
  clone.dataset.logicalIndex = String(logicalIndex);
  clone.setAttribute("aria-hidden", "true");

  clone.querySelectorAll("[id]").forEach((element) => {
    element.removeAttribute("id");
  });

  clone.querySelectorAll("img").forEach((image) => {
    image.alt = "";
  });

  clone.querySelectorAll("[data-photo-expand]").forEach((trigger) => {
    trigger.removeAttribute("data-photo-expand");
    trigger.setAttribute("tabindex", "-1");
  });

  return clone;
}

export function setupPhotoGallery() {
  const galleries = document.querySelectorAll("[data-photo-gallery]");
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  galleries.forEach((gallery) => {
    const viewport = gallery.querySelector("[data-photo-gallery-track]");
    const sourceSlides = Array.from(gallery.querySelectorAll("[data-photo-slide]"));
    const dots = Array.from(gallery.querySelectorAll("[data-photo-dot]"));
    const current = gallery.querySelector("[data-photo-current]");
    const total = gallery.querySelector("[data-photo-total]");
    const status = gallery.querySelector("[data-photo-status]");
    const autoplayButton = gallery.querySelector("[data-photo-autoplay]");

    if (!viewport || sourceSlides.length === 0) {
      return;
    }

    if (total) {
      total.textContent = formatIndex(sourceSlides.length);
    }

    if (gallery.hasAttribute("data-photo-gallery-static")) {
      sourceSlides.forEach((slide, index) => {
        slide.classList.toggle("is-active", index === 0);
      });

      if (current) {
        current.textContent = formatIndex(1);
      }

      return;
    }

    if (sourceSlides.length === 1) {
      if (current) {
        current.textContent = formatIndex(1);
      }

      return;
    }

    const rail = document.createElement("div");

    rail.className = "photo-carousel__rail";
    rail.dataset.photoGalleryRail = "true";

    const leadingClone = createClone(sourceSlides[sourceSlides.length - 1], sourceSlides.length - 1);
    const trailingClone = createClone(sourceSlides[0], 0);

    sourceSlides.forEach((slide, index) => {
      slide.dataset.logicalIndex = String(index);
    });

    viewport.innerHTML = "";
    rail.append(leadingClone, ...sourceSlides, trailingClone);
    viewport.appendChild(rail);

    const renderedSlides = Array.from(rail.querySelectorAll("[data-photo-slide]"));
    const transitionDuration = prefersReducedMotion ? 0 : 520;
    const autoplayDelay = 4400;
    const interactionResumeDelay = 5200;
    const axisIntentDistance = 4;
    const axisCommitDistance = 10;
    const snapThresholdRatio = 0.11;
    const flickProjection = 160;

    let slideWidth = 0;
    let renderedIndex = 1;
    let activeIndex = 0;
    let dragging = false;
    let horizontalDragging = false;
    let animationLocked = false;
    let pointerId = null;
    let startX = 0;
    let startY = 0;
    let dragOffset = 0;
    let startOffset = 0;
    let axisLock = "";
    let autoTimer = 0;
    let resumeTimer = 0;
    let pendingDragFrame = 0;
    let pendingDragOffset = 0;
    let velocitySamples = [];
    let autoplayEnabled = !prefersReducedMotion;
    let pointerHovering = false;
    let galleryInView = false;

    function setTimer(callback, delay) {
      return window.setTimeout(callback, delay);
    }

    function stopAutoLoop() {
      window.clearTimeout(autoTimer);
      window.clearTimeout(resumeTimer);
      autoTimer = 0;
      resumeTimer = 0;
    }

    function canRunAutoLoop() {
      const activeElementIsAutoplayButton =
        Boolean(autoplayButton) && document.activeElement === autoplayButton;
      const focusBlocksAutoplay =
        gallery.contains(document.activeElement) && !activeElementIsAutoplayButton;
      const experienceOverlayIsOpen =
        document.body.classList.contains("is-curtain-active") ||
        document.body.classList.contains("is-language-active");

      return (
        autoplayEnabled &&
        galleryInView &&
        !document.hidden &&
        !dragging &&
        !pointerHovering &&
        !focusBlocksAutoplay &&
        !experienceOverlayIsOpen &&
        !document.body.classList.contains("is-photo-lightbox-open")
      );
    }

    function updateAutoplayPresentation() {
      if (autoplayButton) {
        autoplayButton.setAttribute("aria-pressed", String(autoplayEnabled));
      }

      if (status) {
        status.setAttribute("aria-live", canRunAutoLoop() ? "off" : "polite");
      }
    }

    function queueAutoLoop(delay = autoplayDelay) {
      stopAutoLoop();
      updateAutoplayPresentation();

      if (!canRunAutoLoop()) {
        return;
      }

      autoTimer = setTimer(() => {
        autoTimer = 0;

        if (!canRunAutoLoop()) {
          updateAutoplayPresentation();
          return;
        }

        goToRenderedIndex(renderedIndex + 1, {
          animated: true,
          fromAutoplay: true
        });
      }, delay);
    }

    function syncAutoLoopAvailability(delay = autoplayDelay) {
      if (canRunAutoLoop()) {
        queueAutoLoop(delay);
        return;
      }

      stopAutoLoop();
      updateAutoplayPresentation();
    }

    function pauseAutoLoop() {
      stopAutoLoop();
      updateAutoplayPresentation();

      if (!autoplayEnabled) {
        return;
      }

      resumeTimer = setTimer(() => {
        queueAutoLoop();
      }, interactionResumeDelay);
    }

    function logicalFromRendered(index) {
      return mod(index - 1, sourceSlides.length);
    }

    function setTrackOffset(offset, animated) {
      rail.style.transition = animated
        ? `transform ${transitionDuration}ms cubic-bezier(0.16, 1, 0.3, 1)`
        : "none";
      rail.style.transform = `translate3d(${offset}px, 0, 0)`;
      syncSlideTransforms(offset, horizontalDragging);
    }

    function syncSlideTransforms(offset, isInteractive = false) {
      if (!slideWidth) {
        return;
      }

      const reference = -offset / slideWidth;

      renderedSlides.forEach((slide, index) => {
        const distance = index - reference;
        const absDistance = Math.min(Math.abs(distance), 2.4);
        const direction = absDistance === 0 ? 0 : distance / Math.abs(distance);
        const shift = direction * Math.min(absDistance * (isInteractive ? 12 : 18), isInteractive ? 16 : 24);
        const rotate = direction * Math.min(absDistance * (isInteractive ? 10 : 24), isInteractive ? 12 : 32);
        const scale = 1 - Math.min(absDistance * (isInteractive ? 0.05 : 0.08), isInteractive ? 0.1 : 0.18);
        const opacity = 1 - Math.min(absDistance * (isInteractive ? 0.24 : 0.38), isInteractive ? 0.48 : 0.72);
        const blur = Math.min(absDistance * (isInteractive ? 0.55 : 1.8), isInteractive ? 1.2 : 3.8);
        const shadow = 0.08 + Math.max(0, (isInteractive ? 0.14 : 0.2) - absDistance * (isInteractive ? 0.05 : 0.07));
        const captionOpacity = 1 - Math.min(absDistance * (isInteractive ? 0.28 : 0.36), isInteractive ? 0.5 : 0.58);
        const indexOpacity = 0.88 - Math.min(absDistance * (isInteractive ? 0.18 : 0.24), isInteractive ? 0.38 : 0.48);

        slide.style.setProperty("--photo-shift", shift.toFixed(3));
        slide.style.setProperty("--photo-rotate", rotate.toFixed(3));
        slide.style.setProperty("--photo-scale", scale.toFixed(3));
        slide.style.setProperty("--photo-opacity", Math.max(0.28, opacity).toFixed(3));
        slide.style.setProperty("--photo-blur", blur.toFixed(3));
        slide.style.setProperty("--photo-shadow", shadow.toFixed(3));
        slide.style.setProperty("--photo-caption-opacity", Math.max(0.34, captionOpacity).toFixed(3));
        slide.style.setProperty("--photo-index-opacity", Math.max(0.32, indexOpacity).toFixed(3));
        slide.style.zIndex = String(40 - Math.round(absDistance * 10));
        slide.classList.toggle("is-active", absDistance < 0.5);
      });
    }

    function startHorizontalDrag() {
      if (horizontalDragging) {
        return;
      }

      horizontalDragging = true;
      gallery.classList.add("is-dragging");
      viewport.classList.add("is-grabbing");
      rail.style.transition = "none";

      if (pointerId !== null && viewport.setPointerCapture) {
        viewport.setPointerCapture(pointerId);
      }
    }

    function queueDragOffset(offset) {
      pendingDragOffset = offset;

      if (pendingDragFrame) {
        return;
      }

      pendingDragFrame = window.requestAnimationFrame(() => {
        pendingDragFrame = 0;

        if (!horizontalDragging) {
          return;
        }

        setTrackOffset(startOffset + pendingDragOffset, false);
      });
    }

    function updateStatus() {
      activeIndex = logicalFromRendered(renderedIndex);

      if (current) {
        current.textContent = formatIndex(activeIndex + 1);
      }

      dots.forEach((dot, index) => {
        const isActive = index === activeIndex;

        dot.classList.toggle("is-active", isActive);

        if (isActive) {
          dot.setAttribute("aria-current", "true");
        } else {
          dot.removeAttribute("aria-current");
        }
      });

      const activeSlide = sourceSlides[activeIndex];
      const activeTrigger = activeSlide?.querySelector("[data-photo-expand]");
      const focusedSlide = document.activeElement?.closest?.("[data-photo-slide]");

      if (focusedSlide && focusedSlide !== activeSlide && activeTrigger) {
        activeSlide.removeAttribute("aria-hidden");
        activeTrigger.tabIndex = 0;
        activeTrigger.focus({ preventScroll: true });
      }

      sourceSlides.forEach((slide, index) => {
        const expandButton = slide.querySelector("[data-photo-expand]");
        const isActive = index === activeIndex;

        if (isActive) {
          slide.removeAttribute("aria-hidden");
        } else {
          slide.setAttribute("aria-hidden", "true");
        }

        if (expandButton) {
          expandButton.tabIndex = isActive ? 0 : -1;
        }
      });
    }

    function resumeAutoLoopAfterLightbox() {
      stopAutoLoop();
      window.requestAnimationFrame(() => {
        queueAutoLoop(interactionResumeDelay);
      });
    }

    function jumpToRenderedIndex(nextRenderedIndex) {
      renderedIndex = nextRenderedIndex;
      updateStatus();
      setTrackOffset(-(renderedIndex * slideWidth), false);
    }

    function normalizeLoopEdges() {
      if (renderedIndex === 0) {
        jumpToRenderedIndex(sourceSlides.length);
        return;
      }

      if (renderedIndex === sourceSlides.length + 1) {
        jumpToRenderedIndex(1);
      }
    }

    function goToRenderedIndex(nextRenderedIndex, { animated = true, fromAutoplay = false } = {}) {
      if (animationLocked && animated) {
        return;
      }

      if (nextRenderedIndex === renderedIndex) {
        updateStatus();

        if (!fromAutoplay) {
          pauseAutoLoop();
        }

        return;
      }

      renderedIndex = nextRenderedIndex;
      updateStatus();

      if (animated && transitionDuration > 0) {
        animationLocked = true;
      }

      gallery.classList.toggle("is-animating", animated && transitionDuration > 0);
      setTrackOffset(-(renderedIndex * slideWidth), animated && transitionDuration > 0);

      if (!animated || transitionDuration === 0) {
        normalizeLoopEdges();

        if (!fromAutoplay) {
          pauseAutoLoop();
        }
      }
    }

    function goToLogicalIndex(targetIndex) {
      const desired = clamp(targetIndex, 0, sourceSlides.length - 1);
      let nextRenderedIndex = desired + 1;

      if (activeIndex === 0 && desired === sourceSlides.length - 1) {
        nextRenderedIndex = 0;
      } else if (activeIndex === sourceSlides.length - 1 && desired === 0) {
        nextRenderedIndex = sourceSlides.length + 1;
      }

      goToRenderedIndex(nextRenderedIndex);
    }

    function measure() {
      animationLocked = false;
      gallery.classList.remove("is-animating");
      normalizeLoopEdges();
      slideWidth = viewport.getBoundingClientRect().width;
      jumpToRenderedIndex(renderedIndex);
    }

    function finishDrag() {
      if (!dragging) {
        return;
      }

      const finalDragOffset = dragOffset;
      const threshold = Math.min(slideWidth * snapThresholdRatio, 52);
      const firstSample = velocitySamples[0] ?? {
        x: startX,
        time: performance.now()
      };
      const lastSample = velocitySamples[velocitySamples.length - 1] ?? firstSample;
      const elapsed = Math.max(1, lastSample.time - firstSample.time);
      const velocity = (lastSample.x - firstSample.x) / elapsed;
      const projectedOffset = finalDragOffset + velocity * flickProjection;
      const horizontalDrag = horizontalDragging;

      dragging = false;
      horizontalDragging = false;
      pendingDragOffset = 0;

      if (pendingDragFrame) {
        window.cancelAnimationFrame(pendingDragFrame);
        pendingDragFrame = 0;
      }

      dragOffset = 0;
      axisLock = "";
      velocitySamples = [];
      gallery.classList.remove("is-dragging");
      viewport.classList.remove("is-grabbing");

      if (!horizontalDrag) {
        queueAutoLoop();
        return;
      }

      if (projectedOffset < -threshold) {
        goToRenderedIndex(renderedIndex + 1);
        return;
      }

      if (projectedOffset > threshold) {
        goToRenderedIndex(renderedIndex - 1);
        return;
      }

      setTrackOffset(-(renderedIndex * slideWidth), true);
      pauseAutoLoop();
    }

    function handlePointerMove(event) {
      if (!dragging || event.pointerId !== pointerId) {
        return;
      }

      const deltaX = event.clientX - startX;
      const deltaY = event.clientY - startY;

      if (!axisLock) {
        const absDeltaX = Math.abs(deltaX);
        const absDeltaY = Math.abs(deltaY);

        if (absDeltaX < axisIntentDistance && absDeltaY < axisIntentDistance) {
          return;
        }

        if (absDeltaX >= axisIntentDistance && absDeltaX > absDeltaY * 1.02) {
          axisLock = "x";
        } else if (absDeltaY >= axisIntentDistance && absDeltaY > absDeltaX * 1.12) {
          axisLock = "y";
        } else if (absDeltaX >= axisCommitDistance || absDeltaY >= axisCommitDistance) {
          axisLock = absDeltaX > absDeltaY ? "x" : "y";
        } else {
          return;
        }
      }

      if (axisLock === "x") {
        startHorizontalDrag();
      }

      if (axisLock !== "x") {
        return;
      }

      event.preventDefault();
      dragOffset = clamp(deltaX, -slideWidth * 1.08, slideWidth * 1.08);
      queueDragOffset(dragOffset);

      velocitySamples.push({
        x: event.clientX,
        time: performance.now()
      });

      if (velocitySamples.length > 5) {
        velocitySamples.shift();
      }
    }

    function handlePointerEnd(event) {
      if (pointerId === null || event.pointerId !== pointerId) {
        return;
      }

      if (viewport.hasPointerCapture?.(event.pointerId)) {
        viewport.releasePointerCapture(event.pointerId);
      }

      pointerId = null;
      finishDrag();
    }

    dots.forEach((dot, index) => {
      dot.addEventListener("click", (event) => {
        event.preventDefault();
        goToLogicalIndex(index);
      });
    });

    autoplayButton?.addEventListener("click", () => {
      autoplayEnabled = !autoplayEnabled;

      if (autoplayEnabled) {
        queueAutoLoop();
        return;
      }

      stopAutoLoop();
      updateAutoplayPresentation();
    });

    viewport.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "mouse" && event.button !== 0) {
        return;
      }

      if (animationLocked) {
        return;
      }

      pointerId = event.pointerId;
      dragging = true;
      horizontalDragging = false;
      dragOffset = 0;
      startX = event.clientX;
      startY = event.clientY;
      startOffset = -(renderedIndex * slideWidth);
      axisLock = "";
      velocitySamples = [
        {
          x: event.clientX,
          time: performance.now()
        }
      ];

      stopAutoLoop();
      updateAutoplayPresentation();
    });

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerEnd);
    window.addEventListener("pointercancel", handlePointerEnd);

    viewport.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") {
        return;
      }

      event.preventDefault();

      if (event.key === "ArrowRight") {
        goToRenderedIndex(renderedIndex + 1);
        return;
      }

      goToRenderedIndex(renderedIndex - 1);
    });

    rail.addEventListener("transitionend", (event) => {
      if (event.target !== rail || event.propertyName !== "transform") {
        return;
      }

      animationLocked = false;
      gallery.classList.remove("is-animating");
      normalizeLoopEdges();
      queueAutoLoop();
    });

    rail.addEventListener("transitioncancel", (event) => {
      if (event.target !== rail || event.propertyName !== "transform") {
        return;
      }

      animationLocked = false;
      gallery.classList.remove("is-animating");
      normalizeLoopEdges();
      queueAutoLoop();
    });

    gallery.addEventListener("pointerenter", (event) => {
      if (event.pointerType !== "mouse") {
        return;
      }

      pointerHovering = true;
      stopAutoLoop();
      updateAutoplayPresentation();
    });
    gallery.addEventListener("pointerleave", (event) => {
      if (event.pointerType !== "mouse") {
        return;
      }

      pointerHovering = false;
      queueAutoLoop();
    });
    gallery.addEventListener("focusin", () => {
      stopAutoLoop();
      updateAutoplayPresentation();
    });
    gallery.addEventListener("focusout", () => {
      window.requestAnimationFrame(() => {
        queueAutoLoop();
      });
    });

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        stopAutoLoop();
        updateAutoplayPresentation();
        return;
      }

      queueAutoLoop();
    });

    document.querySelector("[data-photo-lightbox]")?.addEventListener(
      "close",
      resumeAutoLoopAfterLightbox
    );

    if ("IntersectionObserver" in window) {
      const autoplayViewportObserver = new IntersectionObserver(
        (entries) => {
          const entry = entries[0];

          galleryInView = Boolean(entry?.isIntersecting);
          syncAutoLoopAvailability();
        },
        { threshold: 0.12 }
      );

      autoplayViewportObserver.observe(gallery);
    } else {
      const updateGalleryVisibility = () => {
        const rect = gallery.getBoundingClientRect();

        galleryInView = rect.bottom > 0 && rect.top < window.innerHeight;
        syncAutoLoopAvailability();
      };

      window.addEventListener("scroll", updateGalleryVisibility, { passive: true });
      window.addEventListener("resize", updateGalleryVisibility, { passive: true });
      updateGalleryVisibility();
    }

    if ("MutationObserver" in window) {
      const experienceStateObserver = new MutationObserver(() => {
        syncAutoLoopAvailability();
      });

      experienceStateObserver.observe(document.body, {
        attributes: true,
        attributeFilter: ["class"]
      });
    }

    window.addEventListener("resize", measure, {
      passive: true
    });

    measure();
    updateAutoplayPresentation();
  });
}
