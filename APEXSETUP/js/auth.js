// ===== Акаунти: реєстрація / вхід (account.html) + спільні функції для всіх сторінок =====
// Підключати ПІСЛЯ products.js і cart.js.
// Керування профілем (нік, телефон, пароль, пошта, видалення) — на сторінці profile-settings.html,
// див. js/profile/settings.js. Спільні функції доступні через window.ApexAuth.
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

  // Поточний користувач (дані беруться з акаунта, тому нік/аватар/телефон завжди актуальні)
  function getSession() {
    const s = load(SESSION_KEY, null);
    if (!s || !s.email) return null;
    const user = getUsers()[s.email];
    if (!user) return null;
    return {
      email: user.email,
      nick: user.nick,
      phone: user.phone || "",
      avatar: user.avatar || ""
    };
  }

  function saveSession(email) {
    return save(SESSION_KEY, { email: email, ts: Date.now() });
  }

  function normEmail(value) {
    return String(value || "").trim().toLowerCase();
  }

  // Телефон: 0501234567 / 380501234567 / +380501234567 → +380501234567;
  // інші міжнародні номери: +XXXXXXXXXX (10–15 цифр). Якщо формат невірний — null.
  function normPhone(value) {
    const s = String(value || "").replace(/[\s()-]/g, "");
    if (/^0\d{9}$/.test(s)) return "+38" + s;
    if (/^380\d{9}$/.test(s)) return "+" + s;
    if (/^\+\d{10,15}$/.test(s)) return s;
    return null;
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

  function clearSession() {
    try { localStorage.removeItem(SESSION_KEY); } catch (e) { /* ігноруємо */ }
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


  /* ---------- Підтвердження кодом з пошти (спільне для account.html і profile-settings.html) ---------- */
  const CODE_TITLES = {
    register: "Підтвердіть пошту",
    login: "Підтвердіть вхід",
    password: "Підтвердіть зміну пароля",
    email: "Підтвердіть нову пошту",
    delete: "Підтвердіть видалення акаунта"
  };

  // Працює з елементами екрана коду: code-title, code-email, demo-mail, code-form, code-input,
  // code-error, resend-btn, code-back.
  // opts: showCode() — показати екран коду; onVerified(pending) — код введено вірно;
  //       onReset(message, isError) — почати спочатку; onBack(type) — натиснули «Назад».
  function createCodeFlow(opts) {
    const $ = id => document.getElementById(id);
    let pending = null;
    let cooldownTimer = null;

    function codeError(message) {
      const box = $("code-error");
      if (!box) return;
      box.textContent = message || "";
      box.hidden = !message;
    }

    function renderMailNote(result, email, code) {
      const box = $("demo-mail");
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

    function startCooldown() {
      const btn = $("resend-btn");
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
    async function begin(base) {
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

      $("code-title").textContent = CODE_TITLES[base.type] || "Підтвердіть пошту";
      $("code-email").textContent = base.email;
      $("code-input").value = "";
      codeError("");
      opts.showCode();
      renderMailNote(result, base.email, code);
      startCooldown();
      $("code-input").focus();
    }

    function clear() {
      pending = null;
      clearInterval(cooldownTimer);
    }

    // У поле коду пропускаємо лише цифри
    $("code-input").addEventListener("input", e => {
      e.target.value = e.target.value.replace(/\D/g, "").slice(0, 6);
    });

    // Підтвердження коду
    $("code-form").addEventListener("submit", async e => {
      e.preventDefault();
      codeError("");
      if (!pending) { opts.onReset(); return; }

      const value = $("code-input").value.trim();
      if (!/^\d{6}$/.test(value)) return codeError("Введіть 6 цифр коду.");
      if (Date.now() > pending.expires) return codeError("Код прострочений. Надішліть новий.");

      const hash = await sha256(pending.codeSalt + ":" + value);
      if (hash !== pending.codeHash) {
        pending.attempts++;
        const left = MAX_CODE_ATTEMPTS - pending.attempts;
        if (left <= 0) {
          clear();
          opts.onReset("Забагато невдалих спроб. Почніть спочатку.", true);
          return;
        }
        return codeError("Невірний код. Залишилось спроб: " + left);
      }
      opts.onVerified(pending);
    });

    // Повторна відправка коду
    $("resend-btn").addEventListener("click", async () => {
      if (!pending) return;
      // base — усі дані дії, крім технічних полів поточного коду
      const { codeSalt, codeHash, expires, attempts, ...base } = pending;
      const btn = $("resend-btn");
      btn.disabled = true;
      btn.textContent = "Надсилаємо…";
      try {
        await begin(base);
        toast("📧 Новий код надіслано");
      } catch (err) {
        codeError(explainEmailError(err));
        btn.disabled = false;
        btn.textContent = "Надіслати код ще раз";
      }
    });

    // Назад з екрана коду
    $("code-back").addEventListener("click", () => {
      const type = pending ? pending.type : null;
      clear();
      opts.onBack(type);
    });

    return { begin: begin, clear: clear, getPending: () => pending, error: codeError };
  }

  // Усе спільне — для profile-settings.html (js/profile/settings.js)
  window.ApexAuth = {
    USERS_KEY, SESSION_KEY, NICK_RE, EMAIL_RE,
    getUsers, getSession, save, saveSession, clearSession, normEmail,
    toast, sha256, randomHex, checkPassword, setBusy,
    explainEmailError, updateHeader, createCodeFlow
  };

  /* ---------- Далі — тільки для сторінки account.html ---------- */
  const card = document.getElementById("auth-card");
  if (!card) return;

  const el = id => document.getElementById(id);
  const VIEWS = ["choice", "register", "login", "code", "profile"];
  const ALL_ERRORS = ["reg", "login", "code", "profile"];

  function showView(name) {
    VIEWS.forEach(v => { el("view-" + v).hidden = v !== name; });
    ALL_ERRORS.forEach(clearError);

    // Паролі знову приховуємо
    card.querySelectorAll(".pass-wrap input").forEach(input => { input.type = "password"; });
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

  // Малює профіль (нік, пошта, телефон, аватар)
  function renderProfile(session) {
    el("profile-nick").textContent = session.nick;
    el("profile-email").textContent = session.email;
    el("profile-phone").textContent = session.phone ? "📞 " + session.phone : "";

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

  // Підтвердження кодом (реєстрація та вхід)
  const flow = createCodeFlow({
    showCode: () => showView("code"),
    onVerified: finishAuth,
    onReset: (message, isError) => {
      initView();
      if (message) toast(message, isError);
    },
    onBack: type => {
      if (type === "register" || type === "login") showView(type);
      else initView();
    }
  });

  // Успішне завершення дії: оновлюємо інтерфейс
  function finish(message) {
    flow.clear();
    updateHeader();
    initView();
    toast(message);
  }

  // Код підтверджено — виконуємо дію залежно від її типу
  function finishAuth(p) {
    const users = getUsers();

    switch (p.type) {
      case "register": {
        if (users[p.email]) {
          flow.clear();
          showView("login");
          showError("login", "Ця пошта вже зареєстрована. Увійдіть.");
          return;
        }
        users[p.email] = {
          nick: p.nick, email: p.email, phone: p.phone || "",
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
          flow.clear();
          showView("register");
          showError("reg", "Акаунт не знайдено. Зареєструйтесь.");
          return;
        }
        // Якщо при вході вказали новий номер (або в акаунті його ще не було) — зберігаємо
        if (p.phone && user.phone !== p.phone) {
          user.phone = p.phone;
          save(USERS_KEY, users);
        }
        saveSession(p.email);
        finish("✅ Вітаємо, " + user.nick + "!");
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
      if (target === "profile" && !requireSession()) return;
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
    const phone = normPhone(form.elements.phone.value);
    const password = form.elements.password.value;

    if (!NICK_RE.test(nick)) {
      return showError("reg", "Нік: 3–20 символів (літери, цифри, _ . -).");
    }
    if (!EMAIL_RE.test(email)) {
      return showError("reg", "Введіть коректну електронну адресу.");
    }
    if (!phone) {
      return showError("reg", "Введіть коректний номер телефону, наприклад +380501234567.");
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
      await flow.begin({
        type: "register", email: email, nick: nick, phone: phone,
        passSalt: passSalt, passHash: passHash
      });
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
    const phoneRaw = form.elements.phone.value.trim();
    const phone = phoneRaw ? normPhone(phoneRaw) : "";

    if (!email || !password) {
      return showError("login", "Введіть електронну адресу та пароль.");
    }
    if (phoneRaw && !phone) {
      return showError("login", "Введіть коректний номер телефону, наприклад +380501234567.");
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
      // Якщо в акаунті ще немає телефону (старий акаунт) — вимагаємо ввести
      if (!phone && !user.phone) {
        showError("login", "Вкажіть номер телефону — він потрібен для оформлення замовлень.");
        return;
      }
      btn.textContent = "Надсилаємо код…";
      await flow.begin({ type: "login", email: email, nick: user.nick, phone: phone || user.phone });
    } catch (err) {
      showError("login", explainEmailError(err));
    } finally {
      setBusy(btn, false);
    }
  });

  // Вихід з акаунта
  el("logout-btn").addEventListener("click", () => {
    clearSession();
    updateHeader();
    initView();
    toast("Ви вийшли з акаунта");
  });

  // Якщо щось змінилось в іншій вкладці
  window.addEventListener("storage", e => {
    if ((e.key === SESSION_KEY || e.key === USERS_KEY) && !flow.getPending()) initView();
  });

  initView();
})();