// ===== Спільний скрипт: працює на ВСІХ сторінках =====
const STORE_KEY = "apex_store_v3";
const NAME_PREFIX = "APEXSTORE:";
const OLD_KEYS = ["apex_cart", "apex_stats", "apex_cart_v2", "apex_stats_v2"];
const MAX_QTY = 99;

const ACCOUNT_SESSION_KEY = "apex_session_v1";
const ACCOUNT_USERS_KEY = "apex_users_v1";

const REGIONS = [
  "Вінницька", "Волинська", "Дніпропетровська", "Донецька", "Житомирська", "Закарпатська",
  "Запорізька", "Івано-Франківська", "Київська", "Кіровоградська", "Луганська", "Львівська",
  "Миколаївська", "Одеська", "Полтавська", "Рівненська", "Сумська", "Тернопільська",
  "Харківська", "Херсонська", "Хмельницька", "Черкаська", "Чернівецька", "Чернігівська",
  "м. Київ", "АР Крим"
];

const PAYMENT_METHODS = {
  cod:  { label: "Оплата на пошті при отриманні", short: "На пошті" },
  card: { label: "Оплата на карту одразу",        short: "На карту" }
};
const CARD_PAYMENT_NOTE = "Після оформлення менеджер зв’яжеться з вами та надішле реквізити для оплати на карту.";
const COD_PAYMENT_NOTE = "Ви оплатите замовлення у відділенні пошти під час отримання.";

function paymentLabel(key) {
  return PAYMENT_METHODS[key] ? PAYMENT_METHODS[key].label : "—";
}

function cleanupOldData() {
  try {
    OLD_KEYS.forEach(key => localStorage.removeItem(key));
  } catch (e) {
    console.warn("Не вдалося очистити старі дані:", e);
  }
}

function parseStore(text) {
  try {
    const value = JSON.parse(text);
    if (value && typeof value === "object") return value;
  } catch (e) { /* ігноруємо */ }
  return null;
}

function readStore() {
  let fromStorage = null;
  let fromName = null;

  try { fromStorage = parseStore(localStorage.getItem(STORE_KEY)); } catch (e) { /* недоступно */ }
  try {
    if (window.name.indexOf(NAME_PREFIX) === 0) {
      fromName = parseStore(window.name.slice(NAME_PREFIX.length));
    }
  } catch (e) { /* недоступно */ }

  const candidates = [fromStorage, fromName].filter(Boolean);
  if (candidates.length === 0) return { cart: [], stats: {}, ts: 0 };

  candidates.sort((a, b) => (b.ts || 0) - (a.ts || 0));
  return candidates[0];
}

function writeStore(store) {
  store.ts = Date.now();
  const text = JSON.stringify(store);
  let saved = false;

  try { localStorage.setItem(STORE_KEY, text); saved = true; }
  catch (e) { console.warn("localStorage недоступний:", e); }

  try { window.name = NAME_PREFIX + text; saved = true; }
  catch (e) { console.warn("window.name недоступний:", e); }

  return saved;
}

function cartKey(i) {
  return String(i.id) + (i.color ? "::" + i.color : "");
}

