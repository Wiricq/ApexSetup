// ===== Налаштування профілю: нік, телефон, пароль, пошта, видалення акаунта =====
// Підключати ПІСЛЯ products.js, cart.js, auth.js та js/profile/phone-validation.js.
(function () {
  "use strict";

  window.__settingsLoaded = true;                   // для діагностики на profile-settings.html

  const A = window.ApexAuth;                       // спільні функції з auth.js
  const card = document.getElementById("settings-card");
  if (!card) return;

  // Якщо js/auth.js старої версії (без window.ApexAuth) — показуємо підказку замість порожньої картки
  if (!A) {
    card.innerHTML = '<h2>Потрібно оновити js/auth.js</h2>' +
      '<p class="muted">Сторінка не знайшла спільних функцій акаунта. Замініть файл js/auth.js на нову версію й натисніть Ctrl+F5.</p>';
    return;
  }

  const el = id => document.getElementById(id);
  const SCREENS = ["guard", "settings", "code"];
  const TABS = ["nick", "phone", "location", "password", "email", "delete"];
  const ERROR_PREFIXES = ["nick", "phone", "location", "password", "email", "delete", "code"];

  let currentTab = "nick";

  // Список областей беремо з cart.js (той самий, що й у формі замовлення)
  const REGION_LIST = typeof REGIONS !== "undefined" ? REGIONS : [];
  const CITY_RE = /^\p{L}[\p{L}\s.'’ʼ-]{1,49}$/u;
  (function fillRegions() {
    const select = el("location-form").elements.region;
    REGION_LIST.forEach(r => {
      const opt = document.createElement("option");
      opt.value = r;
      opt.textContent = r;
      select.appendChild(opt);
    });
  })();

  /* ---------- Екрани та вкладки ---------- */
  function showScreen(name) {
    SCREENS.forEach(s => { el("view-" + s).hidden = s !== name; });
  }

  function showError(prefix, message) {
    const box = el(prefix + "-error");
    box.textContent = message;
    box.hidden = false;
  }

  function clearErrors() {
    ERROR_PREFIXES.forEach(prefix => {
      const box = el(prefix + "-error");
      if (box) { box.textContent = ""; box.hidden = true; }
    });
  }

  function showTab(name) {
    if (!TABS.includes(name)) name = "nick";
    currentTab = name;
    clearErrors();

    card.querySelectorAll(".settings-tab").forEach(btn => {
      const on = btn.dataset.tab === name;
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
    TABS.forEach(t => { el("tab-" + t).hidden = t !== name; });

    // форми завжди відкриваються чистими; паролі знову приховані
    el(name + "-form").reset();
    card.querySelectorAll(".pass-wrap input").forEach(input => { input.type = "password"; });

    const session = A.getSession();
    if (session && name === "nick") el("nick-form").elements.nick.value = session.nick;
    if (session && name === "phone") el("phone-form").elements.phone.value = session.phone || "";
    if (session && name === "location") {
      const lf = el("location-form").elements;
      lf.region.value = REGION_LIST.includes(session.region) ? session.region : "";
      lf.city.value = session.city || "";
    }

    if (history.replaceState) history.replaceState(null, "", "#" + name);
  }

  function renderSummary(session) {
    const parts = [session.nick, session.email];
    if (session.phone) parts.push("📞 " + session.phone);
    if (session.city || session.region) {
      parts.push("📍 " + [session.city, session.region].filter(Boolean).join(", "));
    }
    el("settings-summary").textContent = parts.join(" · ");
  }

  // Показує налаштування (або повідомлення «потрібен вхід»)
  function init(tab) {
    const session = A.getSession();
    if (!session) {
      showScreen("guard");
      return;
    }
    renderSummary(session);
    showScreen("settings");
    showTab(tab || location.hash.slice(1) || currentTab);
  }

  // Повертає поточного користувача або відправляє на екран «потрібен вхід»
  function requireSession() {
    const session = A.getSession();
    if (!session) {
      init();
      A.toast("Сесія завершена. Увійдіть знову.", true);
      return null;
    }
    return session;
  }

  /* ---------- Підтвердження кодом (пароль, пошта, видалення) ---------- */
  const flow = A.createCodeFlow({
    showCode: () => showScreen("code"),
    onVerified: finishVerified,
    onReset: (message, isError) => {
      init(currentTab);
      if (message) A.toast(message, isError);
    },
    onBack: type => init(type && TABS.includes(type) ? type : currentTab)
  });

  function done(message, tab) {
    flow.clear();
    A.updateHeader();
    init(tab);
    A.toast(message);
  }

  // Код підтверджено — виконуємо дію
  function finishVerified(p) {
    const session = A.getSession();
    if (!session || session.email !== p.account) {
      flow.clear();
      init();
      A.toast("Сесія завершена. Увійдіть знову.", true);
      return;
    }
    const users = A.getUsers();

    switch (p.type) {
      case "password": {
        users[p.account].salt = p.newSalt;
        users[p.account].hash = p.newHash;
        if (!A.save(A.USERS_KEY, users)) {
          flow.error("Не вдалося зберегти новий пароль: браузер блокує localStorage.");
          return;
        }
        done("🔒 Пароль успішно змінено", "password");
        return;
      }

      case "email": {
        if (users[p.email]) {
          flow.clear();
          init("email");
          A.toast("Ця пошта вже використовується іншим акаунтом.", true);
          return;
        }
        const user = users[p.account];
        delete users[p.account];
        user.email = p.email;
        users[p.email] = user;
        if (!A.save(A.USERS_KEY, users)) {
          flow.error("Не вдалося зберегти нову пошту: браузер блокує localStorage.");
          return;
        }
        A.saveSession(p.email);
        done("✉️ Пошту змінено на " + p.email, "email");
        return;
      }

      case "delete": {
        delete users[p.account];
        A.save(A.USERS_KEY, users);
        A.clearSession();
        flow.clear();
        A.updateHeader();
        showScreen("guard");
        A.toast("🗑 Акаунт видалено, пошту відв'язано від сайту");
        setTimeout(() => { location.href = "account.html"; }, 1500);
        return;
      }
    }
  }

  /* ---------- Події ---------- */
  card.addEventListener("click", e => {
    const tab = e.target.closest(".settings-tab");
    if (tab) {
      if (requireSession()) showTab(tab.dataset.tab);
      return;
    }
    const toggle = e.target.closest(".toggle-pass");
    if (toggle) {
      const input = el(toggle.dataset.target);
      input.type = input.type === "password" ? "text" : "password";
    }
  });

  // Зміна ніка (без коду)
  el("nick-form").addEventListener("submit", e => {
    e.preventDefault();
    clearErrors();
    const session = requireSession();
    if (!session) return;

    const nick = e.target.elements.nick.value.trim();
    if (!A.NICK_RE.test(nick)) {
      return showError("nick", "Нік: 3–20 символів (літери, цифри, _ . -).");
    }
    if (nick === session.nick) {
      return showError("nick", "Це ваш поточний нік.");
    }
    const users = A.getUsers();
    const taken = Object.keys(users).some(
      k => k !== session.email && users[k].nick.toLowerCase() === nick.toLowerCase()
    );
    if (taken) {
      return showError("nick", "Цей нік уже зайнятий. Оберіть інший.");
    }

    users[session.email].nick = nick;
    if (!A.save(A.USERS_KEY, users)) {
      return showError("nick", "Не вдалося зберегти: браузер блокує localStorage.");
    }
    A.updateHeader();
    init("nick");
    A.toast("✅ Нік змінено на " + nick);
  });

  // Зміна телефону (без коду; формат перевіряє validatePhone з phone-validation.js)
  el("phone-form").addEventListener("submit", e => {
    e.preventDefault();
    clearErrors();
    const session = requireSession();
    if (!session) return;

    if (typeof validatePhone !== "function") {
      return showError("phone", "Не підключено js/profile/phone-validation.js.");
    }
    const result = validatePhone(e.target.elements.phone.value);
    if (!result.ok) return showError("phone", result.error);
    if (result.phone === session.phone) {
      return showError("phone", "Це ваш поточний номер телефону.");
    }

    const users = A.getUsers();
    users[session.email].phone = result.phone;
    if (!A.save(A.USERS_KEY, users)) {
      return showError("phone", "Не вдалося зберегти: браузер блокує localStorage.");
    }
    init("phone");
    A.toast("✅ Номер телефону оновлено");
  });

  // Зміна області та міста (без коду) — підставляються в оформлення замовлення
  el("location-form").addEventListener("submit", e => {
    e.preventDefault();
    clearErrors();
    const session = requireSession();
    if (!session) return;

    const region = e.target.elements.region.value;
    const city = e.target.elements.city.value.trim().replace(/\s+/g, " ");

    if (!REGION_LIST.includes(region)) {
      return showError("location", "Оберіть область зі списку.");
    }
    if (!CITY_RE.test(city)) {
      return showError("location", "Вкажіть місто (2–50 символів: літери, пробіл, дефіс, апостроф).");
    }
    if (region === session.region && city === session.city) {
      return showError("location", "Ці дані вже збережені в профілі.");
    }

    const users = A.getUsers();
    users[session.email].region = region;
    users[session.email].city = city;
    if (!A.save(A.USERS_KEY, users)) {
      return showError("location", "Не вдалося зберегти: браузер блокує localStorage.");
    }
    init("location");
    A.toast("✅ Адресу збережено: " + city + ", " + region);
  });

  // Зміна пароля (потрібен поточний пароль + код)
  el("password-form").addEventListener("submit", async e => {
    e.preventDefault();
    clearErrors();
    const session = requireSession();
    if (!session) return;

    const f = e.target.elements;
    const current = f.current.value;
    const next = f.next.value;
    const repeat = f.repeat.value;

    if (!current || !next || !repeat) {
      return showError("password", "Заповніть усі поля.");
    }
    if (next.length < 8) {
      return showError("password", "Новий пароль має містити щонайменше 8 символів.");
    }
    if (next !== repeat) {
      return showError("password", "Нові паролі не збігаються.");
    }
    if (next === current) {
      return showError("password", "Новий пароль має відрізнятися від поточного.");
    }

    const btn = el("password-btn");
    A.setBusy(btn, true, "Перевіряємо…");
    try {
      const user = A.getUsers()[session.email];
      if (!(await A.checkPassword(user, current))) {
        showError("password", "Поточний пароль невірний.");
        return;
      }
      const newSalt = A.randomHex(16);
      const newHash = await A.sha256(newSalt + ":" + next);
      btn.textContent = "Надсилаємо код…";
      await flow.begin({
        type: "password", email: session.email, nick: session.nick,
        account: session.email, newSalt: newSalt, newHash: newHash
      });
    } catch (err) {
      showError("password", A.explainEmailError(err));
    } finally {
      A.setBusy(btn, false);
    }
  });

  // Зміна пошти (потрібен пароль; код іде на НОВУ пошту)
  el("email-form").addEventListener("submit", async e => {
    e.preventDefault();
    clearErrors();
    const session = requireSession();
    if (!session) return;

    const f = e.target.elements;
    const newEmail = A.normEmail(f.email.value);
    const password = f.password.value;

    if (!A.EMAIL_RE.test(newEmail)) {
      return showError("email", "Введіть коректну електронну адресу.");
    }
    if (newEmail === session.email) {
      return showError("email", "Це ваша поточна пошта.");
    }
    if (A.getUsers()[newEmail]) {
      return showError("email", "Ця пошта вже використовується іншим акаунтом.");
    }
    if (!password) {
      return showError("email", "Введіть поточний пароль.");
    }

    const btn = el("email-btn");
    A.setBusy(btn, true, "Перевіряємо…");
    try {
      const user = A.getUsers()[session.email];
      if (!(await A.checkPassword(user, password))) {
        showError("email", "Пароль невірний.");
        return;
      }
      btn.textContent = "Надсилаємо код…";
      await flow.begin({
        type: "email", email: newEmail, nick: session.nick, account: session.email
      });
    } catch (err) {
      showError("email", A.explainEmailError(err));
    } finally {
      A.setBusy(btn, false);
    }
  });

  // Видалення акаунта (потрібен пароль + галочка + код)
  el("delete-form").addEventListener("submit", async e => {
    e.preventDefault();
    clearErrors();
    const session = requireSession();
    if (!session) return;

    const f = e.target.elements;
    const password = f.password.value;

    if (!password) {
      return showError("delete", "Введіть пароль.");
    }
    if (!f.agree.checked) {
      return showError("delete", "Поставте галочку, щоб підтвердити видалення.");
    }

    const btn = el("delete-btn");
    A.setBusy(btn, true, "Перевіряємо…");
    try {
      const user = A.getUsers()[session.email];
      if (!(await A.checkPassword(user, password))) {
        showError("delete", "Пароль невірний.");
        return;
      }
      btn.textContent = "Надсилаємо код…";
      await flow.begin({
        type: "delete", email: session.email, nick: session.nick, account: session.email
      });
    } catch (err) {
      showError("delete", A.explainEmailError(err));
    } finally {
      A.setBusy(btn, false);
    }
  });

  // Зміни в іншій вкладці (вихід з акаунта, інша зміна даних)
  window.addEventListener("storage", e => {
    if ((e.key === A.SESSION_KEY || e.key === A.USERS_KEY) && !flow.getPending()) init(currentTab);
  });

  init();
})();