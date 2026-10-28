// ===== «Сетап мрії»: спільні дані та функції =====
// Підключається на сторінках dream-setup.html та admin-setups.html
// (ПІСЛЯ products.js і cart.js).

const SETUPS_KEY = "apex_setups_v1";

// Статуси заявок
const SETUP_STATUSES = {
  new: "Нова",
  progress: "В роботі",
  ready: "Пропозиція готова",
  done: "Виконано",
  rejected: "Відхилено",
  cancelled: "Скасовано"
};

const SETUP_HINTS = {
  new: "Заявку отримано, вона очікує розгляду",
  progress: "Менеджер працює над вашим сетапом",
  ready: "Пропозиція готова — перегляньте відповідь магазину",
  done: "Заявку виконано",
  rejected: "Заявку відхилено",
  cancelled: "Заявку скасовано"
};

// Кольори на вибір
const SETUP_COLORS = [
  { key: "black",  name: "Чорний",       css: "#111111" },
  { key: "white",  name: "Білий",        css: "#f3f4f6" },
  { key: "gray",   name: "Сірий",        css: "#8b8f98" },
  { key: "red",    name: "Червоний",     css: "#e11d48" },
  { key: "pink",   name: "Рожевий",      css: "#f472b6" },
  { key: "blue",   name: "Синій",        css: "#3b82f6" },
  { key: "green",  name: "Зелений",      css: "#22c55e" },
  { key: "purple", name: "Фіолетовий",   css: "#8b5cf6" },
  { key: "orange", name: "Помаранчевий", css: "#f97316" },
  { key: "any",    name: "Будь-який",    css: "linear-gradient(135deg,#e11d48,#f59e0b,#22c55e,#3b82f6,#8b5cf6)" }
];

// Пріоритети на вибір
const SETUP_PRIORITIES = [
  { key: "performance", icon: "⚡", name: "Максимальна продуктивність" },
  { key: "silent",      icon: "🤫", name: "Тиха робота" },
  { key: "rgb",         icon: "🌈", name: "RGB-підсвічування" },
  { key: "wireless",    icon: "📡", name: "Бездротові пристрої" },
  { key: "ergonomics",  icon: "🖐", name: "Ергономіка та комфорт" },
  { key: "compact",     icon: "📦", name: "Компактність" },
  { key: "value",       icon: "💰", name: "Ціна / якість" },
  { key: "sound",       icon: "🎧", name: "Якісний звук" },
  { key: "durable",     icon: "🛡", name: "Довговічність" }
];

// Слоти «столу»: куди користувач «ставить» компоненти сетапу.
//  kind: "product" — вибір товару з каталогу цієї категорії; "options" — вибір з готових варіантів.
// Щоб додати слот — допишіть його сюди (і в CSS-сітку .desk у css/dream.css).
const SETUP_SLOTS = [
  { key: "lighting", icon: "💡", name: "Підсвічування", kind: "options",
    options: ["RGB-стрічка за монітором", "Світлові панелі на стіні", "Підсвічування столу", "Лампа / нічник", "Мінімум, без RGB"] },
  { key: "headset",  icon: "🎧", name: "Навушники",  kind: "product", category: "headsets" },
  { key: "monitor",  icon: "🖥️", name: "Монітор",    kind: "options",
    options: ["24″ Full HD 144 Гц", "27″ Full HD 165 Гц", "27″ QHD 165 Гц", "32″ 4K", "Ультраширокий 34″", "Два монітори"] },
  { key: "gamepad",  icon: "🎮", name: "Геймпад",    kind: "product", category: "gamepads" },
  { key: "keyboard", icon: "⌨️", name: "Клавіатура", kind: "product", category: "keyboards" },
  { key: "mouse",    icon: "🖱️", name: "Миша",       kind: "product", category: "mice" },
  { key: "pad",      icon: "🟥", name: "Килимок",    kind: "product", category: "pads" }
];

