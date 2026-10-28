// ===== Тема «Скляна пустеля» =====
// Підключає css/theme.css на будь-якій сторінці та оновлює логотип у шапці.
(function () {
  "use strict";

  // Якщо в <head> уже є <link ... theme.css> — нічого не додаємо
  if (!document.querySelector('link[href*="theme.css"]')) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "css/theme.css";
    document.head.appendChild(link);
  }

  const MARK =
    '<svg class="logo-mark" viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true">' +
    '<circle cx="14.5" cy="20" r="10"/><circle cx="25.5" cy="20" r="10"/></svg>';

  document.querySelectorAll(".logo").forEach(logo => {
    logo.innerHTML = MARK + '<span class="logo-text"><b>APEX</b><b>SETUP</b></span>';
    logo.setAttribute("aria-label", "APEXSETUP");
  });
})();