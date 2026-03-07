// 先に使う要素をまとめて取っておくと、下の処理が読みやすくなります。
const body = document.body;
const openingOverlay = document.querySelector("[data-opening-overlay]");
const confettiRoot = document.querySelector("[data-confetti]");
const menuToggle = document.querySelector("[data-menu-toggle]");
const mobileNav = document.querySelector("[data-mobile-nav]");
const menuClose = document.querySelector("[data-menu-close]");
const fadeItems = document.querySelectorAll(".fade-up");
const faqItems = document.querySelectorAll(".faq-item");
const countdown = document.querySelector("[data-countdown]");
const navLinks = document.querySelectorAll(".site-nav a");
const observedSections = document.querySelectorAll("section[id]");
const revealButtons = document.querySelectorAll("[data-reveal-key]");
const revealKicker = document.querySelector("[data-reveal-kicker]");
const revealTitle = document.querySelector("[data-reveal-title]");
const revealCopy = document.querySelector("[data-reveal-copy]");
const revealLink = document.querySelector("[data-reveal-link]");
const placeholderLinks = document.querySelectorAll("[data-placeholder-link]");

// OSの「動きを減らす」設定を見て、必要なら演出をやさしくします。
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const mobileNavBreakpoint = window.matchMedia("(max-width: 768px)");

// 後から差し替えるURLは、まずこのあたりを見ると追いやすいです。
const RSVP_FORM_URL = "FORM_URL";
const CEREMONY_MAP_URL =
  "https://www.google.com/maps/search/?api=1&query=%E6%A2%A8%E6%9C%A8%E7%A5%9E%E7%A4%BE%20%E4%BA%AC%E9%83%BD";

let revealAnimationStarted = false;
let confettiPlayed = false;
let openingStarted = false;
let openingFinished = false;
let openingAutoTimer = 0;
let openingRemoveTimer = 0;

// 開幕演出のテンポです。
// ここを調整すると「文字を見せる時間」や「白い光の余韻」を変えられます。
const openingTimeline = {
  autoStartDelay: 3200,
  copyHoldDelay: 1200,
  lightBloomDelay: 2500,
  revealDelay: 2900,
  confettiDelay: 3000,
  completeDelay: 4700,
  overlayRemoveDelay: 900
};

// 印を押したときに表示を切り替える内容です。
const revealContent = {
  date: {
    kicker: "Date",
    title: "2026年10月12日(月)",
    copy: "お日にちや受付時間など、当日に必要な日時情報をこちらでご案内します。",
    linkText: "挙式編を見る",
    linkHref: "#ceremony"
  },
  venue: {
    kicker: "Place",
    title: "京都・梨木神社",
    copy: "会場名やアクセス案内、地図への入り口をこちらにまとめてご案内します。",
    linkText: "Googleマップを開く",
    linkHref: CEREMONY_MAP_URL
  },
  rsvp: {
    kicker: "RSVP",
    title: "ご出欠のご案内",
    copy: "こちらから外部フォームへ進み、ご出欠をご回答いただけます。",
    linkText: "出欠回答はこちら",
    linkHref: RSVP_FORM_URL
  }
};

// 通常セクションのふわっと表示は、サイト本体が見え始めてから動かします。
function startSiteMotion() {
  if (revealAnimationStarted) {
    return;
  }

  revealAnimationStarted = true;
  setupRevealAnimation();
}

