/* ============================================================
   WINTER BG v2 — повноцінна зимова сцена в одному <canvas>
   Підключення: <script src="winter-bg.js"></script> (замість snow.js)
   Потрібен лише: <canvas class="hero-canvas" id="hero-canvas"></canvas> всередині .hero
   ============================================================ */
(function () {
  'use strict';

  const canvas = document.getElementById('hero-canvas');
  if (!canvas) return;
  const hero = canvas.parentElement;
  const ctx = canvas.getContext('2d');
  const REDUCE = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- утиліти ---------- */
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const rand = (a, b) => a + Math.random() * (b - a);
  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function cv(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    return c;
  }

  /* ---------- стан ---------- */
  const PAD = 70;                       // запас по краях шарів для паралакса
  let W = 0, H = 0, DPR = 1, MOBILE = false;
  let t = 0, last = 0, running = false, visible = true, rafId = 0;
  const mouse = { x: .5, y: .5, tx: .5, ty: .5, px: -9999, py: -9999 };
  const S = {};                         // спрайти
  let stars = [], flakesBack = [], flakesFront = [], glitter = [], fogs = [], shoot = [];
  let mount = [], trees = null, aur = null;
  let nextShoot = 3, frames = 0, accDt = 0, degraded = 0, glitterOn = true;

  /* ============================================================
     СПРАЙТИ (малюємо один раз, потім лише drawImage — це швидко)
     ============================================================ */
  function auroraSprite(r, g, b) {
    const c = cv(2, 128), x = c.getContext('2d');
    const gr = x.createLinearGradient(0, 0, 0, 128);
    gr.addColorStop(0, `rgba(${r},${g},${b},0)`);
    gr.addColorStop(.55, `rgba(${r},${g},${b},.18)`);
    gr.addColorStop(.88, `rgba(${r},${g},${b},.85)`);
    gr.addColorStop(1, `rgba(${r},${g},${b},0)`);
    x.fillStyle = gr; x.fillRect(0, 0, 2, 128);
    return c;
  }

  function buildSprites() {
    let c, g, gr;

    // м'яка крапка (сніг, зірки, боке)
    c = cv(64, 64); g = c.getContext('2d');
    gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(.22, 'rgba(240,249,255,.9)');
    gr.addColorStop(.55, 'rgba(190,225,255,.28)');
    gr.addColorStop(1, 'rgba(190,225,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    S.dot = c;

    // кристал-сніжинка з гілочками та сяйвом
    c = cv(96, 96); g = c.getContext('2d');
    gr = g.createRadialGradient(48, 48, 0, 48, 48, 48);
    gr.addColorStop(0, 'rgba(200,232,255,.55)');
    gr.addColorStop(1, 'rgba(200,232,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 96, 96);
    g.translate(48, 48);
    g.strokeStyle = 'rgba(240,250,255,.98)'; g.lineCap = 'round';
    for (let i = 0; i < 6; i++) {
      g.rotate(Math.PI / 3);
      g.lineWidth = 3; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, 40); g.stroke();
      g.lineWidth = 2; g.beginPath();
      g.moveTo(0, 18); g.lineTo(10, 29); g.moveTo(0, 18); g.lineTo(-10, 29);
      g.moveTo(0, 29); g.lineTo(7, 38);  g.moveTo(0, 29); g.lineTo(-7, 38);
      g.stroke();
    }
    S.crystal = c;

    // місяць із ореолом
    c = cv(420, 420); g = c.getContext('2d');
    gr = g.createRadialGradient(210, 210, 10, 210, 210, 210);
    gr.addColorStop(0, 'rgba(190,220,255,.55)');
    gr.addColorStop(.25, 'rgba(150,195,255,.22)');
    gr.addColorStop(1, 'rgba(120,170,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 420, 420);
    gr = g.createRadialGradient(200, 200, 4, 210, 210, 36);
    gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, '#cfe4ff');
    g.fillStyle = gr; g.beginPath(); g.arc(210, 210, 36, 0, TAU); g.fill();
    g.fillStyle = 'rgba(120,160,210,.16)';
    [[198, 200, 9], [222, 218, 6], [214, 196, 4], [200, 224, 5]].forEach(([x, y, r]) => {
      g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    });
    S.moon = c;

    // туман
    c = cv(512, 160); g = c.getContext('2d');
    g.translate(256, 80); g.scale(1, 160 / 512);
    gr = g.createRadialGradient(0, 0, 0, 0, 0, 256);
    gr.addColorStop(0, 'rgba(170,205,255,.24)');
    gr.addColorStop(1, 'rgba(170,205,255,0)');
    g.fillStyle = gr; g.fillRect(-256, -256, 512, 512);
    S.fog = c;
  }

  /* ============================================================
     ГОРИ + ЯЛИНКИ (пререндер у офскрін-канвас)
     ============================================================ */
  function ridgeFn(seed, amp, rough) {
    const r = mulberry32(seed), comps = [];
    for (let i = 0; i < 5; i++) {
      comps.push({ f: (0.9 + i * 1.7) * rough * TAU / 1000, a: Math.pow(.52, i), p: r() * TAU });
    }
    const norm = comps.reduce((s, c) => s + c.a, 0);
    return x => {
      let v = 0;
      for (const c of comps) v += c.a * (1 - Math.abs(Math.sin(x * c.f + c.p)));
      return amp * (v / norm);
    };
  }

  function buildMountains() {
    const specs = [
      { seed: 11, base: .74, amp: .24, rough: 1.0,  top: '#35588f', bot: '#0c1f42', alpha: .85, par: 14, rim: .55, cap: .55 },
      { seed: 27, base: .83, amp: .21, rough: 1.35, top: '#1f3d70', bot: '#081733', alpha: .96, par: 30, rim: .50, cap: .45 },
      { seed: 5,  base: .93, amp: .14, rough: 1.9,  top: '#0f2548', bot: '#050b1a', alpha: 1,   par: 52, rim: .35, cap: .30 }
    ];
    mount = specs.map(s => {
      const cw = W + PAD * 2;
      const c = cv(cw * DPR, H * DPR), g = c.getContext('2d');
      g.scale(DPR, DPR);
      const fn = ridgeFn(s.seed, H * s.amp, s.rough);
      const base = H * s.base, top = base - H * s.amp;

      g.beginPath(); g.moveTo(0, H);
      for (let x = 0; x <= cw; x += 3) g.lineTo(x, base - fn(x));
      g.lineTo(cw, H); g.closePath();
      let gr = g.createLinearGradient(0, top, 0, H);
      gr.addColorStop(0, s.top); gr.addColorStop(1, s.bot);
      g.fillStyle = gr; g.fill();

      // сніг на вершинах
      g.save(); g.clip();
      gr = g.createLinearGradient(0, top, 0, top + H * s.amp * .55);
      gr.addColorStop(0, `rgba(235,246,255,${s.cap})`);
      gr.addColorStop(1, 'rgba(235,246,255,0)');
      g.fillStyle = gr; g.fillRect(0, top, cw, H * s.amp * .6);
      g.restore();

      // світлий контур гребеня
      g.beginPath();
      for (let x = 0; x <= cw; x += 3) {
        const y = base - fn(x);
        if (x) g.lineTo(x, y); else g.moveTo(x, y);
      }
      g.strokeStyle = `rgba(200,230,255,${s.rim})`; g.lineWidth = 1.2;
      g.shadowColor = 'rgba(150,205,255,.9)'; g.shadowBlur = 8; g.stroke();

      return { cv: c, par: s.par, alpha: s.alpha };
    });
  }

  function drawTree(g, x, by, h) {
    const tiers = 4, bw = h * .5;
    g.fillStyle = '#050d1f';
    g.fillRect(x - h * .025, by - h * .08, h * .05, h * .1);
    for (let i = 0; i < tiers; i++) {
      const top = by - h + i * h * .21;
      const bot = top + h * .36;
      const hw = bw / 2 * (.4 + .6 * (i + 1) / tiers);
      g.fillStyle = '#061226';
      g.beginPath(); g.moveTo(x, top); g.lineTo(x - hw, bot); g.lineTo(x + hw, bot); g.closePath(); g.fill();
      g.fillStyle = 'rgba(205,232,255,.20)';   // сніг на лівому схилі
      g.beginPath(); g.moveTo(x, top); g.lineTo(x - hw * .6, top + (bot - top) * .6); g.lineTo(x, top + (bot - top) * .6); g.closePath(); g.fill();
    }
  }

  function buildTrees() {
    const cw = W + PAD * 2;
    const c = cv(cw * DPR, H * DPR), g = c.getContext('2d');
    g.scale(DPR, DPR);
    const r = mulberry32(99);
    const by = H * .985;
    let x = -10;
    while (x < cw) {
      const edge = Math.abs((x - PAD) / W - .5) * 2;   // 0 — центр, 1 — краї
      const h = H * (.05 + .11 * r() * (.35 + .65 * edge)) * (MOBILE ? .8 : 1);
      drawTree(g, x, by + r() * H * .02, h);
      x += h * (.28 + r() * .35);
    }
    const gr = g.createLinearGradient(0, H * .95, 0, H);   // замет знизу
    gr.addColorStop(0, 'rgba(210,235,255,0)');
    gr.addColorStop(1, 'rgba(210,235,255,.22)');
    g.fillStyle = gr; g.fillRect(0, H * .95, cw, H * .05);
    trees = c;
  }

  /* ============================================================
     ПОЛЯРНЕ СЯЙВО (малюється в низькій роздільності й плавно розтягується)
     ============================================================ */
  function buildAurora() {
    const f = MOBILE ? 6 : 4;
    const aw = Math.ceil(W / f), ah = Math.ceil(H * .66 / f);
    const c = cv(aw, ah);
    aur = {
      c, g: c.getContext('2d'), aw, ah, f,
      bands: [
        { s: auroraSprite(80, 255, 170),  y: .58, amp: .10, fr: .016, sp: .30, h: .55, a: .55, p: 0 },
        { s: auroraSprite(70, 215, 255),  y: .50, amp: .12, fr: .011, sp: .22, h: .50, a: .42, p: 2.1 },
        { s: auroraSprite(170, 120, 255), y: .42, amp: .09, fr: .021, sp: .18, h: .40, a: .34, p: 4.2 }
      ]
    };
  }

  function drawAurora(mx) {
    const { g, aw, ah, bands, c, f } = aur;
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, aw, ah);
    g.globalCompositeOperation = 'lighter';
    for (const b of bands) {
      for (let x = 0; x < aw; x += 2) {
        const y = ah * b.y
          + Math.sin(x * b.fr + t * b.sp + b.p) * ah * b.amp
          + Math.sin(x * b.fr * 2.3 - t * b.sp * 1.4 + b.p) * ah * b.amp * .5;
        const ray = ah * b.h * (.65 + .35 * Math.sin(x * .12 + t * .7 + b.p));
        const a = b.a * (.55 + .45 * Math.sin(x * .045 - t * .4 + b.p * 2));
        g.globalAlpha = clamp(a, 0, 1);
        g.drawImage(b.s, x, y - ray, 2.4, ray);
      }
    }
    g.globalAlpha = 1;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = .8 + .15 * Math.sin(t * .25);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(c, -18 - mx * 14, 0, W + 36, ah * f);
    ctx.restore();
  }

  /* ============================================================
     ЗІРКИ, ПАДАЮЧІ ЗІРКИ, МІСЯЦЬ
     ============================================================ */
  function buildStars() {
    const n = Math.round(clamp(W * H / 5500, 60, MOBILE ? 140 : 260));
    stars = Array.from({ length: n }, () => ({
      x: rand(0, W), y: Math.pow(Math.random(), 1.3) * H * .7,
      r: rand(.4, 1.4) * (Math.random() < .06 ? 2.2 : 1),
      ph: rand(0, TAU), sp: rand(.6, 2.2), a: rand(.4, 1)
    }));
  }

  function drawStars(mx) {
    const ox = -mx * 6;
    ctx.fillStyle = '#dff0ff';
    for (const s of stars) {
      const a = s.a * (.55 + .45 * Math.sin(t * s.sp + s.ph));
      ctx.globalAlpha = a;
      if (s.r < 1.6) {
        ctx.fillRect(s.x + ox, s.y, s.r * 1.5, s.r * 1.5);
      } else {
        ctx.drawImage(S.dot, s.x + ox - s.r * 3.5, s.y - s.r * 3.5, s.r * 7, s.r * 7);
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawMoon(mx, my) {
    const sc = clamp(Math.min(W, H) / 800, .6, 1.25);
    const mw = 420 * sc * .9;
    const cx = MOBILE ? W * .78 : W * .8, cy = MOBILE ? H * .14 : H * .19;
    ctx.drawImage(S.moon, cx - mw / 2 - mx * 8, cy - mw / 2 - my * 6, mw, mw);
  }

  function drawShooting(dt) {
    if (!dt) return;
    if (t > nextShoot && shoot.length < 2) {
      shoot.push({ x: rand(W * .3, W * 1.05), y: rand(H * .03, H * .28), vx: -rand(650, 950), vy: rand(240, 380), life: 0, max: rand(.7, 1.1) });
      nextShoot = t + rand(5, 12);
    }
    for (let i = shoot.length - 1; i >= 0; i--) {
      const s = shoot[i];
      s.life += dt; s.x += s.vx * dt; s.y += s.vy * dt;
      const k = s.life / s.max;
      if (k >= 1) { shoot.splice(i, 1); continue; }
      const a = Math.sin(k * Math.PI);
      const tx = s.x - s.vx * .14, ty = s.y - s.vy * .14;
      const gr = ctx.createLinearGradient(tx, ty, s.x, s.y);
      gr.addColorStop(0, 'rgba(200,230,255,0)');
      gr.addColorStop(1, `rgba(255,255,255,${a})`);
      ctx.strokeStyle = gr; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(s.x, s.y); ctx.stroke();
      ctx.globalAlpha = a; ctx.drawImage(S.dot, s.x - 7, s.y - 7, 14, 14); ctx.globalAlpha = 1;
    }
  }

  /* ============================================================
     СНІГ: 2 шари глибини, вітер, пориви, відштовхування курсором
     ============================================================ */
  function makeFlake(init) {
    const z = Math.pow(Math.random(), .8);
    const crystal = z > .62 && Math.random() < .5;
    const bokeh = !crystal && z > .93;
    let s = crystal ? lerp(6, 11, z) : lerp(2.2, 7.5, z);
    let a = lerp(.4, .95, z);
    if (bokeh) { s *= 1.9; a *= .35; }
    return {
      x: rand(0, W), y: init ? rand(-H * .05, H) : rand(-30, -5),
      z, s, a, crystal,
      sp: lerp(22, 85, z) * rand(.85, 1.15),
      sw: rand(8, 26), ps: rand(.4, 1.2), ph: rand(0, TAU),
      rot: rand(0, TAU), rs: rand(-.8, .8),
      ix: 0, iy: 0,
      tw: Math.random() < .18, tp: rand(0, TAU)
    };
  }

  function buildSnow() {
    const n = Math.round(clamp(W * H / 6500, 90, MOBILE ? 150 : 340));
    flakesBack = []; flakesFront = [];
    for (let i = 0; i < n; i++) {
      const f = makeFlake(true);
      (f.z < .55 ? flakesBack : flakesFront).push(f);
    }
  }

  function stepAndDraw(arr, dt, wind) {
    for (const f of arr) {
      if (dt) {
        f.ph += f.ps * dt;
        f.x += (wind * (.25 + f.z) + Math.sin(f.ph) * f.sw + f.ix) * dt;
        f.y += (f.sp + f.iy) * dt;
        f.ix *= .95; f.iy *= .95;
        f.rot += f.rs * dt;
        if (f.z > .45 && mouse.px > -999) {              // курсор розганяє сніг
          const dx = f.x - mouse.px, dy = f.y - mouse.py, d2 = dx * dx + dy * dy;
          if (d2 < 12100 && d2 > 1) {
            const d = Math.sqrt(d2), p = 1 - d / 110;
            f.ix += dx / d * p * 520 * dt;
            f.iy += dy / d * p * 520 * dt;
          }
        }
        if (f.y > H + 20) { f.y = rand(-30, -5); f.x = rand(0, W); }
        if (f.x < -40) f.x = W + 40; else if (f.x > W + 40) f.x = -40;
      }
      let a = f.a;
      if (f.tw) a *= .65 + .35 * Math.sin(t * 3 + f.tp);
      a *= clamp((H - f.y) / (H * .08), 0, 1);
      if (a < .02) continue;
      ctx.globalAlpha = a;
      if (f.crystal) {
        const c = Math.cos(f.rot), s = Math.sin(f.rot);
        ctx.setTransform(DPR * c, DPR * s, -DPR * s, DPR * c, f.x * DPR, f.y * DPR);
        ctx.drawImage(S.crystal, -f.s, -f.s, f.s * 2, f.s * 2);
        ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      } else {
        ctx.drawImage(S.dot, f.x - f.s, f.y - f.s, f.s * 2, f.s * 2);
      }
    }
    ctx.globalAlpha = 1;
  }

  /* ============================================================
     ТУМАН І БЛИСКІТКИ НА СНІГУ
     ============================================================ */
  function buildFog() {
    fogs = [
      { y: .70, sp: 6,  s: 1.4, a: .9, x: 0 },
      { y: .82, sp: -9, s: 1.8, a: .55, x: 200 },
      { y: .93, sp: 12, s: 2.2, a: .6, x: 100 }
    ];
  }

  function drawFog(i) {
    const f = fogs[i];
    const fw = 512 * f.s, fh = 160 * f.s;
    const start = (((f.x + f.sp * t) % fw) + fw) % fw - fw;
    ctx.globalAlpha = f.a;
    for (let x = start; x < W; x += fw * .8) ctx.drawImage(S.fog, x, H * f.y - fh / 2, fw, fh);
    ctx.globalAlpha = 1;
  }

  function buildGlitter() {
    const n = Math.round(W / (MOBILE ? 26 : 14));
    glitter = Array.from({ length: n }, () => ({
      x: rand(0, W), y: rand(H * .9, H * .99), ph: rand(0, TAU), sp: rand(1.5, 4)
    }));
  }

  function drawGlitter(mx) {
    if (!glitterOn) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = '#e8f6ff';
    for (const g of glitter) {
      let a = Math.max(0, Math.sin(t * g.sp + g.ph));
      a = a * a * a * a * a * a;
      if (a < .05) continue;
      const s = 1.5 + a * 2.5, x = g.x - mx * 40;
      ctx.globalAlpha = a * .9;
      ctx.fillRect(x - s, g.y - .4, s * 2, .8);
      ctx.fillRect(x - .4, g.y - s, .8, s * 2);
    }
    ctx.restore();
  }

  /* ============================================================
     ГОЛОВНИЙ КАДР
     ============================================================ */
  function drawLayer(m, mx) {
    ctx.globalAlpha = m.alpha;
    ctx.drawImage(m.cv, -PAD - mx * m.par, 0, W + PAD * 2, H);
    ctx.globalAlpha = 1;
  }

  function draw(dt) {
    mouse.x += (mouse.tx - mouse.x) * .05;
    mouse.y += (mouse.ty - mouse.y) * .05;
    const mx = mouse.x - .5, my = mouse.y - .5;

    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);

    // небо
    drawMoon(mx, my);
    drawStars(mx);
    drawShooting(dt);
    drawAurora(mx);

    // вітер: плавна течія + періодичні пориви + вплив миші
    const gust = Math.pow(Math.max(0, Math.sin(t * .11)), 3) * 70;
    const wind = mx * 60 + Math.sin(t * .3) * 14 + gust;

    // земля, від далекого до ближнього
    drawLayer(mount[0], mx);
    drawFog(0);
    stepAndDraw(flakesBack, dt, wind);
    drawLayer(mount[1], mx);
    drawLayer(mount[2], mx);
    ctx.drawImage(trees, -PAD - mx * 66, 0, W + PAD * 2, H);
    drawFog(1); drawFog(2);
    stepAndDraw(flakesFront, dt, wind);
    drawGlitter(mx);
  }

  /* ============================================================
     ЖИТТЄВИЙ ЦИКЛ
     ============================================================ */
  function buildScene() {
    const r = hero.getBoundingClientRect();
    W = Math.max(1, Math.round(r.width));
    H = Math.max(1, Math.round(r.height));
    MOBILE = W < 800;
    DPR = Math.min(window.devicePixelRatio || 1, MOBILE ? 1.5 : 1.75);
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    buildMountains(); buildTrees(); buildAurora();
    buildStars(); buildSnow(); buildFog(); buildGlitter();
  }

  function perf(dt) {                    // якщо слабкий пристрій — зменшуємо навантаження
    accDt += dt; frames++;
    if (frames < 90) return;
    const avg = accDt / frames;
    frames = 0; accDt = 0;
    if (avg > .027 && degraded < 3) {
      degraded++;
      flakesBack.length = Math.floor(flakesBack.length * .75);
      flakesFront.length = Math.floor(flakesFront.length * .75);
      if (degraded >= 2) glitterOn = false;
    }
  }

  function loop(now) {
    if (!running) return;
    rafId = requestAnimationFrame(loop);
    let dt = (now - last) / 1000;
    last = now;
    if (!(dt > 0)) dt = .016;
    dt = Math.min(dt, .05);
    t += dt;
    perf(dt);
    draw(dt);
  }
  function start() {
    if (running || REDUCE) return;
    running = true; last = performance.now();
    rafId = requestAnimationFrame(loop);
  }
  function stop() { running = false; cancelAnimationFrame(rafId); }
  function sync() { (visible && !document.hidden) ? start() : stop(); }

  /* ---------- події ---------- */
  hero.addEventListener('pointermove', e => {
    const r = hero.getBoundingClientRect();
    mouse.px = e.clientX - r.left; mouse.py = e.clientY - r.top;
    mouse.tx = clamp(mouse.px / r.width, 0, 1);
    mouse.ty = clamp(mouse.py / r.height, 0, 1);
  }, { passive: true });
  hero.addEventListener('pointerleave', () => {
    mouse.px = mouse.py = -9999; mouse.tx = mouse.ty = .5;
  });

  let rz;
  function onResize() {
    clearTimeout(rz);
    rz = setTimeout(() => {
      const r = hero.getBoundingClientRect();
      if (Math.abs(r.width - W) < 1 && Math.abs(r.height - H) < 1) return;
      buildScene();
      if (REDUCE) draw(0);
    }, 120);
  }
  if ('ResizeObserver' in window) new ResizeObserver(onResize).observe(hero);
  else window.addEventListener('resize', onResize);

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(es => { visible = es[0].isIntersecting; sync(); }).observe(hero);
  }
  document.addEventListener('visibilitychange', sync);

  /* ---------- старт ---------- */
  buildSprites();
  buildScene();
  if (REDUCE) draw(0); else sync();
})();