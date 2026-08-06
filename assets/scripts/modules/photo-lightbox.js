export function setupPhotoLightbox() {
  const dialog = document.querySelector("[data-photo-lightbox]");
  const image = dialog?.querySelector("[data-photo-lightbox-image]");
  const closeButton = dialog?.querySelector("[data-photo-lightbox-close]");

  if (!dialog || !image || !closeButton) {
    return;
  }

  let returnFocus = null;

  function closeLightbox() {
    if (dialog.open) {
      dialog.close();
    }
  }

  document.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-photo-expand]");

    if (!trigger || trigger.closest("[data-photo-clone]")) {
      return;
    }

    const preview = trigger.querySelector("img");
    const fullSource = trigger.dataset.photoFullSrc;

    if (!preview || !fullSource) {
      return;
    }

    returnFocus = trigger;
    image.alt = preview.alt;
    image.src = fullSource;
    document.body.classList.add("is-photo-lightbox-open");

    if (typeof dialog.showModal === "function") {
      dialog.showModal();
    } else {
      dialog.setAttribute("open", "");
    }

    closeButton.focus({ preventScroll: true });
  });

  closeButton.addEventListener("click", closeLightbox);

  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) {
      closeLightbox();
    }
  });

  dialog.addEventListener("close", () => {
    document.body.classList.remove("is-photo-lightbox-open");
    image.removeAttribute("src");
    image.alt = "";
    returnFocus?.focus({ preventScroll: true });
    returnFocus = null;
  });
}