function sanitizeCart(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(i => i && i.id !== undefined && Number(i.qty) > 0 && Number.isFinite(Number(i.price)))
    .map(i => ({
      id: String(i.id),
      name: String(i.name || ""),
      price: Number(i.price),
      discount: Number(i.discount) || 0,
      image: i.image || "",
      category: i.category || "",
      color: String(i.color || ""),
      colorHex: /^#[0-9a-f]{6}$/i.test(String(i.colorHex)) ? String(i.colorHex) : "",
      colorHexes: (Array.isArray(i.colorHexes) ? i.colorHexes : [i.colorHex, i.colorHex2])
        .map(String).filter(h => /^#[0-9a-f]{6}$/i.test(h)).slice(0, 6),
      qty: Math.min(MAX_QTY, Math.floor(Number(i.qty)))
    }));
}

function getCart() { return sanitizeCart(readStore().cart); }

function getStats() {
  const stats = readStore().stats;
  return stats && typeof stats === "object" && !Array.isArray(stats) ? stats : {};
}

function saveCart(cart) {
  const store = readStore();
  store.cart = cart;
  const ok = writeStore(store);
  updateCartCount();
  return ok;
}

// Скільки шт. можна купити. Для товарів із кольорами рахуємо окремо по кольору
// (залишок кольору мінус те, що вже зарезервовано в активних замовленнях).
function stockLimit(product, color) {
  if (product && typeof productColors === "function" && productColors(product).length) {
    const c = productColors(product).find(x => x.name === color);
    if (!c) return 0;
    const taken = (reservedColorMap()[String(product.id)] || {})[c.name] || 0;
    return Math.max(0, c.stock - taken);
  }
  return product && product.stock !== null && product.stock !== undefined ? product.stock : Infinity;
}

function maxFor(product, color) {
  return Math.min(MAX_QTY, stockLimit(product, color));
}

function syncCartWithCatalog() {
  const cart = getCart();
  const next = [];
  let changed = false;
  let reduced = false;

  cart.forEach(i => {
    const p = getProductById(i.id);
    const colors = p ? productColors(p) : [];
    let color = i.color;
    let colorHex = i.colorHex;
    let colorHexes = i.colorHexes || [];

    if (p && colors.length) {
      // товар із кольорами: колір має існувати; старі позиції без кольору отримують перший доступний
      let c = color ? colors.find(x => x.name === color) : colors.find(x => stockLimit(p, x.name) > 0);
      if (!c) { changed = true; reduced = true; return; }
      color = c.name;
      colorHex = c.hex;
      colorHexes = c.hexes;
    } else if (p) {
      color = "";
      colorHex = "";
      colorHexes = [];
    }

    if (!p || stockLimit(p, color) <= 0) {
      changed = true;
      reduced = true;
      return;
    }
    const qty = Math.min(i.qty, maxFor(p, color));
    const item = {
      id: i.id, name: p.name, price: p.price,
      discount: Number(p.discount) || 0,
      image: p.image || "", category: p.category || "",
      color: color, colorHex: colorHex, colorHexes: colorHexes, qty: qty
    };
    if (qty !== i.qty) reduced = true;
    if (item.name !== i.name || item.price !== i.price || item.discount !== i.discount || item.image !== i.image ||
        item.category !== i.category || item.color !== i.color || item.colorHex !== i.colorHex || item.colorHexes.join() !== (i.colorHexes || []).join() || qty !== i.qty) changed = true;
    next.push(item);
  });

  if (changed) {
    saveCart(next);
    if (reduced) showToast("ℹ️ Кошик оновлено: деякі товари недоступні або їх менше в наявності", true);
  }
}

// color — назва вибраного кольору (для товарів без кольорів ігнорується).
// Без color береться перший колір, який є в наявності.
function addToCart(id, color) {
  id = String(id);
  const product = getProductById(id);
  if (!product) {
    showToast("⚠️ Товар не знайдено", true);
    return;
  }

  const colors = productColors(product);
  let colorName = "";
  let colorHex = "";
  let colorHexes = [];
  if (colors.length) {
    let c = color ? colors.find(x => x.name === color) : null;
    if (!c) c = colors.find(x => stockLimit(product, x.name) > 0) || null;
    if (!c) {
      showToast("⚠️ " + product.name + " — немає в наявності", true);
      return;
    }
    colorName = c.name;
    colorHex = c.hex;
    colorHexes = c.hexes;
  }
  const label = product.name + (colorName ? " (" + colorName + ")" : "");

  const limit = stockLimit(product, colorName);
  if (limit <= 0) {
    showToast("⚠️ " + label + " — немає в наявності", true);
    return;
  }

  const store = readStore();
  const cart = sanitizeCart(store.cart);
  const item = cart.find(i => i.id === id && i.color === colorName);
  const max = maxFor(product, colorName);

  if (item && item.qty >= max) {
    showToast("⚠️ Максимум " + max + " шт. цього товару", true);
    return;
  }

  if (item) {
    item.qty++;
    item.name = product.name;
    item.price = Number(product.price);
    item.discount = Number(product.discount) || 0;
    item.image = product.image || "";
    item.colorHex = colorHex;
    item.colorHexes = colorHexes;
  } else {
    cart.push({
      id: id,
      name: product.name,
      price: Number(product.price),
      discount: Number(product.discount) || 0,
      image: product.image || "",
      category: product.category || "",
      color: colorName,
      colorHex: colorHex,
      colorHexes: colorHexes,
      qty: 1
    });
  }
  const expectedQty = cart.find(i => i.id === id && i.color === colorName).qty;

  const stats = store.stats && typeof store.stats === "object" ? store.stats : {};
  stats[id] = (stats[id] || 0) + 1;

  store.cart = cart;
  store.stats = stats;
  writeStore(store);
  updateCartCount();

  const saved = getCart().find(i => i.id === id && i.color === colorName);
  if (saved && saved.qty === expectedQty) {
    showToast("✅ " + label + " додано (у кошику: " + getTotals().qty + " шт.)");
  } else {
    showToast("⚠️ Не вдалося зберегти кошик.", true);
  }
}

// key — ключ позиції кошика: id або id::колір (див. cartKey)
function setQty(key, qty) {
  key = String(key);
  qty = Math.floor(Number(qty));
  if (!Number.isFinite(qty)) qty = 1;

  let cart = getCart();
  const item = cart.find(i => cartKey(i) === key);
  if (!item) return;

  const product = getProductById(item.id);
  const max = product ? maxFor(product, item.color) : MAX_QTY;
  if (qty > max) {
    qty = max;
    showToast("ℹ️ Максимум " + max + " шт. (стільки є в наявності)", true);
  }

  if (qty <= 0) {
    cart = cart.filter(i => cartKey(i) !== key);
  } else {
    item.qty = qty;
  }
  saveCart(cart);
  renderCart();
}

function changeQty(key, delta) {
  const item = getCart().find(i => cartKey(i) === String(key));
  if (item) setQty(key, item.qty + delta);
}

function removeFromCart(key) {
  saveCart(getCart().filter(i => cartKey(i) !== String(key)));
  renderCart();
}

/* ========== Промокоди ========== */
const PROMOS_DRAFT_KEY = "apex_promos_draft_v1";
const PROMO_APPLIED_KEY = "apex_promo_applied_v1";
const PROMO_MAX_PERCENT = 90;
const PROMO_CODE_RE = /^[A-Z0-9_-]{3,20}$/;

function normalizePromoCode(value) {
  return String(value || "").trim().toUpperCase().replace(/\s+/g, "");
}

function normalizePromo(p) {
  if (!p || typeof p !== "object") return null;
  const code = normalizePromoCode(p.code);
  const percent = Math.round(Number(p.percent));
  if (!PROMO_CODE_RE.test(code)) return null;
  if (!Number.isFinite(percent) || percent < 1 || percent > PROMO_MAX_PERCENT) return null;
  const maxUses = Math.floor(Number(p.maxUses));
  return {
    code: code,
    percent: percent,
    maxUses: Number.isFinite(maxUses) && maxUses >= 1 ? Math.min(maxUses, 100000) : 0,
    scope: p.scope === "setup" ? "setup" : "cart",
    owner: String(p.owner || "").trim().toLowerCase(),
    source: p.source === "setup" ? "setup" : "",
    setup: Math.max(0, Math.floor(Number(p.setup)) || 0),
    active: p.active !== false,
    expires: /^\d{4}-\d{2}-\d{2}$/.test(String(p.expires || "")) ? String(p.expires) : "",
    createdAt: Number(p.createdAt) || 0
  };
}

function normalizePromoList(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  return list.map(normalizePromo).filter(p => {
    if (!p || seen.has(p.code)) return false;
    seen.add(p.code);
    return true;
  });
}

function loadPublishedPromos() {
  return normalizePromoList(window.__remotePromos || window.PROMOS_PUBLISHED);
}

function hasPromosDraft() {
  try { return localStorage.getItem(PROMOS_DRAFT_KEY) !== null; } catch (e) { return false; }
}

function loadPromos() {
  try {
    const raw = localStorage.getItem(PROMOS_DRAFT_KEY);
    if (raw !== null) return normalizePromoList(JSON.parse(raw));
  } catch (e) { /* ігноруємо */ }
  return loadPublishedPromos();
}

function savePromosDraft(list) {
  try {
    const clean = normalizePromoList(list);
    localStorage.setItem(PROMOS_DRAFT_KEY, JSON.stringify(clean));
    if (window.ApexDB && ApexDB.enabled && ApexDB.isSignedIn()) ApexDB.pushPromosSoon(clean);
    return true;
  } catch (e) {
    return false;
  }
}

function resetPromosDraft() {
  try { localStorage.removeItem(PROMOS_DRAFT_KEY); } catch (e) { /* ігноруємо */ }
}

// ЕКСПОРТ ФУНКЦІЙ ДЛЯ АДМІНКИ ПРОМОКОДІВ (admin-promos.js)
window.hasPromosDraft = hasPromosDraft;
window.loadPromos = loadPromos;
window.savePromosDraft = savePromosDraft;
window.resetPromosDraft = resetPromosDraft;
window.loadPublishedPromos = loadPublishedPromos;

function promoExpired(p) {
  if (!p.expires) return false;
  return Date.now() > new Date(p.expires + "T23:59:59").getTime();
}

function orderPersonKeys(order) {
  const keys = [];
  const email = order.account && order.account.email ? String(order.account.email).trim().toLowerCase() : "";
  const phone = String((order.customer && order.customer.phone) || (order.account && order.account.phone) || "").replace(/\D/g, "");
  if (email) keys.push("e:" + email);
  if (phone) keys.push("p:" + phone);
  if (keys.length === 0) keys.push("o:" + order.id);
  return keys;
}

function loadSetupsForPromo() {
  try {
    const data = JSON.parse(localStorage.getItem("apex_setups_v1"));
    return Array.isArray(data) ? data.filter(s => s && s.id) : [];
  } catch (e) {
    return [];
  }
}

function setupPersonKeys(setup) {
  const keys = [];
  const email = setup.account && setup.account.email ? String(setup.account.email).trim().toLowerCase() : "";
  const phone = String(setup.phone || (setup.account && setup.account.phone) || "").replace(/\D/g, "");
  if (email) keys.push("e:" + email);
  if (phone) keys.push("p:" + phone);
  if (keys.length === 0) keys.push("s:" + setup.id);
  return keys;
}

function promoUseKeys(code, excludeSetupId) {
  const uses = [];
  loadOrders().forEach(o => {
    if (o.promo && o.promo.code === code && o.status !== "cancelled" && o.status !== "refunded") {
      uses.push(orderPersonKeys(o));
    }
  });
  loadSetupsForPromo().forEach(s => {
    if (s.promoCode === code && s.status !== "cancelled" && s.id !== excludeSetupId) {
      uses.push(setupPersonKeys(s));
    }
  });
  return uses;
}

function promoUsedCount(code, excludeSetupId) {
  const groups = [];
  promoUseKeys(code, excludeSetupId).forEach(list => {
    const keys = new Set(list);
    const hit = groups.filter(g => Array.from(keys).some(k => g.has(k)));
    hit.forEach(g => {
      g.forEach(k => keys.add(k));
      groups.splice(groups.indexOf(g), 1);
    });
    groups.push(keys);
  });
  return Math.max(groups.length, remotePromoUsage(code));
}

// Скільки разів код використано за даними спільної бази (js/db.js кладе їх у localStorage)
function remotePromoUsage(code) {
  try {
    const r = JSON.parse(localStorage.getItem("apex_promo_usage_remote_v1"));
    return (r && r.map && Number(r.map[code])) || 0;
  } catch (e) {
    return 0;
  }
}

function promoUsedByBuyer(code, buyer, excludeSetupId) {
  const keys = new Set();
  if (buyer && buyer.email) keys.add("e:" + String(buyer.email).trim().toLowerCase());
  const phone = String((buyer && buyer.phone) || "").replace(/\D/g, "");
  if (phone) keys.add("p:" + phone);
  if (keys.size === 0) return false;
  return promoUseKeys(code, excludeSetupId).some(list => list.some(k => keys.has(k)));
}

function promoLimitReached(p) {
  return p.maxUses > 0 && promoUsedCount(p.code) >= p.maxUses;
}

function promoStatus(p) {
  if (!p.active) return "off";
  if (promoExpired(p)) return "expired";
  if (promoLimitReached(p)) return "limit";
  return "ok";
}

function findPromo(code) {
  const c = normalizePromoCode(code);
  return loadPromos().find(p => p.code === c) || null;
}

function getAppliedPromoCode() {
  try { return localStorage.getItem(PROMO_APPLIED_KEY) || ""; } catch (e) { return ""; }
}

function setAppliedPromo(code) {
  try { localStorage.setItem(PROMO_APPLIED_KEY, normalizePromoCode(code)); } catch (e) { /* ігноруємо */ }
}

function clearAppliedPromo() {
  try { localStorage.removeItem(PROMO_APPLIED_KEY); } catch (e) { /* ігноруємо */ }
}

function getAppliedPromo() {
  const code = getAppliedPromoCode();
  if (!code) return null;
  const p = findPromo(code);
  if (!p || p.scope !== "cart" || promoStatus(p) !== "ok") return null;
  const account = typeof getLoggedInAccount === "function" ? getLoggedInAccount() : null;
  if (p.owner && (!account || String(account.email).toLowerCase() !== p.owner)) return null;
  if (account && promoUsedByBuyer(p.code, account)) return null;
  return p;
}

function unitPriceWithPromo(item, promo) {
  const discount = Number(item.discount) || 0;
  const promoPercent = promo ? promo.percent : 0;
  const totalDiscount = Math.min(PROMO_MAX_PERCENT, discount + promoPercent);
  return Math.round(item.price * (1 - totalDiscount / 100) * 100) / 100;
}

function promoLineNote(item, promo) {
  const own = Number(item.discount) || 0;
  const promoPercent = promo ? promo.percent : 0;
  const total = Math.min(PROMO_MAX_PERCENT, own + promoPercent);
  if (own > 0 && promoPercent > 0) return "−" + total + "% (" + own + "% товар + " + promoPercent + "% промокод)";
  if (own > 0) return "−" + own + "% (знижка)";
  return "−" + total + "% (промокод)";
}

window.__promosReady = false;
(function loadPromosFile() {
  const needsPromos = ["cart-items", "admin-panel", "dream-form", "setups-panel"].some(id => document.getElementById(id));
  if (!needsPromos) {
    window.__promosReady = true;
    return;
  }
  const script = document.createElement("script");
  script.src = "js/promos-data.js?v=" + Date.now();
  const done = () => {
    window.__promosReady = true;
    window.dispatchEvent(new Event("promos:loaded"));
  };
  script.onload = done;
  script.onerror = done;
  document.head.appendChild(script);
})();

function getTotals() {
  const promo = getAppliedPromo();
  let qty = 0, sum = 0, before = 0;
  getCart().forEach(i => {
    qty += i.qty;
    before += i.price * i.qty;
    sum += unitPriceWithPromo(i, promo) * i.qty;
  });
  sum = Math.round(sum * 100) / 100;
  before = Math.round(before * 100) / 100;
  return { qty, sum, beforePromo: before, saved: Math.round((before - sum) * 100) / 100, promo };
}

function updateCartCount() {
  const el = document.getElementById("cart-count");
  if (el) el.textContent = getTotals().qty;
}

let toastTimer;
function showToast(text, isError) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = text;
  toast.style.background = isError ? "#7f1d1d" : "";
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), isError ? 4000 : 1800);
}

