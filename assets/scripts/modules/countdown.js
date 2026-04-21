export function setupCountdown(config) {
  const root = document.querySelector("[data-countdown-root]");
  const days = document.querySelector("[data-countdown-days]");
  const label = document.querySelector("[data-countdown-label]");
  const unit = document.querySelector("[data-countdown-unit]");

  if (!root || !days || !label || !unit) {
    return;
  }

  const targetDate = new Date(config.weddingDateIso);

  if (Number.isNaN(targetDate.getTime())) {
    label.textContent = "日付設定をご確認ください";
    days.textContent = "";
    unit.textContent = "";
    return;
  }

  function updateCountdown() {
    const now = new Date();
    const diff = targetDate.getTime() - now.getTime();

    if (diff <= 0) {
      root.classList.add("is-today");
      label.textContent = "本日は結婚式当日です";
      days.textContent = "";
      unit.textContent = "";
      return;
    }

    const daysRemaining = Math.ceil(diff / (1000 * 60 * 60 * 24));

    root.classList.remove("is-today");
    label.textContent = "その日まであと";
    days.textContent = String(daysRemaining);
    unit.textContent = "日";
  }

  updateCountdown();
  window.setInterval(updateCountdown, 1000 * 60);
}
