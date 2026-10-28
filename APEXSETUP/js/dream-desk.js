// ===== «Сетап мрії»: інтерфейс столу із зонами-слотами =====
// Підключати ПІСЛЯ products.js, cart.js, auth.js, setups-core.js і ПЕРЕД dream-setup.js.
// Дає window.DreamDesk: getComponents(), setComponents(obj), reset().
(function () {
  "use strict";

  const deskBox = document.getElementById("ds-desk");
  if (!deskBox || typeof SETUP_SLOTS === "undefined") return;

  const totalBox = document.getElementById("ds-desk-total");
  const budgetInput = document.getElementById("ds-budget");
  const toggleBtn = document.getElementById("ds-desk-toggle");
  const panel = document.getElementById("ds-desk-panel");
  const summaryBox = document.getElementById("ds-desk-summary");

  let components = {};      // { ключ_слота: запис }, див. normalizeComponents()
  let activeKey = null;     // слот, для якого відкрито вікно вибору
  let justPlaced = null;    // слот, що щойно отримав компонент (для анімації)
  let modal = null;

  const slotByKey = key => SETUP_SLOTS.find(s => s.key === key);

  function emitChange() {
    deskBox.dispatchEvent(new CustomEvent("desk:change", { bubbles: true }));
  }

  /* ---------- Малювання столу ---------- */
  function slotHTML(slot) {
    const entry = components[slot.key];
    let body;
    if (!entry) {
      body = '<span class="slot-plus">＋</span><span class="slot-hint">Додати</span>';
    } else if (entry.type === "product") {
      body = `<span class="slot-value">${escapeHTML(entry.name)}</span>` +
        (entry.price > 0 ? `<span class="slot-price">${formatPrice(entry.price)}</span>` : "");
    } else {
      body = `<span class="slot-value">${escapeHTML(componentText(entry))}</span>`;
    }
    const clear = entry
      ? `<button type="button" class="slot-clear" data-slot-clear="${slot.key}" aria-label="Прибрати: ${escapeHTML(slot.name)}" title="Прибрати">✕</button>`
      : "";
    const classes = "desk-slot slot-" + slot.key + (entry ? " filled" : "") +
      (entry && entry.type === "have" ? " have" : "") + (justPlaced === slot.key ? " placed" : "");
    return `
      <div class="${classes}" data-slot="${slot.key}" role="button" tabindex="0"
           aria-label="${escapeHTML(slot.name)}${entry ? ": " + escapeHTML(componentText(entry)) : ": додати"}">
        <span class="slot-icon" aria-hidden="true">${slot.icon}</span>
        <span class="slot-name">${escapeHTML(slot.name)}</span>
        ${body}
        ${clear}
      </div>`;
  }

  function renderTotal() {
    if (!totalBox) return;
    const picked = Object.keys(components).length;
    const sum = componentsTotal(components);
    const budget = budgetInput ? Number(budgetInput.value) || 0 : 0;

    let text = "Заповнено зон: " + picked + " з " + SETUP_SLOTS.length;
    let over = false;
    if (sum > 0) {
      text += " · Орієнтовна вартість обраних товарів: " + formatPrice(sum);
      if (budget > 0) {
        if (sum <= budget) {
          text += " · у межах бюджету, залишок " + formatPrice(budget - sum);
        } else {
          text += " · перевищує бюджет на " + formatPrice(sum - budget);
          over = true;
        }
      }
    }
    totalBox.textContent = text;
    totalBox.classList.toggle("over", over);
  }

  // Короткий підсумок у заголовку (видно і коли стіл згорнуто)
  function renderSummary() {
    if (!summaryBox) return;
    const picked = Object.keys(components).length;
    const sum = componentsTotal(components);
    summaryBox.textContent = picked === 0
      ? "Не заповнено"
      : "Зон: " + picked + " з " + SETUP_SLOTS.length + (sum > 0 ? " · " + formatPrice(sum) : "");
    summaryBox.classList.toggle("has", picked > 0);
  }

  // Відкриває або закриває стіл
  function setOpen(open) {
    if (!panel || !toggleBtn) return;
    panel.hidden = !open;
    toggleBtn.setAttribute("aria-expanded", open ? "true" : "false");
    toggleBtn.classList.toggle("open", open);
    if (!open) closeModal();
  }

  function render() {
    deskBox.innerHTML = SETUP_SLOTS.map(slotHTML).join("");
    renderTotal();
    renderSummary();
    justPlaced = null;
  }

  /* ---------- Вікно вибору ---------- */
  function ensureModal() {
    if (modal) return modal;
    modal = document.createElement("div");
    modal.className = "desk-overlay";
    modal.hidden = true;
    modal.innerHTML =
      '<div class="desk-modal" role="dialog" aria-modal="true" aria-labelledby="desk-modal-title">' +
        '<div class="desk-modal-head">' +
          '<h3 id="desk-modal-title"></h3>' +
          '<button type="button" class="desk-modal-close" data-pick-close aria-label="Закрити">✕</button>' +
        '</div>' +
        '<div class="desk-modal-body" id="desk-modal-body"></div>' +
      '</div>';
    document.body.appendChild(modal);

    modal.addEventListener("click", onModalClick);
    modal.addEventListener("input", e => {
      if (e.target.id === "desk-search") renderProductList(e.target.value);
    });
    document.addEventListener("keydown", e => {
      if (e.key === "Escape" && !modal.hidden) closeModal();
    });
    return modal;
  }

  function closeModal() {
    if (modal) modal.hidden = true;
    activeKey = null;
  }

  function productsFor(slot) {
    return PRODUCTS
      .filter(p => p.category === slot.category)
      .sort((a, b) => a.price - b.price);
  }

  function renderProductList(query) {
    const slot = slotByKey(activeKey);
    const list = document.getElementById("desk-pick-list");
    if (!slot || !list) return;

    const q = String(query || "").trim().toLowerCase();
    const current = components[slot.key];
    const items = productsFor(slot).filter(p => String(p.name).toLowerCase().includes(q));

    if (items.length === 0) {
      list.innerHTML = '<p class="pick-empty">' +
        (q ? "Нічого не знайдено." : "У каталозі поки немає товарів цієї категорії. Оберіть «Підберіть мені».") + "</p>";
      return;
    }

    list.innerHTML = items.map(p => {
      const out = p.stock === 0;
      const selected = current && current.type === "product" && String(current.id) === String(p.id);
      const image = p.image || placeholderImage(p.category);
      return `
        <button type="button" class="pick-item${selected ? " selected" : ""}" data-pick-product="${escapeHTML(p.id)}"${out ? " disabled" : ""}>
          <img src="${escapeHTML(image)}" alt="" data-category="${escapeHTML(p.category || "")}">
          <span class="pick-info">
            <span class="pick-name">${escapeHTML(p.name)}</span>
            <span class="pick-price">${out ? "Немає в наявності" : formatPrice(p.price)}</span>
          </span>
        </button>`;
    }).join("");
  }

  // Кнопка «Не потрібно — гаджет уже є»
  function haveButtonHTML(current) {
    return `<button type="button" class="pick-have${current && current.type === "have" ? " selected" : ""}" data-pick-have>✅ Не потрібно — гаджет уже є</button>`;
  }

  function openModal(key) {
    const slot = slotByKey(key);
    if (!slot) return;
    ensureModal();
    activeKey = key;

    document.getElementById("desk-modal-title").textContent = slot.icon + " " + slot.name;
    const body = document.getElementById("desk-modal-body");
    const current = components[key];
    let html = "";

    if (slot.kind === "product") {
      const total = productsFor(slot).length;
      html += `<button type="button" class="pick-any${current && current.type === "any" ? " selected" : ""}" data-pick-any>✨ Підберіть мені самі</button>`;
      html += haveButtonHTML(current);
      if (total > 6) html += '<input type="search" class="pick-search" id="desk-search" placeholder="Пошук серед товарів...">';
      html += '<div class="pick-list" id="desk-pick-list"></div>';
    } else {
      html += '<div class="pick-chips">' +
        slot.options.map(text => {
          const on = current && current.type === "option" && current.text === text;
          return `<button type="button" class="pick-chip${on ? " selected" : ""}" data-pick-option="${escapeHTML(text)}">${escapeHTML(text)}</button>`;
        }).join("") + '</div>';
      html += '<div class="pick-custom"><input type="text" id="desk-custom" maxlength="80" placeholder="Або впишіть свій варіант">' +
        '<button type="button" class="btn btn-sm" data-pick-custom>Додати</button></div>';
      html += `<button type="button" class="pick-any${current && current.type === "any" ? " selected" : ""}" data-pick-any>✨ Не важливо — підберіть мені</button>`;
      html += haveButtonHTML(current);
    }

    if (current) {
      html += '<button type="button" class="btn btn-sm btn-outline pick-remove" data-pick-clear>Прибрати із зони</button>';
    }

    body.innerHTML = html;
    if (slot.kind === "product") renderProductList("");
    modal.hidden = false;

    const focusTarget = body.querySelector(".pick-search, #desk-custom, .pick-item, .pick-any");
    if (focusTarget) focusTarget.focus();
  }

  function place(key, entry) {
    components[key] = entry;
    justPlaced = key;
    closeModal();
    render();
    emitChange();
  }

  function remove(key) {
    delete components[key];
    render();
    emitChange();
  }

  function onModalClick(e) {
    if (e.target === modal || e.target.closest("[data-pick-close]")) { closeModal(); return; }
    if (!activeKey) return;
    const slot = slotByKey(activeKey);

    if (e.target.closest("[data-pick-any]")) { place(slot.key, { type: "any" }); return; }
    if (e.target.closest("[data-pick-have]")) { place(slot.key, { type: "have" }); return; }

    if (e.target.closest("[data-pick-clear]")) {
      const key = slot.key;
      closeModal();
      remove(key);
      return;
    }

    const prod = e.target.closest("[data-pick-product]");
    if (prod) {
      const p = getProductById(prod.dataset.pickProduct);
      if (!p || p.stock === 0) return;
      place(slot.key, { type: "product", id: String(p.id), name: p.name, price: Number(p.price) || 0 });
      return;
    }

    const opt = e.target.closest("[data-pick-option]");
    if (opt) { place(slot.key, { type: "option", text: opt.dataset.pickOption }); return; }

    if (e.target.closest("[data-pick-custom]")) {
      const input = document.getElementById("desk-custom");
      const text = input.value.trim();
      if (!text) { input.focus(); return; }
      place(slot.key, { type: "option", text: text.slice(0, 80) });
    }
  }

  /* ---------- Події столу ---------- */
  deskBox.addEventListener("click", e => {
    const clear = e.target.closest("[data-slot-clear]");
    if (clear) {
      e.stopPropagation();
      remove(clear.dataset.slotClear);
      return;
    }
    const slot = e.target.closest("[data-slot]");
    if (slot) openModal(slot.dataset.slot);
  });

  deskBox.addEventListener("keydown", e => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const slot = e.target.closest("[data-slot]");
    if (slot && e.target === slot) {
      e.preventDefault();
      openModal(slot.dataset.slot);
    }
  });

  if (toggleBtn) toggleBtn.addEventListener("click", () => setOpen(panel.hidden));

  // Бюджет змінили — оновлюємо підсумок
  if (budgetInput) budgetInput.addEventListener("input", renderTotal);

  /* ---------- API для dream-setup.js ---------- */
  window.DreamDesk = {
    getComponents: () => normalizeComponents(components),
    // при редагуванні заявки зі столом одразу розкриваємо його
    setComponents: obj => { components = normalizeComponents(obj); render(); setOpen(Object.keys(components).length > 0); },
    reset: () => { components = {}; closeModal(); render(); setOpen(false); },
    open: () => setOpen(true),
    close: () => setOpen(false)
  };

  render();
})();