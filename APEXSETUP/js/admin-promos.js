// ===== Адмін-панель: промокоди =====
// Підключати ПІСЛЯ products.js, cart.js (там логіка промокодів), auth.js, admin-access.js і admin.js.
(function () {
  "use strict";

  const el = id => document.getElementById(id);
  if (!el("promos-section")) return;
  if (typeof apexIsAdmin !== "function" || !apexIsAdmin()) return;   // тільки для адміністратора

  const toast = (text, isError) => { if (typeof showToast === "function") showToast(text, isError); };

  let promos = loadPromos();
  let editingCode = null;          // код, що редагується (null — новий)
  let scopeFilter = "all";         // all | cart | setup
  const SCOPE_TEXT = { cart: "🛒 Кошик", setup: "🎮 Сетап мрії" };

  /* ---------- Допоміжні ---------- */
  // Скільки різних людей використали код (за замовленнями цього браузера)
  const usedCount = code => promoUsedCount(code);

  function formatDate(iso) {
    if (!iso) return "без обмеження";
    const [y, m, d] = iso.split("-");
    return d + "." + m + "." + y;
  }

  const STATUS_TEXT = { ok: "Діє", off: "Вимкнено", expired: "Строк минув", limit: "Ліміт вичерпано" };

  /* ---------- Малювання ---------- */
  function render() {
    promos = loadPromos();
    const sorted = promos
      .filter(p => scopeFilter === "all" || p.scope === scopeFilter)
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    // лічильники на кнопках фільтра
    document.querySelectorAll("#promo-filters [data-scope-filter]").forEach(btn => {
      const key = btn.dataset.scopeFilter;
      btn.classList.toggle("active", key === scopeFilter);
      btn.querySelector("b").textContent = key === "all" ? promos.length : promos.filter(p => p.scope === key).length;
    });

    el("promo-stat-total").textContent = promos.length;
    el("promo-stat-active").textContent = promos.filter(p => promoStatus(p) === "ok").length;
    el("promo-stat-used").textContent = promos.reduce((sum, p) => sum + usedCount(p.code), 0);

    el("promo-tbody").innerHTML = sorted.map(p => {
      const status = promoStatus(p);
      const code = escapeHTML(p.code);
      return `
        <tr>
          <td><b>${code}</b>${p.owner ? `<br><small>👤 ${escapeHTML(p.owner)}${p.setup ? " · заявка №" + p.setup : ""}</small>` : ""}</td>
          <td><span class="status-badge ${p.scope === "setup" ? "new" : "done"}">${SCOPE_TEXT[p.scope] || SCOPE_TEXT.cart}</span></td>
          <td>−${p.percent}%</td>
          <td>${escapeHTML(formatDate(p.expires))}</td>
          <td><span class="status-badge ${status === "ok" ? "done" : "cancelled"}">${STATUS_TEXT[status]}</span></td>
          <td>${usedCount(p.code)} / ${p.maxUses > 0 ? p.maxUses : "∞"}</td>
          <td>
            <button type="button" class="btn btn-sm btn-outline" data-promo-act="toggle" data-code="${code}">${p.active ? "⏸ Вимкнути" : "▶ Увімкнути"}</button>
            <button type="button" class="btn btn-sm btn-outline" data-promo-act="edit" data-code="${code}">✏️</button>
            <button type="button" class="btn btn-sm btn-danger-outline" data-promo-act="delete" data-code="${code}">🗑</button>
          </td>
        </tr>`;
    }).join("");
    el("promo-empty").hidden = sorted.length > 0;
    el("promo-empty").textContent = promos.length === 0
      ? "Промокодів ще немає. Натисніть «+ Створити промокод»."
      : "У цьому розділі промокодів немає.";

    const draft = hasPromosDraft();
    el("promo-reset-btn").hidden = !draft;
    el("promo-note").textContent = draft
      ? "Зміни збережено лише в цьому браузері. Щоб промокоди бачили всі відвідувачі, натисніть «Експортувати промокоди», покладіть файл promos-data.js у папку js/ і завантажте на хостинг. Увага: коди в цьому файлі видно будь-кому, хто відкриє його."
      : "Промокоди беруться з файлу js/promos-data.js. Знижка промокоду додається до знижки товару (разом не більше −90%).";
  }

  function save(list, message) {
    if (!savePromosDraft(list)) {
      toast("⚠️ Не вдалося зберегти: браузер блокує localStorage.", true);
      return false;
    }
    render();
    if (message) toast(message);
    return true;
  }

  /* ---------- Вікно створення / редагування ---------- */
  const modal = el("promo-modal");

  function showError(message) {
    const box = el("promo-error");
    box.textContent = message;
    box.hidden = false;
  }

  // Підказка: як складуться знижки
  function updatePreview() {
    const percent = Math.round(Number(el("promo-percent").value));
    const box = el("promo-preview");
    if (!Number.isFinite(percent) || percent < 1 || percent > PROMO_MAX_PERCENT) {
      box.textContent = "";
      return;
    }
    if (el("promo-scope").value === "setup") {
      box.textContent = "Цей промокод вводиться в заявці «Сетап мрії». Менеджер побачить його в заявці й врахує знижку −" +
        percent + "% у пропозиції. У кошику він не працює.";
      return;
    }
    const withOwn = Math.min(PROMO_MAX_PERCENT, 10 + percent);
    box.textContent =
      "Товар за ₴1000 без знижки з цим промокодом коштуватиме " + formatPrice(finalPrice(1000, percent)) +
      ". Якщо на товарі вже є знижка 10%, вони складуться: −" + withOwn + "% → " + formatPrice(finalPrice(1000, 10 + percent)) + ".";
  }

  function openModal(promo) {
    editingCode = promo ? promo.code : null;
    el("promo-modal-title").textContent = promo ? "Редагування промокоду" : "Новий промокод";
    el("promo-code").value = promo ? promo.code : "";
    el("promo-scope").value = promo ? promo.scope : "cart";
    el("promo-percent").value = promo ? promo.percent : "";
    el("promo-max").value = promo && promo.maxUses > 0 ? promo.maxUses : "";
    el("promo-expires").value = promo ? promo.expires : "";
    el("promo-active").checked = promo ? promo.active : true;
    el("promo-error").hidden = true;
    updatePreview();
    modal.hidden = false;
    el("promo-code").focus();
  }

  function closeModal() {
    modal.hidden = true;
    editingCode = null;
  }

  function generateCode() {
    const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let i = 0; i < 8; i++) code += letters[Math.floor(Math.random() * letters.length)];
    el("promo-code").value = code;
  }

  el("promo-add-btn").addEventListener("click", () => openModal(null));

  // Фільтр «Усі / Кошик / Сетап мрії»
  el("promo-filters").addEventListener("click", e => {
    const btn = e.target.closest("[data-scope-filter]");
    if (!btn) return;
    scopeFilter = btn.dataset.scopeFilter;
    render();
  });
  el("promo-cancel").addEventListener("click", closeModal);
  modal.addEventListener("click", e => { if (e.target === modal) closeModal(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && !modal.hidden) closeModal(); });
  el("promo-generate").addEventListener("click", generateCode);
  el("promo-percent").addEventListener("input", updatePreview);
  el("promo-scope").addEventListener("change", updatePreview);
  el("promo-code").addEventListener("input", e => {
    e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, "");
  });

  el("promo-form").addEventListener("submit", e => {
    e.preventDefault();
    el("promo-error").hidden = true;

    const code = normalizePromoCode(el("promo-code").value);
    const scope = el("promo-scope").value === "setup" ? "setup" : "cart";
    const percent = Math.round(Number(el("promo-percent").value));
    const expires = el("promo-expires").value;
    const active = el("promo-active").checked;
    const maxRaw = el("promo-max").value.trim();
    const maxUses = maxRaw === "" ? 0 : Math.floor(Number(maxRaw));

    if (!PROMO_CODE_RE.test(code)) {
      return showError("Код: 3–20 символів (латиниця, цифри, - та _).");
    }
    if (!Number.isFinite(percent) || percent < 1 || percent > PROMO_MAX_PERCENT) {
      return showError("Знижка — ціле число від 1 до " + PROMO_MAX_PERCENT + " %.");
    }
    if (maxRaw !== "" && (!Number.isFinite(maxUses) || maxUses < 1 || maxUses > 100000)) {
      return showError("Ліміт використань — ціле число від 1 до 100000 (або залиште поле порожнім).");
    }
    if (expires && new Date(expires + "T23:59:59").getTime() < Date.now()) {
      return showError("Дата закінчення вже минула.");
    }

    const list = loadPromos();
    const duplicate = list.some(p => p.code === code && p.code !== editingCode);
    if (duplicate) return showError("Промокод «" + code + "» уже існує.");

    if (editingCode) {
      const item = list.find(p => p.code === editingCode);
      if (!item) { closeModal(); render(); return; }
      item.code = code;
      item.percent = percent;
      item.scope = scope;
      item.maxUses = maxUses;
      item.expires = expires;
      item.active = active;
    } else {
      list.push({ code: code, percent: percent, scope: scope, maxUses: maxUses, active: active, expires: expires, createdAt: Date.now() });
    }

    const wasEditing = !!editingCode;
    if (save(list, wasEditing ? "✅ Промокод оновлено" : "✅ Промокод «" + code + "» створено")) closeModal();
  });

  /* ---------- Дії в таблиці ---------- */
  el("promo-tbody").addEventListener("click", e => {
    const btn = e.target.closest("[data-promo-act]");
    if (!btn) return;
    const list = loadPromos();
    const promo = list.find(p => p.code === btn.dataset.code);
    if (!promo) { render(); return; }

    switch (btn.dataset.promoAct) {
      case "edit":
        openModal(promo);
        break;
      case "toggle":
        promo.active = !promo.active;
        save(list, promo.active ? "▶ Промокод увімкнено" : "⏸ Промокод вимкнено");
        break;
      case "delete":
        if (!confirm("Видалити промокод «" + promo.code + "»?")) break;
        save(list.filter(p => p.code !== promo.code), "🗑 Промокод видалено");
        break;
    }
  });

  /* ---------- Експорт для сайту ---------- */
  el("promo-export-btn").addEventListener("click", () => {
    const list = loadPromos().map(p => ({
      code: p.code, percent: p.percent, scope: p.scope, maxUses: p.maxUses, active: p.active, expires: p.expires, createdAt: p.createdAt
    }));
    const content =
      "// Файл створено адмін-панеллю APEXSETUP (" + new Date().toLocaleString("uk-UA") + ").\n" +
      "// Покладіть його в папку js/ замість старого promos-data.js.\n" +
      "window.PROMOS_PUBLISHED = " + JSON.stringify(list, null, 2) + ";\n";

    const blob = new Blob([content], { type: "text/javascript;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "promos-data.js";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast("⬇ Файл promos-data.js завантажено");
  });

  el("promo-reset-btn").addEventListener("click", () => {
    if (!confirm("Скинути зміни й повернутися до промокодів із файлу promos-data.js?")) return;
    resetPromosDraft();
    render();
    toast("↩️ Зміни скинуто");
  });

  // Файл промокодів підвантажився / замовлення чи промокоди змінили в іншій вкладці
  window.addEventListener("promos:loaded", render);
  window.addEventListener("storage", e => {
    if (e.key === PROMOS_DRAFT_KEY || e.key === ORDERS_KEY) render();
  });

  render();
})();