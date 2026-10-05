// ===== Ядро каталогу: товари, наявність, замовлення, картки товарів =====

// Ключ, під яким адмін-панель зберігає чернетку товарів у цьому браузері
const PRODUCTS_STORAGE_KEY = "apex_products_v1";
// Ключ, під яким зберігаються замовлення
const ORDERS_KEY = "apex_orders_v1";

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

// Гарний формат ціни: 80 -> $80, 79.5 -> $79.50
function formatPrice(value) {
  const n = Number(value) || 0;
  return "$" + (Number.isInteger(n) ? n : n.toFixed(2));
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
    if (order.status === "cancelled") return;
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

  return {
    id: String(p.id),
    name: String(p.name),
    category: p.category ? String(p.category) : "keyboards",
    price: Math.max(0, Number(p.price) || 0),
    rating: Math.min(5, Math.max(0, Math.floor(Number(p.rating) || 0))),
    stock: stock,
    image: p.image ? String(p.image) : "",
    desc: p.desc ? String(p.desc) : "",
    visible: p.visible !== false
  };
}

function normalizeList(list) {
  return Array.isArray(list) ? list.map(normalizeProduct).filter(Boolean) : [];
}

// Товари з файлу js/products-data.js (їх бачать усі відвідувачі)
function loadPublishedProducts() {
  return typeof PUBLISHED_PRODUCTS !== "undefined" ? normalizeList(PUBLISHED_PRODUCTS) : [];
}

// Чи є чернетка адміна в цьому браузері
function hasProductsDraft() {
  try {
    return Array.isArray(JSON.parse(localStorage.getItem(PRODUCTS_STORAGE_KEY)));
  } catch (e) {
    return false;
  }
}

// Усі товари (разом із прихованими) з БАЗОВОЮ кількістю: чернетка адміна або файл
function loadAllProducts() {
  try {
    const raw = localStorage.getItem(PRODUCTS_STORAGE_KEY);
    if (raw !== null) {
      const data = JSON.parse(raw);
      if (Array.isArray(data)) return normalizeList(data);
    }
  } catch (e) { /* падаємо назад на файл */ }
  return loadPublishedProducts();
}

function saveAllProducts(list) {
  try {
    localStorage.setItem(PRODUCTS_STORAGE_KEY, JSON.stringify(list));
    return true;
  } catch (e) {
    console.error("Не вдалося зберегти товари:", e);
    return false;
  }
}

function resetProductsDraft() {
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

// ALL_PRODUCTS — усі товари, PRODUCTS — тільки ті, що видно в каталозі
const ALL_PRODUCTS = withEffectiveStock(loadAllProducts());
const PRODUCTS = ALL_PRODUCTS.filter(p => p.visible);

// Знайти товар за id (id завжди порівнюємо як текст)
function getProductById(id) {
  return PRODUCTS.find(p => String(p.id) === String(id));
}

/* ---------- Картка товару (каталог і рекомендації) ---------- */
function createProductCard(product, badgeText) {
  const rating = Number(product.rating) || 0;
  const stars = rating > 0 ? `<div>${"⭐".repeat(rating)}</div>` : "";
  const badge = badgeText ? `<span class="badge">${escapeHTML(badgeText)}</span>` : "";
  const category = product.category || "";
  const categoryName = CATEGORY_NAMES[category] || "";
  const image = product.image || placeholderImage(category);

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

  return `
    <article class="product-card">
      ${badge}
      <img src="${escapeHTML(image)}" alt="${escapeHTML(product.name)}" data-category="${escapeHTML(category)}">
      <div class="product-body">
        <span class="product-cat">${escapeHTML(categoryName)}</span>
        <h3 class="product-name">${escapeHTML(product.name)}</h3>
        <p class="product-desc">${escapeHTML(product.desc || "")}</p>
        ${stars}
        ${stockHtml}
        <div class="product-footer">
          <span class="price">${formatPrice(product.price)}</span>
          ${buttonHtml}
        </div>
      </div>
    </article>`;
}

// Стилі для підписів наявності (додаються тут, щоб не чіпати style.css)
(function () {
  const style = document.createElement("style");
  style.textContent =
    ".stock{font-size:.82rem;font-weight:600}" +
    ".stock.ok{color:#22c55e}" +
    ".stock.low{color:#f59e0b}" +
    ".stock.out{color:#ef4444}";
  document.head.appendChild(style);
})();