// 幕が最後まで開いたときに、画面いっぱいへ祝福の紙吹雪を広げます。
function playConfetti() {
  if (!confettiRoot || prefersReducedMotion) {
    return;
  }

  confettiRoot.classList.remove("is-active");
  confettiRoot.innerHTML = "";
  window.requestAnimationFrame(() => {
    confettiRoot.classList.add("is-active");
  });

  const colors = ["#f5e6c8", "#caa46b", "#ffffff", "#d55d4f", "#7f1730", "#e7c887"];
  const origins = [
    { x: 10, y: 80 },
    { x: 22, y: 74 },
    { x: 34, y: 68 },
    { x: 46, y: 64 },
    { x: 54, y: 64 },
    { x: 66, y: 68 },
    { x: 78, y: 74 },
    { x: 90, y: 80 }
  ];

  // 粒子数を少し絞って、華やかさは残しつつ描画負荷を軽くします。
  for (let index = 0; index < 84; index += 1) {
    const piece = document.createElement("span");
    const origin = origins[index % origins.length];
    const shapeRoll = index % 9;
    const isDot = shapeRoll === 0 || shapeRoll === 4;
    const isSpark = shapeRoll === 2 || shapeRoll === 6;
    const isRibbon = shapeRoll === 1 || shapeRoll === 7;
    const size = `${6 + Math.random() * 13}px`;
    const distanceX = `${-56 + Math.random() * 112}vw`;
    const distanceY = `${-42 - Math.random() * 62}vh`;
    const rotation = `${-540 + Math.random() * 1080}deg`;
    const duration = `${1.75 + Math.random() * 1.1}s`;
    const delay = `${Math.random() * 0.16}s`;
    const classes = ["confetti-piece"];

    if (isDot) {
      classes.push("confetti-piece--dot");
    }

    if (isSpark) {
      classes.push("confetti-piece--spark");
    }

    if (isRibbon) {
      classes.push("confetti-piece--ribbon");
    }

    piece.className = classes.join(" ");
    piece.style.setProperty("--origin-x", `${origin.x}%`);
    piece.style.setProperty("--origin-y", `${origin.y}%`);
    piece.style.setProperty("--tx", distanceX);
    piece.style.setProperty("--ty", distanceY);
    piece.style.setProperty("--rotate", rotation);
    piece.style.setProperty("--duration", duration);
    piece.style.setProperty("--size", size);
    piece.style.setProperty("--color", colors[index % colors.length]);
    piece.style.animationDelay = delay;
    confettiRoot.appendChild(piece);
  }

  window.setTimeout(() => {
    confettiRoot.innerHTML = "";
    confettiRoot.classList.remove("is-active");
  }, 3000);
}

function finishOpeningSequence() {
  if (openingFinished) {
    return;
  }

  openingFinished = true;
  body.classList.remove(
    "is-opening-pending",
    "is-opening-running",
    "is-opening-queued",
    "is-opening-curtain",
    "is-opening-light",
    "is-opening-reveal"
  );
  body.classList.add("is-opening-complete");
  startSiteMotion();

  if (!openingOverlay) {
    return;
  }

  window.clearTimeout(openingRemoveTimer);
  openingRemoveTimer = window.setTimeout(() => {
    openingOverlay.remove();
  }, openingTimeline.overlayRemoveDelay);
}

function removeOpeningTriggers(triggerMap) {
  window.removeEventListener("wheel", triggerMap.wheel);
  window.removeEventListener("touchmove", triggerMap.touchMove);
  window.removeEventListener("keydown", triggerMap.keydown);
}

function isPlaceholderUrl(url) {
  return url === RSVP_FORM_URL;
}

function setLinkBehavior(link, href) {
  const isExternal = href.startsWith("http") || isPlaceholderUrl(href);

  link.target = isExternal ? "_blank" : "_self";
  link.rel = isExternal ? "noopener noreferrer" : "";
}

// スマホではハンバーガーメニューとして開閉します。
function closeMobileNav() {
  if (!mobileNav || !menuToggle) {
    return;
  }

  mobileNav.classList.remove("is-open");
  menuToggle.setAttribute("aria-expanded", "false");
  body.classList.remove("is-menu-open");

  if (mobileNavBreakpoint.matches) {
    mobileNav.setAttribute("aria-hidden", "true");
  } else {
    mobileNav.removeAttribute("aria-hidden");
  }
}

function openMobileNav() {
  if (!mobileNav || !menuToggle || !mobileNavBreakpoint.matches) {
    return;
  }

  mobileNav.classList.add("is-open");
  mobileNav.setAttribute("aria-hidden", "false");
  menuToggle.setAttribute("aria-expanded", "true");
  body.classList.add("is-menu-open");
  menuClose?.focus();
}

