// ===== «Сетап мрії»: пропозиції товарів від адміна та відповіді клієнта =====
// Підключати ПІСЛЯ products.js, cart.js, auth.js і setups-core.js,
// але ПЕРЕД dream-setup.js та admin-setups.js.
//
// Дані зберігаються всередині заявки: setup.proposal = {
//   items: [{ id, color, colorName, name, price, qty, reaction: "" | "like" | "dislike", comment }],
//   adminComment, clientComment, sentAt, respondedAt, version
// }
(function () {
  "use strict";

  const toast = (text, isError) => { if (typeof showToast === "function") showToast(text, isError); };
  const fmtDate = ts => new Date(ts).toLocaleString("uk-UA");
  const REACTION_TEXT = { like: "👍 Подобається", dislike: "👎 Не підходить" };

  /* ---------- Стилі ---------- */
  (function injectStyles() {
    const st = document.createElement("style");
    st.textContent =
      ".proposal{margin:14px 0;padding:14px 16px;border-radius:14px;border:1px dashed rgba(255,255,255,.4);background:rgba(255,255,255,.06)}" +
      ".proposal-status{font-size:.85rem;opacity:.8;margin:4px 0 10px}" +
      ".prop-item{display:grid;grid-template-columns:64px 1fr auto;gap:10px 12px;align-items:start;padding:10px 0;border-top:1px solid rgba(255,255,255,.14)}" +
      ".prop-item img{width:64px;height:48px;object-fit:cover;border-radius:8px;background:#111827}" +
      ".prop-name{font-weight:700}" +
      ".prop-meta{font-size:.85rem;opacity:.8;display:flex;align-items:center;gap:6px;flex-wrap:wrap}" +
      ".prop-dot{display:inline-block;width:12px;height:12px;border-radius:50%;border:1px solid rgba(255,255,255,.5)}" +
      ".prop-sum{font-weight:700;white-space:nowrap}" +
      ".prop-extra{grid-column:1 / -1;display:flex;flex-direction:column;gap:6px}" +
      ".prop-react{display:flex;flex-wrap:wrap;gap:8px}" +
      ".prop-react button.active-like{background:#16a34a;border-color:#16a34a;color:#fff}" +
      ".prop-react button.active-dislike{background:#dc2626;border-color:#dc2626;color:#fff}" +
      ".prop-extra textarea,.proposal textarea{width:100%;box-sizing:border-box;font:inherit;padding:8px 10px;border-radius:10px;" +
        "border:1px solid rgba(255,255,255,.3);background:rgba(255,255,255,.1);color:inherit}" +
      ".prop-badge{display:inline-block;padding:2px 10px;border-radius:999px;font-size:.8rem;background:rgba(255,255,255,.14)}" +
      ".prop-badge.like{background:rgba(34,197,94,.22);color:#86efac}" +
      ".prop-badge.dislike{background:rgba(239,68,68,.22);color:#fca5a5}" +
      ".prop-warn{color:#fbbf24;font-size:.8rem}" +
      ".prop-total{text-align:right;font-weight:800;margin:10px 0}" +
      ".prop-add{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:10px 0}" +
      ".prop-add select,.prop-add input{font:inherit;padding:8px 10px;border-radius:10px;border:1px solid rgba(255,255,255,.3);" +
        "background:rgba(255,255,255,.1);color:inherit;max-width:100%}" +
      ".prop-add select option,.prop-add select optgroup{color:#111}" +
      ".prop-add input[type=number]{width:70px}" +
      ".prop-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}" +
      ".prop-client-note{margin:8px 0;padding:8px 10px;border-radius:10px;background:rgba(255,255,255,.08)}";
    document.head.appendChild(st);
  })();

  /* ---------- Допоміжне ---------- */
  function getProposal(s) {
    return s && s.proposal && Array.isArray(s.proposal.items) ? s.proposal : null;
  }

  function ensureProposal(s) {
    if (!getProposal(s)) {
      s.proposal = { items: [], adminComment: "", clientComment: "", sentAt: 0, respondedAt: 0, version: 0 };
    }
    return s.proposal;
  }

  function isSent(s) {
    const p = getProposal(s);
    return !!(p && p.sentAt);
  }

  function lineInfo(item) {
    const p = getProductById(item.id);
    const col = p && item.color ? findColor(p, item.color) : null;
    const unit = p ? finalPrice(p.price, p.discount) : (Number(item.price) || 0);
    let unavailable = "";
    if (!p) {
      unavailable = "товар більше недоступний";
    } else if (productColors(p).length > 0) {
      if (!col) unavailable = "цього кольору вже немає";
      else if (colorAvailable(p, col) <= 0) unavailable = "немає в наявності";
    } else if (p.stock !== null && p.stock !== undefined) {
      const taken = reservedMap(loadOrders())[String(p.id)] || 0;
      if (Math.max(0, p.stock - taken) <= 0) unavailable = "немає в наявності";
    }
    return {
      name: p ? p.name : (item.name || "Товар"),
      unit: unit,
      qty: Math.max(1, Math.floor(Number(item.qty)) || 1),
      image: p ? (p.image || placeholderImage(p.category)) : placeholderImage(""),
      category: p ? p.category : "",
      colorName: col ? col.name : (item.colorName || ""),
      colorBg: col ? colorBg(col.hex, col.hex2) : "",
      unavailable: unavailable
    };
  }

  function totalOf(p) {
    return p.items.reduce((sum, it) => {
      const info = lineInfo(it);
      return sum + info.unit * info.qty;
    }, 0);
  }

  function itemHTML(item, idx, mode) {
    const info = lineInfo(item);
    const dot = info.colorName
      ? `<span class="prop-dot" style="background:${escapeHTML(info.colorBg || "#888")}"></span>${escapeHTML(info.colorName)} · `
      : "";
    const warn = info.unavailable ? `<span class="prop-warn">⚠️ ${escapeHTML(info.unavailable)}</span>` : "";

    let extra = "";
    if (mode === "client") {
      extra = `
        <div class="prop-extra">
          <div class="prop-react">
            <button type="button" class="btn btn-sm btn-outline${item.reaction === "like" ? " active-like" : ""}" data-prop="react" data-idx="${idx}" data-val="like">👍 Подобається</button>
            <button type="button" class="btn btn-sm btn-outline${item.reaction === "dislike" ? " active-dislike" : ""}" data-prop="react" data-idx="${idx}" data-val="dislike">👎 Не підходить</button>
          </div>
          <textarea rows="2" maxlength="300" data-prop-idx="${idx}" placeholder="Ваш коментар до цього товару (необов’язково)">${escapeHTML(item.comment || "")}</textarea>
        </div>`;
    } else {
      const badge = item.reaction && REACTION_TEXT[item.reaction]
        ? `<span class="prop-badge ${item.reaction}">${REACTION_TEXT[item.reaction]}</span>`
        : '<span class="prop-badge">без відповіді</span>';
      extra = `
        <div class="prop-extra">
          <div>${badge}${mode === "admin" ? ` <button type="button" class="btn btn-sm btn-danger-outline" data-prop="remove" data-idx="${idx}">✕ Прибрати</button>` : ""}</div>
          ${item.comment ? `<div class="prop-client-note"><b>Коментар клієнта:</b> ${escapeHTML(item.comment)}</div>` : ""}
        </div>`;
    }

    return `
      <div class="prop-item">
        <img src="${escapeHTML(info.image)}" alt="" data-category="${escapeHTML(info.category)}">
        <div>
          <div class="prop-name">${escapeHTML(info.name)}</div>
          <div class="prop-meta">${dot}${info.qty} × ${formatPrice(info.unit)} ${warn}</div>
        </div>
        <div class="prop-sum">${formatPrice(info.unit * info.qty)}</div>
        ${extra}
      </div>`;
  }

  /* ---------- Блок для клієнта ---------- */
  function clientHTML(s) {
    if (!isSent(s)) return "";
    const p = getProposal(s);
    const canAnswer = s.status !== "cancelled";
    const answered = p.respondedAt && p.respondedAt >= p.sentAt;

    const rows = p.items.map((it, i) => itemHTML(it, i, canAnswer ? "client" : "view")).join("");
    const adminComment = p.adminComment
      ? `<div class="admin-reply"><b>Коментар менеджера:</b><br>${escapeHTML(p.adminComment)}</div>`
      : "";

    const controls = canAnswer ? `
      <label>Ваш загальний коментар до пропозиції
        <textarea rows="2" maxlength="500" data-prop-field="client-comment" placeholder="Що змінити, що додати, питання до менеджера...">${escapeHTML(p.clientComment || "")}</textarea>
      </label>
      <div class="prop-actions">
        <button type="button" class="btn btn-sm" data-prop="send-answer">📨 Надіслати відповідь магазину</button>
        <button type="button" class="btn btn-sm btn-outline" data-prop="to-cart">🛒 Додати схвалені в кошик</button>
      </div>` : "";

    return `
      <div class="proposal" data-proposal>
        <b>🛍 Пропозиція товарів від магазину</b>
        <div class="proposal-status">Надіслано ${escapeHTML(fmtDate(p.sentAt))}${answered ? " · ✅ ваша відповідь надіслана " + escapeHTML(fmtDate(p.respondedAt)) : " · очікує вашої відповіді"}</div>
        ${adminComment}
        ${rows}
        <div class="prop-total">Разом: ${formatPrice(totalOf(p))}</div>
        ${controls}
      </div>`;
  }

  /* ---------- Блок для адміна ---------- */
  function productOptionsHTML() {
    const list = loadAllProducts().filter(p => p && p.visible !== false);
    const groups = {};
    list.forEach(p => { (groups[p.category] = groups[p.category] || []).push(p); });
    return '<option value="">Оберіть товар…</option>' + Object.keys(groups).map(cat =>
      `<optgroup label="${escapeHTML(CATEGORY_NAMES[cat] || cat)}">` +
      groups[cat].map(p => `<option value="${escapeHTML(p.id)}">${escapeHTML(p.name)} — ${escapeHTML(formatPrice(finalPrice(p.price, p.discount)))}</option>`).join("") +
      "</optgroup>"
    ).join("");
  }

  function adminHTML(s, status) {
    const p = getProposal(s);
    const cancelled = status === "cancelled";
    if (cancelled && !p) return "";

    let state = "Пропозиції ще немає. Додайте товари нижче.";
    if (p && p.items.length && !p.sentAt) state = "Чернетка: клієнт її ще не бачить.";
    if (p && p.sentAt) {
      const answered = p.respondedAt && p.respondedAt >= p.sentAt;
      state = "Надіслано " + fmtDate(p.sentAt) + (answered ? " · ✅ клієнт відповів " + fmtDate(p.respondedAt) : " · очікує відповіді клієнта");
    }

    const rows = p ? p.items.map((it, i) => itemHTML(it, i, cancelled ? "view" : "admin")).join("") : "";
    const total = p && p.items.length ? `<div class="prop-total">Разом: ${formatPrice(totalOf(p))}</div>` : "";
    const clientComment = p && p.clientComment
      ? `<div class="prop-client-note"><b>Загальний коментар клієнта:</b> ${escapeHTML(p.clientComment)}</div>`
      : "";

    let controls = "";
    if (!cancelled) {
      controls = `
        <div class="prop-add">
          <select data-prop-field="product" aria-label="Товар">${productOptionsHTML()}</select>
          <select data-prop-field="color" aria-label="Колір" hidden></select>
          <input type="number" data-prop-field="qty" min="1" max="99" step="1" value="1" aria-label="Кількість">
          <button type="button" class="btn btn-sm" data-prop="add">+ Додати в пропозицію</button>
        </div>
        <label>Коментар до пропозиції (бачить клієнт)
          <textarea rows="2" maxlength="500" data-prop-field="admin-comment">${escapeHTML(p ? p.adminComment || "" : "")}</textarea>
        </label>
        <div class="prop-actions">
          <button type="button" class="btn btn-sm btn-success" data-prop="send"${p && p.items.length ? "" : " disabled"}>${p && p.sentAt ? "📤 Надіслати оновлену пропозицію" : "📤 Надіслати клієнту"}</button>
          ${p ? '<button type="button" class="btn btn-sm btn-danger-outline" data-prop="retract">🗑 Прибрати пропозицію</button>' : ""}
        </div>`;
    }

    return `
      <div class="proposal" data-proposal>
        <b>🛍 Пропозиція товарів клієнту</b>
        <div class="proposal-status">${escapeHTML(state)}</div>
        ${rows}
        ${total}
        ${clientComment}
        ${controls}
      </div>`;
  }

  /* ---------- Дії клієнта ---------- */
  function bindClient(box, rerender) {
    if (!box) return;

    function context(target) {
      const card = target.closest("[data-setup-id]");
      const block = target.closest("[data-proposal]");
      if (!card || !block) return null;
      const account = getLoggedInAccount();
      const list = loadSetups();
      const setup = list.find(s => s.id === card.dataset.setupId);
      if (!account || !setup || !setupBelongsTo(setup, account) || !getProposal(setup) || !setup.proposal.sentAt) return null;
      if (setup.status === "cancelled") return null;
      return { list, setup, block, p: setup.proposal };
    }

    function collect(ctx) {
      ctx.block.querySelectorAll("textarea[data-prop-idx]").forEach(t => {
        const item = ctx.p.items[Number(t.dataset.propIdx)];
        if (item) item.comment = t.value.trim().slice(0, 300);
      });
      const general = ctx.block.querySelector('[data-prop-field="client-comment"]');
      if (general) ctx.p.clientComment = general.value.trim().slice(0, 500);
    }

    box.addEventListener("click", e => {
      const btn = e.target.closest("button[data-prop]");
      if (!btn) return;
      const ctx = context(btn);
      if (!ctx) { if (rerender) rerender(); return; }
      collect(ctx);

      const act = btn.dataset.prop;

      if (act === "react") {
        const item = ctx.p.items[Number(btn.dataset.idx)];
        if (!item) return;
        item.reaction = item.reaction === btn.dataset.val ? "" : btn.dataset.val;
        if (!saveSetups(ctx.list)) { toast("⚠️ Не вдалося зберегти відповідь.", true); return; }
        if (rerender) rerender();
        return;
      }

      if (act === "send-answer") {
        ctx.p.respondedAt = Date.now();
        ctx.setup.updatedAt = Date.now();
        if (!saveSetups(ctx.list)) { toast("⚠️ Не вдалося надіслати відповідь.", true); return; }
        toast("📨 Відповідь надіслано магазину");
        if (rerender) rerender();
        return;
      }

      if (act === "to-cart") {
        saveSetups(ctx.list);
        const liked = ctx.p.items.filter(it => it.reaction === "like");
        if (liked.length === 0) { toast("Спершу позначте товари, які вам подобаються (👍).", true); return; }
        let added = 0;
        liked.forEach(it => {
          if (lineInfo(it).unavailable) return;
          const qty = Math.max(1, Math.floor(Number(it.qty)) || 1);
          for (let i = 0; i < qty; i++) addToCart(it.id, it.color || "");
          added++;
        });
        if (added === 0) toast("Схвалені товари зараз недоступні.", true);
        else toast("🛒 Додано в кошик позицій: " + added);
      }
    });

    // Коментарі зберігаються одразу, щоб не втратитись при оновленні сторінки
    box.addEventListener("change", e => {
      if (!e.target.matches("[data-prop-idx], [data-prop-field='client-comment']")) return;
      const ctx = context(e.target);
      if (!ctx) return;
      collect(ctx);
      saveSetups(ctx.list);
    });
  }

  /* ---------- Дії адміна ---------- */
  function bindAdmin(box, rerender) {
    if (!box) return;

    function context(target) {
      const card = target.closest("[data-setup-id]");
      const block = target.closest("[data-proposal]");
      if (!card || !block) return null;
      const list = loadSetups();
      const setup = list.find(s => s.id === card.dataset.setupId);
      if (!setup || setup.status === "cancelled") return null;
      return { list, setup, block };
    }

    function readComment(ctx) {
      const field = ctx.block.querySelector('[data-prop-field="admin-comment"]');
      if (field) ensureProposal(ctx.setup).adminComment = field.value.trim().slice(0, 500);
    }

    // Список кольорів залежить від обраного товару
    box.addEventListener("change", e => {
      if (!e.target.matches('[data-prop-field="product"]')) return;
      const block = e.target.closest("[data-proposal]");
      const colorSelect = block.querySelector('[data-prop-field="color"]');
      const product = getProductById(e.target.value);
      const colors = product ? productColors(product) : [];
      if (colors.length === 0) {
        colorSelect.hidden = true;
        colorSelect.innerHTML = "";
        return;
      }
      colorSelect.innerHTML = colors.map(c =>
        `<option value="${escapeHTML(c.key)}">${escapeHTML(c.name)} (є ${colorAvailable(product, c)} шт.)</option>`
      ).join("");
      colorSelect.hidden = false;
    });

    box.addEventListener("click", e => {
      const btn = e.target.closest("button[data-prop]");
      if (!btn) return;
      const ctx = context(btn);
      if (!ctx) { if (rerender) rerender(); return; }
      const act = btn.dataset.prop;

      if (act === "add") {
        const product = getProductById(ctx.block.querySelector('[data-prop-field="product"]').value);
        if (!product) { toast("Оберіть товар зі списку.", true); return; }
        const colors = productColors(product);
        let color = null;
        if (colors.length > 0) {
          color = findColor(product, ctx.block.querySelector('[data-prop-field="color"]').value);
          if (!color) { toast("Оберіть колір товару.", true); return; }
        }
        const qty = Math.floor(Number(ctx.block.querySelector('[data-prop-field="qty"]').value));
        if (!Number.isFinite(qty) || qty < 1 || qty > 99) { toast("Кількість — від 1 до 99.", true); return; }

        const p = ensureProposal(ctx.setup);
        readComment(ctx);
        const colorKey = color ? color.key : "";
        const existing = p.items.find(it => String(it.id) === String(product.id) && (it.color || "") === colorKey);
        if (existing) {
          existing.qty = Math.min(99, (Number(existing.qty) || 0) + qty);
        } else {
          p.items.push({
            id: String(product.id), color: colorKey, colorName: color ? color.name : "",
            name: product.name, price: finalPrice(product.price, product.discount),
            qty: qty, reaction: "", comment: ""
          });
        }
        ctx.setup.updatedAt = Date.now();
        if (!saveSetups(ctx.list)) { toast("⚠️ Не вдалося зберегти пропозицію.", true); return; }
        toast("✅ Товар додано в пропозицію");
        if (rerender) rerender();
        return;
      }

      if (act === "remove") {
        const p = getProposal(ctx.setup);
        if (!p) return;
        readComment(ctx);
        p.items.splice(Number(btn.dataset.idx), 1);
        ctx.setup.updatedAt = Date.now();
        saveSetups(ctx.list);
        if (rerender) rerender();
        return;
      }

      if (act === "send") {
        const p = getProposal(ctx.setup);
        readComment(ctx);
        if (!p || p.items.length === 0) { toast("Додайте хоча б один товар.", true); return; }
        p.sentAt = Date.now();
        p.version = (Number(p.version) || 0) + 1;
        ctx.setup.updatedAt = Date.now();
        if (!saveSetups(ctx.list)) { toast("⚠️ Не вдалося надіслати пропозицію.", true); return; }
        toast("📤 Пропозицію надіслано клієнту");
        if (rerender) rerender();
        return;
      }

      if (act === "retract") {
        if (!confirm("Прибрати всю пропозицію? Клієнт її більше не побачить.")) return;
        delete ctx.setup.proposal;
        ctx.setup.updatedAt = Date.now();
        saveSetups(ctx.list);
        toast("Пропозицію прибрано");
        if (rerender) rerender();
      }
    });
  }

  window.SetupProposals = {
    clientHTML: clientHTML,
    adminHTML: adminHTML,
    bindClient: bindClient,
    bindAdmin: bindAdmin
  };
})();