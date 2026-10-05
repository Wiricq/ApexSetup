// ===== Завантажувач товарів =====
// Підключає файл з опублікованими товарами, а потім основний код каталогу.
// Завдяки цьому в HTML-сторінках нічого міняти не потрібно.
// Порядок важливий: спочатку дані (products-data.js), потім логіка (products-core.js).
document.write('<script src="js/products-data.js"><\/script>');
document.write('<script src="js/products-core.js"><\/script>');