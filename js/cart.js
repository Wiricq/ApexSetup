// ===== Спільний скрипт: працює на ВСІХ сторінках =====
// Підключати ПІСЛЯ products.js.
// Тут: кошик (з урахуванням наявності), оформлення замовлення, статистика,
// лічильник у header, меню, сторінка кошика.

// Усі дані (кошик + статистика) зберігаються в одному об'єкті:
// { cart: [...], stats: {...}, ts: час_останньої_зміни }
// Копія лежить у localStorage і в window.name (резерв для переходів між сторінками).
const STORE_KEY = "apex_store_v3";
const NAME_PREFIX = "APEXSTORE:";
const OLD_KEYS = ["apex_cart", "apex_stats", "apex_cart_v2", "apex_stats_v2"];
const MAX_QTY = 99;

// Ключі акаунтів (щоб записати в замовлення, хто його оформив)
const ACCOUNT_SESSION_KEY = "apex_session_v1";
const ACCOUNT_USERS_KEY = "apex_users_v1";

// Одноразове очищення старих ключів (вони більше ніде не використовуються)
function cleanupOldData() {
  try {
    OLD_KEYS.forEach(key => localStorage.removeItem(key));
  } catch (e) {
    console.warn("Не вдалося очистити старі дані:", e);
  }
}

/* ---------- Сховище ---------- */
function parseStore(text) {
  try {
    const value = JSON.parse(text);
    if (value && typeof value === "object") return value;
  } catch (e) { /* ігноруємо */ }
  return null;
}

// Читаємо обидві копії та беремо новішу
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

// Записуємо в обидва місця. Повертає true, якщо вдалося хоча б в одне.
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

// Перевірка та очищення даних кошика
function sanitizeCart(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(i => i && i.id !== undefined && Number(i.qty) > 0 && Number.isFinite(Number(i.price)))
    .map(i => ({
      id: String(i.id),
      name: String(i.name || ""),
      price: Number(i.price),
      image: i.image || "",
      category: i.category || "",
      qty: Math.min(MAX_QTY, Math.floor(Number(i.qty)))
    }));
}

function getCart() { return sanitizeCart(readStore().cart); }

// Статистика: { "id": кількість_додавань }
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

/* ---------- Наявність товару ---------- */
// Скільки одиниць товару є в наявності (Infinity — без обмеження)
function stockLimit(product) {
  return product && product.stock !== null && product.stock !== undefined ? product.stock : Infinity;
}

// Максимум одного товару в кошику
function maxFor(product) {
  return Math.min(MAX_QTY, stockLimit(product));
}

// Звіряємо кошик із каталогом: видаляємо недоступні товари,
// обмежуємо кількість наявністю, оновлюємо назву/ціну/фото
function syncCartWithCatalog() {
  const cart = getCart();
  const next = [];
  let changed = false;
  let reduced = false;

  cart.forEach(i => {
    const p = getProductById(i.id);
    if (!p || stockLimit(p) <= 0) {
      changed = true;
      reduced = true;
      return; // товару вже немає — прибираємо з кошика
    }
    const qty = Math.min(i.qty, maxFor(p));
    const item = {
      id: i.id, name: p.name, price: p.price,
      image: p.image || "", category: p.category || "", qty: qty
    };
    if (qty !== i.qty) reduced = true;
    if (item.name !== i.name || item.price !== i.price || item.image !== i.image ||
        item.category !== i.category || qty !== i.qty) changed = true;
    next.push(item);
  });

  if (changed) {
    saveCart(next);
    if (reduced) showToast("ℹ️ Кошик оновлено: деякі товари недоступні або їх менше в наявності", true);
  }
}

