// ===== Рекомендації: топ-5 товарів за кількістю додавань у кошик =====
const popularBox = document.getElementById("popular");
const popularHead = document.getElementById("popular-head");
const popularEmpty = document.getElementById("popular-empty");

// 5 найпопулярніших товарів (при рівності — за рейтингом)
function getTopProducts() {
  const stats = getStats(); // { id: кількість_додавань }
  return [...PRODUCTS]
    .sort((a, b) => {
      const diff = (stats[String(b.id)] || 0) - (stats[String(a.id)] || 0);
      return diff !== 0 ? diff : (Number(b.rating) || 0) - (Number(a.rating) || 0);
    })
    .slice(0, 5);
}

// Викликається при завантаженні та з cart.js після додавання товару
function renderPopular() {
  const hasProducts = PRODUCTS.length > 0;
  popularHead.hidden = !hasProducts;
  popularEmpty.hidden = hasProducts;

  if (!hasProducts) {
    popularBox.innerHTML = "";
    return;
  }

  const stats = getStats();
  popularBox.innerHTML = getTopProducts().map((p, index) => {
    const count = stats[String(p.id)] || 0;
    return createProductCard(p, `#${index + 1} · додано ${count} р.`);
  }).join("");
}

renderPopular();