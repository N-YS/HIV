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
  const wordEls = Array.from(cloud.querySelectorAll('.w'));

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

  /* spiral packing around the HIV word, any aspect ratio */
  function layoutWords() {
    const k = clamp(Math.sqrt(vw * vh) / 700, 0.8, 1.8);
    const margin = 10;
    const hivSize = Math.min(vw * 0.34, vh * 0.28, 260);
    hiv.style.fontSize = hivSize + 'px';
    const hw = textWidth('HIV', hivSize, false) * 1.02, hh = hivSize * 1.12;
    hivBox = { w: hw, h: hh, cx: vw / 2, cy: vh / 2 };
    const occupied = [{ x: vw / 2 - hw / 2 - 12, y: vh / 2 - hh / 2 - 8, w: hw + 24, h: hh + 16 }];

    const ax = vw >= vh ? Math.min(3, Math.max(1, (vw / vh) * 1.15)) : 1;
    const ay = vw < vh ? Math.min(2.2, Math.max(1, (vh / vw) * 0.85)) : 1;
    const order = wordEls.map((el, i) => ({ el, i, wt: +el.dataset.w })).sort((a, b) => b.wt - a.wt || a.i - b.i);
    const cardRects = cards.map((c) => { const r = c.getBoundingClientRect(), s = stage.getBoundingClientRect(); return { x: r.left - s.left + r.width / 2, y: r.top - s.top + r.height / 2 }; });

    // deterministic jitter
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

    words = [];
    order.forEach((o, n) => {
      const size = Math.max(13, (11 + o.wt * 5.4) * k);
      const italic = o.el.classList.contains('i');
      const w = textWidth(o.el.textContent, size, italic) + 4, h = size * 1.08;
      let placed = null;
      for (let i = 0; i < 2600 && !placed; i++) {
        const a = i * 0.41, r = 2.7 * Math.sqrt(i) * 2.0;
        const x = vw / 2 + r * Math.cos(a) * ax - w / 2, y = vh / 2 + r * Math.sin(a) * ay - h / 2;
        if (x < margin || y < margin || x + w > vw - margin || y + h > vh - margin) continue;
        let ok = true;
        for (const q of occupied) { if (x < q.x + q.w + 6 && x + w + 6 > q.x && y < q.y + q.h + 4 && y + h + 4 > q.y) { ok = false; break; } }
        if (ok) placed = { x, y };
      }
      if (!placed) { o.el.style.display = 'none'; return; }
      o.el.style.display = '';
      o.el.style.fontSize = size + 'px';
      occupied.push({ x: placed.x, y: placed.y, w, h });
      const c = cardRects.length ? cardRects[n % cardRects.length] : { x: vw / 2, y: vh / 2 };
      words.push({ el: o.el, size, w, h, tx: placed.x, ty: placed.y,
        sx: c.x - w / 2 + (rnd() - 0.5) * 60, sy: c.y - h / 2 + (rnd() - 0.5) * 24,
        ox: 0, oy: 0, vx: 0, vy: 0, k: n / Math.max(1, order.length - 1) });
    });
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
      forum.style.visibility = (fo > 0 && p < 0.78) ? 'visible' : 'hidden';
      forum.style.setProperty('--bg', String(1 - smooth(0.6, 0.74, p)));
      cards.forEach((c, idx) => {
        const i = (idx % 4) * 2 + (idx >= 4 ? 1 : 0);
        const a = smooth(0.34 + i * 0.014, 0.41 + i * 0.014, p);
        const f = 1 - smooth(0.52 + i * 0.01, 0.61 + i * 0.01, p);
        c.style.opacity = String(a * f);
        c.style.transform = 'translateY(' + ((1 - a) * 16 + (1 - f) * -10) + 'px) scale(' + (0.96 + 0.04 * f) + ')';
      });
    }
    const ho = smooth(0.72, 0.85, p);
    hiv.style.opacity = String(ho);
    hiv.style.transform = 'translate3d(' + (hivBox.cx - hivBox.w / 2) + 'px,' + (hivBox.cy - hivBox.h / 2) + 'px,0) scale(' + (0.75 + 0.25 * ho) + ')';
    hiv.style.transformOrigin = '50% 50%';
  }

  function placeWords(p, step) {
    const active = p > 0.82 && !reduce;
    const R = Math.max(110, Math.min(vw, vh) * 0.22) * (1 + ptr.burst * 0.9);
    let alive = false;
    for (const wd of words) {
      const a = reduce ? 1 : ease(smooth(0.5 + wd.k * 0.1, 0.66 + wd.k * 0.1, p));
      const op = reduce ? 1 : smooth(0.5 + wd.k * 0.1, 0.55 + wd.k * 0.1, p);
      const bx = lerp(wd.sx, wd.tx, a), by = lerp(wd.sy, wd.ty, a);
      let tx = 0, ty = 0;
      if (active && ptr.x > -9000) {
        const dx = bx + wd.w / 2 - ptr.x, dy = by + wd.h / 2 - ptr.y, d = Math.hypot(dx, dy) || 1;
        if (d < R) { const f = 1 - d / R, push = f * f * (72 + ptr.burst * 70); tx = dx / d * push; ty = dy / d * push; }
      }
      if (step) {
        wd.vx = (wd.vx + (tx - wd.ox) * 0.09) * 0.8; wd.vy = (wd.vy + (ty - wd.oy) * 0.09) * 0.8;
        wd.ox += wd.vx; wd.oy += wd.vy;
        if (Math.abs(wd.vx) + Math.abs(wd.vy) + Math.abs(tx - wd.ox) + Math.abs(ty - wd.oy) > 0.06) alive = true;
      }
      wd.el.style.opacity = String(op);
      wd.el.style.transform = 'translate3d(' + (bx + wd.ox) + 'px,' + (by + wd.oy) + 'px,0) scale(' + (0.55 + 0.45 * a) + ')';
    }
    ptr.burst *= 0.93; if (ptr.burst < 0.01) ptr.burst = 0; else alive = true;
    return alive;
  }

  function frame() {
    raf = 0;
    drawScene(progress);
    physicsAlive = placeWords(progress, true);
    if (physicsAlive) raf = requestAnimationFrame(frame);
  }
  const request = () => { if (!raf) raf = requestAnimationFrame(frame); };

  /* ---------- inputs ---------- */
  function readScroll() {
    if (reduce) return;
    const top = landing.offsetTop, span = landing.offsetHeight - window.innerHeight;
    progress = clamp((window.scrollY - top) / Math.max(1, span));
    request();
  }
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
  const h = location.hash.slice(1), hi = tabs.findIndex((t) => t.dataset.hash === h);
  if (hi >= 0) { select(hi, false, false); document.getElementById('menu').scrollIntoView(); }
})();
