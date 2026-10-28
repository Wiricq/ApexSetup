// ===== Спільні елементи сайту: посилання у футері, cookies, кнопка Telegram, мобільні стилі =====
// Підвантажується автоматично з js/cart.js на кожній сторінці (HTML змінювати не потрібно).
(function () {
  "use strict";

  const SITE = window.SITE || {};
  const isAdminPage = !!document.getElementById("admin-panel") || !!document.getElementById("setups-panel");

  /* ---------- Мобільні стилі ---------- */
  if (!document.querySelector('link[href$="css/mobile.css"]')) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "css/mobile.css";
    document.head.appendChild(link);
  }

  /* ---------- Стилі елементів ---------- */
  const style = document.createElement("style");
  style.textContent =
    ".footer-links{display:flex;flex-wrap:wrap;justify-content:center;gap:6px 18px;margin:0 0 10px;font-size:.85rem}" +
    ".footer-links a{color:inherit;opacity:.85;text-decoration:none}.footer-links a:hover{opacity:1;text-decoration:underline}" +
    ".cookie-bar{position:fixed;left:12px;right:12px;bottom:12px;z-index:2000;display:flex;flex-wrap:wrap;align-items:center;" +
      "justify-content:space-between;gap:10px 16px;max-width:980px;margin:0 auto;padding:14px 18px;border-radius:18px;" +
      "color:#fff;background:rgba(30,4,10,.96);border:1px solid rgba(255,140,150,.5);box-shadow:0 14px 40px rgba(0,0,0,.5);font-size:.88rem;line-height:1.5}" +
    ".cookie-bar[hidden]{display:none}" +
    ".cookie-bar a{color:#ffb4bb;text-decoration:underline}" +
    ".cookie-bar button{padding:9px 20px;font:inherit;font-weight:700;color:#fff;background:linear-gradient(135deg,#ff3b4a,#b3102a);" +
      "border:0;border-radius:999px;cursor:pointer}" +
    ".tg-fab{position:fixed;right:16px;bottom:16px;z-index:1500;width:52px;height:52px;display:grid;place-items:center;border-radius:50%;" +
      "color:#fff;background:linear-gradient(135deg,#2aabee,#1c7fc0);box-shadow:0 8px 22px rgba(0,0,0,.4);transition:transform .2s,bottom .2s}" +
    ".tg-fab:hover{transform:scale(1.08)}" +
    "body.has-cookie-bar .tg-fab{bottom:92px}" +
    ".site-warning{margin:0 0 20px;padding:12px 16px;border-radius:14px;border:1px solid #f59e0b;background:rgba(245,158,11,.14);font-size:.9rem}" +
    "@media (max-width:640px){body.has-cookie-bar .tg-fab{bottom:150px}}";
  document.head.appendChild(style);

  /* ---------- Посилання у футері ---------- */
  const footer = document.querySelector(".footer");
  if (footer && !footer.querySelector(".footer-links")) {
    const nav = document.createElement("nav");
    nav.className = "footer-links";
    nav.setAttribute("aria-label", "Інформація");
    [
      ["offer.html", "Публічна оферта"],
      ["returns.html", "Повернення й обмін"],
      ["privacy.html", "Політика конфіденційності"],
      ["faq.html", "Часті питання"],
      ["contacts.html", "Контакти"]
    ].forEach(([href, text]) => {
      const a = document.createElement("a");
      a.href = href;
      a.textContent = text;
      nav.appendChild(a);
    });
    footer.insertBefore(nav, footer.firstChild);
  }

  /* ---------- Дані продавця на юридичних сторінках ---------- */
  const fields = {
    sellerName: SITE.sellerName, sellerCode: SITE.sellerCode, sellerAddress: SITE.sellerAddress,
    sellerEmail: SITE.sellerEmail, sellerPhone: SITE.sellerPhone, workHours: SITE.workHours
  };
  document.querySelectorAll("[data-site]").forEach(node => {
    const value = fields[node.dataset.site];
    if (value) node.textContent = value;
  });

  // Нагадуємо адміну заповнити реквізити, поки там шаблонний текст
  const legal = document.querySelector(".legal-page");
  if (legal && /Прізвище|РНОКПП|область, місто/.test(JSON.stringify(SITE))) {
    const warn = document.createElement("p");
    warn.className = "site-warning";
    warn.textContent = "⚠️ Для власника сайту: заповніть реквізити продавця у файлі js/config.js. Цей текст — шаблон, перед запуском магазину його має перевірити юрист.";
    legal.insertBefore(warn, legal.firstChild);
  }

  if (isAdminPage) return;

  /* ---------- Cookies ---------- */
  const COOKIE_KEY = "apex_cookies_ok_v1";
  let accepted = false;
  try { accepted = localStorage.getItem(COOKIE_KEY) === "1"; } catch (e) { /* ігноруємо */ }

  if (!accepted) {
    const bar = document.createElement("div");
    bar.className = "cookie-bar";
    bar.setAttribute("role", "dialog");
    bar.setAttribute("aria-label", "Cookies");
    bar.innerHTML =
      '<span>Сайт використовує cookies та локальне сховище браузера для роботи кошика, акаунта й обраного. ' +
      'Докладніше — у <a href="privacy.html">Політиці конфіденційності</a>.</span>' +
      '<button type="button">Зрозуміло</button>';
    bar.querySelector("button").addEventListener("click", () => {
      try { localStorage.setItem(COOKIE_KEY, "1"); } catch (e) { /* ігноруємо */ }
      bar.remove();
      document.body.classList.remove("has-cookie-bar");
    });
    document.body.appendChild(bar);
    document.body.classList.add("has-cookie-bar");
  }

  /* ---------- Кнопка Telegram ---------- */
  if (SITE.telegram) {
    const fab = document.createElement("a");
    fab.className = "tg-fab";
    fab.href = "https://t.me/" + encodeURIComponent(String(SITE.telegram).replace(/^@/, ""));
    fab.target = "_blank";
    fab.rel = "noopener";
    fab.setAttribute("aria-label", "Написати в Telegram");
    fab.innerHTML = '<svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor" aria-hidden="true"><path d="M21.9 4.3 18.7 19c-.2 1-.9 1.3-1.7.8l-4.7-3.5-2.3 2.2c-.3.3-.5.5-1 .5l.3-4.9 8.9-8c.4-.3-.1-.5-.6-.2L6.6 12.8 1.9 11.3c-1-.3-1-1 .2-1.5L20.4 3c.9-.3 1.7.2 1.5 1.3z"/></svg>';
    document.body.appendChild(fab);
  }

  /* ---------- Нова пошта: вибір міста й відділення ---------- */
  if (SITE.novaPoshtaKey && document.getElementById("order-form")) {
    const s = document.createElement("script");
    s.src = "js/np.js";
    document.head.appendChild(s);
  }
})();