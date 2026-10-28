/* =====================================================
   APEXSETUP: скелетони (заготовки замість порожнього екрана)
   Підключати ДО скриптів сторінки (орендерів), потрібен css/skeleton.css.
   Використання:
     box.innerHTML = Skeleton.orders(3);     // картки замовлень
     grid.innerHTML = Skeleton.products(8);  // картки товарів для каталогу
     box.innerHTML = Skeleton.lines(4);      // кілька рядків тексту
   Потім, коли дані готові, просто перезапишіть innerHTML справжнім вмістом.
   ===================================================== */
(function () {
  "use strict";

  const repeat = (n, html) => Array.from({ length: n }, () => html).join("");

  const orderCard = `
    <article class="order-card sk-card" aria-hidden="true">
      <div class="sk-row"><span class="skeleton sk-title"></span><span class="skeleton sk-pill"></span></div>
      <div class="skeleton sk-steps"></div>
      <div class="sk-cols">
        <div><span class="skeleton sk-line w80"></span><span class="skeleton sk-line w60"></span><span class="skeleton sk-line w70"></span></div>
        <div><span class="skeleton sk-line w90"></span><span class="skeleton sk-line w50"></span></div>
      </div>
    </article>`;

  const productCard = `
    <div class="product-card sk-product sk-card" aria-hidden="true">
      <span class="skeleton sk-img"></span>
      <div class="sk-body">
        <span class="skeleton sk-line w50"></span>
        <span class="skeleton sk-line w90"></span>
        <span class="skeleton sk-line w70"></span>
      </div>
    </div>`;

  window.Skeleton = {
    orders:   (n = 3) => repeat(n, orderCard),
    products: (n = 8) => repeat(n, productCard),
    lines:    (n = 3) => Array.from({ length: n }, (_, i) =>
      `<span class="skeleton sk-line ${["w90", "w70", "w80", "w50"][i % 4]}" aria-hidden="true"></span>`).join("")
  };
})();