// Приводить компоненти до безпечного вигляду (відкидає невідомі слоти й зламані записи)
// Формат: { keyboard: {type:"product", id, name, price}, monitor: {type:"option", text}, mouse: {type:"any"}, pad: {type:"have"} }
function normalizeComponents(raw) {
  const out = {};
  if (!raw || typeof raw !== "object") return out;
  SETUP_SLOTS.forEach(slot => {
    const e = raw[slot.key];
    if (!e || typeof e !== "object") return;
    if (e.type === "any") {
      out[slot.key] = { type: "any" };
    } else if (e.type === "have") {
      out[slot.key] = { type: "have" };               // гаджет у користувача вже є, купувати не треба
    } else if (e.type === "option" && slot.kind === "options" && typeof e.text === "string" && e.text.trim()) {
      out[slot.key] = { type: "option", text: e.text.trim().slice(0, 80) };
    } else if (e.type === "product" && slot.kind === "product" && e.id) {
      out[slot.key] = {
        type: "product",
        id: String(e.id),
        name: String(e.name || "").slice(0, 120),
        price: Math.max(0, Number(e.price) || 0)
      };
    }
  });
  return out;
}

// Текст вибору для слота («Клавіатура X — 2 499 ₴», «Підберіть мені», «27″ QHD»)
function componentText(entry) {
  if (!entry) return "";
  if (entry.type === "any") return "Підберіть мені";
  if (entry.type === "have") return "Не потрібно — вже є";
  if (entry.type === "option") return entry.text;
  if (entry.type === "product") return entry.name + (entry.price > 0 ? " — " + formatPrice(entry.price) : "");
  return "";
}

// Сума вартості обраних товарів
function componentsTotal(components) {
  return Object.keys(components || {}).reduce((sum, key) => {
    const e = components[key];
    return sum + (e && e.type === "product" ? Number(e.price) || 0 : 0);
  }, 0);
}

/* ---------- Збереження ---------- */
function loadSetups() {
  try {
    const data = JSON.parse(localStorage.getItem(SETUPS_KEY));
    return Array.isArray(data) ? data.filter(s => s && s.id) : [];
  } catch (e) {
    return [];
  }
}

function saveSetups(list) {
  try {
    localStorage.setItem(SETUPS_KEY, JSON.stringify(list));
    return true;
  } catch (e) {
    console.error("Не вдалося зберегти заявки:", e);
    return false;
  }
}

function nextSetupNumber(list) {
  return list.reduce((max, s) => Math.max(max, Number(s.number) || 0), 2000) + 1;
}

function newSetupId() {
  return "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
}

/* ---------- Допоміжні функції ---------- */
function setupColor(key) {
  return SETUP_COLORS.find(c => c.key === key) || SETUP_COLORS[SETUP_COLORS.length - 1];
}

function setupPriority(key) {
  return SETUP_PRIORITIES.find(p => p.key === key);
}

// Заявка належить користувачу (за поштою акаунта)
function setupBelongsTo(setup, account) {
  return !!(setup.account && account &&
    String(setup.account.email).toLowerCase() === String(account.email).toLowerCase());
}

// Редагувати можна лише нову заявку
function canEditSetup(setup) {
  return setup.status === "new";
}

// Скасувати можна, поки заявка не завершена
function canCancelSetup(setup) {
  return ["new", "progress", "ready"].includes(setup.status);
}

// Обрізає фото до потрібного розміру й стискає в JPEG (щоб не переповнювати сховище)
function resizeImage(file, width, height, quality) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const targetRatio = width / height;
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
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#111111";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, width, height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Не вдалося прочитати зображення."));
    };
    img.src = url;
  });
}