document.addEventListener("click", function (e) {
  const addBtn = e.target.closest("[data-add]");
  if (addBtn) {
    const card = addBtn.closest(".product-card");
    const chosen = card ? card.querySelector(".color-dot.selected") : null;
    addToCart(addBtn.dataset.add, chosen ? chosen.dataset.color : "");
    if (typeof renderPopular === "function") renderPopular();
    return;
  }

  const actionBtn = e.target.closest("[data-cart-action]");
  if (actionBtn) {
    const id = actionBtn.dataset.id;
    const action = actionBtn.dataset.cartAction;
    if (action === "inc") changeQty(id, 1);
    if (action === "dec") changeQty(id, -1);
    if (action === "remove") removeFromCart(id);
  }
});

document.addEventListener("change", function (e) {
  const input = e.target.closest(".qty-input");
  if (input) setQty(input.dataset.id, input.value);
});

const menuBurger = document.getElementById("burger");
const menuNav = document.getElementById("nav");
if (menuBurger && menuNav) {
  menuBurger.addEventListener("click", () => menuNav.classList.toggle("open"));
}
const currentPage = location.pathname.split("/").pop() || "index.html";
document.querySelectorAll(".nav a").forEach(a => {
  if (a.getAttribute("href") === currentPage) a.classList.add("active");
});

