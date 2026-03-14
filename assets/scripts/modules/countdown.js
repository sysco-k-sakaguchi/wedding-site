function pad(value) {
  return String(value).padStart(2, "0");
}

export function setupCountdown(config) {
  const root = document.querySelector("[data-countdown-root]");
  const days = document.querySelector("[data-countdown-days]");
  const hours = document.querySelector("[data-countdown-hours]");
  const minutes = document.querySelector("[data-countdown-minutes]");
  const seconds = document.querySelector("[data-countdown-seconds]");
  const message = document.querySelector("[data-countdown-message]");

  if (!root || !days || !hours || !minutes || !seconds || !message) {
    return;
  }

  const targetDate = new Date(config.weddingDateIso);

  if (Number.isNaN(targetDate.getTime())) {
    message.textContent = "日付設定を確認してください。";
    return;
  }

  function updateCountdown() {
    const now = new Date();
    const diff = targetDate.getTime() - now.getTime();

    if (diff <= 0) {
      days.textContent = "00";
      hours.textContent = "00";
      minutes.textContent = "00";
      seconds.textContent = "00";
      message.textContent = "本日は結婚式当日です。どうぞお気をつけてお越しください。";
      return;
    }

    const totalSeconds = Math.floor(diff / 1000);
    const dayValue = Math.floor(totalSeconds / (60 * 60 * 24));
    const hourValue = Math.floor((totalSeconds % (60 * 60 * 24)) / (60 * 60));
    const minuteValue = Math.floor((totalSeconds % (60 * 60)) / 60);
    const secondValue = totalSeconds % 60;

    days.textContent = pad(dayValue);
    hours.textContent = pad(hourValue);
    minutes.textContent = pad(minuteValue);
    seconds.textContent = pad(secondValue);
    message.textContent = "その日まで、ゆっくりご準備ください。";
  }

  updateCountdown();
  window.setInterval(updateCountdown, 1000);
}