function setupMobileNav() {
  if (!menuToggle || !mobileNav || !menuClose) {
    return;
  }

  const syncMobileNav = () => {
    if (!mobileNavBreakpoint.matches) {
      closeMobileNav();
      return;
    }

    const isOpen = mobileNav.classList.contains("is-open");
    mobileNav.setAttribute("aria-hidden", String(!isOpen));
    menuToggle.setAttribute("aria-expanded", String(isOpen));
  };

  menuToggle.addEventListener("click", () => {
    if (mobileNav.classList.contains("is-open")) {
      closeMobileNav();
      return;
    }

    openMobileNav();
  });

  menuClose.addEventListener("click", closeMobileNav);

  navLinks.forEach((link) => {
    link.addEventListener("click", () => {
      if (mobileNavBreakpoint.matches) {
        closeMobileNav();
      }
    });
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeMobileNav();
    }
  });

  document.addEventListener("click", (event) => {
    if (!mobileNavBreakpoint.matches || !mobileNav.classList.contains("is-open")) {
      return;
    }

    const target = event.target;

    if (!(target instanceof Node)) {
      return;
    }

    if (mobileNav.contains(target) || menuToggle.contains(target)) {
      return;
    }

    closeMobileNav();
  });

  if ("addEventListener" in mobileNavBreakpoint) {
    mobileNavBreakpoint.addEventListener("change", syncMobileNav);
  }

  syncMobileNav();
}

function startOpeningSequence(triggerMap) {
  if (!openingOverlay || openingStarted) {
    return;
  }

  openingStarted = true;
  window.clearTimeout(openingAutoTimer);
  removeOpeningTriggers(triggerMap);

  body.classList.remove("is-opening-pending");
  body.classList.add("is-opening-running");
  body.classList.add("is-opening-queued");

  // 最初のコピーを少し長めに見せてから、幕開けを始めます。
  window.setTimeout(() => {
    body.classList.remove("is-opening-queued");
    body.classList.add("is-opening-curtain");
  }, openingTimeline.copyHoldDelay);

  window.setTimeout(() => {
    body.classList.add("is-opening-light");
  }, openingTimeline.lightBloomDelay);

  // 白い光が少し広がったあとに、本体サイトが奥から見え始めます。
  window.setTimeout(() => {
    body.classList.add("is-opening-reveal");
  }, openingTimeline.revealDelay);

  // 祝福の紙吹雪は、白い光が残っている間に一度だけ出します。
  window.setTimeout(() => {
    if (confettiPlayed) {
      return;
    }

    playConfetti();
    confettiPlayed = true;
  }, openingTimeline.confettiDelay);

  window.setTimeout(() => {
    finishOpeningSequence();
  }, openingTimeline.completeDelay);
}

// 最初の一回だけ、幕開けの演出を流します。
function setupOpeningSequence() {
  if (!openingOverlay) {
    body.classList.add("is-opening-complete");
    startSiteMotion();
    return;
  }

  if (prefersReducedMotion) {
    body.classList.remove("is-opening-pending");
    body.classList.add("is-opening-complete");
    openingOverlay.remove();
    startSiteMotion();
    return;
  }

  window.scrollTo({ top: 0, behavior: "auto" });

  const triggerMap = {
    wheel: (event) => {
      if (openingStarted) {
        return;
      }

      event.preventDefault();
      startOpeningSequence(triggerMap);
    },
    touchMove: (event) => {
      if (openingStarted) {
        return;
      }

      event.preventDefault();
      startOpeningSequence(triggerMap);
    },
    keydown: (event) => {
      const triggerKeys = ["ArrowDown", "PageDown", " ", "Enter"];

      if (!triggerKeys.includes(event.key)) {
        return;
      }

      event.preventDefault();
      startOpeningSequence(triggerMap);
    }
  };

  window.addEventListener("wheel", triggerMap.wheel, { passive: false });
  window.addEventListener("touchmove", triggerMap.touchMove, { passive: false });
  window.addEventListener("keydown", triggerMap.keydown);

  openingAutoTimer = window.setTimeout(() => {
    startOpeningSequence(triggerMap);
  }, openingTimeline.autoStartDelay);
}

// 通常セクションのスクロール表示です。
function setupRevealAnimation() {
  if (!("IntersectionObserver" in window) || prefersReducedMotion) {
    fadeItems.forEach((item) => item.classList.add("is-visible"));
    return;
  }

  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) {
          return;
        }

        entry.target.classList.add("is-visible");
        revealObserver.unobserve(entry.target);
      });
    },
    {
      threshold: 0.18,
      rootMargin: "0px 0px -8% 0px"
    }
  );

  fadeItems.forEach((item) => revealObserver.observe(item));
}