function renderCart() {
  const itemsBox = document.getElementById("cart-items");
  if (!itemsBox) return;

  const cart = getCart();
  const content = document.getElementById("cart-content");
  const emptyMsg = document.getElementById("cart-empty");
  const checkout = document.getElementById("checkout");

  if (cart.length === 0) {
    content.hidden = true;
    checkout.hidden = true;
    emptyMsg.hidden = false;
    return;
  }
  content.hidden = false;
  emptyMsg.hidden = true;

  const promo = getAppliedPromo();
  itemsBox.innerHTML = cart.map(i => {
    const hasDiscount = (Number(i.discount) || 0) > 0 || promo;
    const unit = unitPriceWithPromo(i, promo);
    
    const unitDisplay = hasDiscount
      ? `<s style="opacity: 0.6;">${formatPrice(i.price)}</s> <b>${formatPrice(unit)}</b> за шт. <span class="promo-tag">${escapeHTML(promoLineNote(i, promo))}</span>`
      : `${formatPrice(i.price)} за шт.`;

    const priceDisplay = hasDiscount
      ? `<s class="old-price" style="opacity: 0.6; font-size: 0.9em; margin-right: 5px;">${formatPrice(i.price * i.qty)}</s> <strong>${formatPrice(unit * i.qty)}</strong>`
      : `<strong>${formatPrice(i.price * i.qty)}</strong>`;

    const id = escapeHTML(cartKey(i));
    const colorLine = i.color
      ? `<span class="muted"><i class="cart-color-dot" style="background:${escapeHTML(colorBackground(i.colorHexes && i.colorHexes.length ? i.colorHexes : [i.colorHex || "#888888"]))}"></i>Колір: ${escapeHTML(i.color)}</span><br>`
      : "";
    const image = i.image || placeholderImage(i.category);
    const limit = stockLimit(getProductById(i.id), i.color);
    const hint = limit !== Infinity && limit <= 5 ? " · залишилось " + limit + " шт." : "";
    return `
      <div class="cart-item">
        <img src="${escapeHTML(image)}" alt="${escapeHTML(i.name)}" data-category="${escapeHTML(i.category)}">
        <div>
          <h3>${escapeHTML(i.name)}</h3>
          ${colorLine}<span class="muted">${unitDisplay}${hint}</span>
        </div>
        <div class="qty">
          <button data-cart-action="dec" data-id="${id}" aria-label="Зменшити кількість">−</button>
          <input type="number" class="qty-input" min="1" max="${Math.min(MAX_QTY, limit)}" value="${i.qty}"
                 data-id="${id}" aria-label="Кількість">
          <button data-cart-action="inc" data-id="${id}" aria-label="Збільшити кількість">+</button>
        </div>
        <div class="price-col">${priceDisplay}</div>
        <button class="remove-btn" data-cart-action="remove" data-id="${id}">Видалити</button>
      </div>`;
  }).join("");

  const totals = getTotals();
  document.getElementById("total-qty").textContent = totals.qty;
  document.getElementById("total-sum").innerHTML = priceHTML(totals.sum, true);

  renderPromoBox();
  if (!checkout.hidden) renderOrderSummary();
}

function renderOrderSummary() {
  const list = document.getElementById("order-list");
  const promo = getAppliedPromo();
  list.innerHTML = getCart()
    .map(i => `<li>${escapeHTML(i.name)}${i.color ? " (" + escapeHTML(i.color) + ")" : ""} × ${i.qty}</li>`)
    .join("") +
    (promo ? `<li>🎟 Промокод ${escapeHTML(promo.code)}: −${promo.percent}% (економія ${formatPrice(getTotals().saved)})</li>` : "");
  document.getElementById("order-total").innerHTML = priceHTML(getTotals().sum, true);
}

const checkoutBtn = document.getElementById("checkout-btn");
if (checkoutBtn) {
  checkoutBtn.addEventListener("click", () => {
    if (getCart().length === 0) return;
    const checkout = document.getElementById("checkout");
    checkout.hidden = false;
    renderOrderSummary();
    fillUserDataFromAccount();
    checkout.scrollIntoView({ behavior: "smooth" });
  });
}

function getLoggedInAccount() {
  try {
    const session = JSON.parse(localStorage.getItem(ACCOUNT_SESSION_KEY));
    if (!session || !session.email) return null;
    const users = JSON.parse(localStorage.getItem(ACCOUNT_USERS_KEY)) || {};
    const user = users[session.email];
    return user ? { nick: user.nick, email: user.email, phone: user.phone || "", region: user.region || "", city: user.city || "" } : null;
  } catch (e) {
    return null;
  }
}

function fillUserDataFromAccount() {
  const form = document.getElementById("order-form");
  if (!form) return;
  const acc = getLoggedInAccount();
  fillLocationFromAccount();

  const phoneField = form.elements.namedItem("phone");
  if (phoneField) {
    let phoneNote = document.getElementById("order-phone-note");
    if (!phoneNote) {
      phoneNote = document.createElement("small");
      phoneNote.id = "order-phone-note";
      phoneNote.className = "field-note";
      phoneField.insertAdjacentElement("afterend", phoneNote);
    }

    if (acc) {
      phoneField.value = acc.phone;
      phoneField.readOnly = true;
      phoneNote.innerHTML = acc.phone
        ? 'Номер береться з вашого профілю. Змінити його можна в <a href="account.html">акаунті</a>.'
        : 'У профілі немає номера телефону. <a href="account.html">Додайте його в акаунті</a>, щоб оформити замовлення.';
    } else {
      phoneField.readOnly = false;
      phoneNote.textContent = "";
    }
  }

  const emailField = form.elements.namedItem("email");
  if (emailField) {
    let emailNote = document.getElementById("order-email-note");
    if (!emailNote) {
      emailNote = document.createElement("small");
      emailNote.id = "order-email-note";
      emailNote.className = "field-note";
      emailField.insertAdjacentElement("afterend", emailNote);
    }

    if (acc) {
      emailField.value = acc.email;
      emailField.readOnly = true;
      emailNote.innerHTML = 'Email береться з вашого профілю. Змінити його можна в <a href="account.html">акаунті</a>.';
    } else {
      emailField.readOnly = false;
      emailNote.textContent = "";
    }
  }
}

