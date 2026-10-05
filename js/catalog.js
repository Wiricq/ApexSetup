// ===== Каталог: фільтрація за категорією + пошук =====
const productsBox = document.getElementById("products");
const filtersBox = document.getElementById("filters");
const searchInput = document.getElementById("search");
const emptyMsg = document.getElementById("empty");           // «нічого не знайдено»
const catalogTools = document.getElementById("catalog-tools"); // пошук + фільтри
const emptyState = document.getElementById("empty-state");   // «товарів поки немає»

let activeCategory = "all";
let searchText = "";

// Якщо перейшли з головної (catalog.html?cat=mice) — одразу вибираємо категорію
const urlCat = new URLSearchParams(location.search).get("cat");
if (urlCat && CATEGORY_NAMES[urlCat]) activeCategory = urlCat;

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

function renderProducts() {
  // Якщо товарів ще немає — показуємо красиве повідомлення
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
  const filtered = PRODUCTS.filter(p => {
    const matchCategory = activeCategory === "all" || p.category === activeCategory;
    const matchSearch = String(p.name).toLowerCase().includes(query);
    return matchCategory && matchSearch;
  });

  productsBox.innerHTML = filtered.map(p => createProductCard(p)).join("");
  emptyMsg.hidden = filtered.length > 0;
}

filtersBox.addEventListener("click", e => {
  const btn = e.target.closest(".filter-btn");
  if (!btn) return;
  activeCategory = btn.dataset.cat;
  highlightFilter();
  renderProducts();
});

searchInput.addEventListener("input", () => {
  searchText = searchInput.value;
  renderProducts();
});

renderFilters();
renderProducts();