/* ---------- Дії з кошиком ---------- */
function addToCart(id) {
  id = String(id);
  const product = getProductById(id);
  if (!product) {
    console.error("Товар з id '" + id + "' не знайдено в каталозі");
    showToast("⚠️ Товар не знайдено", true);
    return;
  }

  const limit = stockLimit(product);
  if (limit <= 0) {
    showToast("⚠️ " + product.name + " — немає в наявності", true);
    return;
  }

  const store = readStore();
  const cart = sanitizeCart(store.cart);
  const item = cart.find(i => i.id === id);
  const max = maxFor(product);

  if (item && item.qty >= max) {
    showToast("⚠️ Максимум " + max + " шт. цього товару" + (limit < MAX_QTY ? " (більше немає в наявності)" : ""), true);
    return;
  }

  if (item) {
    item.qty++;                         // той самий товар — збільшуємо кількість
    item.name = product.name;
    item.price = Number(product.price);
    item.image = product.image || "";
  } else {
    cart.push({
      id: id,
      name: product.name,
      price: Number(product.price),
      image: product.image || "",
      category: product.category || "",
      qty: 1
    });
  }
  const expectedQty = cart.find(i => i.id === id).qty;

  // лічильник популярності
  const stats = store.stats && typeof store.stats === "object" ? store.stats : {};
  stats[id] = (stats[id] || 0) + 1;

  store.cart = cart;
  store.stats = stats;
  writeStore(store);
  updateCartCount();

  // Перевіряємо, що товар справді збережено
  const saved = getCart().find(i => i.id === id);
  if (saved && saved.qty === expectedQty) {
    showToast("✅ " + product.name + " додано (у кошику: " + getTotals().qty + " шт.)");
  } else {
    showToast("⚠️ Не вдалося зберегти кошик. Відкрийте сайт через Live Server.", true);
  }
}

// Встановити точну кількість (використовується кнопками та полем вводу)
function setQty(id, qty) {
  id = String(id);
  qty = Math.floor(Number(qty));
  if (!Number.isFinite(qty)) qty = 1;

  const product = getProductById(id);
  const max = product ? maxFor(product) : MAX_QTY;
  if (qty > max) {
    qty = max;
    showToast("ℹ️ Максимум " + max + " шт. (стільки є в наявності)", true);
  }

  let cart = getCart();
  const item = cart.find(i => i.id === id);
  if (!item) return;

  if (qty <= 0) {
    cart = cart.filter(i => i.id !== id);   // 0 і менше — видаляємо товар
  } else {
    item.qty = qty;
  }
  saveCart(cart);
  renderCart();
}

function changeQty(id, delta) {
  const item = getCart().find(i => i.id === String(id));
  if (item) setQty(id, item.qty + delta);
}

function removeFromCart(id) {
  saveCart(getCart().filter(i => i.id !== String(id)));
  renderCart();
}

function getTotals() {
  let qty = 0, sum = 0;
  getCart().forEach(i => {
    qty += i.qty;
    sum += i.price * i.qty;
  });
  return { qty, sum: Math.round(sum * 100) / 100 };
}

/* ---------- Інтерфейс ---------- */
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

