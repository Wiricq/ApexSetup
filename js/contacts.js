// ===== Форма зворотного зв'язку (імітація, сервера немає) =====
const contactForm = document.getElementById("contact-form");
const contactSuccess = document.getElementById("contact-success");

if (contactForm) {
  contactForm.addEventListener("submit", function (e) {
    e.preventDefault();          // не перезавантажувати сторінку
    contactForm.reset();         // очистити поля
    contactSuccess.hidden = false;
    setTimeout(() => { contactSuccess.hidden = true; }, 5000);
  });
}