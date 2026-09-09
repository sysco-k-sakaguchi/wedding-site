export function setupBusMapDialog() {
  const dialog = document.querySelector("[data-bus-map-dialog]");
  const image = dialog?.querySelector("[data-bus-map-dialog-image]");
  const title = dialog?.querySelector("[data-bus-map-dialog-title]");
  const originalLink = dialog?.querySelector("[data-bus-map-dialog-original]");
  const closeButton = dialog?.querySelector("[data-bus-map-dialog-close]");
  const triggers = Array.from(document.querySelectorAll("[data-bus-map-expand]"));

  if (!dialog || !image || !title || !originalLink || !closeButton || triggers.length === 0) {
    return;
  }

  let returnFocus = null;
  let scrollX = 0;
  let scrollY = 0;

  function closeDialog() {
    if (dialog.open) {
      dialog.close();
    }
  }

  function openDialog(trigger) {
    const source = trigger.dataset.busMapFullSrc;

    if (!source) {
      return;
    }

    const preview = trigger.querySelector("img");
    const resolvedSource = new URL(source, document.baseURI).href;

    returnFocus = trigger;
    scrollX = window.scrollX;
    scrollY = window.scrollY;
    title.textContent = trigger.dataset.busMapTitle ?? preview?.alt ?? "";
    image.src = resolvedSource;
    image.alt = preview?.alt ?? "";
    image.width = Number(trigger.dataset.busMapWidth) || preview?.naturalWidth || 1;
    image.height = Number(trigger.dataset.busMapHeight) || preview?.naturalHeight || 1;
    originalLink.href = resolvedSource;
    document.body.classList.add("is-bus-map-dialog-open");

    if (typeof dialog.showModal === "function") {
      dialog.showModal();
    } else {
      dialog.setAttribute("open", "");
    }

    closeButton.focus({ preventScroll: true });
  }

  triggers.forEach((trigger) => {
    trigger.addEventListener("click", () => openDialog(trigger));
    trigger.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openDialog(trigger);
      }
    });
  });

  closeButton.addEventListener("click", closeDialog);

  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) {
      closeDialog();
    }
  });

  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeDialog();
  });

  dialog.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeDialog();
      return;
    }

    if (event.key === "Tab") {
      const focusableElements = [originalLink, closeButton].filter(
        (element) => element.getClientRects().length > 0
      );

      if (focusableElements.length === 0) {
        return;
      }

      const currentIndex = focusableElements.indexOf(document.activeElement);
      const direction = event.shiftKey ? -1 : 1;
      const nextIndex = currentIndex < 0
        ? 0
        : (currentIndex + direction + focusableElements.length) % focusableElements.length;

      event.preventDefault();
      focusableElements[nextIndex].focus({ preventScroll: true });
    }
  });

  dialog.addEventListener("close", () => {
    const focusTarget = returnFocus;
    const documentElement = document.documentElement;
    const previousScrollBehavior = documentElement.style.scrollBehavior;

    returnFocus = null;
    document.body.classList.remove("is-bus-map-dialog-open");
    image.removeAttribute("src");
    image.alt = "";
    originalLink.removeAttribute("href");

    if (focusTarget?.isConnected) {
      focusTarget.focus({ preventScroll: true });
    }

    documentElement.style.scrollBehavior = "auto";
    window.scrollTo(scrollX, scrollY);
    window.requestAnimationFrame(() => {
      if (previousScrollBehavior) {
        documentElement.style.scrollBehavior = previousScrollBehavior;
      } else {
        documentElement.style.removeProperty("scroll-behavior");
      }
    });
  });
}
