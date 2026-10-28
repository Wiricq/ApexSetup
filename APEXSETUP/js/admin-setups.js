// ===== Адмін: керування заявками «Сетап мрії» =====
// Підключати ПІСЛЯ products.js, cart.js, auth.js, admin-access.js і setups-core.js.
(function () {
  "use strict";

  const el = id => document.getElementById(id);
  const toast = (text, isError) => { if (typeof showToast === "function") showToast(text, isError); };

  /* ---------- Перевірка доступу ---------- */
  if (!apexCurrentUser()) {
    el("guard-login").hidden = false;
    return;
  }
  if (!apexIsAdmin()) {
    (apexAdminConfigured() ? el("guard-denied") : el("guard-config")).hidden = false;
    return;
  }
  el("setups-panel").hidden = false;

  /* ---------- Стан ---------- */
  let setups = loadSetups();
  let filter = "all";
  const listBox = el("setups-list");

  // Статуси, які може ставити адмін (скасувати може лише клієнт)
  const ADMIN_STATUSES = ["new", "progress", "ready", "done", "rejected"];

  /* ---------- Персональні промокоди для клієнтів ---------- */
  const isoDate = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");

  function randomPart() {
    const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let out = "";
    for (let i = 0; i < 4; i++) out += letters[Math.floor(Math.random() * letters.length)];
    return out;
  }

  // Блок «Персональний промокод» у картці заявки (видача або поточний стан)
  function promoBlockHTML(s, status) {
    if (status === "cancelled" || !s.account || !s.account.email || typeof loadPromos !== "function") return "";

    if (s.personalPromo && s.personalPromo.code) {
      const promo = findPromo(s.personalPromo.code);
      const st = promo ? promoStatus(promo) : "gone";
      const stText = { ok: "діє", off: "вимкнено", expired: "строк минув", limit: "клієнт уже використав", gone: "видалено" }[st];
      return `
        <div class="setup-promo">
          <b>🎁 Персональний промокод видано</b><br>
          <code>${escapeHTML(s.personalPromo.code)}</code> · −${Number(s.personalPromo.percent) || 0}%
          ${promo && promo.expires ? " · до " + escapeHTML(promo.expires.split("-").reverse().join(".")) : ""} · ${stText}
          <div><button type="button" class="btn btn-sm btn-danger-outline" data-act="promo-revoke">✖ Відкликати</button></div>
          <small>Клієнт бачить код у своїй заявці. Щоб він працював для всіх відвідувачів, експортуйте промокоди в адмін-панелі (розділ «Промокоди»).</small>
        </div>`;
    }

    return `
      <div class="setup-promo">
        <b>🎁 Видати персональний промокод клієнту</b>
        <div class="setup-promo-row">
          <label>Знижка, %<input type="number" data-field="promo-percent" min="1" max="${PROMO_MAX_PERCENT}" step="1" value="10"></label>
          <label>Діє, днів<input type="number" data-field="promo-days" min="1" max="365" step="1" value="14"></label>
          <button type="button" class="btn btn-sm" data-act="promo-issue">🎁 Видати промокод</button>
        </div>
        <small>Код діє лише для цього клієнта й лише один раз. Знижка додається до знижки товару.</small>
      </div>`;
  }

  /* ---------- Малювання ---------- */
  function cardHTML(s) {
    const status = SETUP_STATUSES[s.status] ? s.status : "new";
    const date = new Date(s.createdAt || 0).toLocaleString("uk-UA");
    const acc = s.account
      ? `${escapeHTML(s.account.nick)} (<a href="mailto:${escapeHTML(s.account.email)}">${escapeHTML(s.account.email)}</a>)`
      : "—";

    // Телефон замовника: з самої заявки або з даних акаунта (для старих заявок)
    const phone = String(s.phone || (s.account && s.account.phone) || "").trim();
    const phoneHref = phone.replace(/[^\d+]/g, "");
    const phoneHTML = phone
      ? `<a href="tel:${escapeHTML(phoneHref)}">${escapeHTML(phone)}</a>`
      : "— (не вказано)";

    let controls;
    if (status === "cancelled") {
      controls = '<p class="setup-hint">Заявку скасовано клієнтом, змінювати статус неможливо.</p>';
    } else {
      const options = ADMIN_STATUSES.map(key =>
        `<option value="${key}"${key === status ? " selected" : ""}>${SETUP_STATUSES[key]}</option>`
      ).join("");
      controls = `
        <div class="setup-admin">
          <label>Статус
            <select data-field="status">${options}</select>
          </label>
          <label>Відповідь клієнту (він побачить її у своїй заявці)
            <textarea data-field="note" rows="3" maxlength="500">${escapeHTML(s.adminNote || "")}</textarea>
          </label>
        </div>`;
    }

    let actions = "";
    if (status !== "cancelled") {
      actions += '<button type="button" class="btn btn-sm btn-success" data-act="save">💾 Зберегти</button>';
    }
    if (status === "done" || status === "rejected" || status === "cancelled") {
      actions += '<button type="button" class="btn btn-sm btn-danger-outline" data-act="delete">🗑 Видалити заявку</button>';
    }

    return `
      <article class="order-card setup-card is-${status}" data-setup-id="${escapeHTML(s.id)}">
        <div class="order-head">
          <span class="order-title">Заявка №${escapeHTML(s.number)}</span>
          <span class="status-badge ${status}">${SETUP_STATUSES[status]}</span>
          <span class="order-date">${escapeHTML(date)}</span>
        </div>
        <div class="setup-row"><span>Клієнт:</span> ${acc}</div>
        <div class="setup-row"><span>Телефон:</span> ${phoneHTML}</div>
        ${setupDetailsHTML(s)}
        ${promoBlockHTML(s, status)}
        ${window.SetupProposals ? SetupProposals.adminHTML(s, status) : ""}
        ${controls}
        <div class="order-actions">${actions}</div>
      </article>`;
  }

  function render() {
    // підсумки
    const counts = { all: setups.length, new: 0, progress: 0, ready: 0, done: 0, rejected: 0, cancelled: 0 };
    setups.forEach(s => { if (counts[s.status] !== undefined) counts[s.status]++; });

    el("st-new").textContent = counts.new;
    el("st-progress").textContent = counts.progress;
    el("st-ready").textContent = counts.ready;
    el("st-done").textContent = counts.done;

    document.querySelectorAll("#setup-filters [data-filter]").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.filter === filter);
      btn.querySelector("b").textContent = counts[btn.dataset.filter];
    });

    // нові зверху
    const shown = setups
      .slice()
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      .filter(s => filter === "all" || s.status === filter);

    listBox.innerHTML = shown.map(cardHTML).join("");

    const empty = el("setups-empty");
    empty.hidden = shown.length > 0;
    empty.textContent = setups.length === 0
      ? "Заявок ще немає."
      : "У цьому розділі заявок немає.";
  }

  /* ---------- Дії ---------- */
  listBox.addEventListener("click", e => {
    const btn = e.target.closest("button[data-act]");
    if (!btn) return;

    setups = loadSetups(); // свіжі дані, щоб нічого не загубити
    const card = btn.closest("[data-setup-id]");
    const setup = setups.find(s => s.id === card.dataset.setupId);
    if (!setup) { render(); return; }

    if (btn.dataset.act === "promo-issue") {
      if (typeof loadPromos !== "function" || !setup.account || !setup.account.email) {
        toast("Не вдалося видати промокод для цієї заявки.", true);
        return;
      }
      const percent = Math.round(Number(card.querySelector('[data-field="promo-percent"]').value));
      const days = Math.round(Number(card.querySelector('[data-field="promo-days"]').value));
      if (!Number.isFinite(percent) || percent < 1 || percent > PROMO_MAX_PERCENT) {
        toast("Знижка — ціле число від 1 до " + PROMO_MAX_PERCENT + " %.", true);
        return;
      }
      if (!Number.isFinite(days) || days < 1 || days > 365) {
        toast("Строк дії — від 1 до 365 днів.", true);
        return;
      }

      const list = loadPromos();
      let code;
      do { code = "SET" + setup.number + "-" + randomPart(); } while (list.some(p => p.code === code));
      const until = new Date();
      until.setDate(until.getDate() + days);

      list.push({
        code: code, percent: percent, scope: "cart", active: true, maxUses: 1, expires: isoDate(until), createdAt: Date.now(),
        owner: String(setup.account.email).toLowerCase(), source: "setup", setup: Number(setup.number) || 0
      });
      if (!savePromosDraft(list)) {
        toast("⚠️ Не вдалося зберегти промокод.", true);
        return;
      }
      setup.personalPromo = { code: code, percent: percent };
      setup.updatedAt = Date.now();
      if (!saveSetups(setups)) {
        toast("⚠️ Не вдалося зберегти заявку.", true);
        return;
      }
      toast("🎁 Промокод " + code + " видано клієнту");
      render();
      return;
    }

    if (btn.dataset.act === "promo-revoke") {
      const code = setup.personalPromo && setup.personalPromo.code;
      if (!code || !confirm("Відкликати промокод " + code + "?")) return;
      savePromosDraft(loadPromos().filter(p => p.code !== code));
      delete setup.personalPromo;
      setup.updatedAt = Date.now();
      saveSetups(setups);
      toast("Промокод відкликано");
      render();
      return;
    }

    if (btn.dataset.act === "save") {
      if (setup.status === "cancelled") {
        toast("Заявку скасовано клієнтом, змінити її не можна.", true);
        render();
        return;
      }
      const status = card.querySelector('[data-field="status"]').value;
      const note = card.querySelector('[data-field="note"]').value.trim();
      if (!ADMIN_STATUSES.includes(status)) return;

      if (status !== setup.status) setup.statusChangedAt = Date.now();
      setup.status = status;
      setup.adminNote = note.slice(0, 500);
      setup.updatedAt = Date.now();

      if (!saveSetups(setups)) {
        toast("⚠️ Не вдалося зберегти зміни.", true);
        return;
      }
      toast("✅ Заявку №" + setup.number + " оновлено: " + SETUP_STATUSES[status]);
      render();
    }

    if (btn.dataset.act === "delete") {
      if (!confirm("Видалити заявку №" + setup.number + "? Цю дію не можна скасувати.")) return;
      setups = setups.filter(s => s.id !== setup.id);
      if (!saveSetups(setups)) {
        toast("⚠️ Не вдалося видалити заявку.", true);
        setups = loadSetups();
      } else {
        toast("🗑 Заявку видалено");
      }
      render();
    }
  });

  el("setup-filters").addEventListener("click", e => {
    const btn = e.target.closest("[data-filter]");
    if (!btn) return;
    filter = btn.dataset.filter;
    render();
  });

  bindPhotoZoom(listBox, el("photo-modal"), el("photo-big"));
  if (window.SetupProposals) {
    SetupProposals.bindAdmin(listBox, () => { setups = loadSetups(); render(); });
  }

  // Нова заявка або зміна в іншій вкладці цього ж браузера
  window.addEventListener("storage", e => {
    if (e.key === SETUPS_KEY) {
      setups = loadSetups();
      render();
    }
  });

  render();
})();