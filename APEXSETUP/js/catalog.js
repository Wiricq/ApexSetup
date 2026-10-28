// ===== Каталог: категорії, пошук, ціна, наявність, знижки, характеристики, сортування =====
const productsBox = document.getElementById("products");
const filtersBox = document.getElementById("filters");
const searchInput = document.getElementById("search");
const emptyMsg = document.getElementById("empty");             // «нічого не знайдено»
const catalogTools = document.getElementById("catalog-tools"); // пошук + фільтри
const emptyState = document.getElementById("empty-state");     // «товарів поки немає»

const priceMinInput = document.getElementById("price-min");
const priceMaxInput = document.getElementById("price-max");
const sortSelect = document.getElementById("sort-select");
const onlyStockBox = document.getElementById("only-stock");
const onlySaleBox = document.getElementById("only-sale");
const attrBox = document.getElementById("attr-filters");
const resultsCount = document.getElementById("results-count");
const filtersToggle = document.getElementById("filters-toggle");
const filtersPanel = document.getElementById("filter-panel");
const filtersBadge = document.getElementById("filters-badge");
const filtersArrow = document.getElementById("filters-arrow");

// Невеликі стилі для кнопки фільтрів (щоб не залежати від css)
(function addFilterToggleStyles() {
  const style = document.createElement("style");
  style.textContent =
    ".filters-toggle-row{margin:12px 0}" +
    ".filter-panel[hidden]{display:none!important}" +
    ".filters-badge{display:inline-block;min-width:20px;padding:0 6px;margin-left:4px;border-radius:999px;" +
      "background:#ff3b4a;color:#fff;font-size:.75rem;line-height:20px;text-align:center}";
  document.head.appendChild(style);
})();

let activeCategory = "all";
let searchText = "";
let attrFilters = {};   // { ключ_характеристики: Set(вибраних значень) }

// Якщо перейшли з головної (catalog.html?cat=mice) — одразу вибираємо категорію
const urlCat = new URLSearchParams(location.search).get("cat");
if (urlCat && CATEGORY_NAMES[urlCat]) activeCategory = urlCat;

/* ---------- Категорії ---------- */
function renderFilters() {
  let html = `<button class="filter-btn" data-cat="all">Всі</button>`;
  for (const key in CATEGORY_NAMES) {
    html += `<button class="filter-btn" data-cat="${key}">${CATEGORY_NAMES[key]}</button>`;
  }
  filtersBox.innerHTML = html;
  highlightFilter();
}

function highlightFilter() {
  filtersBox.querySelectorAll(".filter-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.cat === activeCategory);
  });
}

/* ---------- Характеристики (механічна / мембранна тощо) ---------- */
function groupVisible(def) {
  if (!def.showIf) return true;
  return Object.keys(def.showIf).every(k => {
    const chosen = attrFilters[k];
    if (!chosen || chosen.size === 0) return true;
    return [...chosen].some(v => def.showIf[k].includes(v));
  });
}

function renderAttrFilters() {
  const defs = activeCategory !== "all" ? CATEGORY_ATTRS[activeCategory] : null;

  if (!defs) {
    attrBox.hidden = false;
    attrBox.innerHTML =
      '<p class="fp-note">Оберіть категорію, щоб відфільтрувати за характеристиками ' +
      '(наприклад, механічні, мембранні чи магнітні клавіатури).</p>';
    return;
  }

  attrBox.hidden = false;
  attrBox.innerHTML = Object.keys(defs).filter(key => groupVisible(defs[key])).map(key => {
    const def = defs[key];
    const chips = Object.keys(def.options).map(value => {
      const on = attrFilters[key] && attrFilters[key].has(value);
      return `<button type="button" class="fp-chip${on ? " active" : ""}" ` +
        `data-attr="${key}" data-value="${value}" aria-pressed="${on ? "true" : "false"}">` +
        `${escapeHTML(def.options[value])}</button>`;
    }).join("");
    return `<div class="fp-group"><span class="fp-title">${escapeHTML(def.label)}</span>` +
      `<div class="fp-chips">${chips}</div></div>`;
  }).join("");
}

/* ---------- Підказки в полях ціни: мінімум і максимум у вибраній категорії ---------- */
function updatePriceHints() {
  const list = PRODUCTS.filter(p => activeCategory === "all" || p.category === activeCategory);
  if (list.length === 0) {
    priceMinInput.placeholder = "від";
    priceMaxInput.placeholder = "до";
    return;
  }
  const prices = list.map(p => p.price);
  priceMinInput.placeholder = "від " + Math.min(...prices);
  priceMaxInput.placeholder = "до " + Math.max(...prices);
}

