function fillText(selector, value) {
  document.querySelectorAll(selector).forEach((element) => {
    element.textContent = value;
  });
}

function fillAttribute(selector, attribute, value) {
  document.querySelectorAll(selector).forEach((element) => {
    element.setAttribute(attribute, value);
  });
}

function renderSchedule(scheduleItems = []) {
  const lists = document.querySelectorAll("[data-schedule-list]");

  lists.forEach((list) => {
    list.innerHTML = "";

    scheduleItems.forEach((item) => {
      const entry = document.createElement("li");
      const time = document.createElement("time");
      const copy = document.createElement("div");
      const title = document.createElement("strong");

      time.dateTime = item.time;
      time.textContent = item.time;
      title.textContent = item.title;

      copy.append(title);

      if (item.description) {
        const description = document.createElement("p");

        description.textContent = item.description;
        copy.append(description);
      }

      entry.append(time, copy);
      list.append(entry);
    });
  });
}

function localizePhotoLabels(copy, locale) {
  document.querySelectorAll("[data-photo-image]").forEach((image) => {
    if (image.closest("[data-photo-clone]")) {
      return;
    }

    const localizedAlt = locale === "en"
      ? image.dataset.photoAltEn
      : image.dataset.photoAltJa;

    if (localizedAlt) {
      image.alt = localizedAlt;
    }

    const expandButton = image.closest("[data-photo-expand]");

    if (expandButton) {
      expandButton.setAttribute(
        "aria-label",
        locale === "en"
          ? `Enlarge photo: ${image.alt}`
          : `写真を拡大表示：${image.alt}`
      );
    }
  });

  document.querySelectorAll("[data-photo-dot] .sr-only").forEach((label, index) => {
    label.textContent = `${copy.photoDotPrefix} ${index + 1}`;
  });
}

function localizeStaticCopy(copy) {
  document.querySelectorAll("[data-i18n]").forEach((element) => {
    const key = element.dataset.i18n;

    if (copy[key] !== undefined) {
      element.textContent = copy[key];
    }
  });

  document.querySelectorAll("[data-i18n-aria-label]").forEach((element) => {
    const key = element.dataset.i18nAriaLabel;

    if (copy[key] !== undefined) {
      element.setAttribute("aria-label", copy[key]);
    }
  });

  document.querySelectorAll("[data-i18n-title]").forEach((element) => {
    const key = element.dataset.i18nTitle;

    if (copy[key] !== undefined) {
      element.title = copy[key];
    }
  });

  document.querySelectorAll("[data-i18n-alt]").forEach((element) => {
    const key = element.dataset.i18nAlt;

    if (copy[key] !== undefined) {
      element.alt = copy[key];
    }
  });
}

export function getLocaleConfig(config, locale) {
  return config.locales[locale] ?? config.locales[config.defaultLocale];
}

export function bindContent(config, locale = config.defaultLocale) {
  const localized = getLocaleConfig(config, locale);
  const copy = localized.copy;
  const metaDescription = document.querySelector('meta[name="description"]');

  document.documentElement.lang = locale;
  document.body.dataset.locale = locale;
  document.title = localized.metaTitle;

  if (metaDescription) {
    metaDescription.content = localized.metaDescription;
  }

  localizeStaticCopy(copy);
  fillText("[data-couple-names]", localized.coupleNames);
  fillText("[data-curtain-date]", config.shared.curtainDateDisplay);
  fillText("[data-invitation-message]", localized.invitationMessage);
  fillText("[data-date-display]", localized.weddingDateDisplay);
  fillText("[data-wedding-time]", localized.weddingTimeDisplay);
  fillText("[data-date-year]", localized.dateReveal.year);
  fillText("[data-date-day]", localized.dateReveal.day);
  fillText("[data-date-weekday]", localized.dateReveal.weekday);
  fillText("[data-venue-name]", localized.venue.name);
  fillText("[data-venue-address]", localized.venue.address);
  fillText("[data-venue-access]", localized.venue.access);
  fillText("[data-venue-note]", localized.venue.note);
  fillText("[data-rsvp-deadline]", localized.rsvpDeadline);
  fillText("[data-dining-name]", localized.dining.name);
  fillText("[data-dining-hall]", localized.dining.hall);
  fillText("[data-dining-note]", localized.dining.note);
  fillText("[data-photo-share-note]", localized.photoShareNote);
  fillText("[data-okinawa-date]", localized.chapters.okinawa.date);
  fillText("[data-okinawa-note]", localized.chapters.okinawa.note);
  fillText("[data-ceremony-date]", localized.chapters.ceremony.date);
  fillText("[data-ceremony-note]", localized.chapters.ceremony.note);
  fillText("[data-friends-party-date]", localized.chapters.friendsParty.date);
  fillText("[data-friends-party-note]", localized.chapters.friendsParty.note);
  fillText("[data-closing-message]", localized.closingMessage);
  fillText("[data-language-switch-label]", copy.languageSwitchLabel);
  fillAttribute("[data-language-switch]", "aria-label", copy.languageSwitchAria);

  document.querySelectorAll("[data-map-embed]").forEach((mapEmbed) => {
    mapEmbed.src = localized.mapEmbedUrl;
  });

  document.querySelectorAll("[data-map-link]").forEach((link) => {
    link.href = config.shared.mapExternalUrl;
  });

  fillAttribute("[data-dining-map-embed]", "src", localized.dining.mapEmbedUrl);
  fillAttribute("[data-dining-map-link]", "href", localized.dining.mapExternalUrl);
  fillAttribute("[data-dining-venue-page-link]", "href", localized.dining.venuePageUrl);

  document.querySelectorAll("[data-rsvp-link]").forEach((link) => {
    link.href = config.shared.rsvpUrl;
  });

  renderSchedule(localized.schedule);
  localizePhotoLabels(copy, locale);

  return localized;
}

export function setupPlaceholderLinks({ placeholderValue, getMessage }) {
  document.querySelectorAll("[data-rsvp-link]").forEach((rsvpLink) => {
    rsvpLink.addEventListener("click", (event) => {
      if (rsvpLink.getAttribute("href") !== placeholderValue) {
        return;
      }

      event.preventDefault();
      window.alert(getMessage());
    });
  });
}
