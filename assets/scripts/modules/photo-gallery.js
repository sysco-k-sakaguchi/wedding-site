function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function formatIndex(value) {
  return String(value).padStart(2, "0");
}

export function setupPhotoGallery() {
  const galleries = document.querySelectorAll("[data-photo-gallery]");

  galleries.forEach((gallery) => {
    const track = gallery.querySelector("[data-photo-gallery-track]");
    const slides = Array.from(gallery.querySelectorAll("[data-photo-slide]"));
    const dots = Array.from(gallery.querySelectorAll("[data-photo-dot]"));
    const current = gallery.querySelector("[data-photo-current]");
    const total = gallery.querySelector("[data-photo-total]");

    if (!track || !slides.length) {
      return;
    }

    let activeIndex = 0;
    let ticking = false;

    function setActive(index) {
      const nextIndex = clamp(index, 0, slides.length - 1);

      activeIndex = nextIndex;

      if (current) {
        current.textContent = formatIndex(activeIndex + 1);
      }

      if (total) {
        total.textContent = formatIndex(slides.length);
      }

      dots.forEach((dot, dotIndex) => {
        const isActive = dotIndex === activeIndex;
        dot.classList.toggle("is-active", isActive);

        if (isActive) {
          dot.setAttribute("aria-current", "true");
        } else {
          dot.removeAttribute("aria-current");
        }
      });
    }

    function updateFromScroll() {
      const currentOffset = track.scrollLeft;
      let closestIndex = 0;
      let closestDistance = Number.POSITIVE_INFINITY;

      slides.forEach((slide, index) => {
        const distance = Math.abs(slide.offsetLeft - currentOffset);

        if (distance < closestDistance) {
          closestDistance = distance;
          closestIndex = index;
        }
      });

      setActive(closestIndex);
      ticking = false;
    }

    function requestUpdate() {
      if (ticking) {
        return;
      }

      ticking = true;
      window.requestAnimationFrame(updateFromScroll);
    }

    dots.forEach((dot, index) => {
      dot.addEventListener("click", (event) => {
        event.preventDefault();
        slides[index]?.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
          inline: "start"
        });
        setActive(index);
      });
    });

    track.addEventListener("scroll", requestUpdate, {
      passive: true
    });

    track.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") {
        return;
      }

      event.preventDefault();
      const nextIndex = event.key === "ArrowRight" ? activeIndex + 1 : activeIndex - 1;
      const clampedIndex = clamp(nextIndex, 0, slides.length - 1);

      slides[clampedIndex]?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "start"
      });

      setActive(clampedIndex);
    });

    window.addEventListener("resize", requestUpdate, {
      passive: true
    });

    setActive(0);
  });
}
