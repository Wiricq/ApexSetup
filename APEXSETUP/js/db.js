// ===== Клієнт спільної бази (Supabase REST, без зовнішніх бібліотек) =====
// Підключається автоматично з products.js (разом з js/db-config.js).
(function () {
  "use strict";

  const cfg = window.APEX_DB_CONFIG || {};
  // Беремо лише адресу проєкту (https://xxxx.supabase.co): зайві частини на кшталт /rest/v1/ відкидаємо
  let url = "";
  try { url = new URL(String(cfg.url || "").trim()).origin; } catch (e) { url = ""; }
  const anonKey = String(cfg.anonKey || "").replace(/\s+/g, "");
  const enabled = /^https:\/\/[^\s/]+$/.test(url) && anonKey.length > 20;

  const SESSION_KEY = "apex_db_session_v1";
  const RESERVED_KEY = "apex_reserved_remote_v1";
  const PROMO_USAGE_KEY = "apex_promo_usage_remote_v1";
  const PRODUCTS_KEY = typeof PRODUCTS_STORAGE_KEY !== "undefined" ? PRODUCTS_STORAGE_KEY : "apex_products_v1";
  const DRAFT_KEY = typeof PRODUCTS_DRAFT_KEY !== "undefined" ? PRODUCTS_DRAFT_KEY : "apex_products_draft_v1";

  const api = { enabled: enabled, onError: null };
  window.ApexDB = api;

  const store = {
    get(key) { try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; } },
    set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; } },
    del(key) { try { localStorage.removeItem(key); } catch (e) { /* ігноруємо */ } }
  };

  function reportError(err) {
    if (typeof api.onError === "function") api.onError(err);
    else if (window.console) console.warn("[ApexDB]", err);
  }

  if (!enabled) {
    api.isSignedIn = () => false;
    api.adminEmail = () => "";
    return;
  }

  /* ---------- Ключ адміна (той самий admin_secret, що й для повідомлень) ---------- */
  const getKey = () => { try { return localStorage.getItem(SESSION_KEY) || ""; } catch (e) { return ""; } };
  const setKey = v => { try { v ? localStorage.setItem(SESSION_KEY, v) : localStorage.removeItem(SESSION_KEY); } catch (e) { /* ігноруємо */ } };

  api.isSignedIn = () => !!getKey();
  api.adminEmail = () => "ключ адміна";

  api.signIn = async function (key) {
    key = String(key || "").trim();
    if (!key) throw new Error("Введіть ключ адміна");
    try {
      await request("/rest/v1/rpc/admin_check", { method: "POST", body: { admin_key: key } });
    } catch (err) {
      throw new Error(err.message === "forbidden" ? "Невірний ключ адміна" : err.message);
    }
    setKey(key);
    return true;
  };

  api.signOut = function () { setKey(""); };

  /* ---------- Базовий запит до PostgREST ---------- */
  async function request(path, opts) {
    opts = opts || {};
    const res = await fetch(url + path, {
      method: opts.method || "GET",
      headers: { apikey: anonKey, Authorization: "Bearer " + anonKey, "Content-Type": "application/json" },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body)
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (e) { /* не JSON */ }
    if (!res.ok) {
      const err = new Error((data && (data.message || data.error_description)) || "HTTP " + res.status);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  // Виклик функції адміна: ключ додається автоматично
  async function adminRpc(name, args) {
    const key = getKey();
    if (!key) throw new Error("NOT_SIGNED_IN");
    try {
      return await request("/rest/v1/rpc/" + name, { method: "POST", body: Object.assign({ admin_key: key }, args || {}) });
    } catch (err) {
      if (err.message === "forbidden") { setKey(""); throw new Error("NOT_SIGNED_IN"); }
      throw err;
    }
  }

  /* ---------- Товари ---------- */
  api.fetchProducts = async function () {
    const rows = await request("/rest/v1/products?select=data&order=position.asc");
    return (rows || []).map(r => r.data).filter(p => p && p.id !== undefined);
  };

  let pushChain = Promise.resolve();
  api.pushProducts = function (list) {
    pushChain = pushChain.catch(() => {}).then(() =>
      adminRpc("admin_save_products", { items: list.map(p => Object.assign({}, p, { id: String(p.id) })) }));
    return pushChain;
  };

  let pushTimer = null;
  api.pushProductsSoon = function (list) {
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => { api.pushProducts(list).catch(reportError); }, 700);
  };

  // Адмін: віддалена база — головна. Якщо вона порожня, а локально товари є — завантажуємо їх у базу.
  api.syncProductsAsAdmin = async function () {
    const remote = await api.fetchProducts();
    if (remote.length) {
      store.set(DRAFT_KEY, remote);
      store.set(PRODUCTS_KEY, remote);
      if (typeof PRODUCTS !== "undefined") PRODUCTS = remote;
      return { downloaded: remote.length };
    }
    const local = typeof loadAllProducts === "function" ? loadAllProducts() : [];
    if (local.length) {
      await api.pushProducts(local);
      return { uploaded: local.length };
    }
    return {};
  };

  /* ---------- Замовлення ---------- */
  function rowToOrder(r) {
    return Object.assign({}, r.extra || {}, {
      id: r.id,
      number: Number(r.number),
      createdAt: Date.parse(r.created_at) || 0,
      status: r.status,
      customer: r.customer || {},
      account: r.account || null,
      items: Array.isArray(r.items) ? r.items : [],
      total: Number(r.total) || 0,
      promo: r.promo || null
    });
  }

  // Клієнт: створює замовлення. Номер видає база; перевіряє ліміти промокоду.
  api.createOrder = async function (order) {
    const res = await request("/rest/v1/rpc/create_order", { method: "POST", body: { payload: order } });
    api.refreshAll().catch(() => {});
    return res;
  };

  api.fetchOrders = async function () {
    const rows = await adminRpc("admin_list_orders");
    return (rows || []).map(rowToOrder);
  };

  api.updateOrderStatus = function (id, status) {
    return adminRpc("admin_set_order_status", { order_id: String(id), new_status: status })
      .then(() => api.refreshAll().catch(() => {}));
  };

  api.deleteOrder = function (id) {
    return adminRpc("admin_delete_order", { order_id: String(id) })
      .then(() => api.refreshAll().catch(() => {}));
  };

  /* ---------- Промокоди ---------- */
  api.fetchPromos = async function () {
    const rows = await request("/rest/v1/promos?select=data");
    return (rows || []).map(r => r.data).filter(Boolean);
  };

  api.pushPromos = function (list) {
    return adminRpc("admin_save_promos", { items: list });
  };

  let promoTimer = null;
  api.pushPromosSoon = function (list) {
    clearTimeout(promoTimer);
    promoTimer = setTimeout(() => { api.pushPromos(list).catch(reportError); }, 700);
  };

  /* ---------- Агрегати для всіх відвідувачів (без персональних даних) ---------- */
  async function refreshReserved() {
    const rows = await request("/rest/v1/rpc/reserved_stock", { method: "POST", body: {} });
    const byId = {};
    const byColor = {};
    (rows || []).forEach(r => {
      const id = String(r.product_id);
      const qty = Number(r.qty) || 0;
      byId[id] = (byId[id] || 0) + qty;
      if (r.color) {
        byColor[id] = byColor[id] || {};
        byColor[id][r.color] = (byColor[id][r.color] || 0) + qty;
      }
    });
    store.set(RESERVED_KEY, { ts: Date.now(), byId: byId, byColor: byColor });
  }

  async function refreshPromoUsage() {
    const rows = await request("/rest/v1/rpc/promo_usage", { method: "POST", body: {} });
    const map = {};
    (rows || []).forEach(r => { map[String(r.code)] = Number(r.used) || 0; });
    store.set(PROMO_USAGE_KEY, { ts: Date.now(), map: map });
  }

  // Оновлює товари, резерви та промокоди й сповіщає сторінки подією "products:loaded"
  let refreshing = null;
  api.refreshAll = function () {
    if (refreshing) return refreshing;
    refreshing = Promise.allSettled([api.fetchProducts(), refreshReserved(), refreshPromoUsage(), api.fetchPromos()])
      .then(results => {
        const [prod, , , promos] = results;
        if (prod.status === "fulfilled" && prod.value.length) {
          store.set(PRODUCTS_KEY, prod.value);
          if (typeof loadAllProducts === "function" && typeof PRODUCTS !== "undefined") PRODUCTS = loadAllProducts();
        }
        if (promos.status === "fulfilled" && promos.value.length) window.__remotePromos = promos.value;
        results.forEach(r => { if (r.status === "rejected") reportError(r.reason); });
        window.dispatchEvent(new Event("products:loaded"));
        window.dispatchEvent(new Event("promos:loaded"));
      })
      .finally(() => { refreshing = null; });
    return refreshing;
  };

  function start() {
    api.refreshAll();
    let last = Date.now();
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && Date.now() - last > 30000) {
        last = Date.now();
        api.refreshAll();
      }
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => setTimeout(start, 0));
  else setTimeout(start, 0);
})();