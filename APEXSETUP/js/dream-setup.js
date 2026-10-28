// ===== «Сетап мрії»: сторінка користувача =====
// Підключати ПІСЛЯ products.js, cart.js, auth.js і setups-core.js.
(function () {
  "use strict";

  const el = id => document.getElementById(id);
  const toast = (text, isError) => { if (typeof showToast === "function") showToast(text, isError); };

  const form = el("dream-form");
  const listBox = el("ds-list");

  const NO_PHONE_MSG = "У вашому профілі немає номера телефону. Вийдіть з акаунта й увійдіть знову, вказавши номер телефону.";

  /* ---------- Стан форми ---------- */
  let editingId = null;                 // id заявки, яку редагуємо (null — нова)
  let photos = [];                      // фото-натхнення (data URL або шлях), до MAX_PHOTOS шт.
  const MAX_PHOTOS = 5;
  let selectedColor = "";               // ключ кольору
  const selectedPriorities = new Set(); // ключі пріоритетів

  /* ---------- Кольори та пріоритети ---------- */
  el("ds-colors").innerHTML = SETUP_COLORS.map(c =>
    `<button type="button" class="color-swatch" data-color="${c.key}" aria-pressed="false">` +
    `<span class="swatch-dot" style="background:${c.css}"></span><span>${escapeHTML(c.name)}</span></button>`
  ).join("");

  el("ds-priorities").innerHTML = SETUP_PRIORITIES.map(p =>
    `<button type="button" class="chip" data-priority="${p.key}" aria-pressed="false">` +
    `<span>${p.icon}</span><span>${escapeHTML(p.name)}</span></button>`
  ).join("");

  function syncChoices() {
    document.querySelectorAll("#ds-colors .color-swatch").forEach(btn => {
      const on = btn.dataset.color === selectedColor;
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
    document.querySelectorAll("#ds-priorities .chip").forEach(btn => {
      const on = selectedPriorities.has(btn.dataset.priority);
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  el("ds-colors").addEventListener("click", e => {
    const btn = e.target.closest("[data-color]");
    if (!btn) return;
    selectedColor = btn.dataset.color;
    syncChoices();
  });

  el("ds-priorities").addEventListener("click", e => {
    const btn = e.target.closest("[data-priority]");
    if (!btn) return;
    const key = btn.dataset.priority;
    if (selectedPriorities.has(key)) selectedPriorities.delete(key);
    else selectedPriorities.add(key);
    syncChoices();
  });

  /* ---------- Бюджет і фото ---------- */
  function updateBudgetHint() {
    const value = Number(el("ds-budget").value);
    el("ds-budget-hint").textContent = value > 0 ? "≈ " + secondaryPrice(value) : "";
  }
  el("ds-budget").addEventListener("input", updateBudgetHint);

  /* ---------- Промокод у заявці ---------- */
  function checkPromoField() {
    const raw = el("ds-promo").value;
    const code = normalizePromoCode(raw);
    if (!code) return { ok: true, code: "", percent: 0 };
    if (typeof findPromo !== "function") return { ok: true, code: code, percent: 0 };
    if (!window.__promosReady) return { ok: true, code: code, percent: 0 };

    const promo = findPromo(code);

    if (editingId) {
      const own = loadSetups().find(x => x.id === editingId);
      if (own && own.promoCode === code) {
        return { ok: true, code: code, percent: Number(own.promoPercent) || (promo ? promo.percent : 0) };
      }
    }

    if (!promo) return { ok: false, error: "Такого промокоду не існує." };
    if (promo.scope !== "setup") return { ok: false, error: "Цей промокод діє лише в кошику, у заявці його використати не можна." };
    const status = promoStatus(promo);
    if (status === "off") return { ok: false, error: "Цей промокод зараз не діє." };
    if (status === "expired") return { ok: false, error: "Термін дії промокоду минув." };
    if (status === "limit") return { ok: false, error: "Ліміт використання цього промокоду вичерпано." };
    if (promo.owner) {
      const account = getLoggedInAccount();
      if (!account || String(account.email).toLowerCase() !== promo.owner) {
        return { ok: false, error: "Цей промокод призначений для іншого акаунта." };
      }
    }
    const buyer = getLoggedInAccount();
    if (buyer && promoUsedByBuyer(promo.code, buyer, editingId)) {
      return { ok: false, error: "Ви вже використовували цей промокод." };
    }
    return { ok: true, code: promo.code, percent: promo.percent };
  }

  function updatePromoSummary(result) {
    const box = el("ds-promo-summary");
    const code = normalizePromoCode(el("ds-promo").value);
    if (!code) {
      box.textContent = "Не вказано";
      box.classList.remove("has");
    } else if (!result.ok) {
      box.textContent = "⚠️ Перевірте код";
      box.classList.add("has");
    } else {
      box.textContent = result.code + (result.percent ? " · −" + result.percent + "%" : "");
      box.classList.add("has");
    }
  }

  function updatePromoNote() {
    const note = el("ds-promo-note");
    const result = checkPromoField();
    if (!el("ds-promo").value.trim()) note.textContent = "";
    else if (!result.ok) note.textContent = "⚠️ " + result.error;
    else note.textContent = result.percent ? "✅ Промокод діє: −" + result.percent + "%. Менеджер врахує його в пропозиції." : "";
    updatePromoSummary(result);
  }

  function setPromoOpen(open) {
    el("ds-promo-panel").hidden = !open;
    el("ds-promo-toggle").setAttribute("aria-expanded", open ? "true" : "false");
    el("ds-promo-toggle").classList.toggle("open", open);
  }
  el("ds-promo-toggle").addEventListener("click", () => setPromoOpen(el("ds-promo-panel").hidden));
  el("ds-promo").addEventListener("input", e => {
    e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, "");
    updatePromoNote();
  });
  window.addEventListener("promos:loaded", updatePromoNote);

  /* ---------- Вибір пресетів ---------- */
  const presetsGrid = el("ds-presets-grid");
  if (presetsGrid) {
    presetsGrid.addEventListener("click", e => {
      const card = e.target.closest("[data-preset-img]");
      if (!card) return;
      
      const imgSrc = card.dataset.presetImg;
      const presetName = card.dataset.presetName || "Пресети";

      if (photos.length >= MAX_PHOTOS) {
        return showError("Можна додати не більше " + MAX_PHOTOS + " фото.");
      }

      photos.push(imgSrc);
      updatePhotoPreview();
      toast(`✨ Додано пресет «${presetName}»`);
    });
  }

  // Мініатюри доданих фото з кнопкою видалення + приховування пресетів
  function updatePhotoPreview() {
    const grid = el("ds-photos");
    const presetsWrapper = el("ds-presets-wrapper");

    // Автоматично приховуємо блок пресетів, якщо є хоча б 1 фото
    if (presetsWrapper) {
      presetsWrapper.style.display = photos.length > 0 ? "none" : "block";
    }

    grid.innerHTML = photos.length
      ? photos.map((src, i) =>
          `<div class="photo-thumb">` +
          `<img src="${escapeHTML(src)}" alt="Фото ${i + 1}">` +
          `<button type="button" class="photo-remove" data-photo-remove="${i}" aria-label="Прибрати фото ${i + 1}" title="Прибрати">✕</button>` +
          `</div>`
        ).join("")
      : '<div class="photo-empty">Фото ще не додано</div>';
    el("ds-photo-count").textContent = "Додано: " + photos.length + " з " + MAX_PHOTOS;
    el("ds-photo-pick").disabled = photos.length >= MAX_PHOTOS;
  }

  el("ds-photo-pick").addEventListener("click", () => el("ds-photo-file").click());

  el("ds-photo-file").addEventListener("change", async e => {
    const files = Array.from(e.target.files);
    e.target.value = "";
    if (files.length === 0) return;
    clearError();

    let skipped = 0;
    let problem = "";
    for (const file of files) {
      if (photos.length >= MAX_PHOTOS) { skipped++; continue; }
      if (!/^image\/(png|jpe?g|webp|gif)$/.test(file.type)) {
        problem = "Деякі файли пропущено: потрібні зображення PNG, JPG, WEBP або GIF.";
        continue;
      }
      if (file.size > 8 * 1024 * 1024) {
        problem = "Деякі файли пропущено: розмір фото — до 8 МБ.";
        continue;
      }
      try {
        photos.push(await resizeImage(file, 640, 480, 0.72));
      } catch (err) {
        problem = err.message || "Не вдалося обробити частину фото.";
      }
    }
    updatePhotoPreview();

    if (skipped > 0) problem = "Можна додати не більше " + MAX_PHOTOS + " фото — зайві пропущено.";
    if (problem) showError(problem);
  });

  el("ds-photos").addEventListener("click", e => {
    const btn = e.target.closest("[data-photo-remove]");
    if (!btn) return;
    photos.splice(Number(btn.dataset.photoRemove), 1);
    updatePhotoPreview();
  });

  /* ---------- Телефон з профілю ---------- */
  function updatePhoneField(account) {
    const phone = account && account.phone ? account.phone : "";
    el("ds-phone").value = phone;
    el("ds-phone-note").textContent = phone ? "" : NO_PHONE_MSG;
  }

  /* ---------- Помилки форми ---------- */
  function showError(message) {
    const box = el("ds-error");
    box.textContent = message;
    box.hidden = false;
    box.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function clearError() {
    const box = el("ds-error");
    box.textContent = "";
    box.hidden = true;
  }

  /* ---------- Створення / редагування ---------- */
  function resetForm() {
    editingId = null;
    photos = [];
    selectedColor = "";
    selectedPriorities.clear();
    form.reset();
    updatePromoNote();
    setPromoOpen(false);
    if (window.DreamDesk) DreamDesk.reset();
    el("ds-form-title").textContent = "Нова заявка";
    el("ds-submit").textContent = "Надіслати заявку";
    el("ds-cancel-edit").hidden = true;
    clearError();
    syncChoices();
    updatePhotoPreview();
    updateBudgetHint();
    updatePhoneField(getLoggedInAccount());
  }

  function fillForm(setup) {
    editingId = setup.id;
    photos = Array.isArray(setup.photos) && setup.photos.length
      ? setup.photos.slice(0, MAX_PHOTOS)
      : (setup.photo ? [setup.photo] : []);
    selectedColor = setup.color || "";
    selectedPriorities.clear();
    (setup.priorities || []).forEach(key => selectedPriorities.add(key));
    el("ds-budget").value = setup.budget;
    el("ds-comment").value = setup.comment || "";
    el("ds-promo").value = setup.promoCode || "";
    updatePromoNote();
    setPromoOpen(!!setup.promoCode);
    if (window.DreamDesk) DreamDesk.setComponents(setup.components || {});
    el("ds-form-title").textContent = "Редагування заявки №" + setup.number;
    el("ds-submit").textContent = "Зберегти зміни";
    el("ds-cancel-edit").hidden = false;
    clearError();
    syncChoices();
    updatePhotoPreview();
    updateBudgetHint();
    updatePhoneField(getLoggedInAccount());
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  el("ds-cancel-edit").addEventListener("click", resetForm);

  form.addEventListener("submit", e => {
    e.preventDefault();
    clearError();

    const account = getLoggedInAccount();
    if (!account) { render(); return; }

    if (!account.phone) {
      return showError(NO_PHONE_MSG);
    }

    const budgetRaw = el("ds-budget").value.trim();
    const budget = Number(budgetRaw);
    const comment = el("ds-comment").value.trim();

    if (budgetRaw === "" || !Number.isFinite(budget) || budget < 1) {
      return showError("Вкажіть бюджет у гривнях (число більше нуля).");
    }
    if (budget > 100000000) {
      return showError("Бюджет занадто великий.");
    }
    if (!selectedColor) {
      return showError("Оберіть бажаний колір.");
    }
    if (selectedPriorities.size === 0) {
      return showError("Оберіть хоча б один пріоритет.");
    }
    if (comment.length > 1000) {
      return showError("Коментар занадто довгий (максимум 1000 символів).");
    }

    const components = window.DreamDesk ? DreamDesk.getComponents() : {};

    const promoCheck = checkPromoField();
    if (!promoCheck.ok) {
      setPromoOpen(true);
      return showError(promoCheck.error);
    }

    const list = loadSetups();
    const now = Date.now();
    const accountData = { nick: account.nick, email: account.email, phone: account.phone };

    if (editingId) {
      const setup = list.find(s => s.id === editingId);
      if (!setup || !setupBelongsTo(setup, account) || !canEditSetup(setup)) {
        resetForm();
        render();
        return showError("Цю заявку вже не можна редагувати.");
      }
      setup.budget = Math.round(budget);
      setup.color = selectedColor;
      setup.priorities = Array.from(selectedPriorities);
      setup.comment = comment;
      setup.components = components;
      setup.promoCode = promoCheck.code;
      setup.promoPercent = promoCheck.percent;
      setup.photos = photos.slice();
      setup.photo = photos[0] || "";
      setup.account = accountData;
      setup.phone = account.phone;
      setup.updatedAt = now;
    } else {
      list.push({
        id: newSetupId(),
        number: nextSetupNumber(list),
        createdAt: now,
        updatedAt: now,
        status: "new",
        account: accountData,
        phone: account.phone,
        budget: Math.round(budget),
        color: selectedColor,
        priorities: Array.from(selectedPriorities),
        comment: comment,
        components: components,
        promoCode: promoCheck.code,
        promoPercent: promoCheck.percent,
        photos: photos.slice(),
        photo: photos[0] || "",
        adminNote: ""
      });
    }

    if (!saveSetups(list)) {
      return showError("Не вдалося зберегти заявку: сховище браузера переповнене або заблоковане. Спробуйте додати менше фото або без них.");
    }

    toast(editingId ? "✅ Зміни збережено" : "✅ Заявку надіслано");
    resetForm();
    render();
  });

  /* ---------- Список моїх заявок ---------- */
  function cardHTML(s) {
    const status = SETUP_STATUSES[s.status] ? s.status : "new";
    const date = new Date(s.createdAt || 0).toLocaleString("uk-UA");
    const edited = s.updatedAt && s.updatedAt - (s.createdAt || 0) > 1000 ? " · змінено" : "";
    const byYou = status === "cancelled" ? " (скасовано вами)" : "";
    const note = s.adminNote
      ? `<div class="admin-reply"><b>Відповідь магазину:</b><br>${escapeHTML(s.adminNote)}</div>`
      : "";

    let actions = "";
    if (canEditSetup(s)) {
      actions += '<button type="button" class="btn btn-sm btn-outline" data-act="edit">✏️ Редагувати</button>';
    }
    if (canCancelSetup(s)) {
      actions += '<button type="button" class="btn btn-sm btn-danger-outline" data-act="cancel">✖ Скасувати заявку</button>';
    }

    let personal = "";
    if (s.personalPromo && s.personalPromo.code && typeof findPromo === "function") {
      const code = s.personalPromo.code;
      const promo = findPromo(code);
      const st = promo ? promoStatus(promo) : "gone";
      const stText = { ok: "діє", off: "вимкнено", expired: "строк минув", limit: "вже використано", gone: "відкликано" }[st];
      const until = promo && promo.expires ? " · до " + promo.expires.split("-").reverse().join(".") : "";
      personal = `
        <div class="setup-promo">
          <b>🎁 Персональний промокод від магазину</b><br>
          <code>${escapeHTML(code)}</code> · −${Number(s.personalPromo.percent) || 0}%${escapeHTML(until)} · ${stText}
          ${st === "ok" ? `<div>
            <button type="button" class="btn btn-sm btn-outline" data-act="promo-copy">📋 Копіювати</button>
            <button type="button" class="btn btn-sm" data-act="promo-apply">🛒 Застосувати в кошику</button>
          </div>` : ""}
        </div>`;
    }

    return `
      <article class="order-card setup-card is-${status}" data-setup-id="${escapeHTML(s.id)}">
        <div class="order-head">
          <span class="order-title">Заявка №${escapeHTML(s.number)}</span>
          <span class="status-badge ${status}">${SETUP_STATUSES[status]}</span>
          <span class="order-date">${escapeHTML(date)}${edited}</span>
        </div>
        <p class="setup-hint">${SETUP_HINTS[status]}${byYou}</p>
        ${setupDetailsHTML(s)}
        ${note}
        ${window.SetupProposals ? SetupProposals.clientHTML(s) : ""}
        ${personal}
        <div class="order-actions">${actions}</div>
      </article>`;
  }

  function render() {
    const account = getLoggedInAccount();
    el("guard-login").hidden = !!account;
    el("dream-panel").hidden = !account;
    if (!account) return;

    updatePhoneField(account);

    const mine = loadSetups()
      .filter(s => setupBelongsTo(s, account))
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    if (editingId) {
      const current = mine.find(s => s.id === editingId);
      if (!current || !canEditSetup(current)) {
        resetForm();
        toast("Цю заявку вже не можна редагувати.", true);
      }
    }

    listBox.innerHTML = mine.map(cardHTML).join("");
    const empty = el("ds-empty");
    empty.hidden = mine.length > 0;
    empty.textContent = "У вас ще немає заявок. Заповніть форму вище, і ми підготуємо пропозицію.";
  }

  listBox.addEventListener("click", e => {
    const btn = e.target.closest("button[data-act]");
    if (!btn) return;

    const account = getLoggedInAccount();
    const id = btn.closest("[data-setup-id]").dataset.setupId;
    const list = loadSetups();
    const setup = list.find(s => s.id === id);

    if (!account || !setup || !setupBelongsTo(setup, account)) { render(); return; }

    if (btn.dataset.act === "promo-copy" || btn.dataset.act === "promo-apply") {
      const code = setup.personalPromo && setup.personalPromo.code;
      const promo = code && findPromo(code);
      if (!promo || promoStatus(promo) !== "ok") {
        toast("Цей промокод уже не діє.", true);
        render();
        return;
      }
      if (btn.dataset.act === "promo-copy") {
        if (navigator.clipboard) {
          navigator.clipboard.writeText(promo.code).then(() => toast("📋 Промокод скопійовано"), () => toast("Не вдалося скопіювати", true));
        }
      } else {
        setAppliedPromo(promo.code);
        location.href = "cart.html";
      }
      return;
    }

    if (btn.dataset.act === "edit") {
      if (!canEditSetup(setup)) {
        toast("Цю заявку вже не можна редагувати.", true);
        render();
        return;
      }
      fillForm(setup);
    }

    if (btn.dataset.act === "cancel") {
      if (!canCancelSetup(setup)) {
        toast("Цю заявку вже не можна скасувати.", true);
        render();
        return;
      }
      if (!confirm("Скасувати заявку №" + setup.number + "?")) return;
      setup.status = "cancelled";
      setup.cancelledBy = "customer";
      setup.statusChangedAt = Date.now();
      setup.updatedAt = Date.now();
      if (!saveSetups(list)) {
        toast("⚠️ Не вдалося скасувати заявку.", true);
        return;
      }
      if (editingId === setup.id) resetForm();
      toast("✖ Заявку №" + setup.number + " скасовано");
      render();
    }
  });

  bindPhotoZoom(listBox, el("photo-modal"), el("photo-big"));
  if (window.SetupProposals) SetupProposals.bindClient(listBox, render);

  window.addEventListener("storage", e => {
    if (e.key === SETUPS_KEY || e.key === "apex_session_v1") render();
  });

  resetForm();
  render();
})();