// ===== Основа каталогу: дані та допоміжні функції =====
// Підключається ПЕРШИМ (до cart.js, auth.js, setups-core.js та інших скриптів).

/* ---------- Категорії ---------- */
const CATEGORY_NAMES = {
  keyboards: "Клавіатури",
  mice: "Миші",
  headsets: "Навушники",
  gamepads: "Геймпади",
  pads: "Килимки"
};

// Характеристики для тегів на сторінці товару:
// { категорія: { ключ: { label: "Назва", options: { значення: "Підпис" } } } }
// Характеристики для тегів та фільтрів на сторінці каталогу:
const CATEGORY_ATTRS = {
  keyboards: {
    kind: {
      label: "Тип клавіатури",
      options: { mechanical: "Механічна", membrane: "Мембранна", magnetic: "Магнітна" }
    },
    switchColor: {
      label: "Колір світчів",
      showIf: { kind: ["mechanical"] },   // для мембранних і магнітних колір світчів не показуємо
      options: { red: "Red (Червоні)", blue: "Blue (Сині)", brown: "Brown (Коричневі)", yellow: "Yellow (Жовті)", black: "Black (Чорні)" }
    },
    size: {
      label: "Розмір",
      options: { "100": "100% (Повнорозмірна)", "75": "75% (Компактна)", "65": "65%", "60": "60% (Міні)" }
    },
    hotswap: {
      label: "Hot-swap",
      options: { yes: "Так", no: "Ні" }
    }
  },
  mice: {
    wireless: {
      label: "Підключення",
      options: { yes: "Бездротова", no: "Провідна", dual: "Комбінована (2.4G + Кабель)" }
    },
    weight: {
      label: "Вага",
      options: { light: "Легка (< 60г)", medium: "Середня (60-80г)", heavy: "Важка (> 80г)" }
    }
  },
  headsets: {
    connection: {
      label: "Підключення",
      options: { wired: "Провідні", wireless: "Бездротові" }
    },
    mic: {
      label: "Мікрофон",
      options: { detachable: "Знімний", builtin: "Вбудований" }
    }
  },
  gamepads: {
    platform: {
      label: "Сумісність",
      options: { pc: "PC / Windows", console: "PlayStation / Xbox", universal: "Універсальний (PC/Mobile/Console)" }
    },
    connection: {
      label: "Тип підключення",
      options: { wireless: "Бездротовий", wired: "Провідний" }
    }
  },
  pads: {
    size: {
      label: "Розмір килимка",
      options: { small: "Small / Medium", large: "Large (XL)", deskmat: "Deskmat (На весь стіл)" }
    
    }
  }
};

/* ---------- Товари та ключі сховища ---------- */
const PRODUCTS_STORAGE_KEY = "apex_products_v1";
const PRODUCTS_DRAFT_KEY = "apex_products_draft_v1";
const ORDERS_KEY = "apex_orders_v1";
const REMOTE_CACHE_KEY = "apex_remote_cache_v1";

let PRODUCTS = [];

// Перевірка, чи застосовуються характеристики до товару
function attrApplies(def, values) {
  if (!def || !def.showIf) return true;
  values = values || {};
  return Object.keys(def.showIf).every(k => {
    const v = values[k];
    if (!v) return true;                 // залежна характеристика ще не вибрана — показуємо
    return def.showIf[k].includes(v);
  });
}

