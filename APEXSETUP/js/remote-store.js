// ===== Спільне сховище товарів (Firebase Firestore, REST) =====
// Каталог читає товари з хмари, адмін-панель записує зміни туди автоматично.
// Підключається з products.js ПЕРЕД products-core.js.

const FIREBASE = {
  apiKey: "AIzaSyDl9YE_ZAOUU9nuuLI-erLeqfTAAeN84lk",
  projectId: "apexsetup-f222b",
  adminEmail: "apexsetupix@gmail.com"
};

const REMOTE_ON = !!FIREBASE.apiKey && !!FIREBASE.projectId;

const REMOTE_CACHE_KEY = "apex_remote_cache_v1";     // останній відомий каталог
const REMOTE_SNAP_KEY = "apex_remote_snapshot_v1";   // що зараз лежить у хмарі
const REMOTE_AUTH_KEY = "apex_remote_auth_v1";       // токен адміна
const FS_BASE = "https://firestore.googleapis.com/v1/projects/" +
  FIREBASE.projectId + "/databases/(default)/documents/products";

let remotePushing = false;
let remoteAgain = false;

/* ---------- Локальний кеш і знімок ---------- */
function remoteReadCache() {
  try {
    const data = JSON.parse(localStorage.getItem(REMOTE_CACHE_KEY));
    return Array.isArray(data) ? data : null;
  } catch (e) { return null; }
}

function remoteWriteCache(list) {
  try {
    localStorage.setItem(REMOTE_CACHE_KEY, JSON.stringify(list));
    return true;
  } catch (e) {
    console.error("Не вдалося зберегти товари:", e);
    return false;
  }
}

function remoteReadSnap() {
  try {
    const s = JSON.parse(localStorage.getItem(REMOTE_SNAP_KEY));
    return s && typeof s === "object" && !Array.isArray(s) ? s : {};
  } catch (e) { return {}; }
}

function remoteWriteSnap(snap) {
  try { localStorage.setItem(REMOTE_SNAP_KEY, JSON.stringify(snap)); } catch (e) { /* ігноруємо */ }
}

function remoteEntry(p, index) { return index + "|" + JSON.stringify(p); }

function remoteSnapOf(list) {
  const snap = {};
  list.forEach((p, i) => { snap[String(p.id)] = remoteEntry(p, i); });
  return snap;
}

// Що змінилось порівняно з хмарою: нові/змінені та видалені товари
function remoteDiff(list) {
  const snap = remoteReadSnap();
  const up = [];
  const del = [];
  const ids = new Set();
  list.forEach((p, i) => {
    ids.add(String(p.id));
    if (snap[String(p.id)] !== remoteEntry(p, i)) up.push({ p: p, i: i });
  });
  Object.keys(snap).forEach(id => { if (!ids.has(id)) del.push(id); });
  return { up: up, del: del };
}

function remoteStatusChanged() {
  window.dispatchEvent(new Event("apex-remote-status"));
}

function remoteToast(text, isError) {
  if (typeof showToast === "function") showToast(text, isError);
}

/* ---------- Вхід адміністратора (Firebase Auth) ---------- */
function remoteSaveAuth(data) {
  const auth = {
    idToken: data.idToken || data.id_token,
    refreshToken: data.refreshToken || data.refresh_token,
    exp: Date.now() + (Number(data.expiresIn || data.expires_in) || 3600) * 1000
  };
  try { localStorage.setItem(REMOTE_AUTH_KEY, JSON.stringify(auth)); } catch (e) { /* ігноруємо */ }
  return auth;
}

async function remoteSignIn(password) {
  const r = await fetch(
    "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=" + encodeURIComponent(FIREBASE.apiKey),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: FIREBASE.adminEmail, password: password, returnSecureToken: true })
    }
  );
  if (!r.ok) throw new Error("Невірний пароль або користувача не створено в Firebase Authentication.");
  return remoteSaveAuth(await r.json());
}

