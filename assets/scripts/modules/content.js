function fillText(selector, value) {
  document.querySelectorAll(selector).forEach((element) => {
    element.textContent = value;
  });
}

function renderSchedule(scheduleItems = []) {
  const lists = document.querySelectorAll("[data-schedule-list]");

  if (!lists.length) {
    return;
  }

  lists.forEach((list) => {
    list.innerHTML = "";

    scheduleItems.forEach((item) => {
      const entry = document.createElement("li");
      const time = document.createElement("time");
      const copy = document.createElement("div");
      const title = document.createElement("strong");
      const description = document.createElement("p");

      time.dateTime = item.time;
      time.textContent = item.time;
      title.textContent = item.title;
      description.textContent = item.description;

      copy.append(title, description);
      entry.append(time, copy);
      list.append(entry);
    });
  });
}

export function bindContent(config) {
  fillText("[data-couple-names]", config.coupleNames);
  fillText("[data-invitation-message]", config.invitationMessage);
  fillText("[data-date-display]", config.weddingDateDisplay);
  fillText("[data-wedding-time]", config.weddingTimeDisplay);
  fillText("[data-date-year]", config.dateReveal.year);
  fillText("[data-date-day]", config.dateReveal.day);
  fillText("[data-date-weekday]", config.dateReveal.weekday);
  fillText("[data-venue-name]", config.venue.name);
  fillText("[data-venue-address]", config.venue.address);
  fillText("[data-venue-access]", config.venue.access);
  fillText("[data-venue-note]", config.venue.note);
  fillText("[data-rsvp-deadline]", config.rsvpDeadline);
  fillText("[data-dining-name]", config.dining?.name ?? "");
  fillText("[data-photo-share-note]", config.photoShareNote ?? "");
  fillText("[data-okinawa-date]", config.chapters?.okinawa?.date ?? "");
  fillText("[data-ceremony-date]", config.chapters?.ceremony?.date ?? "");
  fillText("[data-friends-party-date]", config.chapters?.friendsParty?.date ?? "");
  fillText("[data-friends-party-note]", config.chapters?.friendsParty?.note ?? "");

  const mapEmbeds = document.querySelectorAll("[data-map-embed]");
  const mapLinks = document.querySelectorAll("[data-map-link]");
  const rsvpLinks = document.querySelectorAll("[data-rsvp-link]");

  mapEmbeds.forEach((mapEmbed) => {
    mapEmbed.src = config.mapEmbedUrl;
  });

  mapLinks.forEach((link) => {
    link.href = config.mapExternalUrl;
  });

  rsvpLinks.forEach((link) => {
    link.href = config.rsvpUrl;
  });

  renderSchedule(config.schedule);
}

export function setupPlaceholderLinks({ placeholderValue }) {
  const rsvpLinks = document.querySelectorAll("[data-rsvp-link]");

  if (!rsvpLinks.length) {
    return;
  }

  rsvpLinks.forEach((rsvpLink) => {
    rsvpLink.addEventListener("click", (event) => {
      if (rsvpLink.getAttribute("href") !== placeholderValue) {
        return;
      }

      event.preventDefault();
      window.alert("RSVP の URL はまだ仮設定です。assets/scripts/config.js の rsvpUrl を差し替えてください。");
    });
  });
}