// Завантаження всіх товарів (з урахуванням чернеток адміна)
function loadAllProducts() {
  try {
    const draft = localStorage.getItem(PRODUCTS_DRAFT_KEY);
    if (draft !== null) {
      const parsed = JSON.parse(draft);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) { /* ігноруємо */ }
  
  try {
    const saved = JSON.parse(localStorage.getItem(PRODUCTS_STORAGE_KEY));
    if (Array.isArray(saved) && saved.length > 0) return saved;
  } catch (e) { /* ігноруємо */ }

  if (Array.isArray(window.PRODUCTS_DATA)) return window.PRODUCTS_DATA;
  return PRODUCTS;
}

function saveAllProducts(list) {
  try {
    localStorage.setItem(PRODUCTS_DRAFT_KEY, JSON.stringify(list));
    PRODUCTS = list;
    // Адмін, який увійшов у спільну базу: зміни одразу їдуть до всіх відвідувачів
    if (window.ApexDB && ApexDB.enabled && ApexDB.isSignedIn()) ApexDB.pushProductsSoon(list);
    return true;
  } catch (e) {
    return false;
  }
}

function hasProductsDraft() {
  try {
    return localStorage.getItem(PRODUCTS_DRAFT_KEY) !== null;
  } catch (e) {
    return false;
  }
}

function resetProductsDraft() {
  try {
    localStorage.removeItem(PRODUCTS_DRAFT_KEY);
  } catch (e) { /* ігноруємо */ }
}

// Завантаження замовлень
function loadOrders() {
  try {
    const data = JSON.parse(localStorage.getItem(ORDERS_KEY));
    return Array.isArray(data) ? data : [];
  } catch (e) {
    return [];
  }
}

function saveOrders(orders) {
  try {
    localStorage.setItem(ORDERS_KEY, JSON.stringify(orders));
    return true;
  } catch (e) {
    return false;
  }
}

// Агрегати резервів зі спільної бази (їх кладе js/db.js); null — бази немає
const REMOTE_RESERVED_KEY = "apex_reserved_remote_v1";
function remoteReserved() {
  try {
    const r = JSON.parse(localStorage.getItem(REMOTE_RESERVED_KEY));
    return r && r.byId && r.byColor ? r : null;
  } catch (e) {
    return null;
  }
}

// Мапа зарезервованих товарів у активних замовленнях.
// Без аргументу: дані спільної бази, а якщо її немає — локальні замовлення.
function reservedMap(orders) {
  if (orders === undefined) {
    const r = remoteReserved();
    if (r) return r.byId;
    orders = loadOrders();
  }
  const map = {};
  (orders || []).forEach(o => {
    if (o.status === "cancelled" || o.status === "refunded") return;
    (o.items || []).forEach(i => {
      const id = String(i.id);
      map[id] = (map[id] || 0) + (Number(i.qty) || 0);
    });
  });
  return map;
}

/* ---------- Кольори товару: product.colors = [{ name, hex, stock }] ---------- */
const COLOR_PRESETS = [
  { name: "Чорний", hex: "#111111" },       { name: "Білий", hex: "#f5f5f5" },
  { name: "Сірий", hex: "#8a8f98" },        { name: "Червоний", hex: "#e11d48" },
  { name: "Рожевий", hex: "#f472b6" },      { name: "Фіолетовий", hex: "#8b5cf6" },
  { name: "Синій", hex: "#2563eb" },        { name: "Блакитний", hex: "#38bdf8" },
  { name: "Зелений", hex: "#22c55e" },      { name: "Жовтий", hex: "#facc15" },
  { name: "Помаранчевий", hex: "#f97316" }, { name: "Бежевий", hex: "#d6c7a8" }
];
const COLOR_HEX_RE = /^#[0-9a-f]{6}$/i;

// Очищений список кольорів товару (порожній масив = товар без вибору кольору)
function productColors(p) {
  if (!p || !Array.isArray(p.colors)) return [];
  const seen = new Set();
  return p.colors
    .map(c => {
      // відтінки варіанта: масив hexes (1–6 шт.); старий формат hex + hex2 теж підтримуємо
      const raw = c && Array.isArray(c.hexes) ? c.hexes : [c && c.hex, c && c.hex2];
      const hexes = raw.map(String).filter(h => COLOR_HEX_RE.test(h)).slice(0, 6);
      if (!hexes.length) hexes.push("#888888");
      return { c: c, hexes: hexes };
    })
    .map(x => ({
      name: String((x.c && x.c.name) || "").trim(),
      hex: x.hexes[0],
      hexes: x.hexes,
      stock: Math.max(0, Math.floor(Number(x.c && x.c.stock)) || 0)
    }))
    .filter(c => c.name && !seen.has(c.name) && seen.add(c.name));
}

// CSS-фон для кружечка кольору: один відтінок або рівні частини (2, 3, 4... відтінки)
function colorBackground(hexes) {
  const list = (Array.isArray(hexes) ? hexes : [hexes]).filter(Boolean);
  if (list.length === 0) return "#888888";
  if (list.length === 1) return list[0];
  const n = list.length;
  return "linear-gradient(135deg," +
    list.map((h, i) => h + " " + (i * 100 / n).toFixed(2) + "% " + ((i + 1) * 100 / n).toFixed(2) + "%").join(",") + ")";
}

// { id товару: { колір: зарезервовано шт. } } — за активними замовленнями
function reservedColorMap(orders) {
  if (orders === undefined) {
    const r = remoteReserved();
    if (r) return r.byColor;
    orders = loadOrders();
  }
  const map = {};
  (orders || []).forEach(o => {
    if (o.status === "cancelled" || o.status === "refunded") return;
    (o.items || []).forEach(i => {
      if (!i.color) return;
      const id = String(i.id);
      map[id] = map[id] || {};
      map[id][i.color] = (map[id][i.color] || 0) + (Number(i.qty) || 0);
    });
  });
  return map;
}

// Нотатки та синхронізація з хмарою (заглушки для коректної роботи admin.js)
function remoteNote() {
  if (!window.ApexDB || !ApexDB.enabled) return "Локальний режим сховища";
  return ApexDB.isSignedIn()
    ? "☁️ Спільна база підключена"
    : "☁️ Спільна база: введіть ключ адміна, щоб зміни бачили всі";
}

function remoteFlush() {
  // Виконується при необхідності синхронізації
}

// Ініціалізація масиву PRODUCTS при старті
(function initProducts() {
  PRODUCTS = loadAllProducts();
  if (!PRODUCTS.length && Array.isArray(window.PRODUCTS_DATA)) {
    PRODUCTS = window.PRODUCTS_DATA;
  }
})();

function getProductById(id) {
  return PRODUCTS.find(p => String(p.id) === String(id)) || null;
}

/* ---------- Ціноутворення та знижки ---------- */
function finalPrice(price, discount) {
  const p = Number(price) || 0;
  const d = Number(discount) || 0;
  if (d <= 0) return p;
  return Math.round(p * (100 - d) / 100);
}

/* ---------- Допоміжні функції форматування ---------- */
function escapeHTML(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// 2499 -> "2 499 ₴"
function formatPrice(value) {
  const n = Math.round(Number(value) || 0);
  return n.toLocaleString("uk-UA").replace(/\u00a0/g, " ") + " ₴";
}

// HTML ціни
function priceHTML(value, big) {
  return '<b class="price' + (big ? " price-big" : "") + '">' + escapeHTML(formatPrice(value)) + "</b>";
}

// Картинка-заглушка, коли у товару немає фото
function placeholderImage(category) {
  const icons = { keyboards: "⌨️", mice: "🖱️", headsets: "🎧", gamepads: "🎮", pads: "🟥" };
  const icon = icons[category] || "🎮";
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300">' +
    '<rect width="100%" height="100%" fill="#111827"/>' +
    '<text x="50%" y="50%" font-size="80" text-anchor="middle" dominant-baseline="central">' + icon + "</text></svg>";
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}

/* ---------- Створення картки товару зі всією інформацією прямо в картці ---------- */
function createProductCard(p) {
  const id = escapeHTML(p.id);
  const name = escapeHTML(p.name);
  const category = escapeHTML(p.category);
  const image = escapeHTML(p.image || placeholderImage(p.category));
  const hasDiscount = Number(p.discount) > 0;
  const priceVal = Number(p.price) || 0;
  const fPrice = hasDiscount ? finalPrice(priceVal, p.discount) : priceVal;

  // Ціна зі знижкою чи звичайна
  const priceSection = hasDiscount
    ? `<div class="product-prices"><s class="old-price">${escapeHTML(formatPrice(priceVal))}</s> <b class="price">${escapeHTML(formatPrice(fPrice))}</b> <span class="sale-tag">-${p.discount}%</span></div>`
    : `<div class="product-prices"><b class="price">${escapeHTML(formatPrice(priceVal))}</b></div>`;

  // Опис товару
  const descHTML = p.desc
    ? `<p class="product-card-desc" style="margin: 8px 0; font-size: 0.85rem; opacity: 0.85; line-height: 1.4;">${escapeHTML(p.desc)}</p>`
    : "";

  // Характеристики товару
  let attrsHTML = "";
  if (p.attrs && typeof p.attrs === "object") {
    const attrEntries = Object.entries(p.attrs);
    if (attrEntries.length > 0) {
      const defs = (CATEGORY_ATTRS[p.category] || {});
      const items = attrEntries.map(([k, v]) => {
        const label = defs[k] && defs[k].label ? defs[k].label : k;
        const optLabel = defs[k] && defs[k].options && defs[k].options[v] ? defs[k].options[v] : v;
        return `<span style="display:inline-block; margin-right: 6px; margin-bottom: 4px; padding: 2px 8px; background: rgba(255,255,255,0.1); border-radius: 6px; font-size: 0.75rem;"><b>${escapeHTML(label)}:</b> ${escapeHTML(optLabel)}</span>`;
      }).join("");

      attrsHTML = `<div class="product-card-attrs" style="margin: 8px 0;">${items}</div>`;
    }
  }

  // Вибір кольору (якщо в адмінці додано кольори)
  let colorsHTML = "";
  const colors = productColors(p);
  if (colors.length) {
    const taken = reservedColorMap()[String(p.id)] || {};
    const left = colors.map(c => Math.max(0, c.stock - (taken[c.name] || 0)));
    let sel = left.findIndex(n => n > 0);
    if (sel < 0) sel = 0;
    const dots = colors.map((c, i) => {
      const out = left[i] <= 0;
      const title = c.name + (out ? " — немає в наявності" : "");
      return `<button type="button" class="color-dot${i === sel ? " selected" : ""}${out ? " sold-out" : ""}" role="radio" ` +
        `aria-checked="${i === sel ? "true" : "false"}" data-color-pick data-color="${escapeHTML(c.name)}" ` +
        `style="--dot:${escapeHTML(c.hex)};background:${escapeHTML(colorBackground(c.hexes))}" title="${escapeHTML(title)}" aria-label="${escapeHTML(title)}"${out ? " disabled" : ""}></button>`;
    }).join("");
    colorsHTML = `<div class="product-colors"><span class="color-label">Колір: <b>${escapeHTML(colors[sel].name)}</b></span>` +
      `<div class="color-dots" role="radiogroup" aria-label="Колір товару">${dots}</div></div>`;
  }

  const wishBtn = typeof wishButtonHTML === "function" ? wishButtonHTML(p.id) : "";

  return `
    <article class="product-card" data-product-id="${id}">
      <div class="wish-wrap">
        <img src="${image}" alt="${name}" loading="lazy" data-category="${category}">
        ${wishBtn}
      </div>
      <div class="product-info">
        <span class="product-category">${escapeHTML(CATEGORY_NAMES[p.category] || p.category)}</span>
        <h3 class="product-title" style="margin: 4px 0;">${name}</h3>
        ${descHTML}
        ${attrsHTML}
        ${colorsHTML}
        ${priceSection}
        <button type="button" class="btn btn-sm" data-add="${id}">У кошик +</button>
      </div>
    </article>`;
}

/* ---------- Стилі та поведінка вибору кольору (працює на всіх сторінках) ---------- */
(function () {
  const style = document.createElement("style");
  style.textContent =
    ".product-colors{margin:8px 0}" +
    ".color-label{display:block;margin-bottom:6px;font-size:.8rem;opacity:.85}" +
    ".color-dots{display:flex;flex-wrap:wrap;gap:8px}" +
    ".color-dot{position:relative;width:26px;height:26px;padding:0;border-radius:50%;cursor:pointer;" +
      "background:var(--dot,#888);border:2px solid rgba(255,255,255,.4);transition:transform .15s,border-color .15s}" +
    ".color-dot:hover:not(:disabled){transform:scale(1.12)}" +
    ".color-dot.selected{outline:2px solid #ff3b4a;outline-offset:2px;border-color:#fff}" +
    ".color-dot:focus-visible{outline:2px solid #fff;outline-offset:2px}" +
    ".color-dot.sold-out{opacity:.35;cursor:not-allowed}" +
    ".color-dot.sold-out::after{content:'';position:absolute;left:50%;top:-2px;width:2px;height:calc(100% + 4px);" +
      "background:#fff;transform:translateX(-50%) rotate(45deg)}" +
    ".cart-color-dot{display:inline-block;width:12px;height:12px;border-radius:50%;vertical-align:-1px;" +
      "margin-right:4px;border:1px solid rgba(255,255,255,.5)}";
  document.head.appendChild(style);

  document.addEventListener("click", function (e) {
    const dot = e.target.closest("[data-color-pick]");
    if (!dot || dot.disabled) return;
    const card = dot.closest(".product-card");
    if (!card) return;
    card.querySelectorAll(".color-dot").forEach(d => {
      const on = d === dot;
      d.classList.toggle("selected", on);
      d.setAttribute("aria-checked", on ? "true" : "false");
    });
    const label = card.querySelector(".color-label b");
    if (label) label.textContent = dot.dataset.color;
  });
})();

/* ---------- Підключаємо поруч лежачі скрипти: спільна база (db-config.js, db.js) і красиві меню вибору (ui-select.js) ---------- */
(function () {
  const self = document.currentScript;
  if (!self || !self.src) return;
  ["db-config.js", "db.js", "ui-select.js"].forEach(function (name) {
    document.write('<script src="' + new URL(name, self.src).href + '"><\/script>');
  });
})();