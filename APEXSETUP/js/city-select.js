/* =====================================================
   APEXSETUP: випадаючий список міст з пошуком
   Як працює:
   1) Знаходить у формі замовлення поле міста (CITY_FIELD_SELECTOR нижче).
      Це може бути <input> або <select>.
   2) Замінює його на красивий список із рядком пошуку.
   3) Обране місто лежить у прихованому полі з тим самим name="city",
      тому cart.js (form.elements.namedItem("city")) працює без змін.
   ===================================================== */

// Поле міста у формі замовлення (cart.html: <input name="city">)
const CITY_FIELD_SELECTOR = '#order-form [name="city"]';

// Міста України (перші — найбільші, далі за алфавітом)
const DEFAULT_CITIES = [
  "Київ", "Харків", "Дніпро", "Запоріжжя", "Одеса", "Львів", "Кривий Ріг",
  "Миколаїв", "Чернігів", "Вінниця", "Полтава", "Черкаси", "Суми", "Хмельницький",
  "Житомир", "Рівне", "Івано-Франківськ", "Тернопіль", "Луцьк", "Ужгород",
  "Чернівці", "Кропивницький", "Херсон", "Маріуполь", "Луганськ", "Донецьк", "Сімферополь",
  "Алчевськ", "Бердичів", "Бердянськ", "Біла Церква", "Бровари", "Бориспіль", "Буча",
  "Вараш", "Васильків", "Вишгород", "Вознесенськ", "Гайсин", "Дрогобич", "Дубно",
  "Енергодар", "Ірпінь", "Ізмаїл", "Кам'янець-Подільський", "Кам'янське", "Ковель",
  "Коломия", "Конотоп", "Коростень", "Костопіль", "Краматорськ", "Кременчук",
  "Лисичанськ", "Лубни", "Мелітополь", "Мукачево", "Нікополь", "Новоград-Волинський",
  "Нова Каховка", "Новомосковськ", "Обухів", "Олександрія", "Охтирка", "Павлоград",
  "Первомайськ", "Переяслав", "Подільськ", "Прилуки", "Ромни", "Світловодськ",
  "Севастополь", "Слов'янськ", "Сміла", "Стрий", "Трускавець", "Умань", "Фастів",
  "Хуст", "Червоноград", "Чорноморськ", "Шостка", "Южноукраїнськ", "Яворів"
];