// Стилі галереї фото (додаються тут, щоб працювали і в адмін-панелі)
(function () {
  const style = document.createElement("style");
  style.textContent =
    ".setup-promo{margin-top:14px;padding:14px 16px;border-radius:16px;border:1px dashed rgba(255,140,150,.7);background:rgba(255,59,74,.1);line-height:1.6}" +
    ".setup-promo code{font-size:1.1rem;font-weight:800;letter-spacing:.08em;padding:2px 10px;border-radius:8px;background:rgba(255,255,255,.14)}" +
    ".setup-promo-row{display:flex;flex-wrap:wrap;align-items:flex-end;gap:10px 14px;margin-top:8px}" +
    ".setup-promo-row label{display:grid;gap:4px;font-size:.85rem}" +
    ".setup-promo-row input{width:110px;padding:8px 12px;font:inherit;color:inherit;border-radius:10px;border:1px solid rgba(255,255,255,.3);background:rgba(255,255,255,.1)}" +
    ".setup-promo .btn{margin:6px 8px 0 0}" +
    ".setup-gallery{display:flex;flex-direction:column;gap:8px;min-width:0}" +
    ".setup-thumbs{display:flex;flex-wrap:wrap;gap:6px}" +
    ".setup-thumbs img.setup-photo{width:56px;height:42px;min-width:0;max-width:none;flex:none;object-fit:cover;border-radius:8px;cursor:pointer}";
  document.head.appendChild(style);
})();

// HTML з деталями заявки (фото, бюджет, колір, пріоритети, коментар) — спільний для користувача й адміна
function setupDetailsHTML(setup) {
  const color = setupColor(setup.color);
  // Фото: нові заявки мають масив photos, старі — одне поле photo
  const photoList = (Array.isArray(setup.photos) && setup.photos.length ? setup.photos : (setup.photo ? [setup.photo] : []))
    .filter(src => typeof src === "string" && src);
  const photoTag = (src, i) =>
    `<img class="setup-photo" src="${escapeHTML(src)}" alt="Фото-натхнення ${i + 1}" title="Натисніть, щоб збільшити">`;
  const photo = photoList.length === 0
    ? `<div class="setup-photo empty">🎮</div>`
    : photoList.length === 1
      ? photoTag(photoList[0], 0)
      : `<div class="setup-gallery">${photoTag(photoList[0], 0)}` +
        `<div class="setup-thumbs">${photoList.slice(1).map((src, i) => photoTag(src, i + 1)).join("")}</div></div>`;
  const chips = (setup.priorities || []).map(key => {
    const p = setupPriority(key);
    return p ? `<span class="chip-static">${p.icon} ${escapeHTML(p.name)}</span>` : "";
  }).join("");
  const comment = setup.comment
    ? `<div class="setup-row"><span>Коментар:</span> ${escapeHTML(setup.comment)}</div>`
    : "";

  // Компоненти, «поставлені» на стіл
  const components = normalizeComponents(setup.components);
  const compChips = SETUP_SLOTS.filter(slot => components[slot.key]).map(slot =>
    `<span class="chip-static">${slot.icon} ${escapeHTML(slot.name)}: ${escapeHTML(componentText(components[slot.key]))}</span>`
  ).join("");
  const compTotal = componentsTotal(components);
  const promoRow = setup.promoCode
    ? `<div class="setup-row"><span>Промокод клієнта:</span> <b>${escapeHTML(setup.promoCode)}</b>` +
      (setup.promoPercent ? " (−" + Number(setup.promoPercent) + "%)" : "") + `</div>`
    : "";
  const compRow = compChips
    ? `<div class="setup-row"><span>Сетап:</span><div class="chip-list">${compChips}</div>` +
      (compTotal > 0 ? `<div>Орієнтовно товарів на: <b>${formatPrice(compTotal)}</b></div>` : "") + `</div>`
    : "";

  return `
    <div class="setup-body">
      ${photo}
      <div class="setup-info">
        <div class="setup-row"><span>Бюджет:</span> ${priceHTML(setup.budget, true)}</div>
        <div class="setup-row"><span>Колір:</span> <i class="color-dot" style="background:${color.css}"></i> ${escapeHTML(color.name)}</div>
        <div class="setup-row"><span>Пріоритети:</span><div class="chip-list">${chips || "—"}</div></div>
        ${compRow}
        ${promoRow}
        ${comment}
      </div>
    </div>`;
}

// Збільшення фото по кліку (модальне вікно)
function bindPhotoZoom(container, modal, bigImage) {
  container.addEventListener("click", e => {
    const img = e.target.closest("img.setup-photo");
    if (!img) return;
    bigImage.src = img.src;
    modal.hidden = false;
  });
  modal.addEventListener("click", () => { modal.hidden = true; });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") modal.hidden = true;
  });
}