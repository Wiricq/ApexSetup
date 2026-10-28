// ===== Ядро каталогу: товари, валюти, наявність, знижки, замовлення, картки товарів =====

// Ключ, під яким адмін-панель зберігає чернетку товарів у цьому браузері (режим без Firebase)
const PRODUCTS_STORAGE_KEY = "apex_products_v1";
// Ключ, під яким зберігаються замовлення
const ORDERS_KEY = "apex_orders_v1";

// ===== ВАЛЮТИ =====
// Основна валюта сайту — гривня (UAH): усі ціни в адмін-панелі вводяться в гривнях.
// Долар і євро показуються поруч як додаткові (для інформації).
// Курс: скільки гривень коштує 1 одиниця валюти. За потреби змінюйте вручну.
const CURRENCY = {
  USD_UAH: 45.06,   // 1 долар США = 45,06 грн
  EUR_UAH: 50.48    // 1 євро = 50,48 грн
};

// Назви категорій для відображення
const CATEGORY_NAMES = {
  keyboards: "Клавіатури",
  mice: "Миші",
  pads: "Килимки",
  gamepads: "Геймпади",
  headsets: "Навушники"
};

const CATEGORY_ICONS = {
  keyboards: "⌨️", mice: "🖱️", pads: "🟥", gamepads: "🎮", headsets: "🎧"
};
// Характеристики для фільтрів у каталозі (по категоріях).
// Щоб додати нову характеристику чи варіант — допишіть її тут:
// вона автоматично з'явиться і в адмін-панелі, і у фільтрах каталогу.
const CATEGORY_ATTRS = {
  keyboards: {
    type: { label: "Тип", options: { mechanical: "Механічна", magnetic: "Магнітна", membrane: "Мембранна" } },
    switch: {
      label: "Колір свічів",
      showIf: { type: ["mechanical", "magnetic"] },   // тільки для механічних і магнітних
      options: { red: "Червоні", blue: "Сині", brown: "Коричневі", black: "Чорні", yellow: "Жовті", white: "Білі", other: "Інший" }
    },
    hotswap: {
      label: "Hot-swap (заміна свічів)",
      showIf: { type: ["mechanical", "magnetic"] },
      options: { yes: "Є hot-swap", no: "Немає hot-swap" }
    },
    size: { label: "Розмір", options: { full: "Повнорозмірна", tkl: "TKL (без цифрового блоку)", compact: "Компактна (60–75%)" } },
    connection: { label: "Підключення", options: { wired: "Дротова", wireless: "Бездротова" } }
  },
  mice: {
    connection: { label: "Підключення", options: { wired: "Дротова", wireless: "Бездротова" } },
    purpose: { label: "Призначення", options: { gaming: "Ігрова", office: "Офісна" } }
  },
  pads: {
    size: { label: "Розмір", options: { small: "Малий", medium: "Середній", large: "Великий", xl: "XL (на весь стіл)" } }
  },
  gamepads: {
    connection: { label: "Підключення", options: { wired: "Дротовий", wireless: "Бездротовий" } },
    platform: { label: "Платформа", options: { pc: "ПК", console: "Консоль", universal: "Універсальний" } }
  },
  headsets: {
    connection: { label: "Підключення", options: { wired: "Дротові", wireless: "Бездротові" } },
    mic: { label: "Мікрофон", options: { yes: "З мікрофоном", no: "Без мікрофона" } }
  }
};

// Чи потрібно показувати характеристику для товару з такими значеннями
// (напр., колір свічів — лише коли тип «Механічна» або «Магнітна»)
function attrApplies(def, attrs) {
  if (!def.showIf) return true;
  return Object.keys(def.showIf).every(k => def.showIf[k].includes(attrs && attrs[k]));
}

