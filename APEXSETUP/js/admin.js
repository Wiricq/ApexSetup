// ===== Адмін-панель: товари, знижки, замовлення та промокоди =====
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
  el("admin-panel").hidden = false;

  /* ---------- Стан ---------- */
  let products = loadAllProducts();
  let orders = loadOrders();
  let reserved = reservedMap(orders);
  let reservedColors = reservedColorMap(orders);
  let stockNoteState = { hidden: true, text: "" };
  let ordersFilter = "all";
  let editingId = null;
  let imageValue = "";
  let saleOn = false;
  let query = "";

  const STATUS_LABELS = {
    new: "Нове",
    done: "Виконано",
    cancelled: "Скасовано",
    refund: "Запит на повернення",
    refunded: "Кошти повернено"
  };

  const tbody = el("admin-tbody");
  const modal = el("product-modal");
  const form = el("product-form");

  el("pf-category").innerHTML = Object.keys(CATEGORY_NAMES)
    .map(key => `<option value="${key}">${CATEGORY_NAMES[key]}</option>`)
    .join("");

  function renderAttrFields(category, values) {
    const defs = CATEGORY_ATTRS[category] || {};
    const keys = Object.keys(defs).filter(k => attrApplies(defs[k], values || {}));
    el("pf-attrs-box").hidden = Object.keys(defs).length === 0;
    el("pf-attrs").innerHTML = keys.map(key => {
      const def = defs[key];
      const options = '<option value="">Не вказано</option>' + Object.keys(def.options).map(v =>
        `<option value="${v}"${values && values[key] === v ? " selected" : ""}>${escapeHTML(def.options[v])}</option>`
      ).join("");
      return `<label>${escapeHTML(def.label)}<select data-attr="${key}">${options}</select></label>`;
    }).join("");
  }

  function readAttrFields() {
    const attrs = {};
    document.querySelectorAll("#pf-attrs [data-attr]").forEach(select => {
      if (select.value) attrs[select.dataset.attr] = select.value;
    });
    return attrs;
  }

  function effectiveStock(p) {
    return p.stock === null ? null : Math.max(0, p.stock - (reserved[p.id] || 0));
  }

  function applyChange(mutator, okMessage) {
    const backup = JSON.parse(JSON.stringify(products));
    mutator();
    if (!saveAllProducts(products)) {
      products = backup;
      render();
      toast("⚠️ Не вдалося зберегти: сховище переповнене.", true);
      return false;
    }
    render();
    if (okMessage) toast(okMessage);
    return true;
  }

  function newId() {
    let id;
    do {
      id = "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    } while (products.some(p => p.id === id));
    return id;
  }

  function render() {
    reserved = reservedMap(orders);
    reservedColors = reservedColorMap(orders);
    renderProducts();
    renderOrders();
  }

  function renderProducts() {
    el("stat-total").textContent = products.length;
    el("stat-visible").textContent = products.filter(p => p.visible).length;
    el("stat-out").textContent = products.filter(p => effectiveStock(p) === 0).length;

    el("source-note").textContent = remoteNote();
    el("reset-btn").hidden = !hasProductsDraft();

    const q = query.trim().toLowerCase();
    const list = products.filter(p =>
      !q ||
      p.name.toLowerCase().includes(q) ||
      (CATEGORY_NAMES[p.category] || "").toLowerCase().includes(q)
    );

    tbody.innerHTML = list.map(p => {
      const categoryName = CATEGORY_NAMES[p.category] || p.category;
      const image = p.image || placeholderImage(p.category);
      const effective = effectiveStock(p);
      const taken = reserved[p.id] || 0;
      const stockText = effective === null ? "∞" : effective;
      const colors = productColors(p);
      const rc = reservedColors[p.id] || {};
      const stockOff = effective === null || colors.length ? " disabled" : "";
      const colorsNote = colors.length
        ? "<small>" + colors.map(c => escapeHTML(c.name) + ": " + Math.max(0, c.stock - (rc[c.name] || 0))).join(" · ") + "</small>"
        : "";
      const takenNote = effective !== null && taken > 0 ? `<small>у замовленнях: ${taken}</small>` : "";
      const priceCell = p.discount > 0
        ? `<s class="old-price">${formatPrice(p.price)}</s> <b>${formatPrice(finalPrice(p.price, p.discount))}</b>` +
          `<small class="sale-tag">знижка −${p.discount}%</small>`
        : formatPrice(p.price);
      return `
        <tr data-id="${escapeHTML(p.id)}" class="${p.visible ? "" : "row-hidden"}">
          <td><img class="thumb" src="${escapeHTML(image)}" alt="" data-category="${escapeHTML(p.category)}"></td>
          <td><strong>${escapeHTML(p.name)}</strong><small>${escapeHTML(categoryName)}</small></td>
          <td>${priceCell}</td>
          <td>
            <div class="stock-ctl">
              <button type="button" data-act="dec"${stockOff} aria-label="Зменшити">−</button>
              <span class="${effective === 0 ? "stock-zero" : ""}">${stockText}</span>
              <button type="button" data-act="inc"${stockOff} aria-label="Збільшити">+</button>
            </div>
            ${takenNote}${colorsNote}
          </td>
          <td>
            <label class="switch" title="Показувати">
              <input type="checkbox" data-act="visible"${p.visible ? " checked" : ""}>
              <span></span>
            </label>
          </td>
          <td class="row-actions">
            <button type="button" class="btn btn-sm btn-outline" data-act="edit">Змінити</button>
            <button type="button" class="btn btn-sm btn-danger-outline" data-act="delete">Видалити</button>
          </td>
        </tr>`;
    }).join("");

    const empty = el("admin-empty");
    empty.hidden = list.length > 0;
    empty.textContent = products.length === 0 ? "Товарів ще немає." : "Нічого не знайдено.";
  }

  tbody.addEventListener("click", e => {
    const btn = e.target.closest("button[data-act]");
    if (!btn) return;
    const id = btn.closest("tr").dataset.id;
    const product = products.find(p => p.id === id);
    if (!product) return;

    switch (btn.dataset.act) {
      case "edit": openModal(product); break;
      case "delete":
        if (confirm("Видалити товар «" + product.name + "»?")) {
          applyChange(() => { products = products.filter(p => p.id !== id); }, "🗑 Видалено");
        }
        break;
      case "inc":
      case "dec": {
        if (product.stock === null || productColors(product).length) return;
        const goingDown = btn.dataset.act === "dec";
        if (goingDown && effectiveStock(product) <= 0) return;
        applyChange(() => { product.stock = Math.max(0, product.stock + (goingDown ? -1 : 1)); });
        break;
      }
    }
  });

  tbody.addEventListener("change", e => {
    const checkbox = e.target.closest('input[data-act="visible"]');
    if (!checkbox) return;
    const id = checkbox.closest("tr").dataset.id;
    const product = products.find(p => p.id === id);
    if (!product) return;
    applyChange(() => { product.visible = checkbox.checked; }, checkbox.checked ? "👁 Показано" : "🙈 Приховано");
  });

  function renderOrders() {
    const counts = { all: orders.length, new: 0, done: 0, cancelled: 0, refund: 0, refunded: 0 };
    let revenue = 0;
    orders.forEach(o => {
      if (counts[o.status] !== undefined) counts[o.status]++;
      if (o.status !== "cancelled" && o.status !== "refunded") revenue += Number(o.total) || 0;
    });
    const isRefundOrder = o => o.status === "refund" || o.status === "refunded";
    const refundTotal = counts.refund + counts.refunded;
    el("ord-new").textContent = counts.new;
    el("ord-done").textContent = counts.done;
    el("ord-cancelled").textContent = counts.cancelled;
    if (el("ord-refund")) el("ord-refund").textContent = counts.refund;
    el("ord-revenue").textContent = formatPrice(Math.round(revenue * 100) / 100);

    document.querySelectorAll("#order-filters [data-filter]").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.filter === ordersFilter);
      btn.querySelector("b").textContent = btn.dataset.filter === "refund" ? refundTotal : counts[btn.dataset.filter];
    });

    const list = orders
      .slice()
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      .filter(o => ordersFilter === "all" || (ordersFilter === "refund" ? isRefundOrder(o) : o.status === ordersFilter));

    el("orders-list").innerHTML = list.map(o => {
      const c = o.customer || {};
      const phoneHref = String(c.phone || "").replace(/[^\d+]/g, "");
      const date = new Date(o.createdAt || 0).toLocaleString("uk-UA");
      const status = STATUS_LABELS[o.status] ? o.status : "new";

      const items = o.items.map(i =>
        `<li><span>${escapeHTML(i.name)}${i.color ? " (" + escapeHTML(i.color) + ")" : ""} × ${Number(i.qty) || 0}</span><span>${formatPrice((Number(i.price) || 0) * (Number(i.qty) || 0))}</span></li>`
      ).join("");

      let actions = "";
      if (status === "new") actions += '<button type="button" class="btn btn-sm btn-success" data-order-act="done">✅ Виконано</button>';
      if (status === "new" || status === "done") actions += '<button type="button" class="btn btn-sm btn-danger-outline" data-order-act="cancel">✖ Скасувати</button>';
      if (status === "cancelled" || status === "refunded") actions += '<button type="button" class="btn btn-sm btn-outline" data-order-act="delete">🗑 Видалити</button>';

      return `
        <article class="order-card is-${status}" data-order-id="${escapeHTML(o.id)}">
          <div class="order-head">
            <span class="order-title">Замовлення №${escapeHTML(o.number)}</span>
            <span class="status-badge ${status}">${STATUS_LABELS[status]}</span>
            <span class="order-date">${escapeHTML(date)}</span>
          </div>
          <div class="order-body" style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
            <div class="order-info">
              <div><span>Ім'я та прізвище:</span> <b>${escapeHTML(c.name || "—")}</b></div>
              <div><span>Телефон:</span> <a href="tel:${escapeHTML(phoneHref)}">${escapeHTML(c.phone || "—")}</a></div>
              <div><span>Email:</span> <b>${escapeHTML(c.email || "—")}</b></div>
              <div><span>Область:</span> <b>${escapeHTML(c.region || "—")}</b></div>
              <div><span>Місто:</span> <b>${escapeHTML(c.city || "—")}</b></div>
              <div><span>Доставка / Відділення:</span> <b>${escapeHTML(c.delivery || "—")}</b></div>
              <div><span>Оплата:</span> <b>${escapeHTML(paymentLabel(c.payment))}</b></div>
              ${c.comment ? `<div><span>Коментар:</span> <b>${escapeHTML(c.comment)}</b></div>` : ""}
              ${o.promo ? `<div><span>Промокод:</span> <b>${escapeHTML(o.promo.code)}</b></div>` : ""}
            </div>
            <div>
              <ul class="order-items">${items}</ul>
              <div class="order-total"><span>Разом</span><span>${formatPrice(o.total)}</span></div>
            </div>
          </div>
          <div class="order-actions">${actions}</div>
        </article>`;
    }).join("");

    el("orders-empty").hidden = list.length > 0;
  }

  el("orders-list").addEventListener("click", e => {
    const btn = e.target.closest("button[data-order-act]");
    if (!btn) return;
    orders = loadOrders();
    const id = btn.closest("[data-order-id]").dataset.orderId;
    const order = orders.find(o => o.id === id);
    if (!order) return;

    if (btn.dataset.orderAct === "done") order.status = "done";
    if (btn.dataset.orderAct === "cancel") order.status = "cancelled";
    if (btn.dataset.orderAct === "delete") orders = orders.filter(o => o.id !== id);

    saveOrders(orders);
    render();

    if (window.ApexDB && ApexDB.enabled) {
      if (ApexDB.isSignedIn()) {
        const act = btn.dataset.orderAct;
        (act === "delete" ? ApexDB.deleteOrder(id) : ApexDB.updateOrderStatus(id, order.status))
          .catch(err => toast("⚠️ Не вдалося зберегти в базі: " + err.message, true));
      } else {
        toast("⚠️ Зміну збережено лише в цьому браузері — увійдіть у спільну базу.", true);
      }
    }
  });

  el("order-filters").addEventListener("click", e => {
    const btn = e.target.closest("[data-filter]");
    if (!btn) return;
    ordersFilter = btn.dataset.filter;
    renderOrders();
  });

  function setSaleMode(on) {
    saleOn = on;
    document.querySelectorAll("#pf-sale-toggle [data-sale]").forEach(btn => {
      btn.classList.toggle("active", (btn.dataset.sale === "yes") === on);
    });
    el("pf-sale-box").hidden = !on;
    updateSalePreview();
  }

  function updateSalePreview() {
    const box = el("pf-sale-preview");
    if (!box) return;
    const priceRaw = el("pf-price").value;
    const price = Number(priceRaw);
    const discount = Number(el("pf-discount").value);
    if (saleOn && priceRaw !== "" && Number.isFinite(price) && Number.isInteger(discount) && discount >= 1 && discount <= 90) {
      box.textContent = "Нова ціна: " + formatPrice(finalPrice(price, discount)) + " (було " + formatPrice(price) + ")";
    } else {
      box.textContent = "";
    }
  }

  const saleToggle = el("pf-sale-toggle");
  if (saleToggle) {
    saleToggle.addEventListener("click", e => {
      const btn = e.target.closest("[data-sale]");
      if (!btn) return;
      setSaleMode(btn.dataset.sale === "yes");
      if (saleOn && !el("pf-discount").value) el("pf-discount").focus();
    });
  }

  const saleBox = el("pf-sale-box");
  if (saleBox) {
    saleBox.addEventListener("click", e => {
      const chip = e.target.closest("[data-chip]");
      if (!chip) return;
      el("pf-discount").value = chip.dataset.chip;
      updateSalePreview();
    });
  }

  const discountInput = el("pf-discount");
  if (discountInput) discountInput.addEventListener("input", updateSalePreview);
  const priceInput = el("pf-price");
  if (priceInput) priceInput.addEventListener("input", updateSalePreview);

  function showFormError(message) {
    const box = el("pf-error");
    if (!box) return;
    box.textContent = message;
    box.hidden = false;
  }

  function clearFormError() {
    const box = el("pf-error");
    if (box) {
      box.textContent = "";
      box.hidden = true;
    }
  }

  function updatePreview() {
    const img = el("pf-preview");
    if (!img) return;
    const category = el("pf-category").value;
    delete img.dataset.fallback;
    img.dataset.category = category;
    img.src = imageValue || placeholderImage(category);
    const removeBtn = el("pf-image-remove");
    if (removeBtn) removeBtn.hidden = !imageValue;
  }

  function openModal(product) {
    editingId = product ? product.id : null;
    el("modal-title").textContent = product ? "Редагувати товар" : "Додати товар";
    el("pf-name").value = product ? product.name : "";
    el("pf-category").value = product ? product.category : "keyboards";
    renderAttrFields(el("pf-category").value, product ? product.attrs : {});
    el("pf-price").value = product ? product.price : "";
    el("pf-rating").value = product ? String(product.rating) : "5";
    el("pf-desc").value = product ? product.desc : "";
    el("pf-visible").checked = product ? product.visible : true;

    const discount = product ? product.discount : 0;
    if (el("pf-discount")) el("pf-discount").value = discount > 0 ? discount : "";
    setSaleMode(discount > 0);

    const effective = product ? effectiveStock(product) : 10;
    el("pf-stock").value = effective === null ? "" : effective;
    const taken = product ? (reserved[product.id] || 0) : 0;
    const note = el("pf-stock-note");
    if (note) {
      note.hidden = !(product && product.stock !== null && taken > 0);
      note.textContent = "У замовленнях зараз зарезервовано " + taken + " шт.";
    }

    colorsBox.innerHTML = "";
    if (product) {
      const rc = reservedColors[product.id] || {};
      productColors(product).forEach(c =>
        addColorRow({ name: c.name, hexes: c.hexes, qty: Math.max(0, c.stock - (rc[c.name] || 0)) }));
    }
    stockNoteState = { hidden: note ? note.hidden : true, text: note ? note.textContent : "" };
    syncColorStock();

    imageValue = product ? product.image : "";
    const imagePath = el("pf-image-path");
    if (imagePath) imagePath.value = imageValue && !imageValue.startsWith("data:") ? imageValue : "";

    updatePreview();
    clearFormError();
    modal.hidden = false;
    el("pf-name").focus();
  }

  function closeModal() {
    modal.hidden = true;
    editingId = null;
  }

  function processProductImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const W = 640, H = 480;
        const targetRatio = W / H;
        let sw = img.width, sh = img.height, sx = 0, sy = 0;
        if (sw / sh > targetRatio) {
          const nw = sh * targetRatio;
          sx = (sw - nw) / 2;
          sw = nw;
        } else {
          const nh = sw / targetRatio;
          sy = (sh - nh) / 2;
          sh = nh;
        }
        const canvas = document.createElement("canvas");
        canvas.width = W;
        canvas.height = H;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#111111";
        ctx.fillRect(0, 0, W, H);
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, W, H);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Не вдалося прочитати зображення."));
      };
      img.src = url;
    });
  }

  /* ---------- Кольори товару ---------- */
  const colorsBox = el("pf-colors");

  (function addColorStyles() {
    const style = document.createElement("style");
    style.textContent =
      ".color-row{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-bottom:8px}" +
      ".color-row .cr-preset,.color-row .cr-name{flex:1 1 130px;min-width:0}" +
      ".color-row .cr-hex{width:44px;height:38px;padding:2px;cursor:pointer;background:none;border:1px solid rgba(255,255,255,.3);border-radius:8px}" +
      ".color-row .cr-qty{width:90px}" +
      ".color-row .cr-shades{display:flex;flex-wrap:wrap;gap:6px;align-items:center}" +
      ".color-row .cr-shade{position:relative;display:inline-flex}" +
      ".color-row .cr-shade-del{position:absolute;top:-6px;right:-6px;width:18px;height:18px;padding:0;line-height:16px;font-size:12px;cursor:pointer;" +
        "color:#fff;background:#ff3b4a;border:0;border-radius:50%}" +
      ".color-row .cr-add-shade{padding:6px 10px;font:inherit;font-size:.8rem;cursor:pointer;color:inherit;background:rgba(255,255,255,.1);" +
        "border:1px dashed rgba(255,255,255,.4);border-radius:999px;white-space:nowrap}" +
      ".color-row .cr-add-shade[hidden]{display:none}" +
      ".color-row .cr-del{width:34px;height:34px;cursor:pointer;color:#fff;background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.3);border-radius:50%}" +
      ".color-row .cr-del:hover{background:#ff3b4a}";
    document.head.appendChild(style);
  })();

  const MAX_SHADES = 6;

  // Один відтінок у варіанті; перший — основний, решту можна прибрати
  function addShade(row, hex) {
    const box = row.querySelector(".cr-shades");
    if (box.children.length >= MAX_SHADES) return;
    const shade = document.createElement("span");
    shade.className = "cr-shade";
    shade.innerHTML =
      '<input type="color" class="cr-hex" aria-label="Відтінок" value="' + escapeHTML(hex || "#e11d48") + '">' +
      (box.children.length ? '<button type="button" class="cr-shade-del" aria-label="Прибрати відтінок">×</button>' : "");
    box.appendChild(shade);
    row.querySelector(".cr-add-shade").hidden = box.children.length >= MAX_SHADES;
  }

  function addColorRow(data) {
    data = data || {};
    const row = document.createElement("div");
    row.className = "color-row";
    row.innerHTML =
      '<select class="cr-preset" aria-label="Швидкий вибір кольору"><option value="">Швидкий вибір…</option>' +
        COLOR_PRESETS.map((c, i) => '<option value="' + i + '">' + escapeHTML(c.name) + "</option>").join("") + "</select>" +
      '<span class="cr-shades"></span>' +
      '<button type="button" class="cr-add-shade" title="Додати ще один відтінок (для багатоколірного варіанта)">＋ відтінок</button>' +
      '<input type="text" class="cr-name" maxlength="24" placeholder="Назва, напр. Чорно-червоний" aria-label="Назва кольору" value="' + escapeHTML(data.name || "") + '">' +
      '<input type="number" class="cr-qty" min="0" step="1" placeholder="К-сть" aria-label="Кількість" value="' + (data.qty === undefined ? "" : data.qty) + '">' +
      '<button type="button" class="cr-del" aria-label="Видалити колір">✕</button>';
    colorsBox.appendChild(row);
    const shades = Array.isArray(data.hexes) && data.hexes.length ? data.hexes : ["#111111"];
    shades.forEach(h => addShade(row, h));
  }

  // Якщо є кольори — загальна кількість рахується автоматично
  function syncColorStock() {
    const rows = colorsBox.querySelectorAll(".color-row");
    const stockInput = el("pf-stock");
    const note = el("pf-stock-note");
    if (rows.length) {
      let sum = 0;
      rows.forEach(r => { sum += Math.max(0, Math.floor(Number(r.querySelector(".cr-qty").value)) || 0); });
      stockInput.value = sum;
      stockInput.disabled = true;
      if (note) { note.hidden = false; note.textContent = "Рахується автоматично: сума по кольорах."; }
    } else {
      stockInput.disabled = false;
      if (note) { note.hidden = stockNoteState.hidden; note.textContent = stockNoteState.text; }
    }
  }

  function readColorRows() {
    const rows = [];
    const names = new Set();
    let error = "";
    colorsBox.querySelectorAll(".color-row").forEach(row => {
      if (error) return;
      const name = row.querySelector(".cr-name").value.trim();
      const raw = row.querySelector(".cr-qty").value.trim();
      const qty = Number(raw);
      if (!name) error = "Вкажіть назву для кожного кольору.";
      else if (names.has(name.toLowerCase())) error = "Кольори не повинні повторюватися: «" + name + "».";
      else if (raw === "" || !Number.isInteger(qty) || qty < 0) error = "Вкажіть кількість (ціле число від 0) для кольору «" + name + "».";
      else {
        names.add(name.toLowerCase());
        const hexes = Array.from(row.querySelectorAll(".cr-hex")).map(input => input.value);
        rows.push({ name: name, hexes: hexes, qty: qty });
      }
    });
    return { rows: rows, error: error };
  }

  el("pf-color-add").addEventListener("click", () => {
    addColorRow({});
    syncColorStock();
    const last = colorsBox.lastElementChild;
    if (last) last.querySelector(".cr-preset").focus();
  });

  colorsBox.addEventListener("change", e => {
    const preset = e.target.closest(".cr-preset");
    if (!preset) return;
    const c = COLOR_PRESETS[Number(preset.value)];
    if (c) {
      const row = preset.closest(".color-row");
      row.querySelector(".cr-hex").value = c.hex;
      row.querySelector(".cr-name").value = c.name;
    }
    preset.value = "";
  });

  colorsBox.addEventListener("click", e => {
    const addShadeBtn = e.target.closest(".cr-add-shade");
    if (addShadeBtn) {
      addShade(addShadeBtn.closest(".color-row"), "#e11d48");
      return;
    }
    const shadeDel = e.target.closest(".cr-shade-del");
    if (shadeDel) {
      const row = shadeDel.closest(".color-row");
      shadeDel.closest(".cr-shade").remove();
      row.querySelector(".cr-add-shade").hidden = false;
      return;
    }
    const del = e.target.closest(".cr-del");
    if (!del) return;
    del.closest(".color-row").remove();
    syncColorStock();
  });

  colorsBox.addEventListener("input", e => {
    if (e.target.closest(".cr-qty")) syncColorStock();
  });

  el("add-btn").addEventListener("click", () => openModal(null));
  el("modal-cancel").addEventListener("click", closeModal);
  modal.addEventListener("click", e => { if (e.target === modal) closeModal(); });

  el("pf-attrs").addEventListener("change", () => {
    renderAttrFields(el("pf-category").value, readAttrFields());
  });

  el("pf-category").addEventListener("change", () => {
    renderAttrFields(el("pf-category").value, {});
    updatePreview();
  });

  const imgPick = el("pf-image-pick");
  const imgFile = el("pf-image-file");
  if (imgPick && imgFile) {
    imgPick.addEventListener("click", () => imgFile.click());
    imgFile.addEventListener("change", async e => {
      const file = e.target.files[0];
      e.target.value = "";
      if (!file) return;
      clearFormError();
      try {
        imageValue = await processProductImage(file);
        const imagePath = el("pf-image-path");
        if (imagePath) imagePath.value = "";
        updatePreview();
      } catch (err) {
        showFormError(err.message || "Помилка обробки фото.");
      }
    });
  }

  const imagePathInput = el("pf-image-path");
  if (imagePathInput) {
    imagePathInput.addEventListener("input", e => {
      imageValue = e.target.value.trim();
      updatePreview();
    });
  }

  const imageRemoveBtn = el("pf-image-remove");
  if (imageRemoveBtn) {
    imageRemoveBtn.addEventListener("click", () => {
      imageValue = "";
      const imagePath = el("pf-image-path");
      if (imagePath) imagePath.value = "";
      updatePreview();
    });
  }

  form.addEventListener("submit", e => {
    e.preventDefault();
    clearFormError();

    const name = el("pf-name").value.trim();
    const category = el("pf-category").value;
    const price = Number(el("pf-price").value);
    const stockRaw = el("pf-stock").value.trim();
    const rating = Number(el("pf-rating").value);
    const desc = el("pf-desc").value.trim();
    const visible = el("pf-visible").checked;

    if (!name) return showFormError("Введіть назву товару.");
    if (el("pf-price").value === "" || !Number.isFinite(price) || price < 0) {
      return showFormError("Вкажіть коректну ціну.");
    }

    let discount = 0;
    if (saleOn && el("pf-discount")) {
      const raw = el("pf-discount").value.trim();
      discount = Number(raw);
    }

    let stock = null;
    if (stockRaw !== "") {
      const typed = Number(stockRaw);
      if (Number.isInteger(typed) && typed >= 0) {
        stock = typed + (editingId ? (reserved[editingId] || 0) : 0);
      }
    }

    const colorRead = readColorRows();
    if (colorRead.error) return showFormError(colorRead.error);
    let colors = [];
    if (colorRead.rows.length) {
      // зберігаємо «усього» = вільні + зарезервовані (так само, як і для звичайної кількості)
      const rc = (editingId && reservedColors[editingId]) || {};
      colors = colorRead.rows.map(r => ({ name: r.name, hex: r.hexes[0], hexes: r.hexes, stock: r.qty + (rc[r.name] || 0) }));
      stock = colors.reduce((sum, c) => sum + c.stock, 0);
    }

    const data = {
      name, category,
      price: Math.round(price * 100) / 100,
      discount, stock, rating, colors,
      image: imageValue,
      desc,
      attrs: readAttrFields(),
      visible
    };

    const wasEditing = editingId !== null;
    const saved = applyChange(() => {
      const index = wasEditing ? products.findIndex(p => p.id === editingId) : -1;
      if (index >= 0) products[index] = Object.assign({}, products[index], data);
      else products.push(Object.assign({ id: newId() }, data));
    }, wasEditing ? "✅ Зміни збережено" : "✅ Товар додано");

    if (saved) closeModal();
  });

  const adminSearch = el("admin-search");
  if (adminSearch) {
    adminSearch.addEventListener("input", e => {
      query = e.target.value;
      renderProducts();
    });
  }

  /* ---------- Спільна база: вхід, синхронізація замовлень і товарів ---------- */
  function initSharedDb() {
    if (!window.ApexDB || !ApexDB.enabled) return;
    ApexDB.onError = err => toast("⚠️ База: " + (err && err.message ? err.message : err), true);

    const bar = document.createElement("div");
    bar.id = "db-bar";
    bar.style.cssText = "margin:0 0 16px;padding:12px 16px;border-radius:14px;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.07)";
    el("admin-panel").insertBefore(bar, el("admin-panel").firstChild);

    let timer = null;
    let lastSync = "";

    function fingerprint(list) {
      return list.map(o => o.id + ":" + o.status).join("|");
    }

    async function syncOrders(silent) {
      try {
        const remote = await ApexDB.fetchOrders();
        const changed = fingerprint(remote) !== fingerprint(orders);
        orders = remote;
        saveOrders(orders);
        lastSync = new Date().toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" });
        if (changed || !silent) render();
        renderBar();
      } catch (err) {
        if (err.message === "NOT_SIGNED_IN") { stopPolling(); renderBar(); return; }
        if (!silent) toast("⚠️ Не вдалося отримати замовлення: " + err.message, true);
      }
    }

    async function fullSync() {
      await syncOrders(false);
      try {
        const res = await ApexDB.syncProductsAsAdmin();
        products = loadAllProducts();
        render();
        if (res.uploaded) toast("☁️ Товари (" + res.uploaded + ") завантажено у спільну базу");
      } catch (err) {
        toast("⚠️ Не вдалося синхронізувати товари: " + err.message, true);
      }
    }

    function startPolling() {
      stopPolling();
      timer = setInterval(() => { if (document.visibilityState === "visible") syncOrders(true); }, 20000);
    }
    function stopPolling() { clearInterval(timer); timer = null; }

    function renderBar() {
      if (ApexDB.isSignedIn()) {
        bar.innerHTML =
          '<b>☁️ Спільна база підключена</b>' +
          (lastSync ? ' · оновлено о ' + lastSync : '') +
          ' <button type="button" class="btn btn-sm btn-outline" id="db-refresh">Оновити</button>' +
          ' <button type="button" class="btn btn-sm btn-outline" id="db-logout">Вийти з бази</button>';
        el("db-refresh").addEventListener("click", fullSync);
        el("db-logout").addEventListener("click", () => { ApexDB.signOut(); stopPolling(); renderBar(); });
      } else {
        bar.innerHTML =
          '<b>☁️ Спільна база:</b> введіть секретний ключ адміна, щоб бачити замовлення всіх клієнтів і публікувати зміни.' +
          '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px">' +
          '<input type="password" id="db-pass" placeholder="Секретний ключ адміна" autocomplete="off" style="flex:1 1 260px;min-width:0">' +
          '<button type="button" class="btn btn-sm" id="db-login">Увійти в базу</button></div>' +
          '<p class="form-error" id="db-error" hidden style="margin-top:8px"></p>';
        const submit = async () => {
          const err = el("db-error");
          err.hidden = true;
          try {
            await ApexDB.signIn(el("db-pass").value);
            renderBar();
            startPolling();
            fullSync();
          } catch (e) {
            err.textContent = e.message;
            err.hidden = false;
          }
        };
        el("db-login").addEventListener("click", submit);
        el("db-pass").addEventListener("keydown", e => { if (e.key === "Enter") submit(); });
      }
      el("source-note").textContent = remoteNote();
    }

    renderBar();
    if (ApexDB.isSignedIn()) { startPolling(); fullSync(); }
  }

  render();
  initSharedDb();
})();