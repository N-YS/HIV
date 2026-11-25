/* Landing page: drawn computer -> zoom into screen -> forum cards -> words -> word cloud.
   Scroll drives everything through one progress value p (0..1). Words repel the pointer. */
(() => {
  'use strict';
  const doc = document.documentElement;
  doc.classList.add('js');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) doc.classList.add('reduce');

  const $ = (id) => document.getElementById(id);
  const landing = $('landing'), stage = $('stage'), comp = $('computer'), screenEl = $('screenRect');
  const forum = $('forum'), cloud = $('cloud'), hiv = $('hiv'), hint = $('hint');
  const cards = Array.from(forum.querySelectorAll('.card'));
  /* cloud words are lifted from the keyword spans inside the real posts: one word per distinct keyword */
  const wordEls = [];
  (() => {
    const seen = {}; let n = 0;
    forum.querySelectorAll('.t').forEach((sp) => {
      const key = sp.textContent.toLowerCase();
      if (seen[key]) return;
      seen[key] = 1;
      const el = document.createElement('span');
      el.className = 'w' + (n % 3 === 1 ? ' i' : '');
      el.dataset.w = sp.dataset.w; el.textContent = sp.textContent; el._span = sp;
      cloud.appendChild(el); wordEls.push(el); n++;
    });
  })();

  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const smooth = (a, b, p) => { const t = clamp((p - a) / (b - a)); return t * t * (3 - 2 * t); };
  const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  const lerp = (a, b, t) => a + (b - a) * t;

  let vw = 0, vh = 0, dxT = 0, dyT = 0, sMax = 1;
  let words = [];            // {el,size,w,h,tx,ty,sx,sy,ox,oy,vx,vy,k}
  let hivBox = { w: 0, h: 0, cx: 0, cy: 0 };
  let progress = reduce ? 1 : 0;
  const ptr = { x: -9999, y: -9999, burst: 0 };
  let raf = 0, physicsAlive = false;

  /* ---------- measuring ---------- */
  function measureScene() {
    vw = stage.clientWidth; vh = stage.clientHeight;
    if (reduce) return;
    const prev = comp.style.transform;
    comp.style.transform = 'none';
    const st = stage.getBoundingClientRect();
    const cr = comp.getBoundingClientRect();
    const sr = screenEl.getBoundingClientRect();
    const scx = sr.left + sr.width / 2 - st.left, scy = sr.top + sr.height / 2 - st.top;
    comp.style.transformOrigin = (scx - (cr.left - st.left)) + 'px ' + (scy - (cr.top - st.top)) + 'px';
    dxT = vw / 2 - scx; dyT = vh / 2 - scy;
    sMax = Math.max(vw / sr.width, vh / sr.height) * 1.08;
    comp.style.transform = prev;
  }

  const canvas = document.createElement('canvas').getContext('2d');
  function textWidth(txt, size, italic) {
    const fam = getComputedStyle(document.body).fontFamily;
    canvas.font = (italic ? 'italic ' : '') + size + 'px ' + fam;
    return canvas.measureText(txt).width;
  }

  /* scatter over the whole stage: best-candidate sampling keeps the words evenly spread, with a gap for HIV */
  function layoutWords() {
    const k = clamp(Math.sqrt(vw * vh) / 560, 0.85, 2.1);
    const margin = vw < 600 ? 20 : 30;
    const hivSize = Math.min(vw * 0.34, vh * 0.28, 260);
    hiv.style.fontSize = hivSize + 'px';
    const hw = textWidth('HIV', hivSize, false) * 1.02, hh = hivSize * 1.12;
    hivBox = { w: hw, h: hh, cx: vw / 2, cy: vh / 2 };
    const occupied = [{ x: vw / 2 - hw / 2 - 16, y: vh / 2 - hh / 2 - 10, w: hw + 32, h: hh + 20 }];
    const order = wordEls.map((el, i) => ({ el, i, wt: +el.dataset.w })).sort((a, b) => b.wt - a.wt || a.i - b.i);
    const st = stage.getBoundingClientRect();
    cards.forEach((c) => { c._tf = c.style.transform; c.style.transform = 'none'; });
    let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const placedC = [];
    words = [];
    order.forEach((o, n) => {
      const size = Math.max(13, (11 + o.wt * 5.2) * k);
      const italic = o.el.classList.contains('i');
      const w = textWidth(o.el.textContent, size, italic) + 4, h = size * 1.08;
      let best = null, bestD = -1;
      for (let i = 0; i < 90; i++) {
        const x = margin + rnd() * Math.max(1, vw - w - margin * 2), y = margin + rnd() * Math.max(1, vh - h - margin * 2);
        let ok = true;
        for (const q of occupied) { if (x < q.x + q.w + 14 && x + w + 14 > q.x && y < q.y + q.h + 10 && y + h + 10 > q.y) { ok = false; break; } }
        if (!ok) continue;
        let d = 1e9; for (const q of placedC) d = Math.min(d, Math.hypot(q.x - (x + w / 2), (q.y - (y + h / 2)) * 1.6));
        if (d > bestD) { bestD = d; best = { x, y }; }
      }
      if (!best) { o.el.style.display = 'none'; return; }
      o.el.style.display = '';
      o.el.style.fontSize = size + 'px';
      occupied.push({ x: best.x, y: best.y, w, h }); placedC.push({ x: best.x + w / 2, y: best.y + h / 2 });
      /* start where the word sits inside its post */
      const sp = o.el._span; let r = sp.getBoundingClientRect(), s0 = 0.6, fromSpan = r.width > 0;
      let cx, cy;
      if (fromSpan) { cx = r.left - st.left + r.width / 2; cy = r.top - st.top + r.height / 2; s0 = clamp(parseFloat(getComputedStyle(sp).fontSize) / size, 0.3, 1); }
      else { cx = vw / 2; cy = vh / 2; }
      words.push({ el: o.el, span: fromSpan ? sp : null, size, w, h, tx: best.x, ty: best.y,
        sx: cx - w / 2, sy: cy - h / 2, s0,
        ox: 0, oy: 0, vx: 0, vy: 0, k: n / Math.max(1, order.length - 1), lastSp: 1,
        ax: 7 + rnd() * 11, ay: 6 + rnd() * 9, f1: 0.22 + rnd() * 0.4, f2: 0.18 + rnd() * 0.4, p1: rnd() * 6.28, p2: rnd() * 6.28 });
    });
    cards.forEach((c) => { c.style.transform = c._tf || ''; });
  }

  /* ---------- per-frame drawing ---------- */
  function drawScene(p) {
    if (!reduce) {
      const z = ease(smooth(0.08, 0.32, p));
      comp.style.transform = 'translate3d(' + (z * dxT) + 'px,' + (z * dyT) + 'px,0) scale(' + (1 + z * (sMax - 1)) + ')';
      comp.parentNode.style.visibility = p > 0.38 ? 'hidden' : 'visible';
      hint.style.opacity = String(1 - smooth(0, 0.05, p));
      hint.style.animation = p > 0.0005 ? 'none' : '';
      const fo = smooth(0.29, 0.35, p);
      forum.style.opacity = String(fo);
      forum.style.visibility = (fo > 0 && p < 0.8) ? 'visible' : 'hidden';
      forum.style.setProperty('--bg', String(1 - smooth(0.6, 0.74, p)));
      cards.forEach((c, idx) => {
        const i = (idx % 3) * 2 + (idx >= 3 ? 1 : 0);
        const a = smooth(0.34 + i * 0.014, 0.41 + i * 0.014, p);
        const f = 1 - smooth(0.6 + i * 0.008, 0.7 + i * 0.008, p);
        c.style.opacity = String(a * f);
        c.style.transform = 'translateY(' + ((1 - a) * 16 + (1 - f) * -10) + 'px) scale(' + (0.96 + 0.04 * f) + ')';
      });
    }
    const ho = smooth(0.72, 0.85, p);
    hiv.style.opacity = String(ho);
    hiv.style.transform = 'translate3d(' + (hivBox.cx - hivBox.w / 2) + 'px,' + (hivBox.cy - hivBox.h / 2) + 'px,0) scale(' + (0.75 + 0.25 * ho) + ')';
    hiv.style.transformOrigin = '50% 50%';
  }

  let now = 0;
  function placeWords(p, step) {
    const active = p > 0.82 && !reduce;
    const R = Math.max(110, Math.min(vw, vh) * 0.22) * (1 + ptr.burst * 0.9);
    const settle = reduce ? 0 : smooth(0.74, 0.86, p);
    const t = now / 1000;
    let alive = settle > 0;
    for (const wd of words) {
      const a = reduce ? 1 : ease(smooth(0.5 + wd.k * 0.1, 0.66 + wd.k * 0.1, p));
      const op = reduce ? 1 : smooth(0.5 + wd.k * 0.1, 0.515 + wd.k * 0.1, p);
      let bx = lerp(wd.sx, wd.tx, a), by = lerp(wd.sy, wd.ty, a);
      /* ambient float, always drifting once the cloud has settled */
      if (settle > 0) { bx += Math.sin(t * wd.f1 + wd.p1) * wd.ax * settle; by += Math.cos(t * wd.f2 + wd.p2) * wd.ay * settle; }
      let tx = 0, ty = 0;
      if (active && ptr.x > -9000) {
        const dx = bx + wd.w / 2 - ptr.x, dy = by + wd.h / 2 - ptr.y, d = Math.hypot(dx, dy) || 1;
        if (d < R) { const f = 1 - d / R, push = f * f * (72 + ptr.burst * 70); tx = dx / d * push; ty = dy / d * push; }
      }
      if (step) {
        wd.vx = (wd.vx + (tx - wd.ox) * 0.09) * 0.8; wd.vy = (wd.vy + (ty - wd.oy) * 0.09) * 0.8;
        wd.ox += wd.vx; wd.oy += wd.vy;
      }
      wd.el.style.opacity = String(op);
      wd.el.style.transform = 'translate3d(' + (bx + wd.ox) + 'px,' + (by + wd.oy) + 'px,0) scale(' + (wd.s0 + (1 - wd.s0) * a) + ')';
      /* the word has left its post, so the post's own text is hollowed out */
      if (wd.span && !reduce) { const v = op > 0.5 ? 0 : 1; if (v !== wd.lastSp) { wd.span.style.opacity = String(v); wd.lastSp = v; } }
    }
    ptr.burst *= 0.93; if (ptr.burst < 0.01) ptr.burst = 0;
    return alive;
  }

  let inView = true;
  function frame(ts) {
    raf = 0; now = ts || performance.now();
    drawScene(progress);
    physicsAlive = placeWords(progress, true);
    if ((physicsAlive || ptr.burst) && inView && !document.hidden) raf = requestAnimationFrame(frame);
  }
  const request = () => { if (!raf) raf = requestAnimationFrame(frame); };

  /* ---------- inputs ---------- */
  function readScroll() {
    if (reduce) return;
    const top = landing.offsetTop, span = landing.offsetHeight - window.innerHeight;
    progress = clamp((window.scrollY - top) / Math.max(1, span));
    request();
  }
  if ('IntersectionObserver' in window) new IntersectionObserver((es) => { inView = es[0].isIntersecting; if (inView) request(); }, { threshold: 0 }).observe(landing);
  document.addEventListener('visibilitychange', request);
  window.addEventListener('scroll', readScroll, { passive: true });
  stage.addEventListener('pointermove', (e) => { const r = stage.getBoundingClientRect(); ptr.x = e.clientX - r.left; ptr.y = e.clientY - r.top; request(); });
  stage.addEventListener('pointerdown', (e) => { const r = stage.getBoundingClientRect(); ptr.x = e.clientX - r.left; ptr.y = e.clientY - r.top; ptr.burst = 1; request(); });
  const leave = () => { ptr.x = ptr.y = -9999; request(); };
  stage.addEventListener('pointerleave', leave);
  stage.addEventListener('pointercancel', leave);
  stage.addEventListener('touchend', () => setTimeout(leave, 350), { passive: true });

  let rt = 0;
  function rebuild() { measureScene(); layoutWords(); readScroll(); request(); }
  window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(rebuild, 120); });
  window.addEventListener('orientationchange', () => setTimeout(rebuild, 250));
  const ready = (document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve();
  rebuild();
  ready.then(rebuild);
  window.addEventListener('load', rebuild);

  /* ---------- menu (pill organizer tabs) ---------- */
  const tabs = Array.from(document.querySelectorAll('.lid'));
  const panels = Array.from(document.querySelectorAll('.panel'));
  function select(i, focus, push) {
    tabs.forEach((t, j) => { const on = i === j; t.setAttribute('aria-selected', on); t.tabIndex = on ? 0 : -1; panels[j].hidden = !on; });
    document.dispatchEvent(new CustomEvent('panelshown', { detail: i }));
    if (focus) tabs[i].focus();
    if (push) history.replaceState(null, '', '#' + tabs[i].dataset.hash);
  }
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => select(i, false, true));
    t.addEventListener('keydown', (e) => {
      const n = tabs.length; let j = null;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') j = (i + 1) % n;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') j = (i + n - 1) % n;
      if (e.key === 'Home') j = 0; if (e.key === 'End') j = n - 1;
      if (j !== null) { e.preventDefault(); select(j, true, true); }
    });
  });
  /* ---------- top menu: a paper strip that arrives once the intro is over ---------- */
  const nav = $('topnav');
  const navBtns = [];
  if (nav) {
    const brief = document.createElement('a'); brief.href = '#brief'; brief.className = 'tn tn-brief'; brief.textContent = 'Brief';
    nav.appendChild(brief);
    const strip = document.createElement('div'); strip.className = 'tn-tabs'; nav.appendChild(strip);
    tabs.forEach((t, i) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'tn';
      b.textContent = t.querySelector('.lid-top').textContent;
      b.addEventListener('click', () => {
        select(i, false, true);
        document.getElementById('panels').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
      });
      strip.appendChild(b); navBtns.push(b);
    });
    const showNav = () => {
      const on = window.scrollY > landing.offsetTop + landing.offsetHeight - window.innerHeight * 0.6;
      nav.classList.toggle('on', on); doc.classList.toggle('nav-on', on);
    };
    window.addEventListener('scroll', showNav, { passive: true }); showNav();
  }
  document.addEventListener('panelshown', (e) => {
    navBtns.forEach((b, j) => { if (j === e.detail) { b.setAttribute('aria-current', 'page'); const st = b.parentNode; st.scrollTo({ left: b.offsetLeft - 12, behavior: 'auto' }); } else b.removeAttribute('aria-current'); });
  });
  select(0, false, false);
  const h = location.hash.slice(1), hi = tabs.findIndex((t) => t.dataset.hash === h);
  if (hi >= 0) { select(hi, false, false); document.getElementById('menu').scrollIntoView(); }
})();
