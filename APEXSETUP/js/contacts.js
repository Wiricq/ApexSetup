// ===== Форма «Напишіть нам» =====
// Повідомлення потрапляють на сторінку «Репорти» (бачить лише адміністратор).
(function () {
  "use strict";

  const COOLDOWN_MS = 15000; // пауза між відправками

  const form = document.getElementById("contact-form");
  if (!form) return;
  const success = document.getElementById("contact-success");
  let lastSent = 0;
  let successTimer;

  function toast(text, isError) {
    if (typeof showToast === "function") showToast(text, isError); // з cart.js
  }

  form.addEventListener("submit", async function (e) {
    e.preventDefault();

    const field = name => form.elements.namedItem(name).value.trim();
    const name = field("name");
    const email = field("email");
    const message = field("message");

    if (!name || !email || !message) {
      toast("Заповніть усі поля.", true);
      return;
    }
    if (name.length > 60 || message.length > 2000) {
      toast("Занадто довге ім'я або повідомлення.", true);
      return;
    }
    if (Date.now() - lastSent < COOLDOWN_MS) {
      toast("Зачекайте кілька секунд перед наступним повідомленням.", true);
      return;
    }

    const report = {
      id: "r" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      createdAt: Date.now(),
      name: name,
      email: email,
      message: message,
      read: false,
      account: typeof getLoggedInAccount === "function" ? getLoggedInAccount() : null // з cart.js
    };

    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      await ReportsAPI.send(report);
      lastSent = Date.now();
      form.reset();
      success.hidden = false;
      clearTimeout(successTimer);
      successTimer = setTimeout(() => { success.hidden = true; }, 6000);
    } catch (err) {
      console.error("Не вдалося надіслати повідомлення:", err);
      toast("Не вдалося надіслати повідомлення. Спробуйте пізніше.", true);
    } finally {
      button.disabled = false;
    }
  });
})();