async function remoteRefresh(refreshToken) {
  const r = await fetch(
    "https://securetoken.googleapis.com/v1/token?key=" + encodeURIComponent(FIREBASE.apiKey),
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "grant_type=refresh_token&refresh_token=" + encodeURIComponent(refreshToken)
    }
  );
  if (!r.ok) throw new Error("refresh");
  return remoteSaveAuth(await r.json());
}

// Вікно для введення пароля адміна
function remoteAskPassword() {
  return new Promise(resolve => {
    const overlay = document.createElement("div");
    overlay.className = "overlay";
    overlay.innerHTML =
      '<div class="modal">' +
      '<h2>🔐 Публікація товарів</h2>' +
      '<p>Введіть пароль адміністратора Firebase, щоб зміни з’явились у каталозі для всіх відвідувачів.</p>' +
      '<form>' +
      '<input type="password" class="search" placeholder="Пароль" autocomplete="current-password">' +
      '<div style="display:flex;gap:10px;justify-content:center">' +
      '<button type="button" class="btn btn-outline" data-cancel>Скасувати</button>' +
      '<button type="submit" class="btn">Увійти</button></div>' +
      '<p class="form-error" hidden style="margin-top:12px"></p>' +
      '</form></div>';
    document.body.appendChild(overlay);

    const form = overlay.querySelector("form");
    const input = overlay.querySelector("input");
    const errorBox = overlay.querySelector(".form-error");
    const close = value => { overlay.remove(); resolve(value); };
    input.focus();

    overlay.querySelector("[data-cancel]").addEventListener("click", () => close(null));
    form.addEventListener("submit", async e => {
      e.preventDefault();
      errorBox.hidden = true;
      try {
        const auth = await remoteSignIn(input.value);
        close(auth.idToken);
      } catch (err) {
        errorBox.textContent = err.message || "Не вдалося увійти.";
        errorBox.hidden = false;
      }
    });
  });
}

async function remoteToken() {
  let auth = null;
  try { auth = JSON.parse(localStorage.getItem(REMOTE_AUTH_KEY)); } catch (e) { /* ігноруємо */ }

  if (auth && auth.idToken && auth.exp > Date.now() + 60000) return auth.idToken;
  if (auth && auth.refreshToken) {
    try { return (await remoteRefresh(auth.refreshToken)).idToken; }
    catch (e) { /* токен застарів — просимо пароль */ }
  }
  return remoteAskPassword();
}

/* ---------- Читання з хмари ---------- */
async function remoteFetchAll() {
  const items = [];
  let pageToken = "";
  do {
    const url = FS_BASE + "?pageSize=300&key=" + encodeURIComponent(FIREBASE.apiKey) +
      (pageToken ? "&pageToken=" + encodeURIComponent(pageToken) : "");
    const r = await fetch(url);
    if (!r.ok) throw new Error("HTTP " + r.status);
    const data = await r.json();
    (data.documents || []).forEach(doc => {
      const f = doc.fields || {};
      try {
        items.push({
          p: JSON.parse(f.json.stringValue),
          order: Number(f.order && f.order.integerValue) || 0
        });
      } catch (e) { /* пошкоджений запис пропускаємо */ }
    });
    pageToken = data.nextPageToken || "";
  } while (pageToken);

  items.sort((a, b) => a.order - b.order);
  return items.map(x => x.p);
}

// Завантажує актуальний каталог. Якщо він змінився — оновлює кеш і перезавантажує сторінку.
async function remotePull() {
  if (!REMOTE_ON || remotePushing) return;

  // Є локальні зміни, які ще не опубліковані — не перезаписуємо їх
  const cache = remoteReadCache();
  if (cache) {
    const d = remoteDiff(cache);
    if (d.up.length || d.del.length) return;
  }

  let remote;
  try { remote = await remoteFetchAll(); }
  catch (e) { console.warn("Не вдалося отримати товари з хмари:", e); return; }

  if (remote.length === 0 && cache === null) return; // хмара ще порожня — працює файл products-data.js

  remoteWriteSnap(remoteSnapOf(remote));
  if (JSON.stringify(remote) === JSON.stringify(cache)) return;

  remoteWriteCache(remote);
  remoteStatusChanged();

  const modal = document.getElementById("product-modal");
  if (modal && !modal.hidden) return; // адмін зараз редагує товар — не перериваємо

  try {
    const last = Number(sessionStorage.getItem("apex_remote_reload")) || 0;
    if (Date.now() - last < 5000) return;      // захист від зациклення
    sessionStorage.setItem("apex_remote_reload", String(Date.now()));
  } catch (e) { /* ігноруємо */ }
  location.reload();
}

