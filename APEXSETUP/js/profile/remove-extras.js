// ===== Прибирає зайві елементи сайту =====
//  1) кнопку «Репорти» в меню профілю (account.html);
//  2) усю картку «Напишіть нам» (рамка, заголовок, форма) на сторінці контактів (contacts.html).
// Підключати в кінці <body> (після інших скриптів).
(function () {
  "use strict";

  const REPORTS_RE = /репорт/i;
  const DREAM_RE = /^сетап мрії$/i;      // пункт меню профілю «Сетап мрії» (він є у верхній панелі)
  const WRITE_US_RE = /^напишіть\s+нам[.!:]?$/i;
  const HEADINGS = "h1, h2, h3, h4, h5, h6, legend, .section-title, .card-title";

  /* ---------- 1. «Репорти» в меню профілю ---------- */
  // Прибирає з меню профілю «Репорти» та «Сетап мрії» (назва без значка має збігатися повністю,
  // тож пункт «Заявки «Сетап мрії»» для адміна лишається)
  function removeReportsButtons() {
    document.querySelectorAll(".settings-menu a, .settings-menu button").forEach(item => {
      const label = item.textContent.trim().replace(/^[^\p{L}]+/u, "").trim();
      if (REPORTS_RE.test(item.textContent) || DREAM_RE.test(label)) item.remove();
    });
  }

  removeReportsButtons();

  // Кнопки в меню додає інший скрипт (після завантаження сторінки) — стежимо кілька секунд
  const menu = document.querySelector(".settings-menu");
  if (menu && window.MutationObserver) {
    const observer = new MutationObserver(removeReportsButtons);
    observer.observe(menu, { childList: true, subtree: true });
    setTimeout(() => observer.disconnect(), 8000);
  }

  /* ---------- 2. Картка «Напишіть нам» у контактах ---------- */
  const main = document.querySelector("main");

  function isBoundary(node) {
    return !node || node === document.body || node === main;
  }

  // Чи є в елементі «чужий» зміст (телефони, пошта, інші заголовки) — тоді піднімати його не можна
  function hasOtherContent(node) {
    if (node.querySelector('a[href^="tel:"], a[href^="mailto:"]')) return true;
    return Array.from(node.querySelectorAll(HEADINGS)).some(h => !WRITE_US_RE.test(h.textContent.trim()));
  }

  // Піднімаємось до батька, поки в ньому немає іншого змісту, окрім нашої картки
  function climbWhileAlone(card) {
    while (!isBoundary(card.parentElement)) {
      const parent = card.parentElement;
      const hasSiblingContent = Array.from(parent.children).some(c =>
        c !== card && (c.textContent.trim() || c.querySelector("img, svg, a, form, input, textarea"))
      );
      if (hasSiblingContent) break;
      card = parent;
    }
    return card;
  }

  // Видаляє елемент і порожні обгортки, що від нього лишились
  function removeWithEmptyParents(node) {
    let parent = node.parentElement;
    node.remove();
    for (let i = 0; i < 4 && !isBoundary(parent); i++) {
      if (parent.children.length > 0 || parent.textContent.trim()) break;
      const up = parent.parentElement;
      parent.remove();
      parent = up;
    }
  }

  function removeWriteUsCard() {
    const heading = Array.from(document.querySelectorAll(HEADINGS))
      .find(h => WRITE_US_RE.test(h.textContent.trim()));
    const forms = Array.from(document.querySelectorAll("form"));

    // Форма: перша після заголовка «Напишіть нам», а на сторінці контактів — перша з полем коментаря
    let form = null;
    if (heading) {
      form = forms.find(f => heading.compareDocumentPosition(f) & Node.DOCUMENT_POSITION_FOLLOWING) || null;
    }
    if (!form && /contact/i.test(location.pathname)) {
      form = forms.find(f => f.querySelector("textarea")) || null;
    }
    if (!form && !heading) return;

    // Картка = найближчий предок, який містить і форму, і заголовок (рамка з фоном)
    let card = null;
    if (form && heading) {
      let c = form;
      while (c && !isBoundary(c) && !c.contains(heading)) c = c.parentElement;
      if (c && !isBoundary(c) && !hasOtherContent(c)) card = c;
    }

    if (card) {
      removeWithEmptyParents(climbWhileAlone(card));
      return;
    }

    // Запасний варіант: прибираємо форму з її рамкою та заголовок окремо
    if (form) removeWithEmptyParents(climbWhileAlone(form));
    if (heading && heading.isConnected) removeWithEmptyParents(heading);
  }

  removeWriteUsCard();
})();