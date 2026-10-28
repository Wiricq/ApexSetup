// ===== Мої замовлення (для покупця) =====
// Підключати ПІСЛЯ products.js, cart.js і auth.js.
(function () {
  "use strict";

  const el = id => document.getElementById(id);
  const toast = (text, isError) => { if (typeof showToast === "function") showToast(text, isError); };

  const STATUS_LABELS = {
    new: "Нове",
    confirmed: "Підтверджено",
    shipped: "Відправлено",
    arrived: "Прибуло у відділення",
    done: "Виконано",
    cancelled: "Скасовано",
    refund: "Запит на повернення",
    refunded: "Кошти повернено"
  };
  const STATUS_HINTS = {
    new: "Очікує обробки магазином",
    confirmed: "Магазин підтвердив замовлення й готує його до відправки",
    shipped: "Замовлення передано в доставку",
    arrived: "Замовлення чекає на вас у відділенні. Заберіть його",
    done: "Замовлення виконано",
    cancelled: "Замовлення скасовано",
    refund: "Запит на повернення розглядається магазином",
    refunded: "Кошти за замовлення повернено"
  };

  // Етапи звичайного шляху замовлення (для смужки прогресу)
  const FLOW = ["new", "confirmed", "shipped", "arrived", "done"];
  // Статуси, у яких покупець ще може скасувати замовлення сам
  const CUSTOMER_CAN_CANCEL = ["new", "confirmed"];

  // Групування для фільтрів: «Повернення» об'єднує refund і refunded
  const filterOf = status => (status === "refund" || status === "refunded") ? "refund" : status;

  let filter = "all";
  const listBox = el("orders-list");

  (function injectStyles() {
    const st = document.createElement("style");
    st.textContent =
      ".status-badge.confirmed{background:rgba(59,130,246,.18);color:#60a5fa}" +
      ".status-badge.shipped{background:rgba(168,85,247,.18);color:#c084fc}" +
      ".status-badge.arrived{background:rgba(245,158,11,.18);color:#fbbf24}" +
      ".status-badge.refund{background:rgba(249,115,22,.18);color:#fb923c}" +
      ".status-badge.refunded{background:rgba(148,163,184,.18);color:#cbd5e1}" +
      ".order-progress{display:flex;gap:6px;margin:12px 0 4px;padding:0;list-style:none}" +
      ".order-progress li{flex:1;text-align:center;font-size:12px;opacity:.5;position:relative;padding-top:14px}" +
      ".order-progress li::before{content:'';position:absolute;top:0;left:0;right:0;height:4px;border-radius:2px;background:rgba(255,255,255,.18)}" +
      ".order-progress li.passed{opacity:.85}" +
      ".order-progress li.passed::before{background:#22c55e}" +
      ".order-progress li.current{opacity:1;font-weight:600}" +
      ".order-progress li.current::before{background:#3b82f6}";
    document.head.appendChild(st);
  })();

  // Чи належить замовлення цьому користувачу
  // (оформлене під його акаунтом або з його поштою у формі)
  function belongsTo(order, account) {
    const email = String(account.email).toLowerCase();
    if (order.account && String(order.account.email).toLowerCase() === email) return true;
    const customerEmail = String((order.customer || {}).email || "").trim().toLowerCase();
    return customerEmail === email;
  }

  function myOrders(account) {
    return loadOrders().filter(o => belongsTo(o, account));
  }

  function progressHTML(status) {
    const idx = FLOW.indexOf(status);
    if (idx < 0) return "";
    return '<ol class="order-progress">' + FLOW.map((s, i) =>
      `<li class="${i < idx ? "passed" : i === idx ? "current" : ""}">${STATUS_LABELS[s]}</li>`
    ).join("") + "</ol>";
  }

  /* ---------- Малювання ---------- */
  function cardHTML(o) {
    const c = o.customer || {};
    const status = STATUS_LABELS[o.status] ? o.status : "new";
    const date = new Date(o.createdAt || 0).toLocaleString("uk-UA");
    const byYou = status === "cancelled" && o.cancelledBy === "customer" ? " (скасовано вами)" : "";
    const changed = o.statusChangedAt && status !== "new"
      ? ` <small>(${escapeHTML(new Date(o.statusChangedAt).toLocaleString("uk-UA"))})</small>`
      : "";

    const items = o.items.map(i =>
      `<li><span>${escapeHTML(i.name)}${i.colorName ? " (" + escapeHTML(i.colorName) + ")" : ""} × ${Number(i.qty) || 0}</span>` +
      `<span>${formatPrice((Number(i.price) || 0) * (Number(i.qty) || 0))}</span></li>`
    ).join("");

    const comment = c.comment
      ? `<div><span>Коментар:</span> ${escapeHTML(c.comment)}</div>`
      : "";
    const promo = o.promo && o.promo.code
      ? `<div><span>Промокод:</span> <b>${escapeHTML(o.promo.code)}</b></div>`
      : "";

    const actions = CUSTOMER_CAN_CANCEL.includes(status)
      ? '<button type="button" class="btn btn-sm btn-danger-outline" data-act="cancel">✖ Скасувати замовлення</button>'
      : "";

    return `
      <article class="order-card is-${status}" data-order-id="${escapeHTML(o.id)}">
        <div class="order-head">
          <span class="order-title">Замовлення №${escapeHTML(o.number)}</span>
          <span class="status-badge ${status}">${STATUS_LABELS[status]}</span>
          <span class="order-date">${escapeHTML(date)}</span>
        </div>
        ${progressHTML(status)}
        <div class="order-body">
          <div class="order-info">
            <div><span>Статус:</span> ${STATUS_HINTS[status]}${byYou}${changed}</div>
            <div><span>Отримувач:</span> <b>${escapeHTML(c.name || "—")}</b></div>
            <div><span>Телефон:</span> ${escapeHTML(c.phone || "—")}</div>
            <div><span>Місто:</span> ${escapeHTML(c.city || "—")}</div>
            <div><span>Доставка:</span> ${escapeHTML(c.delivery || "—")}</div>
            ${promo}
            ${comment}
          </div>
          <div>
            <ul class="order-items">${items}</ul>
            <div class="order-total"><span>Разом</span><span>${priceHTML(o.total, true)}</span></div>
          </div>
        </div>
        <div class="order-actions">${actions}</div>
      </article>`;
  }

  function render() {
    const account = getLoggedInAccount(); // з cart.js
    el("guard-login").hidden = !!account;
    el("orders-panel").hidden = !account;
    if (!account) return;

    const orders = myOrders(account);

    // лічильники на фільтрах
    const counts = { all: orders.length, new: 0, confirmed: 0, shipped: 0, arrived: 0, done: 0, cancelled: 0, refund: 0 };
    orders.forEach(o => {
      const key = filterOf(STATUS_LABELS[o.status] ? o.status : "new");
      if (counts[key] !== undefined) counts[key]++;
    });
    document.querySelectorAll("#order-filters [data-filter]").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.filter === filter);
      btn.querySelector("b").textContent = counts[btn.dataset.filter] || 0;
    });

    // список (нові зверху)
    const shown = orders
      .slice()
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      .filter(o => filter === "all" || filterOf(STATUS_LABELS[o.status] ? o.status : "new") === filter);

    listBox.innerHTML = shown.map(cardHTML).join("");

    const empty = el("orders-empty");
    empty.hidden = shown.length > 0;
    empty.textContent = orders.length === 0
      ? "У вас ще немає замовлень."
      : "У цьому розділі замовлень немає.";
  }

  /* ---------- Дії ---------- */
  // Скасування замовлення покупцем (поки воно не передане в доставку)
  listBox.addEventListener("click", e => {
    const btn = e.target.closest('button[data-act="cancel"]');
    if (!btn) return;

    const account = getLoggedInAccount();
    const id = btn.closest("[data-order-id]").dataset.orderId;
    const orders = loadOrders(); // свіжі дані
    const order = orders.find(o => o.id === id);

    if (!account || !order || !belongsTo(order, account)) { render(); return; }
    if (!CUSTOMER_CAN_CANCEL.includes(order.status)) {
      toast("Це замовлення вже не можна скасувати.", true);
      render();
      return;
    }
    if (!confirm("Скасувати замовлення №" + order.number + "? Товари повернуться в наявність.")) return;

    order.status = "cancelled";
    order.cancelledBy = "customer";
    order.statusChangedAt = Date.now();
    if (!saveOrders(orders)) {
      toast("⚠️ Не вдалося скасувати замовлення: браузер блокує localStorage.", true);
      return;
    }
    toast("✖ Замовлення №" + order.number + " скасовано");
    render();
  });

  el("order-filters").addEventListener("click", e => {
    const btn = e.target.closest("[data-filter]");
    if (!btn) return;
    filter = btn.dataset.filter;
    render();
  });

  // Зміни в іншій вкладці (наприклад, адмін змінив статус або ви вийшли з акаунта)
  window.addEventListener("storage", e => {
    if (e.key === ORDERS_KEY || e.key === "apex_session_v1") render();
  });

  render();
})();