/* ---------- Фільтрація й сортування ---------- */
function readPrice(input) {
  const raw = input.value.trim();
  if (raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function matchesFilters(p, query, min, max) {
  if (activeCategory !== "all" && p.category !== activeCategory) return false;
  if (!String(p.name).toLowerCase().includes(query)) return false;
  if (min !== null && p.price < min) return false;
  if (max !== null && p.price > max) return false;
  if (onlyStockBox.checked && p.stock === 0) return false;
  if (onlySaleBox.checked && !(p.discount > 0)) return false;

  if (activeCategory !== "all") {
    for (const key in attrFilters) {
      const chosen = attrFilters[key];
      if (chosen.size > 0 && !chosen.has(p.attrs && p.attrs[key])) return false;
    }
  }
  return true;
}

function sortProducts(list) {
  const mode = sortSelect.value;
  if (mode === "default") return list;

  const stats = typeof getStats === "function" ? getStats() : {};
  const sorted = list.slice();
  switch (mode) {
    case "popular":
      sorted.sort((a, b) => (Number(stats[String(b.id)]) || 0) - (Number(stats[String(a.id)]) || 0));
      break;
    case "price-asc":
      sorted.sort((a, b) => a.price - b.price);
      break;
    case "price-desc":
      sorted.sort((a, b) => b.price - a.price);
      break;
    case "discount":
      sorted.sort((a, b) => (b.discount || 0) - (a.discount || 0));
      break;
    case "rating":
      sorted.sort((a, b) => (b.rating || 0) - (a.rating || 0));
      break;
  }
  return sorted;
}

function renderProducts() {
  if (PRODUCTS.length === 0) {
    catalogTools.hidden = true;
    productsBox.innerHTML = "";
    emptyMsg.hidden = true;
    emptyState.hidden = false;
    return;
  }
  catalogTools.hidden = false;
  emptyState.hidden = true;

  const query = searchText.trim().toLowerCase();
  let min = readPrice(priceMinInput);
  let max = readPrice(priceMaxInput);
  if (min !== null && max !== null && min > max) { const t = min; min = max; max = t; }

  const filtered = sortProducts(PRODUCTS.filter(p => matchesFilters(p, query, min, max)));

  productsBox.innerHTML = filtered.map(p => createProductCard(p)).join("");
  emptyMsg.hidden = filtered.length > 0;
  resultsCount.textContent = "Знайдено: " + filtered.length + " з " + PRODUCTS.length;
  updateFiltersBadge();
}

/* ---------- Відкриття/закриття панелі фільтрів і лічильник активних фільтрів ---------- */
function setFiltersOpen(open) {
  filtersPanel.hidden = !open;
  filtersToggle.setAttribute("aria-expanded", open ? "true" : "false");
  filtersArrow.textContent = open ? "▴" : "▾";
}

function updateFiltersBadge() {
  let count = 0;
  if (readPrice(priceMinInput) !== null) count++;
  if (readPrice(priceMaxInput) !== null) count++;
  if (sortSelect.value !== "default") count++;
  if (onlyStockBox.checked) count++;
  if (onlySaleBox.checked) count++;
  Object.keys(attrFilters).forEach(key => { count += attrFilters[key].size; });
  filtersBadge.textContent = count;
  filtersBadge.hidden = count === 0;
}

filtersToggle.addEventListener("click", () => setFiltersOpen(filtersPanel.hidden));

/* ---------- Події ---------- */
filtersBox.addEventListener("click", e => {
  const btn = e.target.closest(".filter-btn");
  if (!btn) return;
  activeCategory = btn.dataset.cat;
  attrFilters = {};
  highlightFilter();
  renderAttrFilters();
  updatePriceHints();
  renderProducts();
});

attrBox.addEventListener("click", e => {
  const chip = e.target.closest(".fp-chip");
  if (!chip) return;
  const key = chip.dataset.attr;
  const value = chip.dataset.value;
  if (!attrFilters[key]) attrFilters[key] = new Set();
  if (attrFilters[key].has(value)) attrFilters[key].delete(value);
  else attrFilters[key].add(value);
  const defs = CATEGORY_ATTRS[activeCategory] || {};
  Object.keys(attrFilters).forEach(k => { if (defs[k] && !groupVisible(defs[k])) delete attrFilters[k]; });
  renderAttrFilters();
  renderProducts();
});

searchInput.addEventListener("input", () => {
  searchText = searchInput.value;
  renderProducts();
});

[priceMinInput, priceMaxInput].forEach(input => input.addEventListener("input", renderProducts));
[sortSelect, onlyStockBox, onlySaleBox].forEach(control => control.addEventListener("change", renderProducts));

document.getElementById("filters-reset").addEventListener("click", () => {
  priceMinInput.value = "";
  priceMaxInput.value = "";
  sortSelect.value = "default";
  onlyStockBox.checked = false;
  onlySaleBox.checked = false;
  attrFilters = {};
  renderAttrFilters();
  renderProducts();
});

renderFilters();
renderAttrFilters();
updatePriceHints();
renderProducts();

// Товари оновилися зі спільної бази — перемальовуємо каталог
window.addEventListener("products:loaded", () => {
  renderFilters();
  renderAttrFilters();
  updatePriceHints();
  renderProducts();
});