// ===== Доступ адміністратора =====
// Адмін-панель відкривається ТІЛЬКИ для акаунта з поштою зі списку нижче.
// Пошта підтверджується кодом, який приходить на неї при реєстрації/вході.
const ADMIN_EMAILS = ["apexsetupix@gmail.com"];

// Поточний користувач, який увійшов (або null)
function apexCurrentUser() {
  try {
    const session = JSON.parse(localStorage.getItem("apex_session_v1"));
    if (!session || !session.email) return null;
    const users = JSON.parse(localStorage.getItem("apex_users_v1")) || {};
    const user = users[session.email];
    return user ? { email: String(user.email).toLowerCase(), nick: user.nick } : null;
  } catch (e) {
    return null;
  }
}

function apexAdminConfigured() {
  return ADMIN_EMAILS.some(e => String(e).trim() !== "");
}

// Чи є поточний користувач адміністратором
function apexIsAdmin() {
  const user = apexCurrentUser();
  if (!user) return false;
  return ADMIN_EMAILS.map(e => String(e).trim().toLowerCase()).includes(user.email);
}

// На сторінці акаунта додаємо в меню профілю кнопку «Адмін-панель» (тільки для адміна)
(function () {
  const profile = document.getElementById("view-profile");
  if (!profile) return; // ми не на сторінці акаунта

  function syncAdminLink() {
    const menu = profile.querySelector(".settings-menu");
    if (!menu) return;
    let link = document.getElementById("admin-link");
    if (apexIsAdmin()) {
      if (!link) {
        link = document.createElement("a");
        link.id = "admin-link";
        link.href = "admin.html";
        link.className = "settings-item";
        link.innerHTML = "<span>🛠</span> Адмін-панель";
        menu.insertBefore(link, menu.firstChild);
      }
    } else if (link) {
      link.remove();
    }
  }

  syncAdminLink();
  window.addEventListener("storage", syncAdminLink);
  // профіль показується/ховається — перевіряємо при кожній зміні
  new MutationObserver(syncAdminLink).observe(profile, { attributes: true, attributeFilter: ["hidden"] });
})();