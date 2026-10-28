// ===== Сторінка «Обране» =====
// Підключати ПІСЛЯ products.js, cart.js (там логіка обраного) і auth.js.
(function () {
  "use strict";

  const grid = document.getElementById("wish-products");
  const toolbar = document.getElementById("wish-toolbar");
  const summary = document.getElementById("wish-summary");
  const emptyBox = document.getElementById("wish-empty");
  if (!grid || typeof getWishlist !== "function") return;

  // Слово «товар» у правильній формі
  function plural(n) {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return "товар";
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return "товари";
    return "товарів";
  }

  function render() {
    // нові — зверху; товари, яких уже немає в каталозі, пропускаємо
    const items = getWishlist()
      .slice()
      .reverse()
      .map(id => getProductById(id))
      .filter(Boolean);

    grid.innerHTML = items.map(p => createProductCard(p)).join("");
    toolbar.hidden = items.length === 0;
    emptyBox.hidden = items.length > 0;
    summary.textContent = "В обраному: " + items.length + " " + plural(items.length);
  }

  document.getElementById("wish-clear").addEventListener("click", () => {
    if (!confirm("Очистити все обране?")) return;
    clearWishlist();
    showToast("Обране очищено");
  });

  // Прибрали товар сердечком (тут чи в іншій вкладці) — перемальовуємо список
  window.addEventListener("wishlist:change", () => {
    render();
    syncWishlistUI();
  });

  render();
})();