function fillLocationFromAccount() {
  const form = document.getElementById("order-form");
  if (!form) return;
  const acc = getLoggedInAccount();
  const hasLocation = !!(acc && acc.region && acc.city && REGIONS.includes(acc.region));

  [["region", "Область"], ["city", "Місто"]].forEach(pair => {
    const field = form.elements.namedItem(pair[0]);
    if (!field) return;

    let note = document.getElementById("order-" + pair[0] + "-note");
    if (!note) {
      note = document.createElement("small");
      note.id = "order-" + pair[0] + "-note";
      note.className = "field-note";
      field.insertAdjacentElement("afterend", note);
    }

    if (hasLocation) {
      field.value = acc[pair[0]];
      // select не має readOnly, тому блокуємо через disabled (value при цьому читається)
      if (field.tagName === "SELECT") field.disabled = true; else field.readOnly = true;
      note.innerHTML = pair[1] + ' береться з вашого профілю. Змінити можна в <a href="profile-settings.html#location">налаштуваннях профілю</a>.';
    } else {
      field.disabled = false;
      field.readOnly = false;
      note.innerHTML = acc
        ? 'Щоб не вводити щоразу, збережіть область і місто в <a href="profile-settings.html#location">налаштуваннях профілю</a>.'
        : "";
    }
  });
}

