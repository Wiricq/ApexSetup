// ===== Доступ адміністратора + пункти меню профілю =====
// Адмін-сторінки відкриваються ТІЛЬКИ для акаунта з поштою зі списку нижче.
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

// Кількість непрочитаних повідомлень (лише локальний режим «Репортів»)
function apexUnreadReports() {
  try {
    const list = JSON.parse(localStorage.getItem("apex_reports_v1"));
    return Array.isArray(list) ? list.filter(r => r && !r.read).length : 0;
  } catch (e) {
    return 0;
  }
}

// Кількість нових заявок «Сетап мрії»
function apexNewSetups() {
  try {
    const list = JSON.parse(localStorage.getItem("apex_setups_v1"));
    return Array.isArray(list) ? list.filter(s => s && s.status === "new").length : 0;
  } catch (e) {
    return 0;
  }
}

// На сторінці акаунта додаємо в меню профілю:
//  • «Мої замовлення» та «Сетап мрії» — для будь-якого користувача;
//  • «Адмін-панель», «Заявки «Сетап мрії»» і «Репорти» — тільки для адміна.
(function () {
  const profile = document.getElementById("view-profile");
  if (!profile) return; // ми не на сторінці акаунта

  function makeLink(id, href, html) {
    const link = document.createElement("a");
    link.id = id;
    link.href = href;
    link.className = "settings-item";
    link.innerHTML = html;
    return link;
  }

  // Створює пункт меню, якщо його ще немає (place — куди його вставити)
  function ensureLink(id, href, html, place) {
    let link = document.getElementById(id);
    if (!link) {
      link = makeLink(id, href, html);
      place(link);
    }
    return link;
  }

  // Червоний лічильник біля пункту меню
  function setBadge(link, count) {
    let badge = link.querySelector(".menu-badge");
    if (count > 0) {
      if (!badge) {
        badge = document.createElement("span");
        badge.className = "menu-badge";
        badge.style.cssText =
          "margin-left:auto;background:#e11d48;color:#fff;border-radius:20px;" +
          "padding:2px 10px;font-size:.8rem;font-weight:700";
        link.appendChild(badge);
      }
      badge.textContent = count;
    } else if (badge) {
      badge.remove();
    }
  }

  function syncProfileLinks() {
    const menu = profile.querySelector(".settings-menu");
    if (!menu) return;

    // Для всіх, хто увійшов
    const ordersLink = ensureLink("orders-link", "orders.html", "<span>📦</span> Мої замовлення",
      l => menu.insertBefore(l, menu.firstChild));
    ensureLink("dream-link", "dream-setup.html", "<span>🎮</span> Сетап мрії",
      l => ordersLink.after(l));

    // Для не-адміна прибираємо адмін-пункти
    if (!apexIsAdmin()) {
      ["admin-link", "setups-admin-link", "reports-link"].forEach(id => {
        const link = document.getElementById(id);
        if (link) link.remove();
      });
      return;
    }

    // Для адміна: Адмін-панель → Заявки «Сетап мрії» → Репорти
    const adminLink = ensureLink("admin-link", "admin.html", "<span>🛠</span> Адмін-панель",
      l => menu.insertBefore(l, menu.firstChild));
    const setupsLink = ensureLink("setups-admin-link", "admin-setups.html", "<span>🗂</span> Заявки «Сетап мрії»",
      l => adminLink.after(l));
    const reportsLink = ensureLink("reports-link", "reports.html", "<span>📨</span> Репорти",
      l => setupsLink.after(l));

    setBadge(setupsLink, apexNewSetups());
    setBadge(reportsLink, apexUnreadReports());
  }

  syncProfileLinks();
  window.addEventListener("storage", syncProfileLinks);
  // профіль показується/ховається — перевіряємо при кожній зміні
  new MutationObserver(syncProfileLinks).observe(profile, { attributes: true, attributeFilter: ["hidden"] });
})();