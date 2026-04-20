export function setupRevealObserver() {
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (prefersReducedMotion || !("IntersectionObserver" in window)) {
    return {
      observe(target) {
        target?.classList.add("is-visible");
      },
      observeAll(targets) {
        Array.from(targets).forEach((target) => {
          target.classList.add("is-visible");
        });
      }
    };
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) {
          return;
        }

        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    {
      threshold: 0.18
    }
  );

  return {
    observe(target) {
      if (!target) {
        return;
      }

      observer.observe(target);
    },
    observeAll(targets) {
      Array.from(targets).forEach((target) => {
        observer.observe(target);
      });
    }
  };
}