// Прибираємо регістр та апострофи, щоб «Кам'янське» знаходилось і за «камянське»
function norm(text) {
  return String(text).toLowerCase().replace(/['’ʼ`]/g, "").replace(/ё/g, "е").trim();
}

// Підсвітка введеного фрагмента в назві міста
function highlight(city, query) {
  const q = norm(query);
  if (!q) return city;
  // шукаємо позицію у нормалізованому рядку з урахуванням прибраних апострофів
  let plain = "", map = [];
  for (let i = 0; i < city.length; i++) {
    if (!/['’ʼ`]/.test(city[i])) { plain += city[i].toLowerCase(); map.push(i); }
  }
  const at = plain.indexOf(q);
  if (at === -1) return city;
  const start = map[at], end = map[at + q.length - 1] + 1;
  return city.slice(0, start) + "<mark>" + city.slice(start, end) + "</mark>" + city.slice(end);
}

function buildCitySelect(field) {
  // 1) беремо список міст: з <select>, якщо там вже є опції, інакше стандартний
  let cities = DEFAULT_CITIES;
  if (field.tagName === "SELECT") {
    const fromSelect = [...field.options].map(o => o.textContent.trim()).filter((t, i) => t && field.options[i].value !== "");
    if (fromSelect.length > 1) cities = fromSelect;
  }

  const wasRequired = field.required;
  const startValue = field.value || "";
  // cart.js міг уже заблокувати поле (місто береться з профілю)
  const startLocked = field.readOnly || field.disabled;

  // 2) приховане поле, яке читає ваш код замовлення
  const hidden = document.createElement("input");
  hidden.type = "hidden";
  if (field.id) hidden.id = field.id;
  hidden.name = field.name || field.id;
  hidden.value = startValue;

  // 3) розмітка компонента
  const wrap = document.createElement("div");
  wrap.className = "city-select";
  wrap.innerHTML = `
    <button type="button" class="city-trigger" aria-haspopup="listbox" aria-expanded="false">
      <span class="city-current"></span>
      <svg class="city-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
    </button>
    <div class="city-panel" hidden>
      <input type="text" class="city-search" placeholder="Введіть назву міста" autocomplete="off" aria-label="Пошук міста">
      <ul class="city-list" role="listbox"></ul>
    </div>`;
  wrap.appendChild(hidden);

  field.replaceWith(wrap);

  const trigger = wrap.querySelector(".city-trigger");
  const current = wrap.querySelector(".city-current");
  const panel = wrap.querySelector(".city-panel");
  const search = wrap.querySelector(".city-search");
  const list = wrap.querySelector(".city-list");
  let shown = [];      // міста, що зараз у списку
  let active = -1;     // підсвічений пункт (для стрілок)

  // cart.js іноді сам ставить field.value = "..." (місто з профілю).
  // Перехоплюємо це, щоб напис на кнопці завжди збігався зі значенням.
  const nativeValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  Object.defineProperty(hidden, "value", {
    configurable: true,
    get() { return nativeValue.get.call(this); },
    set(v) { nativeValue.set.call(this, v); setLabel(); }
  });

  // Те саме для readOnly/disabled: блокуємо кнопку, коли місто береться з профілю
  function syncLocked() {
    const locked = hidden.hasAttribute("readonly") || hidden.hasAttribute("disabled");
    wrap.classList.toggle("locked", locked);
    trigger.disabled = locked;
    if (locked) close();
  }
  new MutationObserver(syncLocked).observe(hidden, { attributes: true, attributeFilter: ["readonly", "disabled"] });
  if (startLocked) hidden.setAttribute("readonly", "");

  function setLabel() {
    current.textContent = hidden.value || "Оберіть місто";
    current.classList.toggle("placeholder", !hidden.value);
  }

  function render() {
    const q = norm(search.value);
    // спочатку міста, що починаються з введеного, потім ті, що містять його
    const starts = [], contains = [];
    cities.forEach(c => {
      const n = norm(c);
      if (!q) starts.push(c);
      else if (n.startsWith(q)) starts.push(c);
      else if (n.includes(q)) contains.push(c);
    });
    shown = starts.concat(contains);
    active = shown.length && q ? 0 : -1;

    if (!shown.length) {
      // Малого міста чи села може не бути у списку: даємо змогу ввести його вручну
      const typed = search.value.trim();
      const safe = typed.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
      list.innerHTML = typed.length >= 2
        ? `<li class="city-empty">Такого міста немає у списку</li><li role="option" class="city-option city-custom" data-city="${safe}">Використати «${safe}»</li>`
        : "";
      return;
    }
    list.innerHTML = shown.map((c, i) =>
      `<li role="option" data-city="${c.replace(/"/g, "&quot;")}" class="city-option${c === hidden.value ? " selected" : ""}${i === active ? " active" : ""}">${highlight(c, search.value)}</li>`
    ).join("");
  }

  function setActive(i) {
    const items = list.querySelectorAll(".city-option");
    if (!items.length) return;
    active = (i + items.length) % items.length;
    items.forEach((el, k) => el.classList.toggle("active", k === active));
    items[active].scrollIntoView({ block: "nearest" });
  }

  function open() {
    panel.hidden = false;
    wrap.classList.add("open");
    trigger.setAttribute("aria-expanded", "true");
    search.value = "";
    render();
    search.focus();
  }
  function close() {
    panel.hidden = true;
    wrap.classList.remove("open");
    trigger.setAttribute("aria-expanded", "false");
  }
  function choose(city) {
    hidden.value = city;
    wrap.classList.remove("invalid");
    setLabel();
    close();
    trigger.focus();
    hidden.dispatchEvent(new Event("input", { bubbles: true }));
    hidden.dispatchEvent(new Event("change", { bubbles: true }));
  }

  trigger.addEventListener("click", () => (panel.hidden ? open() : close()));
  search.addEventListener("input", render);
  list.addEventListener("click", e => {
    const li = e.target.closest(".city-option");
    if (li) choose(li.dataset.city);
  });
  // Список лежить усередині <label>: без цього клік по ньому "пробиває" label
  // і повторно натискає кнопку, тож список одразу відкривався б знову.
  panel.addEventListener("click", e => { if (e.target !== search) e.preventDefault(); });
  search.addEventListener("keydown", e => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive(active + 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive(active - 1); }
    else if (e.key === "Enter") {
      e.preventDefault();               // щоб Enter не відправив форму
      if (shown[active]) choose(shown[active]);
    } else if (e.key === "Escape") { close(); trigger.focus(); }
  });
  document.addEventListener("click", e => { if (!wrap.contains(e.target)) close(); });

  // Перевірка «обов'язкове поле» під час відправки форми
  const form = wrap.closest("form");
  if (form && wasRequired) {
    form.addEventListener("submit", e => {
      if (!hidden.value) {
        e.preventDefault();
        wrap.classList.add("invalid");
        trigger.focus();
      }
    });
  }

  setLabel();
  syncLocked();
}

// Запуск: одразу, коли поле з'явилося на сторінці (навіть якщо кошик малюється скриптом)
function initCitySelect() {
  const field = document.querySelector(CITY_FIELD_SELECTOR);
  if (!field || field.closest(".city-select")) return false;
  buildCitySelect(field);
  return true;
}

document.addEventListener("DOMContentLoaded", () => {
  if (initCitySelect()) return;
  const observer = new MutationObserver(() => { if (initCitySelect()) observer.disconnect(); });
  observer.observe(document.body, { childList: true, subtree: true });
});