const orderForm = document.getElementById("order-form");
if (orderForm) {
  // Спочатку наповнюємо список областей, потім підставляємо дані акаунта
  const regionSelect = orderForm.elements.namedItem("region");
  if (regionSelect && regionSelect.options && regionSelect.options.length <= 1) {
    regionSelect.innerHTML = '<option value="">Оберіть область</option>' +
      REGIONS.map(r => `<option value="${r}">${r}</option>`).join("");
  }
  fillUserDataFromAccount();

  const payNote = document.getElementById("pay-note");
  function updatePayNote() {
    if (!payNote) return;
    const chosen = orderForm.elements.namedItem("payment");
    const value = chosen ? chosen.value : "";
    payNote.textContent = value === "card" ? CARD_PAYMENT_NOTE : value === "cod" ? COD_PAYMENT_NOTE : "";
    payNote.hidden = !value;
  }
  orderForm.addEventListener("change", e => {
    if (e.target && e.target.name === "payment") updatePayNote();
  });

  orderForm.addEventListener("submit", async e => {
    e.preventDefault();

    const before = JSON.stringify(getCart());
    syncCartWithCatalog();
    const cart = getCart();
    if (cart.length === 0) { renderCart(); return; }
    if (JSON.stringify(cart) !== before) {
      renderCart();
      showToast("ℹ️ Наявність змінилась. Перевірте кошик.", true);
      return;
    }

    const field = name => {
      const f = orderForm.elements.namedItem(name);
      return f ? String(f.value || "").trim() : "";
    };

    const account = getLoggedInAccount();
    if (account && !account.phone) {
      showToast("⚠️ Додайте номер телефону у профілі.", true);
      fillUserDataFromAccount();
      return;
    }

    if (orderForm.elements.namedItem("region") && !REGIONS.includes(field("region"))) {
      showToast("⚠️ Оберіть область.", true);
      orderForm.elements.namedItem("region").focus();
      return;
    }
    if (orderForm.elements.namedItem("city") && field("city").length < 2) {
      showToast("⚠️ Вкажіть місто.", true);
      orderForm.elements.namedItem("city").focus();
      return;
    }
    if (orderForm.elements.namedItem("payment") && !PAYMENT_METHODS[field("payment")]) {
      showToast("⚠️ Оберіть спосіб оплати.", true);
      return;
    }

    const promo = getAppliedPromo();
    if (promo) {
      const buyer = { email: account ? account.email : field("email"), phone: account ? account.phone : field("phone") };
      if (promoUsedByBuyer(promo.code, buyer)) {
        clearAppliedPromo();
        showToast("⚠️ Ви вже використовували цей промокод.", true);
        renderCart();
        return;
      }
    }

    const items = cart.map(i => ({ id: i.id, name: i.name, color: i.color || "", colorHex: i.colorHex || "", colorHexes: i.colorHexes || [], price: unitPriceWithPromo(i, promo), qty: i.qty }));
    const promoSaved = Math.round(cart.reduce((sum, i) => sum + (i.price - unitPriceWithPromo(i, promo)) * i.qty, 0) * 100) / 100;
    const total = Math.round(items.reduce((sum, i) => sum + i.price * i.qty, 0) * 100) / 100;

    const order = {
      id: "o" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      createdAt: Date.now(),
      status: "new",
      customer: {
        name: field("name"),
        phone: account ? account.phone : field("phone"),
        email: account ? account.email : field("email"),
        region: field("region"),
        city: field("city"),
        payment: field("payment"),
        delivery: field("delivery"),
        comment: field("comment")
      },
      account: account,
      items: items,
      total: total,
      promo: promo ? { code: promo.code, percent: promo.percent, saved: promoSaved } : null
    };

    const orders = loadOrders();
    let number;

    if (window.ApexDB && ApexDB.enabled) {
      // Спільна база: замовлення має дійти до магазину, інакше кошик не очищаємо
      const submitBtn = orderForm.querySelector('[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;
      try {
        const res = await ApexDB.createOrder(order);
        number = Number(res && res.number);
        order.number = number;
      } catch (err) {
        if (submitBtn) submitBtn.disabled = false;
        if (err.message === "PROMO_LIMIT") {
          clearAppliedPromo();
          showToast("⚠️ Ліміт використання цього промокоду вичерпано.", true);
          renderCart();
        } else if (err.message === "PROMO_USED") {
          clearAppliedPromo();
          showToast("⚠️ Ви вже використовували цей промокод.", true);
          renderCart();
        } else {
          showToast("⚠️ Не вдалося надіслати замовлення. Перевірте інтернет і спробуйте ще раз.", true);
        }
        return;
      }
      if (submitBtn) submitBtn.disabled = false;
      orders.push(order);          // копія в браузері покупця — для його історії
      saveOrders(orders);
    } else {
      number = orders.reduce((max, o) => Math.max(max, Number(o.number) || 0), 1000) + 1;
      order.number = number;
      orders.push(order);
      if (!saveOrders(orders)) {
        showToast("⚠️ Не вдалося зберегти замовлення.", true);
        return;
      }
    }

    saveCart([]);
    clearAppliedPromo();
    orderForm.reset();
    fillUserDataFromAccount();
    if (typeof updatePayNote === "function") updatePayNote();

    const message = document.querySelector("#success .modal p");
    if (message) message.textContent = "Ваше замовлення №" + number + " успішно оформлено.";
    document.getElementById("success").hidden = false;
    renderCart();
  });
}

let promoOpen = false;
let promoMessage = null;
let promoInputValue = "";

(function () {
  const style = document.createElement("style");
  style.textContent =
    ".promo-box{margin:18px 0}" +
    ".promo-toggle{display:flex;align-items:center;gap:12px;width:100%;box-sizing:border-box;padding:14px 18px;font:inherit;text-align:left;" +
      "color:inherit;background:rgba(255,255,255,.08);border:2px solid rgba(255,255,255,.28);border-radius:18px;cursor:pointer;" +
      "transition:border-color .2s,background .2s}" +
    ".promo-toggle:hover,.promo-toggle:focus-visible{border-color:rgba(255,140,150,.9);outline:none}" +
    ".promo-toggle.open{border-color:#ff3b4a}" +
    ".promo-toggle-title{font-weight:800}.promo-toggle-title small{font-weight:400;opacity:.75}" +
    ".promo-toggle-info{margin-left:auto;font-size:.85rem;opacity:.75}" +
    ".promo-toggle-info.has{opacity:1;color:#bbf7d0;font-weight:700}" +
    ".promo-toggle-arrow{font-size:1.1rem;transition:transform .25s}" +
    ".promo-toggle.open .promo-toggle-arrow{transform:rotate(180deg)}" +
    ".promo-panel{margin-top:10px;padding:16px 18px;border-radius:18px;border:1px dashed rgba(255,255,255,.4);background:rgba(255,255,255,.08)}" +
    ".promo-panel[hidden]{display:none}" +
    ".promo-row{display:flex;flex-wrap:wrap;gap:10px}" +
    ".promo-row input{flex:1 1 180px;min-width:0;padding:11px 16px;font:inherit;text-transform:uppercase;letter-spacing:.08em;" +
      "color:#fff;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.3);border-radius:999px}" +
    ".promo-row input::placeholder{text-transform:none;letter-spacing:0;color:rgba(255,255,255,.6)}" +
    ".promo-row input:focus{outline:none;border-color:#ff3b4a}" +
    ".promo-applied{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px;font-weight:600}" +
    ".promo-remove{padding:6px 14px;font:inherit;font-size:.85rem;color:#fff;background:rgba(0,0,0,.35);" +
      "border:1px solid rgba(255,255,255,.35);border-radius:999px;cursor:pointer}" +
    ".promo-remove:hover{background:#ff3b4a}" +
    ".promo-sum{margin:10px 0 0}" +
    ".promo-hint{margin:4px 0 0;font-size:.8rem;opacity:.75}" +
    ".promo-msg{margin:10px 0 0;font-size:.9rem}" +
    ".promo-msg.error{color:#ffb4b4}.promo-msg.ok{color:#bbf7d0}" +
    ".promo-tag{display:inline-block;margin-left:6px;padding:2px 8px;border-radius:999px;font-size:.75rem;" +
      "background:rgba(255,59,74,.25);border:1px solid rgba(255,59,74,.6)}";
  document.head.appendChild(style);
})();

function renderPromoBox() {
  const box = document.getElementById("promo-box");
  if (!box) return;

  const storedCode = getAppliedPromoCode();
  const promo = getAppliedPromo();
  if (storedCode && !promo && window.__promosReady) {
    clearAppliedPromo();
    promoMessage = { text: "Промокод «" + storedCode + "» більше не діє.", error: true };
  }

  let html;
  if (promo) {
    const totals = getTotals();
    html =
      '<div class="promo-applied"><span>🎟 <b>' + escapeHTML(promo.code) + '</b> · додаткова знижка −' + promo.percent + '%</span>' +
      '<button type="button" class="promo-remove" data-promo-remove>✕ Прибрати</button></div>' +
      '<p class="promo-sum">Без промокоду: ' + formatPrice(totals.beforePromo) + ' → <b>' + formatPrice(totals.sum) +
      '</b> · економія ' + formatPrice(totals.saved) + '</p>' +
      '<p class="promo-hint">Знижка промокоду додається до знижки товару (разом не більше −' + PROMO_MAX_PERCENT + '%).</p>';
  } else {
    html =
      '<div class="promo-row">' +
      '<input type="text" id="promo-input" maxlength="20" placeholder="Є промокод? Введіть його" autocomplete="off" ' +
      'aria-label="Промокод" value="' + escapeHTML(promoInputValue) + '">' +
      '<button type="button" class="btn btn-sm" data-promo-apply>Застосувати</button></div>';
  }
  if (promoMessage) {
    promoOpen = true;
    html += '<p class="promo-msg ' + (promoMessage.error ? "error" : "ok") + '">' + escapeHTML(promoMessage.text) + '</p>';
    promoMessage = null;
  }

  const summary = promo ? promo.code + " · −" + promo.percent + "%" : "Не вказано";
  box.innerHTML =
    '<button type="button" class="promo-toggle' + (promoOpen ? " open" : "") + '" data-promo-toggle ' +
      'aria-expanded="' + (promoOpen ? "true" : "false") + '" aria-controls="promo-panel">' +
      '<span class="promo-toggle-title">🎟 Промокод <small>(необов’язково)</small></span>' +
      '<span class="promo-toggle-info' + (promo ? " has" : "") + '">' + escapeHTML(summary) + '</span>' +
      '<span class="promo-toggle-arrow" aria-hidden="true">▾</span>' +
    '</button>' +
    '<div class="promo-panel" id="promo-panel"' + (promoOpen ? "" : " hidden") + '>' + html + '</div>';
}

function applyPromoFromInput() {
  const input = document.getElementById("promo-input");
  promoInputValue = input ? input.value : "";
  const code = normalizePromoCode(promoInputValue);

  if (!code) {
    promoMessage = { text: "Введіть промокод.", error: true };
  } else if (!window.__promosReady) {
    promoMessage = { text: "Завантажуємо промокоди, спробуйте ще раз.", error: true };
  } else {
    const promo = findPromo(code);
    const status = promo ? promoStatus(promo) : "none";
    if (status === "none") promoMessage = { text: "Такого промокоду не існує.", error: true };
    else if (promo.scope === "setup") promoMessage = { text: "Цей промокод діє лише в заявці «Сетап мрії».", error: true };
    else if (status === "off") promoMessage = { text: "Цей промокод зараз не діє.", error: true };
    else if (status === "expired") promoMessage = { text: "Термін дії промокоду минув.", error: true };
    else if (status === "limit") promoMessage = { text: "Ліміт використання вичерпано.", error: true };
    else if (promo.owner && !getLoggedInAccount()) promoMessage = { text: "Увійдіть у свій акаунт.", error: true };
    else {
      setAppliedPromo(promo.code);
      promoInputValue = "";
      promoMessage = { text: "✅ Промокод застосовано: −" + promo.percent + "%", error: false };
    }
  }
  renderCart();
}

(function initPromoBox() {
  const itemsBox = document.getElementById("cart-items");
  if (!itemsBox || document.getElementById("promo-box")) return;
  const box = document.createElement("div");
  box.className = "promo-box";
  box.id = "promo-box";
  itemsBox.insertAdjacentElement("afterend", box);

  box.addEventListener("click", e => {
    if (e.target.closest("[data-promo-toggle]")) {
      promoOpen = !promoOpen;
      renderPromoBox();
      if (promoOpen) {
        const input = document.getElementById("promo-input");
        if (input) input.focus();
      }
      return;
    }
    if (e.target.closest("[data-promo-apply]")) applyPromoFromInput();
    if (e.target.closest("[data-promo-remove]")) {
      clearAppliedPromo();
      promoMessage = { text: "Промокод прибрано.", error: false };
      renderCart();
    }
  });
  box.addEventListener("keydown", e => {
    if (e.key === "Enter" && e.target.id === "promo-input") {
      e.preventDefault();
      applyPromoFromInput();
    }
  });
  box.addEventListener("input", e => {
    if (e.target.id === "promo-input") promoInputValue = e.target.value;
  });
})();

window.addEventListener("promos:loaded", () => { if (typeof renderCart === "function") renderCart(); });
// Дані зі спільної бази оновилися (товари, залишки): звіряємо кошик з актуальним каталогом
window.addEventListener("products:loaded", () => { syncCartWithCatalog(); updateCartCount(); });
window.addEventListener("storage", e => {
  if (e.key === PROMOS_DRAFT_KEY || e.key === PROMO_APPLIED_KEY) renderCart();
});

function refreshAll() {
  fillUserDataFromAccount();
  updateCartCount();
  renderCart();
  if (typeof renderPopular === "function") renderPopular();
}

window.addEventListener("storage", function (e) {
  if (e.key === STORE_KEY) refreshAll();
});
window.addEventListener("pageshow", function (e) {
  if (e.persisted) refreshAll();
});

cleanupOldData();
syncCartWithCatalog();
updateCartCount();
renderCart();

const WISHLIST_KEY = "apex_wishlist_v1";
const WISHLIST_MAX = 200;

function getWishlist() {
  try {
    const data = JSON.parse(localStorage.getItem(WISHLIST_KEY));
    return Array.isArray(data) ? data.map(String) : [];
  } catch (e) {
    return [];
  }
}

function saveWishlist(list) {
  try {
    localStorage.setItem(WISHLIST_KEY, JSON.stringify(list.slice(-WISHLIST_MAX)));
    return true;
  } catch (e) {
    return false;
  }
}

// Обране без «привидів»: рахуємо лише товари, які зараз є в каталозі (видалені або замінені не враховуються).
function getValidWishlist() {
  return getWishlist().filter(id => getProductById(id));
}

// Прибирає зі сховища застарілі записи й повідомляє сторінку, якщо щось змінилось.
// Поки каталог порожній (ще не завантажився), нічого не видаляємо, щоб не втратити обране.
function pruneWishlist() {
  if (!Array.isArray(PRODUCTS) || PRODUCTS.length === 0) return;
  const raw = getWishlist();
  const valid = getValidWishlist();
  if (valid.length === raw.length) return;
  saveWishlist(valid);
  window.dispatchEvent(new CustomEvent("wishlist:change", { detail: { id: null, active: false } }));
}

function isInWishlist(id) {
  return getWishlist().includes(String(id));
}

function toggleWishlist(id) {
  id = String(id);
  const list = getWishlist();
  const index = list.indexOf(id);
  if (index === -1) list.push(id);
  else list.splice(index, 1);
  if (!saveWishlist(list)) {
    showToast("⚠️ Не вдалося зберегти обране.", true);
    return index !== -1;
  }
  const active = index === -1;
  window.dispatchEvent(new CustomEvent("wishlist:change", { detail: { id: id, active: active } }));
  return active;
}

function clearWishlist() {
  if (saveWishlist([])) window.dispatchEvent(new CustomEvent("wishlist:change", { detail: { id: null, active: false } }));
}

function wishButtonHTML(id) {
  const on = isInWishlist(id);
  return '<button type="button" class="wish-btn' + (on ? " active" : "") + '" data-wish="' + escapeHTML(id) + '"' +
    ' aria-pressed="' + (on ? "true" : "false") + '"' +
    ' aria-label="' + (on ? "Прибрати з обраного" : "Додати в обране") + '"' +
    ' title="' + (on ? "Прибрати з обраного" : "Додати в обране") + '">' +
    '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 2.7 5 6 5c2 0 3.4 1 4.4 2.4h3.2C14.6 6 16 5 18 5c3.3 0 5.1 3.4 3.6 6.8C19.5 16.4 12 21 12 21z"/></svg>' +
    '</button>';
}

function syncWishlistUI() {
  const list = getValidWishlist();
  document.querySelectorAll("[data-wish]").forEach(btn => {
    const on = list.includes(String(btn.dataset.wish));
    btn.classList.toggle("active", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    const label = on ? "Прибрати з обраного" : "Додати в обране";
    btn.setAttribute("aria-label", label);
    btn.title = label;
  });
  const count = document.getElementById("wish-count");
  if (count) {
    count.textContent = list.length;
    count.hidden = list.length === 0;
  }
}

(function () {
  const style = document.createElement("style");
  style.textContent =
    ".wish-wrap{position:relative}" +
    ".wish-wrap img{display:block;width:100%}" +
    ".wish-btn{position:absolute;right:10px;bottom:10px;z-index:2;width:40px;height:40px;padding:0;" +
      "display:grid;place-items:center;border-radius:50%;cursor:pointer;color:#fff;" +
      "background:rgba(20,0,5,.55);border:1px solid rgba(255,255,255,.35);backdrop-filter:blur(6px);" +
      "transition:transform .2s,background .2s,color .2s,border-color .2s}" +
    ".wish-btn svg{fill:none;stroke:currentColor;stroke-width:2;stroke-linejoin:round;transition:fill .2s}" +
    ".wish-btn:hover{transform:scale(1.12);border-color:#ff8a93}" +
    ".wish-btn.active{color:#ff3b4a;border-color:#ff3b4a;background:rgba(255,255,255,.92)}" +
    ".wish-btn.active svg{fill:#ff3b4a}" +
    ".wish-btn.pop{animation:wishpop .35s ease}" +
    "@keyframes wishpop{0%{transform:scale(1)}40%{transform:scale(1.35)}100%{transform:scale(1)}}" +
    ".wish-btn:focus-visible{outline:2px solid #fff;outline-offset:2px}" +
    ".wish-toolbar{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;margin-bottom:20px}" +
    ".wish-toolbar[hidden]{display:none!important}" +
    ".cart-tabs{display:flex;flex-wrap:wrap;gap:10px;margin:0 0 24px}" +
    ".cart-tab{display:inline-flex;align-items:center;gap:8px;padding:10px 22px;border-radius:999px;" +
      "border:1px solid rgba(255,255,255,.28);background:rgba(255,255,255,.12);color:#fff;" +
      "font:inherit;font-weight:600;cursor:pointer;transition:background .2s,border-color .2s,transform .2s}" +
    ".cart-tab:hover{transform:translateY(-2px);border-color:rgba(255,140,150,.8)}" +
    ".cart-tab.active{background:var(--red,#e11d48);border-color:transparent}" +
    ".wish-hide{display:none!important}" +
    ".wish-count[hidden]{display:none!important}";
  document.head.appendChild(style);
})();

(function initCartWishlist() {
  const itemsBox = document.getElementById("cart-items");
  if (!itemsBox) return;
  const main = itemsBox.closest("main") || document.querySelector("main");
  if (!main) return;
  const title = main.querySelector(".page-title, h1");
  const titleTop = title ? Array.from(main.children).find(c => c === title || c.contains(title)) || null : null;

  const tabs = document.createElement("div");
  tabs.className = "cart-tabs";
  tabs.innerHTML =
    '<button type="button" class="cart-tab active" data-cart-tab="cart">🛒 Кошик</button>' +
    '<button type="button" class="cart-tab" data-cart-tab="wish">❤️ Обране <span class="cart-count wish-count" id="wish-count" hidden>0</span></button>';

  const panel = document.createElement("section");
  panel.id = "cart-wishlist";
  panel.className = "wish-hide";
  panel.innerHTML =
    '<div class="wish-toolbar" id="cart-wish-toolbar" hidden>' +
      '<span id="cart-wish-summary"></span>' +
      '<span>' +
        '<button type="button" class="btn btn-sm" id="cart-wish-addall">🛒 Додати все в кошик</button> ' +
        '<button type="button" class="btn btn-sm btn-outline" id="cart-wish-clear">Очистити обране</button>' +
      '</span>' +
    '</div>' +
    '<div class="products-grid" id="cart-wish-grid"></div>' +
    '<div class="empty-state" id="cart-wish-empty" hidden>' +
      '<div class="empty-icon">🤍</div>' +
      '<h2>В обраному поки порожньо</h2>' +
      '<p>Натисніть на сердечко на картці товару, щоб зберегти його тут.</p>' +
      '<a href="catalog.html" class="btn">Перейти до каталогу</a>' +
    '</div>';

  if (titleTop) titleTop.insertAdjacentElement("afterend", tabs);
  else main.prepend(tabs);
  tabs.insertAdjacentElement("afterend", panel);

  const grid = document.getElementById("cart-wish-grid");
  const toolbar = document.getElementById("cart-wish-toolbar");
  const summary = document.getElementById("cart-wish-summary");
  const emptyBox = document.getElementById("cart-wish-empty");
  let currentItems = [];

  function plural(n) {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return "товар";
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return "товари";
    return "товарів";
  }

  function renderWishlistPanel() {
    currentItems = getWishlist().slice().reverse().map(id => getProductById(id)).filter(Boolean);
    grid.innerHTML = currentItems.map(p => createProductCard(p)).join("");
    toolbar.hidden = currentItems.length === 0;
    emptyBox.hidden = currentItems.length > 0;
    summary.textContent = "В обраному: " + currentItems.length + " " + plural(currentItems.length);
  }

  function showTab(name) {
    const wish = name === "wish";
    Array.from(main.children).forEach(child => {
      if (child === titleTop || child === tabs || child === panel) return;
      child.classList.toggle("wish-hide", wish);
    });
    panel.classList.toggle("wish-hide", !wish);
    tabs.querySelectorAll(".cart-tab").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.cartTab === name);
    });
    if (wish) renderWishlistPanel();
    if (history.replaceState) history.replaceState(null, "", wish ? "#wishlist" : location.pathname + location.search);
  }

  tabs.addEventListener("click", e => {
    const btn = e.target.closest("[data-cart-tab]");
    if (btn) showTab(btn.dataset.cartTab);
  });

  document.getElementById("cart-wish-clear").addEventListener("click", () => {
    if (!confirm("Очистити все обране?")) return;
    clearWishlist();
    showToast("Обране очищено");
  });

  document.getElementById("cart-wish-addall").addEventListener("click", () => {
    const inCart = new Set(getCart().map(i => String(i.id)));
    const toAdd = currentItems.filter(p => p.stock !== 0 && !inCart.has(String(p.id)));
    if (toAdd.length === 0) {
      showToast("Усе доступне вже лежить у кошику", true);
      return;
    }
    toAdd.forEach(p => addToCart(p.id));
    showToast("🛒 Додано в кошик: " + toAdd.length + " " + plural(toAdd.length));
    showTab("cart");
  });

  window.addEventListener("wishlist:change", () => {
    if (!panel.classList.contains("wish-hide")) renderWishlistPanel();
    syncWishlistUI();
  });

  syncWishlistUI();
  if (location.hash === "#wishlist") showTab("wish");
})();

document.addEventListener("click", function (e) {
  const btn = e.target.closest("[data-wish]");
  if (!btn) return;
  e.preventDefault();
  const active = toggleWishlist(btn.dataset.wish);
  syncWishlistUI();
  btn.classList.remove("pop");
  void btn.offsetWidth;
  btn.classList.add("pop");
  showToast(active ? "❤️ Додано в обране" : "Прибрано з обраного");
});

window.addEventListener("storage", function (e) {
  if (e.key === WISHLIST_KEY) {
    syncWishlistUI();
    window.dispatchEvent(new CustomEvent("wishlist:change", { detail: { id: null, active: false } }));
  }
});
window.addEventListener("pageshow", function (e) {
  if (e.persisted) syncWishlistUI();
});


// Чистимо обране від товарів, яких уже немає, — при завантаженні та коли каталог оновився зі спільної бази
pruneWishlist();
syncWishlistUI();
window.addEventListener("products:loaded", () => { pruneWishlist(); syncWishlistUI(); });