// Залишає тільки відомі характеристики з допустимими значеннями
function normalizeAttrs(category, attrs) {
  const result = {};
  const defs = CATEGORY_ATTRS[category] || {};
  if (attrs && typeof attrs === "object") {
    Object.keys(defs).forEach(key => {
      const value = attrs[key];
      if (typeof value === "string" && defs[key].options[value] && attrApplies(defs[key], result)) result[key] = value;
    });
  }
  return result;
}
/* ---------- Допоміжні функції ---------- */
// Захист від зламаного HTML у назвах/описах
function escapeHTML(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* ---------- Ціни у валютах ---------- */
// Число з пробілами між тисячами: 3320 -> "3 320", 79.5 -> "79,50"
function formatNumber(value) {
  const n = Math.round((Number(value) || 0) * 100) / 100;
  return n.toLocaleString("uk-UA", {
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
    maximumFractionDigits: 2
  });
}

// Усі ціни на сайті зберігаються в гривнях
function formatUAH(uah) { return "₴" + formatNumber(uah); }
function formatUSD(uah) { return "$" + formatNumber((Number(uah) || 0) / CURRENCY.USD_UAH); }
function formatEUR(uah) { return "€" + formatNumber((Number(uah) || 0) / CURRENCY.EUR_UAH); }

// Основна ціна (гривні) — її використовують кошик, замовлення та адмін-панель
function formatPrice(uah) { return formatUAH(uah); }

// Додаткові валюти: "$73,68 · €65,77"
function secondaryPrice(uah) { return formatUSD(uah) + " · " + formatEUR(uah); }

// Ціна для HTML: великі гривні + дрібніші долар і євро.
// inline = true — усе в один рядок (для підсумків)
function priceHTML(uah, inline) {
  return `<span class="pr${inline ? " pr-inline" : ""}">` +
    `<span class="pr-main">${formatUAH(uah)}</span>` +
    `<span class="pr-sub">${secondaryPrice(uah)}</span>` +
    `</span>`;
}

// Заглушка, якщо фото не вказано або не знайдено
function placeholderImage(category) {
  const icon = CATEGORY_ICONS[category] || "🎮";
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="#1c1c1c"/><stop offset="1" stop-color="#3b0a1a"/></linearGradient></defs>` +
    `<rect width="400" height="300" fill="url(#g)"/>` +
    `<text x="200" y="175" font-size="90" text-anchor="middle">${icon}</text></svg>`;
  return "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg);
}

// Якщо будь-яке фото не завантажилось — підставляємо заглушку
// (подія error не спливає, тому слухаємо в режимі capture)
document.addEventListener("error", function (e) {
  const img = e.target;
  if (img && img.tagName === "IMG" && !img.dataset.fallback) {
    img.dataset.fallback = "1";
    img.src = placeholderImage(img.dataset.category);
  }
}, true);

/* ---------- Знижки ---------- */
// Відсоток знижки: ціле число від 1 до 90 (0 = без знижки)
function normalizeDiscount(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n) || n < 1) return 0;
  return Math.min(90, n);
}

// Ціна після знижки, округлена до цілих гривень
function finalPrice(price, discount) {
  const d = normalizeDiscount(discount);
  return Math.round(((Number(price) || 0) * (100 - d)) / 100);
}

/* ---------- Замовлення ---------- */
// Усі замовлення з цього браузера
function loadOrders() {
  try {
    const data = JSON.parse(localStorage.getItem(ORDERS_KEY));
    return Array.isArray(data) ? data.filter(o => o && Array.isArray(o.items)) : [];
  } catch (e) {
    return [];
  }
}

function saveOrders(list) {
  try {
    localStorage.setItem(ORDERS_KEY, JSON.stringify(list));
    return true;
  } catch (e) {
    console.error("Не вдалося зберегти замовлення:", e);
    return false;
  }
}

// Скільки одиниць кожного товару «зайнято» активними замовленнями (скасовані не рахуються)
// Результат: { "id товару": кількість }
function reservedMap(orders) {
  const map = {};
  (orders || loadOrders()).forEach(order => {
    if (order.status === "cancelled" || order.status === "refunded") return; // скасовані й повернені не тримають товар
    order.items.forEach(item => {
      const id = String(item.id);
      map[id] = (map[id] || 0) + (Number(item.qty) || 0);
    });
  });
  return map;
}

/* ---------- Товари ---------- */
// Приводимо товар до єдиного формату (stock: null = без обмеження кількості)
function normalizeProduct(p) {
  if (!p || p.id === undefined || p.id === null || !p.name) return null;

  let stock = null;
  if (p.stock !== undefined && p.stock !== null && p.stock !== "" && Number.isFinite(Number(p.stock))) {
    stock = Math.max(0, Math.floor(Number(p.stock)));
  }

  const category = p.category ? String(p.category) : "keyboards";

  return {
    id: String(p.id),
    name: String(p.name),
    category: category,
    price: Math.max(0, Number(p.price) || 0),      // звичайна ціна в гривнях (без знижки)
    discount: normalizeDiscount(p.discount),       // знижка в % (0 = без знижки)
    rating: Math.min(5, Math.max(0, Math.floor(Number(p.rating) || 0))),
    stock: stock,
    image: p.image ? String(p.image) : "",
    desc: p.desc ? String(p.desc) : "",
    attrs: normalizeAttrs(category, p.attrs),      // характеристики для фільтрів
    visible: p.visible !== false
  };
}

// Приводимо весь список до єдиного формату (відкидаємо зламані записи)
function normalizeList(list) {
  if (!Array.isArray(list)) return [];
  return list.map(normalizeProduct).filter(Boolean);
}

// Товари з файлу js/products-data.js (початкові дані / запасний варіант)
function loadFilePublishedProducts() {
  return typeof PUBLISHED_PRODUCTS !== "undefined" ? normalizeList(PUBLISHED_PRODUCTS) : [];
}

// Товари, які бачать усі відвідувачі: спільне сховище (кеш) або файл
function loadPublishedProducts() {
  if (typeof REMOTE_ON !== "undefined" && REMOTE_ON) {
    const cache = remoteReadCache();
    if (cache) return normalizeList(cache);
  }
  return loadFilePublishedProducts();
}

// Чи є чернетка адміна в цьому браузері (лише без Firebase)
function hasProductsDraft() {
  if (typeof REMOTE_ON !== "undefined" && REMOTE_ON) return false;
  try {
    return Array.isArray(JSON.parse(localStorage.getItem(PRODUCTS_STORAGE_KEY)));
  } catch (e) {
    return false;
  }
}

// Усі товари (разом із прихованими) з БАЗОВОЮ кількістю і звичайною ціною
function loadAllProducts() {
  if (typeof REMOTE_ON !== "undefined" && REMOTE_ON) return loadPublishedProducts();
  try {
    const raw = localStorage.getItem(PRODUCTS_STORAGE_KEY);
    if (raw !== null) {
      const data = JSON.parse(raw);
      if (Array.isArray(data)) return normalizeList(data);
    }
  } catch (e) { /* падаємо назад на файл */ }
  return loadFilePublishedProducts();
}

function saveAllProducts(list) {
  // З Firebase: зберігаємо локально й одразу публікуємо в хмару
  if (typeof REMOTE_ON !== "undefined" && REMOTE_ON) {
    if (!remoteWriteCache(list)) return false;
    remoteFlush();
    return true;
  }
  try {
    localStorage.setItem(PRODUCTS_STORAGE_KEY, JSON.stringify(list));
    return true;
  } catch (e) {
    console.error("Не вдалося зберегти товари:", e);
    return false;
  }
}

function resetProductsDraft() {
  if (typeof REMOTE_ON !== "undefined" && REMOTE_ON) return;
  try { localStorage.removeItem(PRODUCTS_STORAGE_KEY); } catch (e) { /* ігноруємо */ }
}

// Віднімаємо від кількості те, що вже замовлено (щоб у каталозі була актуальна наявність)
function withEffectiveStock(list) {
  const reserved = reservedMap();
  return list.map(p => {
    if (p.stock === null) return p;
    const taken = reserved[p.id] || 0;
    return Object.assign({}, p, { stock: Math.max(0, p.stock - taken) });
  });
}

// Застосовуємо знижки: price стає ціною ПІСЛЯ знижки (її використовують кошик і замовлення),
// а звичайна ціна зберігається в oldPrice
function applyDiscounts(list) {
  return list.map(p => {
    if (!p.discount) return p;
    return Object.assign({}, p, { oldPrice: p.price, price: finalPrice(p.price, p.discount) });
  });
}

// ALL_PRODUCTS — усі товари, PRODUCTS — тільки ті, що видно в каталозі
const ALL_PRODUCTS = applyDiscounts(withEffectiveStock(loadAllProducts()));
const PRODUCTS = ALL_PRODUCTS.filter(p => p.visible);

// Знайти товар за id (id завжди порівнюємо як текст)
function getProductById(id) {
  return PRODUCTS.find(p => String(p.id) === String(id));
}

/* ---------- Картка товару (каталог) ---------- */
function createProductCard(product, badgeText) {
  const rating = Number(product.rating) || 0;
  const stars = rating > 0 ? `<div>${"⭐".repeat(rating)}</div>` : "";
  const badge = badgeText ? `<span class="badge">${escapeHTML(badgeText)}</span>` : "";
  const category = product.category || "";
  const categoryName = CATEGORY_NAMES[category] || "";
  const image = product.image || placeholderImage(category);

    // Мітки характеристик (механічна, бездротова тощо)
  const attrDefs = CATEGORY_ATTRS[category] || {};
  const productAttrs = product.attrs || {};
  const tagList = Object.keys(attrDefs)
    .filter(key => productAttrs[key])
    .map(key => `<span class="tag">${escapeHTML(attrDefs[key].options[productAttrs[key]])}</span>`)
    .join("");
  const tagsHtml = tagList ? `<div class="tags">${tagList}</div>` : "";

  // Знижка: стара ціна закреслена + мітка з відсотком
  const hasSale = product.discount > 0 && product.oldPrice;
  const saleBadge = hasSale ? `<span class="badge sale">−${product.discount}%</span>` : "";

  // Ціна: великі гривні, нижче дрібніше долар і євро
  const priceBox =
    `<div class="price-box">` +
    (hasSale ? `<span class="price-old">${formatPrice(product.oldPrice)}</span>` : "") +
    `<span class="price">${formatPrice(product.price)}</span>` +
    `<span class="pr-sub">${secondaryPrice(product.price)}</span>` +
    `</div>`;

  // Наявність: stock === null означає «без обмеження»
  const stock = product.stock;
  let stockHtml;
  let buttonHtml;
  if (stock === 0) {
    stockHtml = '<span class="stock out">Немає в наявності</span>';
    buttonHtml = '<button class="btn" disabled>Немає в наявності</button>';
  } else {
    if (stock === null) stockHtml = '<span class="stock ok">В наявності</span>';
    else if (stock <= 3) stockHtml = `<span class="stock low">Залишилось ${stock} шт.</span>`;
    else stockHtml = `<span class="stock ok">В наявності: ${stock} шт.</span>`;
    buttonHtml = `<button class="btn" data-add="${escapeHTML(product.id)}">Додати в кошик</button>`;
  }

  // Кнопка «Обране» (працює, якщо на сторінці підключено cart.js з розділом Wishlist)
  const wish = typeof wishButtonHTML === "function" ? wishButtonHTML(product.id) : "";

  return `
    <article class="product-card">
      ${badge}
      ${saleBadge}
      <div class="wish-wrap">
        <img src="${escapeHTML(image)}" alt="${escapeHTML(product.name)}" data-category="${escapeHTML(category)}">
        ${wish}
      </div>
      <div class="product-body">
        <span class="product-cat">${escapeHTML(categoryName)}</span>
        <h3 class="product-name">${escapeHTML(product.name)}</h3>
        <p class="product-desc">${escapeHTML(product.desc || "")}</p>
                ${tagsHtml}
        ${stars}
        ${stockHtml}
        <div class="product-footer">
          ${priceBox}
          ${buttonHtml}
        </div>
      </div>
    </article>`;
}

// Стилі для наявності, знижок і цін у валютах (додаються тут, щоб не чіпати style.css)
(function () {
  const style = document.createElement("style");
  style.textContent =
    ".product-card{position:relative}" +
    ".stock{font-size:.82rem;font-weight:600}" +
    ".stock.ok{color:#22c55e}" +
    ".stock.low{color:#f59e0b}" +
    ".stock.out{color:#ef4444}" +
    ".badge.sale{top:0;right:0;left:auto;background:#e11d48}" +
    ".price-box{display:flex;flex-direction:column;line-height:1.15}" +
    ".price-old{font-size:.85rem;font-weight:600;color:#9ca3af;text-decoration:line-through}" +
    /* основна ціна (гривня) і додаткові (долар, євро) */
    ".pr{display:inline-flex;flex-direction:column;line-height:1.15;vertical-align:top}" +
    ".pr-main{font-weight:800}" +
    ".pr-sub{font-size:.72rem;font-weight:600;color:var(--muted);opacity:.85}" +
    ".pr-inline{flex-direction:row;flex-wrap:wrap;align-items:baseline;gap:4px 10px}";
  document.head.appendChild(style);
})();