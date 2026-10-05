// ===== Адмін-панель: товари та замовлення =====
// Підключати ПІСЛЯ products.js, cart.js, auth.js і admin-access.js.
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
  let products = loadAllProducts();   // усі товари (з БАЗОВОЮ кількістю)
  let orders = loadOrders();          // усі замовлення
  let reserved = reservedMap(orders); // скільки кожного товару «зайнято» замовленнями
  let ordersFilter = "all";           // фільтр замовлень
  let editingId = null;               // id товару, який редагуємо (null — новий)
  let imageValue = "";                // фото: шлях/посилання або data URL
  let query = "";                     // пошуковий запит

  const STATUS_LABELS = { new: "Нове", done: "Виконано", cancelled: "Скасовано" };

  const tbody = el("admin-tbody");
  const modal = el("product-modal");
  const form = el("product-form");

  // Список категорій у формі
  el("pf-category").innerHTML = Object.keys(CATEGORY_NAMES)
    .map(key => `<option value="${key}">${CATEGORY_NAMES[key]}</option>`)
    .join("");

  // Кількість, доступна просто зараз (база мінус замовлення)
  function effectiveStock(p) {
    return p.stock === null ? null : Math.max(0, p.stock - (reserved[p.id] || 0));
  }

  /* ---------- Збереження товарів ---------- */
  // Виконує зміну, зберігає чернетку; якщо не вдалося — скасовує зміну
  function applyChange(mutator, okMessage) {
    const backup = JSON.parse(JSON.stringify(products));
    mutator();
    if (!saveAllProducts(products)) {
      products = backup;
      render();
      toast("⚠️ Не вдалося зберегти: сховище браузера переповнене. Вкажіть шлях до фото замість завантаження.", true);
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

  /* ---------- Малювання ---------- */
  function render() {
    reserved = reservedMap(orders);
    renderProducts();
    renderOrders();
  }

  function renderProducts() {
    // статистика
    el("stat-total").textContent = products.length;
    el("stat-visible").textContent = products.filter(p => p.visible).length;
    el("stat-out").textContent = products.filter(p => effectiveStock(p) === 0).length;

    // звідки зараз беруться товари
    const draft = hasProductsDraft();
    el("source-note").textContent = draft
      ? "Зараз використовується чернетка цього браузера (ваші зміни). Щоб їх побачили всі відвідувачі, експортуйте файл для сайту."
      : "Зараз використовується файл js/products-data.js (змін у цьому браузері ще немає).";
    el("reset-btn").hidden = !draft;

    // таблиця
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
      const stockOff = effective === null ? " disabled" : "";
      const takenNote = effective !== null && taken > 0 ? `<small>у замовленнях: ${taken}</small>` : "";
      return `
        <tr data-id="${escapeHTML(p.id)}" class="${p.visible ? "" : "row-hidden"}">
          <td><img class="thumb" src="${escapeHTML(image)}" alt="" data-category="${escapeHTML(p.category)}"></td>
          <td><strong>${escapeHTML(p.name)}</strong><small>${escapeHTML(categoryName)}</small></td>
          <td>${formatPrice(p.price)}</td>
          <td>
            <div class="stock-ctl">
              <button type="button" data-act="dec"${stockOff} aria-label="Зменшити кількість">−</button>
              <span class="${effective === 0 ? "stock-zero" : ""}">${stockText}</span>
              <button type="button" data-act="inc"${stockOff} aria-label="Збільшити кількість">+</button>
            </div>
            ${takenNote}
          </td>
          <td>
            <label class="switch" title="Показувати в каталозі">
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
    empty.textContent = products.length === 0
      ? "Товарів ще немає. Натисніть «+ Додати товар»."
      : "Нічого не знайдено.";
  }

  /* ---------- Дії в таблиці товарів ---------- */
  tbody.addEventListener("click", e => {
    const btn = e.target.closest("button[data-act]");
    if (!btn) return;
    const id = btn.closest("tr").dataset.id;
    const product = products.find(p => p.id === id);
    if (!product) return;

    switch (btn.dataset.act) {
      case "edit":
        openModal(product);
        break;
      case "delete":
        if (confirm("Видалити товар «" + product.name + "»? Цю дію не можна скасувати.")) {
          applyChange(() => { products = products.filter(p => p.id !== id); }, "🗑 Товар видалено");
        }
        break;
      case "inc":
      case "dec": {
        if (product.stock === null) return;
        const goingDown = btn.dataset.act === "dec";
        if (goingDown && effectiveStock(product) <= 0) return;
        applyChange(() => { product.stock = Math.max(0, product.stock + (goingDown ? -1 : 1)); });
        break;
      }
    }
  });

  // Перемикач «показувати в каталозі»
  tbody.addEventListener("change", e => {
    const checkbox = e.target.closest('input[data-act="visible"]');
    if (!checkbox) return;
    const id = checkbox.closest("tr").dataset.id;
    const product = products.find(p => p.id === id);
    if (!product) return;
    applyChange(() => { product.visible = checkbox.checked; },
      checkbox.checked ? "👁 Товар показано в каталозі" : "🙈 Товар приховано з каталогу");
  });

  /* ---------- Замовлення ---------- */
  function renderOrders() {
    // підсумки
    const counts = { all: orders.length, new: 0, done: 0, cancelled: 0 };
    let revenue = 0;
    orders.forEach(o => {
      if (counts[o.status] !== undefined) counts[o.status]++;
      if (o.status !== "cancelled") revenue += Number(o.total) || 0;
    });
    el("ord-new").textContent = counts.new;
    el("ord-done").textContent = counts.done;
    el("ord-cancelled").textContent = counts.cancelled;
    el("ord-revenue").textContent = formatPrice(Math.round(revenue * 100) / 100);

    // фільтри
    document.querySelectorAll("#order-filters [data-filter]").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.filter === ordersFilter);
      btn.querySelector("b").textContent = counts[btn.dataset.filter];
    });

    // список (нові зверху)
    const list = orders
      .slice()
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      .filter(o => ordersFilter === "all" || o.status === ordersFilter);

    el("orders-list").innerHTML = list.map(o => {
      const c = o.customer || {};
      const phoneHref = String(c.phone || "").replace(/[^\d+]/g, "");
      const account = o.account
        ? `${escapeHTML(o.account.nick)} (${escapeHTML(o.account.email)})`
        : "гість (без входу в акаунт)";
      const date = new Date(o.createdAt || 0).toLocaleString("uk-UA");
      const status = STATUS_LABELS[o.status] ? o.status : "new";

      const items = o.items.map(i =>
        `<li><span>${escapeHTML(i.name)} × ${Number(i.qty) || 0}</span><span>${formatPrice((Number(i.price) || 0) * (Number(i.qty) || 0))}</span></li>`
      ).join("");

      let actions = "";
      if (status === "new") {
        actions += '<button type="button" class="btn btn-sm btn-success" data-order-act="done">✅ Виконано</button>';
      }
      if (status === "new" || status === "done") {
        actions += '<button type="button" class="btn btn-sm btn-danger-outline" data-order-act="cancel">✖ Скасувати замовлення</button>';
      }
      if (status === "cancelled") {
        actions += '<button type="button" class="btn btn-sm btn-outline" data-order-act="delete">🗑 Видалити зі списку</button>';
      }

      return `
        <article class="order-card is-${status}" data-order-id="${escapeHTML(o.id)}">
          <div class="order-head">
            <span class="order-title">Замовлення №${escapeHTML(o.number)}</span>
            <span class="status-badge ${status}">${STATUS_LABELS[status]}</span>
            <span class="order-date">${escapeHTML(date)}</span>
          </div>
          <div class="order-body">
            <div class="order-info">
              <div><span>Покупець:</span> <b>${escapeHTML(c.name || "—")}</b></div>
              <div><span>Телефон:</span> <a href="tel:${escapeHTML(phoneHref)}">${escapeHTML(c.phone || "—")}</a></div>
              <div><span>Email:</span> <a href="mailto:${escapeHTML(c.email || "")}">${escapeHTML(c.email || "—")}</a></div>
              <div><span>Місто:</span> ${escapeHTML(c.city || "—")}</div>
              <div><span>Доставка:</span> ${escapeHTML(c.delivery || "—")}</div>
              <div><span>Коментар:</span> ${escapeHTML(c.comment || "—")}</div>
              <div><span>Акаунт:</span> ${account}</div>
            </div>
            <div>
              <ul class="order-items">${items}</ul>
              <div class="order-total"><span>Разом</span><span>${formatPrice(o.total)}</span></div>
            </div>
          </div>
          <div class="order-actions">${actions}</div>
        </article>`;
    }).join("");

    const empty = el("orders-empty");
    empty.hidden = list.length > 0;
    empty.textContent = orders.length === 0 ? "Замовлень ще немає." : "У цьому розділі замовлень немає.";
  }

  // Змінює статус замовлення і зберігає (скасування автоматично повертає товар у наявність)
  function setOrderStatus(order, status, message) {
    const previous = order.status;
    order.status = status;
    order.statusChangedAt = Date.now();
    if (!saveOrders(orders)) {
      order.status = previous;
      toast("⚠️ Не вдалося зберегти зміни замовлення.", true);
      return;
    }
    render();
    toast(message);
  }

  el("orders-list").addEventListener("click", e => {
    const btn = e.target.closest("button[data-order-act]");
    if (!btn) return;

    orders = loadOrders(); // беремо свіжі дані, щоб нічого не загубити
    const id = btn.closest("[data-order-id]").dataset.orderId;
    const order = orders.find(o => o.id === id);
    if (!order) { render(); return; }

    switch (btn.dataset.orderAct) {
      case "done":
        setOrderStatus(order, "done", "✅ Замовлення №" + order.number + " виконано");
        break;
      case "cancel":
        if (confirm("Скасувати замовлення №" + order.number + "? Товари повернуться в наявність.")) {
          setOrderStatus(order, "cancelled", "✖ Замовлення №" + order.number + " скасовано, товари повернуто в наявність");
        }
        break;
      case "delete":
        if (confirm("Видалити скасоване замовлення №" + order.number + " зі списку?")) {
          orders = orders.filter(o => o.id !== id);
          if (!saveOrders(orders)) {
            toast("⚠️ Не вдалося видалити замовлення.", true);
            orders = loadOrders();
          }
          render();
        }
        break;
    }
  });

  el("order-filters").addEventListener("click", e => {
    const btn = e.target.closest("[data-filter]");
    if (!btn) return;
    ordersFilter = btn.dataset.filter;
    renderOrders();
  });

  /* ---------- Вікно додавання / редагування товару ---------- */
  function showFormError(message) {
    const box = el("pf-error");
    box.textContent = message;
    box.hidden = false;
  }

  function clearFormError() {
    const box = el("pf-error");
    box.textContent = "";
    box.hidden = true;
  }

  function updatePreview() {
    const img = el("pf-preview");
    const category = el("pf-category").value;
    delete img.dataset.fallback;          // дозволяємо знову підставити заглушку
    img.dataset.category = category;
    img.src = imageValue || placeholderImage(category);
    el("pf-image-remove").hidden = !imageValue;
  }

  function openModal(product) {
    editingId = product ? product.id : null;
    el("modal-title").textContent = product ? "Редагувати товар" : "Додати товар";
    el("pf-name").value = product ? product.name : "";
    el("pf-category").value = product ? product.category : "keyboards";
    el("pf-price").value = product ? product.price : "";
    el("pf-rating").value = product ? String(product.rating) : "5";
    el("pf-desc").value = product ? product.desc : "";
    el("pf-visible").checked = product ? product.visible : true;

    // кількість показуємо ту, що доступна зараз (з урахуванням замовлень)
    const effective = product ? effectiveStock(product) : 10;
    el("pf-stock").value = effective === null ? "" : effective;
    const taken = product ? (reserved[product.id] || 0) : 0;
    const note = el("pf-stock-note");
    note.hidden = !(product && product.stock !== null && taken > 0);
    note.textContent = "У замовленнях зараз зарезервовано " + taken + " шт. Число вище вже враховує їх.";

    imageValue = product ? product.image : "";
    el("pf-image-path").value = imageValue && !imageValue.startsWith("data:") ? imageValue : "";

    updatePreview();
    clearFormError();
    modal.hidden = false;
    el("pf-name").focus();
  }

  function closeModal() {
    modal.hidden = true;
    editingId = null;
  }

  // Обрізає фото до 640×480 і стискає в JPEG (щоб не переповнювати сховище)
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

  el("add-btn").addEventListener("click", () => openModal(null));
  el("modal-cancel").addEventListener("click", closeModal);
  modal.addEventListener("click", e => { if (e.target === modal) closeModal(); });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && !modal.hidden) closeModal();
  });

  el("pf-category").addEventListener("change", updatePreview);

  // Фото: завантаження файлу
  el("pf-image-pick").addEventListener("click", () => el("pf-image-file").click());
  el("pf-image-file").addEventListener("change", async e => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    clearFormError();
    if (!/^image\/(png|jpe?g|webp|gif)$/.test(file.type)) {
      return showFormError("Оберіть зображення PNG, JPG, WEBP або GIF.");
    }
    if (file.size > 8 * 1024 * 1024) {
      return showFormError("Файл завеликий (максимум 8 МБ).");
    }
    try {
      imageValue = await processProductImage(file);
      el("pf-image-path").value = "";
      updatePreview();
    } catch (err) {
      showFormError(err.message || "Не вдалося обробити фото.");
    }
  });

  // Фото: шлях або посилання, введене вручну
  el("pf-image-path").addEventListener("input", e => {
    imageValue = e.target.value.trim();
    updatePreview();
  });

  el("pf-image-remove").addEventListener("click", () => {
    imageValue = "";
    el("pf-image-path").value = "";
    updatePreview();
  });

  // Збереження товару
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
    if (name.length > 80) return showFormError("Назва занадто довга (максимум 80 символів).");
    if (!CATEGORY_NAMES[category]) return showFormError("Оберіть категорію.");
    if (el("pf-price").value === "" || !Number.isFinite(price) || price < 0) {
      return showFormError("Вкажіть коректну ціну (0 або більше).");
    }

    // Те, що ви вписали, — це кількість «зараз у наявності».
    // Базову кількість рахуємо як введене число + те, що вже в замовленнях.
    let stock = null; // порожньо = без обмеження
    if (stockRaw !== "") {
      const typed = Number(stockRaw);
      if (!Number.isInteger(typed) || typed < 0) {
        return showFormError("Кількість має бути цілим числом від 0 (або залиште поле порожнім).");
      }
      stock = typed + (editingId ? (reserved[editingId] || 0) : 0);
    }
    if (desc.length > 500) return showFormError("Опис занадто довгий (максимум 500 символів).");

    const data = {
      name: name,
      category: category,
      price: Math.round(price * 100) / 100,
      stock: stock,
      rating: rating,
      image: imageValue,
      desc: desc,
      visible: visible
    };

    const wasEditing = editingId !== null;
    const saved = applyChange(() => {
      const index = wasEditing ? products.findIndex(p => p.id === editingId) : -1;
      if (index >= 0) products[index] = Object.assign({}, products[index], data);
      else products.push(Object.assign({ id: newId() }, data));
    }, wasEditing ? "✅ Зміни збережено" : "✅ Товар додано");

    if (saved) closeModal();
  });

  /* ---------- Пошук, експорт, скидання ---------- */
  el("admin-search").addEventListener("input", e => {
    query = e.target.value;
    renderProducts();
  });

  // Завантажує файл products-data.js для публікації на сайті
  // (кількість записується БАЗОВА, без віднімання замовлень)
  el("export-btn").addEventListener("click", () => {
    const text =
      "// Файл створено адмін-панеллю APEXSETUP (" + new Date().toLocaleString("uk-UA") + ").\n" +
      "// Покладіть його в папку js/ із заміною старого products-data.js\n" +
      "const PUBLISHED_PRODUCTS = " + JSON.stringify(products, null, 2) + ";\n";
    const blob = new Blob([text], { type: "application/javascript" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "products-data.js";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast("⬇ Файл products-data.js завантажено");
  });

  el("reset-btn").addEventListener("click", () => {
    if (!confirm("Скинути всі зміни? Товари повернуться до стану з файлу js/products-data.js.")) return;
    resetProductsDraft();
    products = loadAllProducts();
    render();
    toast("↩️ Чернетку скинуто");
  });

  // Якщо товари або замовлення змінились в іншій вкладці (наприклад, клієнт оформив замовлення)
  window.addEventListener("storage", e => {
    if (e.key === ORDERS_KEY || e.key === PRODUCTS_STORAGE_KEY) {
      orders = loadOrders();
      products = loadAllProducts();
      render();
    }
  });

  render();
})();