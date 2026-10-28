// ===== Головна: блок «Нові товари» =====
// Показує 5 товарів, які найчастіше додавали в кошик.
// Підключати ПІСЛЯ products.js і cart.js (використовує PRODUCTS, getStats, createProductCard).
const POPULAR_COUNT = 5;

function getPopularProducts() {
  const stats = getStats();   // { id: кількість_додавань_у_кошик } з cart.js

  return PRODUCTS
    .map((p, index) => ({ p, index, count: Number(stats[String(p.id)]) || 0 }))
    .filter(item => stockLimit(item.p) > 0)                  // тільки ті, що є в наявності
    .sort((a, b) => b.count - a.count || a.index - b.index)  // більше додавань — вище; при рівності — порядок каталогу
    .slice(0, POPULAR_COUNT)
    .map(item => item.p);
}

function renderPopular() {
  const section = document.getElementById("popular-section");
  const box = document.getElementById("popular-products");
  if (!section || !box) return;

  const items = getPopularProducts();
  section.hidden = items.length === 0;   // немає товарів — блок не показуємо
  box.innerHTML = items.map(p => createProductCard(p)).join("");
}

renderPopular();