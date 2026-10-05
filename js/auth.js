// ===== Акаунти: реєстрація / вхід + керування акаунтом =====
// Підключати ПІСЛЯ products.js і cart.js.
(function () {
  "use strict";

  /* ---------- НАЛАШТУВАННЯ ---------- */
  // Справжні листи надсилаються через EmailJS.
  // Private Key тут НЕ потрібен і не повинен бути в коді сайту.
  const EMAIL_CONFIG = {
    enabled: true,
    serviceId: "service_dbaszj6",
    templateId: "template_s68nftn",
    publicKey: "XLYfRLmm_eP00VaPy",
    // ТІЛЬКИ ДЛЯ ТЕСТУ: true — код додатково показується на сторінці.
    // Для справжнього сайту має бути false.
    showCodeOnPage: false
  };

  const CODE_TTL_MS = 10 * 60 * 1000; // код дійсний 10 хвилин
  const RESEND_COOLDOWN_S = 30;       // пауза перед повторною відправкою
  const MAX_CODE_ATTEMPTS = 5;        // спроб ввести код

  const USERS_KEY = "apex_users_v1";      // усі акаунти
  const SESSION_KEY = "apex_session_v1";  // хто зараз увійшов

  const NICK_RE = /^[\p{L}0-9_.-]{3,20}$/u;
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  /* ---------- Допоміжні функції ---------- */
  function load(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return fallback;
      const value = JSON.parse(raw);
      return value === null ? fallback : value;
    } catch (e) {
      return fallback;
    }
  }

  function save(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.error("Не вдалося зберегти в localStorage:", e);
      return false;
    }
  }

  function getUsers() {
    const users = load(USERS_KEY, {});
    return users && typeof users === "object" && !Array.isArray(users) ? users : {};
  }

  // Поточний користувач (дані беруться з акаунта, тому нік/аватар завжди актуальні)
  function getSession() {
    const s = load(SESSION_KEY, null);
    if (!s || !s.email) return null;
    const user = getUsers()[s.email];
    if (!user) return null;
    return { email: user.email, nick: user.nick, avatar: user.avatar || "" };
  }

  function saveSession(email) {
    return save(SESSION_KEY, { email: email, ts: Date.now() });
  }

  function normEmail(value) {
    return String(value || "").trim().toLowerCase();
  }

  function toast(text, isError) {
    if (typeof showToast === "function") showToast(text, isError); // з cart.js
  }

  // Випадковий рядок із hex-символів (для "солі")
  function randomHex(bytes) {
    const arr = new Uint8Array(bytes);
    if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(arr);
    else for (let i = 0; i < bytes; i++) arr[i] = Math.floor(Math.random() * 256);
    return Array.from(arr, b => b.toString(16).padStart(2, "0")).join("");
  }

  // Хеш SHA-256 (якщо браузер не підтримує crypto.subtle — слабкий запасний варіант)
  async function sha256(text) {
    if (window.crypto && crypto.subtle) {
      const data = new TextEncoder().encode(text);
      const buf = await crypto.subtle.digest("SHA-256", data);
      return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, "0")).join("");
    }
    let h1 = 0x811c9dc5, h2 = 5381;
    for (let i = 0; i < text.length; i++) {
      const c = text.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 16777619);
      h2 = (Math.imul(h2, 33) ^ c) >>> 0;
    }
    return "weak-" + (h1 >>> 0).toString(16) + h2.toString(16);
  }

  // Перевірка пароля користувача
  async function checkPassword(user, password) {
    const hash = await sha256(user.salt + ":" + password);
    return hash === user.hash;
  }

  // Випадковий 6-значний код
  function generateCode() {
    const arr = new Uint32Array(1);
    if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(arr);
    else arr[0] = Math.floor(Math.random() * 4294967296);
    return String(arr[0] % 1000000).padStart(6, "0");
  }

  /* ---------- Надсилання коду на пошту ---------- */
  async function sendCodeEmail(email, nick, code) {
    if (!EMAIL_CONFIG.enabled) {
      // Демо-режим: лист не надсилається, код покажемо на сторінці
      return { demo: true, code: code };
    }

    if (!EMAIL_CONFIG.serviceId || !EMAIL_CONFIG.templateId || !EMAIL_CONFIG.publicKey) {
      const err = new Error("У EMAIL_CONFIG не заповнені serviceId / templateId / publicKey");
      err.status = 0;
      throw err;
    }

    let response;
    try {
      response = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service_id: EMAIL_CONFIG.serviceId,
          template_id: EMAIL_CONFIG.templateId,
          user_id: EMAIL_CONFIG.publicKey,
          template_params: {
            // основні змінні шаблону
            to_email: email,
            nick: nick,
            code: code,
            // запасні назви на випадок іншого оформлення шаблону
            email: email,
            user_email: email,
            to_name: nick,
            name: nick,
            passcode: code,
            otp: code,
            otp_code: code,
            verification_code: code,
            time: "10 хвилин",
            message: "Ваш код підтвердження APEXSETUP: " + code + ". Він дійсний 10 хвилин."
          }
        })
      });
    } catch (networkError) {
      const err = new Error(networkError.message || "Мережева помилка");
      err.status = -1; // немає зв'язку, блокування браузером/розширенням
      throw err;
    }

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      const err = new Error(text || "HTTP " + response.status);
      err.status = response.status;
      throw err;
    }
    return { demo: false, status: response.status, code: code };
  }

  // Людське пояснення помилки надсилання (показується на сторінці)
  function explainEmailError(err) {
    console.error("Помилка:", err);
    const status = err && err.status;
    const detail = err && err.message ? String(err.message).slice(0, 200) : "невідома помилка";
    let hint;

    if (status === -1) {
      hint = "Немає зв'язку з EmailJS. Перевірте інтернет, вимкніть блокувальники реклами та відкрийте сайт через Live Server (http://127.0.0.1...), а не через file://.";
    } else if (status === 0) {
      hint = "Не заповнені ключі в js/auth.js (блок EMAIL_CONFIG).";
    } else if (status === 400) {
      hint = "EmailJS не прийняв запит: перевірте Service ID, Template ID та Public Key (без пробілів).";
    } else if (status === 403) {
      hint = "EmailJS заблокував запит. Відкрийте сайт через Live Server (http://127.0.0.1...), а не через file://.";
    } else if (status === 412) {
      hint = "Сервіс пошти підключений без дозволу на надсилання. У EmailJS (Email Services) перепідключіть його.";
    } else if (status === 422) {
      hint = "У шаблоні EmailJS поле «To Email» має бути {{to_email}}.";
    } else if (status === 429) {
      hint = "Перевищено ліміт листів EmailJS. Спробуйте пізніше.";
    } else {
      hint = "Не вдалося виконати дію.";
    }
    return hint + " (Технічна деталь: " + detail + ")";
  }

  /* ---------- Іконка акаунта в header (усі сторінки) ---------- */
  function updateHeader() {
    const link = document.getElementById("account-link");
    const label = document.getElementById("account-label");
    const session = getSession();

    if (link) {
      link.classList.toggle("logged-in", !!session);
      link.title = session ? "Акаунт: " + session.nick : "Увійти в акаунт";

      // Якщо є аватар — показуємо його замість іконки
      const svg = link.querySelector("svg");
      let img = link.querySelector(".account-photo");
      if (session && session.avatar) {
        if (!img) {
          img = document.createElement("img");
          img.className = "account-photo";
          img.alt = "";
          img.style.cssText = "width:32px;height:32px;border-radius:50%;object-fit:cover;flex-shrink:0";
          link.insertBefore(img, link.firstChild);
        }
        img.src = session.avatar;
        if (svg) svg.style.display = "none";
      } else {
        if (img) img.remove();
        if (svg) svg.style.display = "";
      }
    }
    if (label) label.textContent = session ? session.nick : "Акаунт";
  }

  updateHeader();
  window.addEventListener("storage", e => {
    if (e.key === SESSION_KEY || e.key === USERS_KEY) updateHeader();
  });

  /* ---------- Далі — тільки для сторінки account.html ---------- */
  const card = document.getElementById("auth-card");
  if (!card) return;

  const el = id => document.getElementById(id);
  const VIEWS = ["choice", "register", "login", "code", "profile", "nick", "password", "email", "delete"];
  const SETTINGS_FORMS = ["nick", "password", "email", "delete"];
  const ALL_ERRORS = ["reg", "login", "code", "profile", "nick", "password", "email", "delete"];

  // Куди повертає кнопка «Назад» на екрані коду
  const TYPE_VIEW = { register: "register", login: "login", password: "password", email: "email", delete: "delete" };
  const CODE_TITLES = {
    register: "Підтвердіть пошту",
    login: "Підтвердіть вхід",
    password: "Підтвердіть зміну пароля",
    email: "Підтвердіть нову пошту",
    delete: "Підтвердіть видалення акаунта"
  };

  // Дані поточної перевірки коду (тримаємо лише в пам'яті сторінки)
  let pending = null;
  let cooldownTimer = null;

  function showView(name) {
    VIEWS.forEach(v => { el("view-" + v).hidden = v !== name; });
    ALL_ERRORS.forEach(clearError);

    // Паролі знову приховуємо
    card.querySelectorAll(".pass-wrap input").forEach(input => { input.type = "password"; });

    // Форми налаштувань завжди відкриваються чистими
    if (SETTINGS_FORMS.includes(name)) {
      el(name + "-form").reset();
      if (name === "nick") {
        const session = getSession();
        if (session) el("nick-form").elements.nick.value = session.nick;
      }
    }
  }

  function showError(prefix, message) {
    const box = el(prefix + "-error");
    box.textContent = message;
    box.hidden = false;
  }

  function clearError(prefix) {
    const box = el(prefix + "-error");
    if (box) { box.textContent = ""; box.hidden = true; }
  }

  function setBusy(button, busy, busyText) {
    if (busy) {
      button.dataset.text = button.textContent;
      button.textContent = busyText;
    } else if (button.dataset.text) {
      button.textContent = button.dataset.text;
    }
    button.disabled = busy;
  }

  // Малює профіль (нік, пошта, аватар)
  function renderProfile(session) {
    el("profile-nick").textContent = session.nick;
    el("profile-email").textContent = session.email;

    const avatar = el("profile-avatar");
    avatar.textContent = "";
    if (session.avatar) {
      const img = document.createElement("img");
      img.src = session.avatar;
      img.alt = "Аватар";
      avatar.append(img);
    } else {
      avatar.textContent = session.nick.charAt(0).toUpperCase();
    }
    el("avatar-remove").hidden = !session.avatar;
  }

  function initView() {
    const session = getSession();
    if (session) {
      renderProfile(session);
      showView("profile");
    } else {
      showView("choice");
    }
  }

  // Повертає поточного користувача або відправляє на екран входу
  function requireSession() {
    const session = getSession();
    if (!session) {
      initView();
      toast("Сесія завершена. Увійдіть знову.", true);
      return null;
    }
    return session;
  }

  // Блок-повідомлення на екрані коду: що саме сталося з листом
  function renderMailNote(result, email, code) {
    const box = el("demo-mail");
    box.textContent = "";
    box.hidden = false;

    const strong = text => {
      const node = document.createElement("strong");
      node.textContent = text;
      return node;
    };
    const codeSpan = value => {
      const node = document.createElement("span");
      node.className = "code-show";
      node.textContent = value;
      return node;
    };

    if (result.demo) {
      box.append("📬 ", strong("Демо-режим:"), " справжній лист не надсилається. Ваш код:", codeSpan(code));
    } else {
      box.append(
        "✅ Лист із кодом надіслано на ", strong(email),
        ". Якщо його немає у «Вхідних», перевірте «Спам». Лист може йти до хвилини."
      );
      if (EMAIL_CONFIG.showCodeOnPage) {
        box.append(document.createElement("br"), "🧪 Тестовий режим, код:", codeSpan(code));
      }
    }
  }

  // Пауза перед повторною відправкою коду
  function startCooldown() {
    const btn = el("resend-btn");
    let left = RESEND_COOLDOWN_S;
    clearInterval(cooldownTimer);
    btn.disabled = true;
    btn.textContent = "Надіслати код ще раз (" + left + ")";
    cooldownTimer = setInterval(() => {
      left--;
      if (left <= 0) {
        clearInterval(cooldownTimer);
        btn.disabled = false;
        btn.textContent = "Надіслати код ще раз";
      } else {
        btn.textContent = "Надіслати код ще раз (" + left + ")";
      }
    }, 1000);
  }

  // Створює код, надсилає його на base.email і показує екран введення коду
  async function beginCode(base) {
    const code = generateCode();
    const codeSalt = randomHex(8);
    const codeHash = await sha256(codeSalt + ":" + code);
    const result = await sendCodeEmail(base.email, base.nick, code); // кидає помилку, якщо не вдалось

    pending = Object.assign({}, base, {
      codeSalt: codeSalt,
      codeHash: codeHash,
      expires: Date.now() + CODE_TTL_MS,
      attempts: 0
    });

    el("code-title").textContent = CODE_TITLES[base.type] || "Підтвердіть пошту";
    el("code-email").textContent = base.email;
    el("code-input").value = "";
    showView("code");
    renderMailNote(result, base.email, code);
    startCooldown();
    el("code-input").focus();
  }

  // Успішне завершення дії: оновлюємо інтерфейс
  function finish(message) {
    pending = null;
    clearInterval(cooldownTimer);
    updateHeader();
    initView();
    toast(message);
  }

  // Код підтверджено — виконуємо дію залежно від її типу
  function finishAuth() {
    const p = pending;
    const users = getUsers();

    // Для змін в акаунті перевіряємо, що користувач усе ще той самий
    if (p.type === "password" || p.type === "email" || p.type === "delete") {
      const session = getSession();
      if (!session || session.email !== p.account) {
        pending = null;
        clearInterval(cooldownTimer);
        initView();
        toast("Сесія завершена. Увійдіть знову.", true);
        return;
      }
    }

    switch (p.type) {
      case "register": {
        if (users[p.email]) {
          pending = null;
          showView("login");
          showError("login", "Ця пошта вже зареєстрована. Увійдіть.");
          return;
        }
        users[p.email] = {
          nick: p.nick, email: p.email,
          salt: p.passSalt, hash: p.passHash,
          created: Date.now()
        };
        if (!save(USERS_KEY, users)) {
          showError("code", "Не вдалося зберегти акаунт: браузер блокує localStorage.");
          return;
        }
        saveSession(p.email);
        finish("✅ Вітаємо, " + p.nick + "!");
        return;
      }

      case "login": {
        const user = users[p.email];
        if (!user) {
          pending = null;
          showView("register");
          showError("reg", "Акаунт не знайдено. Зареєструйтесь.");
          return;
        }
        saveSession(p.email);
        finish("✅ Вітаємо, " + user.nick + "!");
        return;
      }

      case "password": {
        const user = users[p.account];
        user.salt = p.newSalt;
        user.hash = p.newHash;
        if (!save(USERS_KEY, users)) {
          showError("code", "Не вдалося зберегти новий пароль: браузер блокує localStorage.");
          return;
        }
        finish("🔒 Пароль успішно змінено");
        return;
      }

      case "email": {
        if (users[p.email]) {
          pending = null;
          initView();
          toast("Ця пошта вже використовується іншим акаунтом.", true);
          return;
        }
        const user = users[p.account];
        delete users[p.account];
        user.email = p.email;
        users[p.email] = user;
        if (!save(USERS_KEY, users)) {
          showError("code", "Не вдалося зберегти нову пошту: браузер блокує localStorage.");
          return;
        }
        saveSession(p.email);
        finish("✉️ Пошту змінено на " + p.email);
        return;
      }

      case "delete": {
        delete users[p.account];
        save(USERS_KEY, users);
        try { localStorage.removeItem(SESSION_KEY); } catch (e) { /* ігноруємо */ }
        pending = null;
        clearInterval(cooldownTimer);
        updateHeader();
        showView("choice");
        toast("🗑 Акаунт видалено, пошту відв'язано від сайту");
        return;
      }
    }
  }

  /* ---------- Аватар ---------- */
  // Обрізає фото до квадрата 160×160 і повертає його як JPEG (data URL)
  function processAvatar(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const size = 160;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        const side = Math.min(img.width, img.height);
        const sx = (img.width - side) / 2;
        const sy = (img.height - side) / 2;
        ctx.fillStyle = "#111111";
        ctx.fillRect(0, 0, size, size);
        ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Не вдалося прочитати зображення."));
      };
      img.src = url;
    });
  }

  el("avatar-pick").addEventListener("click", () => el("avatar-input").click());

  el("avatar-input").addEventListener("change", async e => {
    const file = e.target.files[0];
    e.target.value = ""; // щоб можна було вибрати той самий файл ще раз
    if (!file) return;
    clearError("profile");

    const session = requireSession();
    if (!session) return;

    if (!/^image\/(png|jpe?g|webp|gif)$/.test(file.type)) {
      return showError("profile", "Оберіть зображення PNG, JPG, WEBP або GIF.");
    }
    if (file.size > 5 * 1024 * 1024) {
      return showError("profile", "Файл завеликий (максимум 5 МБ).");
    }

    try {
      const data = await processAvatar(file);
      const users = getUsers();
      users[session.email].avatar = data;
      if (!save(USERS_KEY, users)) {
        return showError("profile", "Не вдалося зберегти фото: браузер блокує localStorage.");
      }
      updateHeader();
      initView();
      toast("🖼 Аватар оновлено");
    } catch (err) {
      showError("profile", err.message || "Не вдалося обробити фото.");
    }
  });

  el("avatar-remove").addEventListener("click", () => {
    const session = requireSession();
    if (!session) return;
    const users = getUsers();
    delete users[session.email].avatar;
    save(USERS_KEY, users);
    updateHeader();
    initView();
    toast("Фото прибрано");
  });

  /* ---------- Події ---------- */
  // Кнопки переходу між екранами та показ/приховування пароля
  card.addEventListener("click", e => {
    const go = e.target.closest("[data-go]");
    if (go) {
      const target = go.dataset.go;
      // у налаштування можна потрапити тільки будучи в акаунті
      if (SETTINGS_FORMS.includes(target) || target === "profile") {
        if (!requireSession()) return;
      }
      showView(target);
    }

    const toggle = e.target.closest(".toggle-pass");
    if (toggle) {
      const input = el(toggle.dataset.target);
      input.type = input.type === "password" ? "text" : "password";
    }
  });

  // Реєстрація
  el("register-form").addEventListener("submit", async e => {
    e.preventDefault();
    clearError("reg");
    const form = e.target;
    const nick = form.elements.nick.value.trim();
    const email = normEmail(form.elements.email.value);
    const password = form.elements.password.value;

    if (!NICK_RE.test(nick)) {
      return showError("reg", "Нік: 3–20 символів (літери, цифри, _ . -).");
    }
    if (!EMAIL_RE.test(email)) {
      return showError("reg", "Введіть коректну електронну адресу.");
    }
    if (password.length < 8) {
      return showError("reg", "Пароль має містити щонайменше 8 символів.");
    }

    const users = getUsers();
    if (users[email]) {
      return showError("reg", "Ця пошта вже зареєстрована. Спробуйте увійти.");
    }
    const nickTaken = Object.keys(users).some(k => users[k].nick.toLowerCase() === nick.toLowerCase());
    if (nickTaken) {
      return showError("reg", "Цей нік уже зайнятий. Оберіть інший.");
    }

    const btn = el("reg-btn");
    setBusy(btn, true, "Надсилаємо код…");
    try {
      const passSalt = randomHex(16);
      const passHash = await sha256(passSalt + ":" + password);
      await beginCode({ type: "register", email: email, nick: nick, passSalt: passSalt, passHash: passHash });
    } catch (err) {
      showError("reg", explainEmailError(err));
    } finally {
      setBusy(btn, false);
    }
  });

  // Вхід
  el("login-form").addEventListener("submit", async e => {
    e.preventDefault();
    clearError("login");
    const form = e.target;
    const email = normEmail(form.elements.email.value);
    const password = form.elements.password.value;

    if (!email || !password) {
      return showError("login", "Введіть електронну адресу та пароль.");
    }

    const btn = el("login-btn");
    setBusy(btn, true, "Перевіряємо…");
    try {
      const user = getUsers()[email];
      // Хешуємо в будь-якому випадку, щоб не розкривати, чи існує така пошта
      const hash = await sha256((user ? user.salt : "none") + ":" + password);
      if (!user || hash !== user.hash) {
        showError("login", "Невірна електронна адреса або пароль.");
        return;
      }
      btn.textContent = "Надсилаємо код…";
      await beginCode({ type: "login", email: email, nick: user.nick });
    } catch (err) {
      showError("login", explainEmailError(err));
    } finally {
      setBusy(btn, false);
    }
  });

  // Зміна ніка (без коду)
  el("nick-form").addEventListener("submit", e => {
    e.preventDefault();
    clearError("nick");
    const session = requireSession();
    if (!session) return;

    const nick = e.target.elements.nick.value.trim();
    if (!NICK_RE.test(nick)) {
      return showError("nick", "Нік: 3–20 символів (літери, цифри, _ . -).");
    }
    if (nick === session.nick) {
      return showError("nick", "Це ваш поточний нік.");
    }
    const users = getUsers();
    const taken = Object.keys(users).some(
      k => k !== session.email && users[k].nick.toLowerCase() === nick.toLowerCase()
    );
    if (taken) {
      return showError("nick", "Цей нік уже зайнятий. Оберіть інший.");
    }

    users[session.email].nick = nick;
    if (!save(USERS_KEY, users)) {
      return showError("nick", "Не вдалося зберегти: браузер блокує localStorage.");
    }
    updateHeader();
    initView();
    toast("✅ Нік змінено на " + nick);
  });

  // Зміна пароля (потрібен поточний пароль + код)
  el("password-form").addEventListener("submit", async e => {
    e.preventDefault();
    clearError("password");
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
    setBusy(btn, true, "Перевіряємо…");
    try {
      const user = getUsers()[session.email];
      if (!(await checkPassword(user, current))) {
        showError("password", "Поточний пароль невірний.");
        return;
      }
      const newSalt = randomHex(16);
      const newHash = await sha256(newSalt + ":" + next);
      btn.textContent = "Надсилаємо код…";
      await beginCode({
        type: "password", email: session.email, nick: session.nick,
        account: session.email, newSalt: newSalt, newHash: newHash
      });
    } catch (err) {
      showError("password", explainEmailError(err));
    } finally {
      setBusy(btn, false);
    }
  });

  // Зміна пошти (потрібен пароль; код іде на НОВУ пошту)
  el("email-form").addEventListener("submit", async e => {
    e.preventDefault();
    clearError("email");
    const session = requireSession();
    if (!session) return;

    const f = e.target.elements;
    const newEmail = normEmail(f.email.value);
    const password = f.password.value;

    if (!EMAIL_RE.test(newEmail)) {
      return showError("email", "Введіть коректну електронну адресу.");
    }
    if (newEmail === session.email) {
      return showError("email", "Це ваша поточна пошта.");
    }
    if (getUsers()[newEmail]) {
      return showError("email", "Ця пошта вже використовується іншим акаунтом.");
    }
    if (!password) {
      return showError("email", "Введіть поточний пароль.");
    }

    const btn = el("email-btn");
    setBusy(btn, true, "Перевіряємо…");
    try {
      const user = getUsers()[session.email];
      if (!(await checkPassword(user, password))) {
        showError("email", "Пароль невірний.");
        return;
      }
      btn.textContent = "Надсилаємо код…";
      await beginCode({
        type: "email", email: newEmail, nick: session.nick, account: session.email
      });
    } catch (err) {
      showError("email", explainEmailError(err));
    } finally {
      setBusy(btn, false);
    }
  });

  // Видалення акаунта (потрібен пароль + галочка + код)
  el("delete-form").addEventListener("submit", async e => {
    e.preventDefault();
    clearError("delete");
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
    setBusy(btn, true, "Перевіряємо…");
    try {
      const user = getUsers()[session.email];
      if (!(await checkPassword(user, password))) {
        showError("delete", "Пароль невірний.");
        return;
      }
      btn.textContent = "Надсилаємо код…";
      await beginCode({
        type: "delete", email: session.email, nick: session.nick, account: session.email
      });
    } catch (err) {
      showError("delete", explainEmailError(err));
    } finally {
      setBusy(btn, false);
    }
  });

  // У поле коду пропускаємо лише цифри
  el("code-input").addEventListener("input", e => {
    e.target.value = e.target.value.replace(/\D/g, "").slice(0, 6);
  });

  // Підтвердження коду
  el("code-form").addEventListener("submit", async e => {
    e.preventDefault();
    clearError("code");
    if (!pending) { initView(); return; }

    const value = el("code-input").value.trim();
    if (!/^\d{6}$/.test(value)) {
      return showError("code", "Введіть 6 цифр коду.");
    }
    if (Date.now() > pending.expires) {
      return showError("code", "Код прострочений. Надішліть новий.");
    }

    const hash = await sha256(pending.codeSalt + ":" + value);
    if (hash !== pending.codeHash) {
      pending.attempts++;
      const left = MAX_CODE_ATTEMPTS - pending.attempts;
      if (left <= 0) {
        pending = null;
        clearInterval(cooldownTimer);
        initView();
        toast("Забагато невдалих спроб. Почніть спочатку.", true);
        return;
      }
      return showError("code", "Невірний код. Залишилось спроб: " + left);
    }
    finishAuth();
  });

  // Повторна відправка коду
  el("resend-btn").addEventListener("click", async () => {
    if (!pending) return;
    // base — усі дані дії, крім технічних полів поточного коду
    const { codeSalt, codeHash, expires, attempts, ...base } = pending;
    const btn = el("resend-btn");
    btn.disabled = true;
    btn.textContent = "Надсилаємо…";
    try {
      await beginCode(base);
      toast("📧 Новий код надіслано");
    } catch (err) {
      showError("code", explainEmailError(err));
      btn.disabled = false;
      btn.textContent = "Надіслати код ще раз";
    }
  });

  // Назад з екрана коду
  el("code-back").addEventListener("click", () => {
    const type = pending ? pending.type : null;
    pending = null;
    clearInterval(cooldownTimer);
    if (type && TYPE_VIEW[type] && (type === "register" || type === "login" || getSession())) {
      showView(TYPE_VIEW[type]);
    } else {
      initView();
    }
  });

  // Вихід з акаунта
  el("logout-btn").addEventListener("click", () => {
    try { localStorage.removeItem(SESSION_KEY); } catch (e) { /* ігноруємо */ }
    updateHeader();
    initView();
    toast("Ви вийшли з акаунта");
  });

  // Якщо щось змінилось в іншій вкладці
  window.addEventListener("storage", e => {
    if ((e.key === SESSION_KEY || e.key === USERS_KEY) && !pending) initView();
  });

  initView();
})();