/* ---------- Запис у хмару (тільки адмін) ---------- */
async function remoteWriteDoc(method, id, token, p, index) {
  const url = FS_BASE + "/" + encodeURIComponent(id) + "?key=" + encodeURIComponent(FIREBASE.apiKey);
  const options = { method: method, headers: { "Authorization": "Bearer " + token } };
  if (method === "PATCH") {
    options.headers["Content-Type"] = "application/json";
    options.body = JSON.stringify({
      fields: {
        json: { stringValue: JSON.stringify(p) },
        order: { integerValue: String(index) }
      }
    });
  }
  const r = await fetch(url, options);
  if (r.status === 401 || r.status === 403) {
    try { localStorage.removeItem(REMOTE_AUTH_KEY); } catch (e) { /* ігноруємо */ }
    throw new Error("Немає прав на запис. Перевірте пошту адміна та правила Firestore.");
  }
  if (!r.ok && !(method === "DELETE" && r.status === 404)) throw new Error("HTTP " + r.status);
}

// Публікує всі локальні зміни товарів у хмару
async function remoteFlush() {
  if (!REMOTE_ON) return;
  if (remotePushing) { remoteAgain = true; return; }

  remotePushing = true;
  remoteStatusChanged();
  try {
    do {
      remoteAgain = false;
      const list = remoteReadCache();
      if (!list) break;

      const diff = remoteDiff(list);
      if (!diff.up.length && !diff.del.length) break;

      const token = await remoteToken();
      if (!token) throw new Error("Публікацію скасовано: не введено пароль.");

      const snap = remoteReadSnap();
      for (const item of diff.up) {
        await remoteWriteDoc("PATCH", String(item.p.id), token, item.p, item.i);
        snap[String(item.p.id)] = remoteEntry(item.p, item.i);
        remoteWriteSnap(snap);
      }
      for (const id of diff.del) {
        await remoteWriteDoc("DELETE", id, token);
        delete snap[id];
        remoteWriteSnap(snap);
      }
      remoteToast("☁️ Зміни опубліковано — їх бачать усі відвідувачі");
    } while (remoteAgain);
  } catch (e) {
    console.error("Помилка публікації:", e);
    remoteToast("⚠️ " + (e.message || "Не вдалося опублікувати зміни."), true);
  } finally {
    remotePushing = false;
    remoteStatusChanged();
  }
}

// Підказка в адмін-панелі про стан синхронізації
function remoteNote() {
  if (!REMOTE_ON) {
    return hasProductsDraft()
      ? "Зараз використовується чернетка цього браузера. Підключіть Firebase в js/remote-store.js, щоб зміни бачили всі."
      : "Firebase ще не підключено (js/remote-store.js): товари беруться з файлу js/products-data.js.";
  }
  if (remotePushing) return "☁️ Публікуємо зміни на сайт…";
  const cache = remoteReadCache();
  if (cache) {
    const d = remoteDiff(cache);
    if (d.up.length || d.del.length) {
      return "⚠️ Є зміни, які ще не опубліковані на сайті. Оновіть сторінку й введіть пароль адміна, або внесіть ще одну зміну.";
    }
  }
  return "✅ Товари синхронізуються автоматично: усе, що ви додаєте, змінюєте чи видаляєте, одразу з’являється в каталозі для всіх.";
}

/* ---------- Запуск ---------- */
if (REMOTE_ON) {
  remotePull();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") remotePull();
  });
}