// ===== Красиве випадне меню замість стандартного <select> =====
// Підключається автоматично з products.js і замінює ВСІ звичайні списки вибору на сайті.
// Справжній <select> лишається в сторінці (прихований), тому форми та інші скрипти працюють як раніше.
// Щоб залишити системне меню для конкретного списку, додайте йому атрибут data-native.
(function () {
  "use strict";
  if (window.__uiSelectLoaded) return;
  window.__uiSelectLoaded = true;

  const valueDesc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value");
  const indexDesc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "selectedIndex");
  const instances = new Set();
  const resetForms = new WeakSet();
  let openInst = null;
  let uid = 0;

  /* ---------- Стилі ---------- */
  const style = document.createElement("style");
  style.textContent =
    ".ui-select{position:relative;display:inline-block;max-width:100%;vertical-align:middle}" +
    ".ui-select.is-full{display:block;width:100%}" +
    ".ui-select-native{position:absolute!important;left:0;bottom:0;width:1px!important;height:1px!important;min-width:0!important;" +
      "margin:0!important;overflow:hidden;opacity:0!important;pointer-events:none!important}" +
    ".ui-select .ui-select-btn{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;box-sizing:border-box;" +
      "margin:0;text-align:left;cursor:pointer;-webkit-appearance:none;appearance:none;transition:border-color .15s,box-shadow .15s}" +
    ".ui-select .ui-select-btn:hover:not(:disabled){border-color:rgba(201,160,255,.8)}" +
    ".ui-select .ui-select-btn:focus-visible{outline:2px solid #c9a0ff;outline-offset:2px}" +
    ".ui-select .ui-select-btn:disabled{opacity:.55;cursor:not-allowed}" +
    ".ui-select-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
    ".ui-select-label.is-placeholder{opacity:.6}" +
    ".ui-select-arrow{flex:none;width:12px;height:12px;transition:transform .2s}" +
    ".ui-select.is-open .ui-select-arrow{transform:rotate(180deg)}" +
    ".ui-select-list{position:fixed;z-index:2147483000;margin:0;padding:6px;list-style:none;overflow-y:auto;box-sizing:border-box;" +
      "border-radius:14px;border:1px solid var(--uis-border);background:var(--uis-bg);color:var(--uis-fg);" +
      "box-shadow:0 18px 40px rgba(0,0,0,.45);font:inherit;animation:uisIn .12s ease-out}" +
    "@keyframes uisIn{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}" +
    ".ui-select-group{padding:8px 12px 4px;font-size:.72rem;letter-spacing:.05em;text-transform:uppercase;opacity:.6}" +
    ".ui-select-opt{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 12px;border-radius:10px;" +
      "cursor:pointer;line-height:1.3}" +
    ".ui-select-opt.is-active{background:var(--uis-hover)}" +
    ".ui-select-opt[aria-selected=true]{background:var(--uis-sel);font-weight:600}" +
    ".ui-select-opt.is-placeholder{opacity:.65}" +
    ".ui-select-opt[aria-disabled=true]{opacity:.4;cursor:not-allowed}" +
    ".ui-select-opt .ui-check{flex:none;opacity:0}" +
    ".ui-select-opt[aria-selected=true] .ui-check{opacity:1}";
  document.head.appendChild(style);

  /* ---------- Допоміжні ---------- */
  function parseColor(str) {
    const m = String(str).match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  }
  function luminance(c) {
    return (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255;
  }

  // Копіюємо вигляд справжнього <select> на нашу кнопку, щоб вона вписалась у будь-яку тему
  function syncStyle(inst) {
    const cs = getComputedStyle(inst.select);
    const b = inst.btn.style;
    b.color = cs.color;
    b.fontFamily = cs.fontFamily;
    b.fontSize = cs.fontSize;
    b.fontWeight = cs.fontWeight;
    b.lineHeight = cs.lineHeight;
    b.letterSpacing = cs.letterSpacing;
    b.backgroundColor = cs.backgroundColor;
    b.border = cs.borderTopWidth + " " + cs.borderTopStyle + " " + cs.borderTopColor;
    b.borderRadius = cs.borderRadius;
    b.padding = cs.padding;
    b.boxShadow = cs.boxShadow;
    if (cs.backdropFilter && cs.backdropFilter !== "none") b.backdropFilter = cs.backdropFilter;
    if (parseFloat(cs.height) > 8) b.minHeight = cs.height;
  }

  function currentOption(select) {
    return select.options[select.selectedIndex] || null;
  }

  function refresh(inst) {
    const opt = currentOption(inst.select);
    inst.label.textContent = opt ? opt.text : "";
    inst.label.classList.toggle("is-placeholder", !!opt && opt.value === "");
    inst.btn.disabled = inst.select.disabled;
    if (openInst === inst) close(inst);
  }

  /* ---------- Відкриття / закриття ---------- */
  function buildList(inst) {
    const list = document.createElement("ul");
    list.className = "ui-select-list";
    list.setAttribute("role", "listbox");
    list.id = "uis-list-" + inst.id;
    inst.items = [];

    const addOption = opt => {
      const li = document.createElement("li");
      li.className = "ui-select-opt" + (opt.value === "" ? " is-placeholder" : "");
      li.id = "uis-" + inst.id + "-" + inst.items.length;
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", opt.selected ? "true" : "false");
      if (opt.disabled) li.setAttribute("aria-disabled", "true");
      li.dataset.index = inst.items.length;
      li.innerHTML = "<span></span><span class=\"ui-check\" aria-hidden=\"true\">✓</span>";
      li.firstChild.textContent = opt.text;
      list.appendChild(li);
      inst.items.push({ opt: opt, li: li });
    };

    Array.from(inst.select.children).forEach(node => {
      if (node.tagName === "OPTGROUP") {
        const g = document.createElement("li");
        g.className = "ui-select-group";
        g.setAttribute("role", "presentation");
        g.textContent = node.label;
        list.appendChild(g);
        Array.from(node.children).forEach(o => { if (o.tagName === "OPTION") addOption(o); });
      } else if (node.tagName === "OPTION") {
        addOption(node);
      }
    });

    // Тема меню підлаштовується під колір тексту списку
    const cs = getComputedStyle(inst.select);
    const fg = parseColor(cs.color) || { r: 255, g: 255, b: 255, a: 1 };
    const dark = luminance(fg) > 0.55;
    list.style.setProperty("--uis-fg", cs.color);
    list.style.setProperty("--uis-bg", dark ? "rgba(24,10,40,.98)" : "#ffffff");
    list.style.setProperty("--uis-border", dark ? "rgba(255,255,255,.18)" : "rgba(0,0,0,.15)");
    list.style.setProperty("--uis-hover", dark ? "rgba(255,255,255,.10)" : "rgba(0,0,0,.06)");
    list.style.setProperty("--uis-sel", dark ? "rgba(190,130,255,.28)" : "rgba(120,60,200,.16)");
    list.style.fontSize = cs.fontSize;
    list.style.fontFamily = cs.fontFamily;
    return list;
  }

  function position(inst) {
    const list = inst.list;
    const r = inst.btn.getBoundingClientRect();
    const margin = 8;
    list.style.minWidth = r.width + "px";
    list.style.maxWidth = Math.max(r.width, Math.min(480, window.innerWidth - margin * 2)) + "px";
    list.style.maxHeight = "320px";
    const below = window.innerHeight - r.bottom - margin;
    const above = r.top - margin;
    const height = Math.min(list.scrollHeight + 2, 320);
    const up = below < Math.min(height, 200) && above > below;
    const room = Math.max(120, up ? above : below) - 6;
    list.style.maxHeight = Math.min(320, room) + "px";
    list.style.left = Math.max(margin, Math.min(r.left, window.innerWidth - list.offsetWidth - margin)) + "px";
    if (up) { list.style.top = "auto"; list.style.bottom = (window.innerHeight - r.top + 6) + "px"; }
    else { list.style.bottom = "auto"; list.style.top = (r.bottom + 6) + "px"; }
  }

  function setActive(inst, index, scroll) {
    if (!inst.items.length) return;
    index = Math.max(0, Math.min(inst.items.length - 1, index));
    inst.items.forEach((it, i) => it.li.classList.toggle("is-active", i === index));
    inst.active = index;
    inst.btn.setAttribute("aria-activedescendant", inst.items[index].li.id);
    if (scroll !== false) inst.items[index].li.scrollIntoView({ block: "nearest" });
  }

  function step(inst, from, dir) {
    let i = from;
    for (let n = 0; n < inst.items.length; n++) {
      i += dir;
      if (i < 0 || i >= inst.items.length) return from;
      if (!inst.items[i].opt.disabled) return i;
    }
    return from;
  }

  function open(inst) {
    if (inst.select.disabled || openInst === inst) return;
    if (openInst) close(openInst);
    syncStyle(inst);
    inst.list = buildList(inst);
    document.body.appendChild(inst.list);
    inst.wrap.classList.add("is-open");
    inst.btn.setAttribute("aria-expanded", "true");
    inst.btn.setAttribute("aria-controls", inst.list.id);
    openInst = inst;
    position(inst);
    setActive(inst, Math.max(0, inst.select.selectedIndex));
  }

  function close(inst) {
    if (!inst || openInst !== inst) return;
    if (inst.list) inst.list.remove();
    inst.list = null;
    inst.wrap.classList.remove("is-open");
    inst.btn.setAttribute("aria-expanded", "false");
    inst.btn.removeAttribute("aria-activedescendant");
    openInst = null;
  }

  function choose(inst, index) {
    const item = inst.items[index];
    if (!item || item.opt.disabled) return;
    const changed = inst.select.selectedIndex !== item.opt.index;
    indexDesc.set.call(inst.select, item.opt.index);
    close(inst);
    refresh(inst);
    inst.btn.focus();
    if (changed) {
      inst.select.dispatchEvent(new Event("input", { bubbles: true }));
      inst.select.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }

  /* ---------- Підключення до <select> ---------- */
  function enhance(select) {
    if (select.dataset.uiSelect || select.multiple || select.size > 1 || select.hasAttribute("data-native")) return;
    if (!select.parentNode || select.closest(".ui-select-list")) return;
    select.dataset.uiSelect = "1";

    const parent = select.parentElement;
    const cs = getComputedStyle(select);
    const parentDisplay = getComputedStyle(parent).display;
    const width = select.offsetWidth;

    const wrap = document.createElement("div");
    wrap.className = "ui-select";
    if (/flex|grid/.test(parentDisplay)) {
      wrap.style.flex = cs.flex;
      wrap.style.minWidth = cs.minWidth === "auto" ? "0" : cs.minWidth;
      wrap.style.margin = cs.margin;
      wrap.style.alignSelf = cs.alignSelf;
    } else if (!width || width >= (parent.clientWidth - 2) * 0.95) {
      wrap.classList.add("is-full");
    } else {
      wrap.style.width = width + "px";
    }

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ui-select-btn";
    btn.setAttribute("aria-haspopup", "listbox");
    btn.setAttribute("aria-expanded", "false");
    const aria = select.getAttribute("aria-label");
    if (aria) btn.setAttribute("aria-label", aria);
    btn.innerHTML = '<span class="ui-select-label"></span>' +
      '<svg class="ui-select-arrow" viewBox="0 0 10 10" aria-hidden="true"><path d="M1 3l4 4 4-4" fill="none" ' +
      'stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

    select.parentNode.insertBefore(wrap, select);
    wrap.appendChild(btn);
    wrap.appendChild(select);
    select.classList.add("ui-select-native");
    select.tabIndex = -1;
    select.setAttribute("aria-hidden", "true");

    const inst = { id: ++uid, select: select, wrap: wrap, btn: btn, label: btn.firstChild, items: [], active: 0, list: null };
    instances.add(inst);

    // Скрипти сторінки змінюють .value / .selectedIndex напряму — підхоплюємо це
    Object.defineProperty(select, "value", {
      configurable: true,
      get() { return valueDesc.get.call(this); },
      set(v) { valueDesc.set.call(this, v); refresh(inst); }
    });
    Object.defineProperty(select, "selectedIndex", {
      configurable: true,
      get() { return indexDesc.get.call(this); },
      set(v) { indexDesc.set.call(this, v); refresh(inst); }
    });

    new MutationObserver(() => refresh(inst)).observe(select, {
      childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["disabled", "label"]
    });

    if (select.form && !resetForms.has(select.form)) {
      resetForms.add(select.form);
      select.form.addEventListener("reset", () => setTimeout(() => instances.forEach(refresh), 0));
    }

    btn.addEventListener("click", () => (openInst === inst ? close(inst) : open(inst)));
    // клік по <label for="..."> активує справжній select — відкриваємо наше меню
    select.addEventListener("click", () => { if (openInst !== inst) open(inst); });

    btn.addEventListener("keydown", e => {
      const isOpen = openInst === inst;
      const k = e.key;
      if (!isOpen) {
        if (k === "ArrowDown" || k === "ArrowUp" || k === "Enter" || k === " ") { e.preventDefault(); open(inst); }
        return;
      }
      if (k === "Escape") { e.preventDefault(); close(inst); }
      else if (k === "Tab") close(inst);
      else if (k === "ArrowDown") { e.preventDefault(); setActive(inst, step(inst, inst.active, 1)); }
      else if (k === "ArrowUp") { e.preventDefault(); setActive(inst, step(inst, inst.active, -1)); }
      else if (k === "Home") { e.preventDefault(); setActive(inst, step(inst, -1, 1)); }
      else if (k === "End") { e.preventDefault(); setActive(inst, step(inst, inst.items.length, -1)); }
      else if (k === "Enter" || k === " ") { e.preventDefault(); choose(inst, inst.active); }
      else if (k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const ch = k.toLowerCase();
        const n = inst.items.length;
        for (let off = 1; off <= n; off++) {
          const i = (inst.active + off) % n;
          if (!inst.items[i].opt.disabled && inst.items[i].opt.text.trim().toLowerCase().startsWith(ch)) { setActive(inst, i); break; }
        }
      }
    });

    syncStyle(inst);
    refresh(inst);
  }

  function enhanceAll(root) {
    if (root.nodeType !== 1) return;
    if (root.tagName === "SELECT") enhance(root);
    root.querySelectorAll && root.querySelectorAll("select").forEach(enhance);
  }

  /* ---------- Події сторінки ---------- */
  document.addEventListener("pointerdown", e => {
    if (!openInst) return;
    if (openInst.list && openInst.list.contains(e.target)) return;
    if (openInst.btn.contains(e.target)) return;
    close(openInst);
  }, true);

  document.addEventListener("click", e => {
    if (!openInst || !openInst.list) return;
    const li = e.target.closest && e.target.closest(".ui-select-opt");
    if (li && openInst.list.contains(li)) choose(openInst, Number(li.dataset.index));
  });

  document.addEventListener("mousemove", e => {
    if (!openInst || !openInst.list) return;
    const li = e.target.closest && e.target.closest(".ui-select-opt");
    if (li && openInst.list.contains(li) && li.getAttribute("aria-disabled") !== "true") setActive(openInst, Number(li.dataset.index), false);
  });

  window.addEventListener("resize", () => { if (openInst) close(openInst); });
  window.addEventListener("scroll", e => {
    if (!openInst || !openInst.list || openInst.list.contains(e.target)) return;
    const r = openInst.btn.getBoundingClientRect();
    if (r.bottom < 0 || r.top > window.innerHeight) close(openInst);
    else position(openInst);
  }, true);

  // Змінилась тема сайту (клас/атрибут на html чи body) — оновлюємо вигляд кнопок
  let themeTimer = null;
  function resyncAll() {
    cancelAnimationFrame(themeTimer);
    themeTimer = requestAnimationFrame(() => {
      instances.forEach(inst => { if (!inst.select.isConnected) instances.delete(inst); else syncStyle(inst); });
    });
  }
  const themeObserver = new MutationObserver(resyncAll);
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme", "style"] });
  if (window.matchMedia) {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    if (mq.addEventListener) mq.addEventListener("change", resyncAll);
  }

  function start() {
    enhanceAll(document.body);
    new MutationObserver(mutations => {
      mutations.forEach(m => m.addedNodes.forEach(enhanceAll));
    }).observe(document.body, { childList: true, subtree: true });
    themeObserver.observe(document.body, { attributes: true, attributeFilter: ["class", "data-theme", "style"] });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();