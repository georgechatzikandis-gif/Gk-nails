(() => {
  const body = document.body;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  body.classList.add("loading");
  document.getElementById("year").textContent = new Date().getFullYear();

  /* ---------- Preloader ---------- */
  const preloader = document.getElementById("preloader");
  const finishLoading = () => {
    preloader.classList.add("done");
    body.classList.remove("loading");
    body.classList.add("loaded");
  };
  window.addEventListener("load", () => setTimeout(finishLoading, reduceMotion ? 0 : 1500));
  setTimeout(finishLoading, 4000); // safety net

  /* ---------- Nav: scroll state, hide on scroll down ---------- */
  const nav = document.getElementById("nav");
  const toTop = document.getElementById("toTop");
  let lastY = 0;
  const onScroll = () => {
    const y = window.scrollY;
    nav.classList.toggle("scrolled", y > 40);
    nav.classList.toggle("hidden", y > lastY && y > 400 && !navLinks.classList.contains("open"));
    toTop.classList.toggle("show", y > 700);
    lastY = y;
  };

  /* ---------- Mobile menu ---------- */
  const navToggle = document.getElementById("navToggle");
  const navLinks = document.getElementById("navLinks");
  const setMenu = (open) => {
    navLinks.classList.toggle("open", open);
    navToggle.setAttribute("aria-expanded", String(open));
    body.style.overflow = open ? "hidden" : "";
  };
  navToggle.addEventListener("click", () => setMenu(!navLinks.classList.contains("open")));
  navLinks.querySelectorAll("a").forEach((a) => a.addEventListener("click", () => setMenu(false)));

  /* ---------- Active nav link ---------- */
  const sections = [...document.querySelectorAll("section[id]")];
  const linkFor = (id) => navLinks.querySelector(`a[href="#${id}"]:not(.btn)`);
  const sectionObserver = new IntersectionObserver(
    (entries) => entries.forEach((e) => {
      const l = linkFor(e.target.id);
      if (l) l.classList.toggle("active", e.isIntersecting);
    }),
    { rootMargin: "-45% 0px -50% 0px" }
  );
  sections.forEach((s) => sectionObserver.observe(s));

  /* ---------- Reveal on scroll (with stagger) ---------- */
  const revealObserver = new IntersectionObserver(
    (entries) => entries.forEach((e) => {
      if (e.isIntersecting) {
        e.target.classList.add("in");
        revealObserver.unobserve(e.target);
      }
    }),
    { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
  );
  document.querySelectorAll(".reveal").forEach((el) => {
    const siblings = [...el.parentElement.children].filter((c) => c.classList.contains("reveal"));
    el.style.setProperty("--d", `${Math.min(siblings.indexOf(el), 6) * 0.1}s`);
    revealObserver.observe(el);
  });

  /* ---------- Counter ---------- */
  document.querySelectorAll("[data-count]").forEach((el) => {
    const target = +el.dataset.count;
    const obs = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      obs.disconnect();
      const start = performance.now();
      const step = (t) => {
        const p = Math.min((t - start) / 1600, 1);
        el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3)));
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }, { threshold: 0.6 });
    obs.observe(el);
  });

  /* ---------- Parallax ---------- */
  const parallaxEls = [...document.querySelectorAll("[data-parallax]")];
  const parallaxImgs = [...document.querySelectorAll("[data-parallax-img]")];
  const parallax = () => {
    if (reduceMotion) return;
    const y = window.scrollY;
    parallaxEls.forEach((el) => {
      el.style.transform = `translateY(${y * parseFloat(el.dataset.parallax)}px)`;
    });
    parallaxImgs.forEach((img) => {
      const r = img.parentElement.getBoundingClientRect();
      const p = (r.top + r.height / 2 - innerHeight / 2) / innerHeight;
      img.style.transform = `translateY(${-8 + p * -10}%)`;
    });
  };

  let ticking = false;
  window.addEventListener("scroll", () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { onScroll(); parallax(); ticking = false; });
  }, { passive: true });
  onScroll(); parallax();

  /* ---------- 3D tilt on hover (pointer devices) ---------- */
  if (!reduceMotion && matchMedia("(hover: hover)").matches) {
    document.querySelectorAll(".tilt").forEach((el) => {
      el.addEventListener("pointermove", (e) => {
        const r = el.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5;
        const y = (e.clientY - r.top) / r.height - 0.5;
        el.style.transform = `perspective(900px) rotateY(${x * 10}deg) rotateX(${-y * 10}deg) scale(1.02)`;
      });
      el.addEventListener("pointerleave", () => { el.style.transform = ""; });
    });
  }

  /* ---------- Lightbox ---------- */
  const items = [...document.querySelectorAll(".gallery__item")];
  const lb = document.getElementById("lightbox");
  const lbImg = lb.querySelector("img");
  const lbCap = lb.querySelector("figcaption");
  let current = 0;
  const show = (i) => {
    current = (i + items.length) % items.length;
    const img = items[current].querySelector("img");
    lbImg.src = img.src;
    lbImg.alt = img.alt;
    lbCap.textContent = items[current].dataset.caption;
  };
  const open = (i) => { show(i); lb.classList.add("open"); body.style.overflow = "hidden"; };
  const close = () => { lb.classList.remove("open"); body.style.overflow = ""; };
  items.forEach((it, i) => it.addEventListener("click", () => open(i)));
  lb.querySelector(".lightbox__close").addEventListener("click", close);
  lb.querySelector(".lightbox__nav--prev").addEventListener("click", (e) => { e.stopPropagation(); show(current - 1); });
  lb.querySelector(".lightbox__nav--next").addEventListener("click", (e) => { e.stopPropagation(); show(current + 1); });
  lb.addEventListener("click", (e) => { if (e.target === lb) close(); });
  document.addEventListener("keydown", (e) => {
    if (!lb.classList.contains("open")) return;
    if (e.key === "Escape") close();
    if (e.key === "ArrowLeft") show(current - 1);
    if (e.key === "ArrowRight") show(current + 1);
  });

  /* ---------- Falling petals ---------- */
  const canvas = document.getElementById("petals");
  if (!reduceMotion && canvas.getContext) {
    const ctx = canvas.getContext("2d");
    const colors = ["#f2b8b5", "#e9a9a6", "#f8d4cf", "#d98c84"];
    let W, H, petals = [];
    const resize = () => {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      W = innerWidth; H = innerHeight;
      canvas.width = W * dpr; canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const make = (initial) => ({
      x: Math.random() * W,
      y: initial ? Math.random() * H : -20,
      s: 6 + Math.random() * 8,
      vy: 0.35 + Math.random() * 0.6,
      vx: -0.2 + Math.random() * 0.4,
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 0.03,
      sway: Math.random() * Math.PI * 2,
      c: colors[(Math.random() * colors.length) | 0],
      a: 0.35 + Math.random() * 0.4,
    });
    resize();
    const count = W < 600 ? 12 : 22;
    for (let i = 0; i < count; i++) petals.push(make(true));
    addEventListener("resize", resize);

    const draw = (p) => {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.scale(1, Math.abs(Math.cos(p.sway * 0.7)) * 0.6 + 0.4);
      ctx.globalAlpha = p.a;
      ctx.fillStyle = p.c;
      ctx.beginPath();
      ctx.moveTo(0, -p.s);
      ctx.bezierCurveTo(p.s * 0.9, -p.s * 0.6, p.s * 0.7, p.s * 0.6, 0, p.s);
      ctx.bezierCurveTo(-p.s * 0.7, p.s * 0.6, -p.s * 0.9, -p.s * 0.6, 0, -p.s);
      ctx.fill();
      ctx.restore();
    };
    const tick = () => {
      ctx.clearRect(0, 0, W, H);
      petals.forEach((p, i) => {
        p.sway += 0.015;
        p.x += p.vx + Math.sin(p.sway) * 0.5;
        p.y += p.vy;
        p.rot += p.vr;
        if (p.y > H + 20 || p.x < -30 || p.x > W + 30) petals[i] = make(false);
        draw(p);
      });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
})();
