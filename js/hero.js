// ===== Анімований фон hero: частинки, що світяться і з'єднуються лініями =====
(function () {
  const canvas = document.getElementById("hero-canvas");
  if (!canvas) return; // ми не на головній сторінці

  const ctx = canvas.getContext("2d");
  const hero = canvas.parentElement;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const COLORS = ["225,29,72", "124,58, 237"]; // червоний та фіолетовий (RGB)
  const LINK_DISTANCE = 130;   // з якої відстані частинки з'єднуються лініями
  const MOUSE_DISTANCE = 160;  // радіус впливу курсора

  let width = 0, height = 0, particles = [];
  const mouse = { x: null, y: null };

  // Створення однієї частинки
  function createParticle() {
    return {
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.5,
      vy: (Math.random() - 0.5) * 0.5,
      r: Math.random() * 2 + 1,
      color: COLORS[Math.random() < 0.5 ? 0 : 1]
    };
  }

  // Підганяємо canvas під розмір hero (з урахуванням чіткості екрана)
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = hero.clientWidth;
    height = hero.clientHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const count = Math.min(110, Math.floor((width * height) / 14000));
    particles = [];
    for (let i = 0; i < count; i++) particles.push(createParticle());
  }

  // Оновлення позицій
  function update() {
    for (const p of particles) {
      // відштовхування від курсора
      if (mouse.x !== null) {
        const dx = p.x - mouse.x;
        const dy = p.y - mouse.y;
        const dist = Math.hypot(dx, dy);
        if (dist < MOUSE_DISTANCE && dist > 0) {
          const force = (MOUSE_DISTANCE - dist) / MOUSE_DISTANCE;
          p.x += (dx / dist) * force * 2.2;
          p.y += (dy / dist) * force * 2.2;
        }
      }
      p.x += p.vx;
      p.y += p.vy;

      // повертаємо частинку з іншого боку, якщо вона вийшла за екран
      if (p.x < 0) p.x = width;
      if (p.x > width) p.x = 0;
      if (p.y < 0) p.y = height;
      if (p.y > height) p.y = 0;
    }
  }

  // Малювання
  function draw() {
    ctx.clearRect(0, 0, width, height);

    // лінії між близькими частинками
    for (let i = 0; i < particles.length; i++) {
      const a = particles[i];
      for (let j = i + 1; j < particles.length; j++) {
        const b = particles[j];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (dist < LINK_DISTANCE) {
          ctx.strokeStyle = `rgba(${a.color},${(1 - dist / LINK_DISTANCE) * 0.35})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }

      // лінії від курсора до частинок
      if (mouse.x !== null) {
        const dist = Math.hypot(a.x - mouse.x, a.y - mouse.y);
        if (dist < MOUSE_DISTANCE) {
          ctx.strokeStyle = `rgba(255,255,255,${(1 - dist / MOUSE_DISTANCE) * 0.3})`;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(mouse.x, mouse.y);
          ctx.stroke();
        }
      }
    }

    // самі частинки зі світінням
    for (const p of particles) {
      ctx.fillStyle = `rgba(${p.color},0.15)`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * 4, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = `rgba(${p.color},0.95)`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Головний цикл анімації
  function loop() {
    update();
    draw();
    requestAnimationFrame(loop);
  }

  // Відстеження миші та дотику
  function setPointer(clientX, clientY) {
    const rect = hero.getBoundingClientRect();
    mouse.x = clientX - rect.left;
    mouse.y = clientY - rect.top;
  }
  hero.addEventListener("mousemove", e => setPointer(e.clientX, e.clientY));
  hero.addEventListener("mouseleave", () => { mouse.x = null; mouse.y = null; });
  hero.addEventListener("touchmove", e => {
    if (e.touches[0]) setPointer(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: true });
  hero.addEventListener("touchend", () => { mouse.x = null; mouse.y = null; });

  // Перерахунок при зміні розміру вікна
  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      resize();
      if (reduceMotion) draw();
    }, 150);
  });

  // Старт
  resize();
  if (reduceMotion) {
    draw();           // одна статична картинка без руху
  } else {
    loop();
  }
})();