// Один обробник кліків для кнопок «Додати в кошик», «+», «−», «Видалити»
document.addEventListener("click", function (e) {
  const addBtn = e.target.closest("[data-add]");
  if (addBtn) {
    addToCart(addBtn.dataset.add);
    if (typeof renderPopular === "function") renderPopular(); // оновити рекомендації
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

// Ручне введення кількості у кошику
document.addEventListener("change", function (e) {
  const input = e.target.closest(".qty-input");
  if (input) setQty(input.dataset.id, input.value);
});

// Мобільне меню + підсвічування активної сторінки
const menuBurger = document.getElementById("burger");
const menuNav = document.getElementById("nav");
if (menuBurger && menuNav) {
  menuBurger.addEventListener("click", () => menuNav.classList.toggle("open"));
}
const currentPage = location.pathname.split("/").pop() || "index.html";
document.querySelectorAll(".nav a").forEach(a => {
  if (a.getAttribute("href") === currentPage) a.classList.add("active");
});

/* ---------- Сторінка кошика (cart.html) ---------- */
function renderCart() {
  const itemsBox = document.getElementById("cart-items");
  if (!itemsBox) return; // ми не на сторінці кошика

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

  itemsBox.innerHTML = cart.map(i => {
    const id = escapeHTML(i.id);
    const image = i.image || placeholderImage(i.category);
    const limit = stockLimit(getProductById(i.id));
    const hint = limit !== Infinity && limit <= 5 ? " · залишилось " + limit + " шт." : "";
    return `
      <div class="cart-item">
        <img src="${escapeHTML(image)}" alt="${escapeHTML(i.name)}" data-category="${escapeHTML(i.category)}">
        <div>
          <h3>${escapeHTML(i.name)}</h3>
          <span class="muted">${formatPrice(i.price)} за шт.${hint}</span>
        </div>
        <div class="qty">
          <button data-cart-action="dec" data-id="${id}" aria-label="Зменшити кількість">−</button>
          <input type="number" class="qty-input" min="1" max="${Math.min(MAX_QTY, limit)}" value="${i.qty}"
                 data-id="${id}" aria-label="Кількість">
          <button data-cart-action="inc" data-id="${id}" aria-label="Збільшити кількість">+</button>
        </div>
        <strong class="price">${formatPrice(i.price * i.qty)}</strong>
        <button class="remove-btn" data-cart-action="remove" data-id="${id}">Видалити</button>
      </div>`;
  }).join("");

  const totals = getTotals();
  document.getElementById("total-qty").textContent = totals.qty;
  document.getElementById("total-sum").textContent = formatPrice(totals.sum);

  if (!checkout.hidden) renderOrderSummary(); // оновити «Ваше замовлення»
}

// Блок «Ваше замовлення» у формі
function renderOrderSummary() {
  const list = document.getElementById("order-list");
  list.innerHTML = getCart()
    .map(i => `<li>${escapeHTML(i.name)} × ${i.qty}</li>`)
    .join("");
  document.getElementById("order-total").textContent = formatPrice(getTotals().sum);
}

// Кнопка «Оформити замовлення»
const checkoutBtn = document.getElementById("checkout-btn");
if (checkoutBtn) {
  checkoutBtn.addEventListener("click", () => {
    if (getCart().length === 0) return;
    const checkout = document.getElementById("checkout");
    checkout.hidden = false;
    renderOrderSummary();
    checkout.scrollIntoView({ behavior: "smooth" });
  });
}

/* ---------- Оформлення замовлення ---------- */
// Хто зараз увійшов в акаунт (або null, якщо гість)
function getLoggedInAccount() {
  try {
    const session = JSON.parse(localStorage.getItem(ACCOUNT_SESSION_KEY));
    if (!session || !session.email) return null;
    const users = JSON.parse(localStorage.getItem(ACCOUNT_USERS_KEY)) || {};
    const user = users[session.email];
    return user ? { nick: user.nick, email: user.email } : null;
  } catch (e) {
    return null;
  }
}

// Підтвердження замовлення: зберігаємо замовлення (кількість товару зменшується автоматично)
const orderForm = document.getElementById("order-form");
if (orderForm) {
  orderForm.addEventListener("submit", function (e) {
    e.preventDefault();

    // Перевіряємо наявність ще раз: поки клієнт заповнював форму, вона могла змінитись
    const before = JSON.stringify(getCart());
    syncCartWithCatalog();
    const cart = getCart();
    if (cart.length === 0) { renderCart(); return; }
    if (JSON.stringify(cart) !== before) {
      renderCart();
      showToast("ℹ️ Наявність змінилась. Перевірте кошик і підтвердіть замовлення ще раз.", true);
      return;
    }

    const field = name => orderForm.elements.namedItem(name).value.trim();
    const items = cart.map(i => ({ id: i.id, name: i.name, price: i.price, qty: i.qty }));
    const total = Math.round(items.reduce((sum, i) => sum + i.price * i.qty, 0) * 100) / 100;

    const orders = loadOrders();
    const number = orders.reduce((max, o) => Math.max(max, Number(o.number) || 0), 1000) + 1;

    orders.push({
      id: "o" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      number: number,
      createdAt: Date.now(),
      status: "new",
      customer: {
        name: field("name"),
        phone: field("phone"),
        email: field("email"),
        city: field("city"),
        delivery: field("delivery"),
        comment: field("comment")
      },
      account: getLoggedInAccount(),
      items: items,
      total: total
    });

    if (!saveOrders(orders)) {
      showToast("⚠️ Не вдалося зберегти замовлення: браузер блокує localStorage.", true);
      return;
    }

    saveCart([]);                                   // очищаємо кошик
    orderForm.reset();

    const message = document.querySelector("#success .modal p");
    if (message) message.textContent = "Ваше замовлення №" + number + " успішно оформлено.";
    document.getElementById("success").hidden = false;
    renderCart();
  });
}

/* ---------- Синхронізація ---------- */
// Оновити все, що залежить від кошика
function refreshAll() {
  updateCartCount();
  renderCart();
  if (typeof renderPopular === "function") renderPopular();
}

// Зміни в іншій вкладці
window.addEventListener("storage", function (e) {
  if (e.key === STORE_KEY) refreshAll();
});

// Повернення на сторінку кнопкою «Назад» (браузер може показати стару копію)
window.addEventListener("pageshow", function (e) {
  if (e.persisted) refreshAll();
});

// Запуск при завантаженні сторінки
cleanupOldData();
syncCartWithCatalog();
updateCartCount();
renderCart();