// FAQの開閉です。
function setupFaq() {
  faqItems.forEach((item) => {
    const button = item.querySelector(".faq-question");
    const answer = item.querySelector(".faq-answer");

    if (!button || !answer) {
      return;
    }

    button.addEventListener("click", () => {
      const isOpen = item.classList.contains("is-open");

      item.classList.toggle("is-open", !isOpen);
      button.setAttribute("aria-expanded", String(!isOpen));
      answer.style.maxHeight = !isOpen ? `${answer.scrollHeight}px` : "0px";
    });
  });
}

// 画面幅が変わったときに、開いている回答の高さを保ちます。
function refreshOpenFaqHeight() {
  faqItems.forEach((item) => {
    if (!item.classList.contains("is-open")) {
      return;
    }

    const answer = item.querySelector(".faq-answer");

    if (answer) {
      answer.style.maxHeight = `${answer.scrollHeight}px`;
    }
  });
}

// パーティ編のカウントダウンです。
function updateCountdown() {
  if (!countdown) {
    return;
  }

  const targetDate = new Date(countdown.dataset.countdown);
  const now = new Date();
  const diff = Math.max(targetDate.getTime() - now.getTime(), 0);
  const totalMinutes = Math.floor(diff / (1000 * 60));
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  const daysNode = countdown.querySelector("[data-days]");
  const hoursNode = countdown.querySelector("[data-hours]");
  const minutesNode = countdown.querySelector("[data-minutes]");

  if (daysNode) {
    daysNode.textContent = String(days).padStart(2, "0");
  }

  if (hoursNode) {
    hoursNode.textContent = String(hours).padStart(2, "0");
  }

  if (minutesNode) {
    minutesNode.textContent = String(minutes).padStart(2, "0");
  }
}

// 画面中央に入ったセクションのナビを現在地として光らせます。
function setupCurrentNav() {
  if (!("IntersectionObserver" in window)) {
    return;
  }

  const navObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) {
          return;
        }

        const currentId = entry.target.getAttribute("id");

        navLinks.forEach((link) => {
          const isCurrent = link.getAttribute("href") === `#${currentId}`;
          link.classList.toggle("is-current", isCurrent);
        });
      });
    },
    {
      threshold: 0,
      rootMargin: "-45% 0px -45% 0px"
    }
  );

  observedSections.forEach((section) => navObserver.observe(section));
}

// 印を押したときに、右下の案内を切り替えます。
function setupRevealOrbs() {
  if (!revealButtons.length || !revealTitle || !revealCopy || !revealKicker || !revealLink) {
    return;
  }

  revealButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.revealKey;
      const content = revealContent[key];

      if (!content) {
        return;
      }

      revealButtons.forEach((item) => item.classList.toggle("is-active", item === button));

      revealKicker.textContent = content.kicker;
      revealTitle.textContent = content.title;
      revealCopy.textContent = content.copy;
      revealLink.textContent = content.linkText;
      revealLink.href = content.linkHref;
      revealLink.classList.remove("is-hidden");
      setLinkBehavior(revealLink, content.linkHref);
    });
  });
}

// FORM_URL のまま押された場合だけ、差し替え忘れに気づけるようにします。
function setupPlaceholderLinks() {
  if (!placeholderLinks.length) {
    return;
  }

  placeholderLinks.forEach((link) => {
    link.addEventListener("click", (event) => {
      const href = link.getAttribute("href");

      if (href && !isPlaceholderUrl(href)) {
        return;
      }

      event.preventDefault();
      window.alert("このリンク先は準備中です。正式なご案内の際にURLを設定いたします。");
    });
  });
}

// 初期化処理をまとめておくと、あとから見返したときに入口が分かりやすくなります。
function initializeSite() {
  setupOpeningSequence();
  setupMobileNav();
  setupFaq();
  setupCurrentNav();
  setupRevealOrbs();
  setupPlaceholderLinks();
  updateCountdown();

  window.addEventListener("resize", refreshOpenFaqHeight);

  if (countdown) {
    window.setInterval(updateCountdown, 60 * 1000);
  }
}

initializeSite();
