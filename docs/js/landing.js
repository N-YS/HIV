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
  const hv = $('hv'), hti = $('hti'), badge = $('badge');
  const sblue = $('sblue'), briefEl = $('brief'), briefText = $('briefText');
  const brief2 = $('brief2'), b2Text = $('b2Text'), b2f1 = $('b2f1'), b2f2 = $('b2f2'), b2cap = $('b2cap'), b2Next = $('b2Next');
  const P1 = 0.65;   // the first 72% of the scroll is the zoom and the cloud; the rest fades the cloud into the brief
  let qv = reduce ? 1 : 0;
  const forum = $('forum'), cloud = $('cloud'), hiv = $('hiv'), hint = $('hint');
  const PAL = ['#673141', '#4d5f2a', '#5B7396', '#7a5a8a', '#8E2F4A'];
  /* cloud words are lifted from the keyword spans inside the real posts: one word per distinct keyword */
  const wordEls = [];
  (() => {
    const seen = {}; let n = 0;
    forum.querySelectorAll('.t').forEach((sp) => {
      const key = sp.textContent.toLowerCase();
      if (seen[key]) return;
      seen[key] = 1;
      const el = document.createElement('span');
      /* same look in the post and in the cloud: the word only grows */
      const ital = n % 3 === 1, col = PAL[n % PAL.length];
      el.className = 'w' + (ital ? ' i' : ''); el.style.color = col;
      if (ital) sp.classList.add('i'); sp.style.color = col;
      el.dataset.w = sp.dataset.w; el.textContent = sp.textContent; el._span = sp;
      cloud.appendChild(el); wordEls.push(el); n++;
    });
  })();

  if (reduce) { briefEl.classList.add('brief-static'); landing.after(briefEl); }
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const smooth = (a, b, p) => { const t = clamp((p - a) / (b - a)); return t * t * (3 - 2 * t); };
  const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  const lerp = (a, b, t) => a + (b - a) * t;

  let vw = 0, vh = 0, dxT = 0, dyT = 0, sMax = 1, fitM = 0.3, scx = 0, scy = 0;
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
    scx = sr.left + sr.width / 2 - st.left; scy = sr.top + sr.height / 2 - st.top;
    comp.style.transformOrigin = (scx - (cr.left - st.left)) + 'px ' + (scy - (cr.top - st.top)) + 'px';
    dxT = vw / 2 - scx; dyT = vh / 2 - scy;
    fitM = Math.min(sr.width / vw, sr.height / vh) * 0.94;   // the forum layer sits inside the screen at this scale
    sMax = 1 / fitM;                                        // and lands at exactly 1:1 when we are fully zoomed in
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
    const hivSize = Math.min(vw * 0.3, vh * 0.25, 240);
    const bw = Math.min(vw * (vw < 600 ? 0.9 : 0.62), 720);
    hiv.style.width = bw + 'px'; hiv.style.fontSize = hivSize + 'px';
    hv.style.fontSize = hivSize + 'px';
    hti.style.fontSize = clamp(bw / (vw < 600 ? 14 : 19), 15, 34) + 'px';
    const hw = bw, hh = hiv.offsetHeight;
    hivBox = { w: hw, h: hh, cx: vw / 2, cy: vh / 2 };
    const occupied = [{ x: vw / 2 - hw / 2 - 16, y: vh / 2 - hh / 2 - 10, w: hw + 32, h: hh + 20 }];
    const order = wordEls.map((el, i) => ({ el, i, wt: +el.dataset.w })).sort((a, b) => b.wt - a.wt || a.i - b.i);
    const st = stage.getBoundingClientRect();
    const ftf = forum.style.transform; forum.style.transform = 'none';
    let seed = 23; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const placedC = [];
    words = [];
    order.forEach((o, n) => {
      const size = Math.max(13, (11 + o.wt * 5.2) * k);
      const italic = o.el.classList.contains('i');
      const w = textWidth(o.el.textContent, size, italic) + 4, h = size * 1.08;
      const sp0 = o.el._span;
      if (!reduce && !sp0.getClientRects().length) { o.el.style.display = 'none'; return; }
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
      if (fromSpan) { cx = r.left - st.left + r.width / 2; cy = r.top - st.top + r.height / 2; s0 = clamp(parseFloat(getComputedStyle(sp).fontSize) / size, 0.05, 1); }
      else { cx = vw / 2; cy = vh / 2; }
      /* start exactly where the word sits in its bubble: same centre, same scale, same tilt, so there is no jump when it is handed over */
      const aw = o.el.offsetWidth || w, ah = o.el.offsetHeight || h;
      const bub = sp.closest('.bubble'); const rot0 = bub ? (parseFloat(bub.style.getPropertyValue('--r')) || 0) : 0;
      words.push({ el: o.el, span: fromSpan ? sp : null, size, w, h, tx: best.x, ty: best.y, rot0,
        sx: cx - aw / 2, sy: cy - ah / 2, s0,
        ox: 0, oy: 0, vx: 0, vy: 0, k: n / Math.max(1, order.length - 1), lastSp: 1,
        ax: 7 + rnd() * 11, ay: 6 + rnd() * 9, f1: 0.22 + rnd() * 0.4, f2: 0.18 + rnd() * 0.4, p1: rnd() * 6.28, p2: rnd() * 6.28 });
    });
    forum.style.transform = ftf;
    /* leave in a shuffled order, so words stream out of every bubble */
    const idx = words.map((_, i) => i); let sd = 5; const r2 = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
    for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(r2() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
    idx.forEach((wi, rank) => { words[wi].k = rank / Math.max(1, idx.length - 1); });
  }

  /* ---------- per-frame drawing ---------- */
  function drawScene(p) {
    if (!reduce) {
      const z = ease(smooth(0.08, 0.32, p));
      const sc = 1 + z * (sMax - 1);
      comp.style.transform = 'translate3d(' + (z * dxT) + 'px,' + (z * dyT) + 'px,0) scale(' + sc + ')';
      comp.parentNode.style.visibility = p > 0.36 ? 'hidden' : 'visible';
      hint.style.opacity = String(1 - smooth(0, 0.05, p));
      hint.style.animation = p > 0.0005 ? 'none' : '';
      /* the forum is the computer's screen: same layer, carried along by the zoom */
      forum.style.transform = 'translate3d(' + ((scx - vw / 2) * (1 - z)) + 'px,' + ((scy - vh / 2) * (1 - z)) + 'px,0) scale(' + (sc * fitM) + ')';
      forum.style.borderRadius = (1 - z) * 30 + 'px';
      sblue.style.opacity = String(smooth(0.32, 0.4, p));
      forum.style.visibility = p < 0.68 ? 'visible' : 'hidden';
      forum.style.setProperty('--tx', String(smooth(0.2, 0.32, p)));        // scribbles turn into the real words
      forum.style.setProperty('--bf', String(1 - smooth(0.4, 0.58, p)));     // bubbles fade out in one continuous move, the keywords stay
      forum.style.setProperty('--bg', String(1 - smooth(0.44, 0.6, p)));
      if (badge) badge.style.opacity = String(1 - smooth(0, 0.06, p));
      if (p > 0.02) forum.classList.add('on');
    }
    const ho = smooth(0.64, 0.8, p);
    const out = reduce ? 0 : smooth(P1, P1 + 0.1, qv);                 // the cloud and the title fade away into the brief
    hiv.style.opacity = String(ho * (1 - out));
    cloud.style.opacity = String(1 - out);
    if (!reduce) {
      const sh = (el, a, b) => { const v = smooth(a, b, qv); el.style.opacity = String(v); el.style.transform = 'translate3d(0,' + ((1 - v) * 22) + 'px,0)'; };
      briefEl.style.visibility = qv > P1 + 0.08 ? 'visible' : 'hidden';
      { const vin = smooth(P1 + 0.12, P1 + 0.2, qv), v = vin * (1 - smooth(0.93, 0.985, qv)); briefText.style.opacity = String(v); briefText.style.transform = 'translate3d(0,' + ((1 - vin) * 22) + 'px,0)'; }   // the first paragraph arrives, then leaves for the storefront
    }
    hiv.style.transform = 'translate3d(' + (hivBox.cx - hivBox.w / 2) + 'px,' + (hivBox.cy - hivBox.h / 2) + 'px,0) scale(' + (0.75 + 0.25 * ho) + ')';
    hiv.style.transformOrigin = '50% 50%';
  }

  /* second half of the brief: the storefront comes first, then this pinned scene (text, then the two diagrams) */
  function drawBrief2() {
    if (reduce || !brief2) return;
    const r = brief2.getBoundingClientRect(), span = r.height - window.innerHeight;
    const q = clamp(-r.top / Math.max(1, span));
    const sh = (el, a, b, hold) => { const v = smooth(a, b, q); el.style.opacity = String(hold === undefined ? v : Math.min(v, 1 - smooth(hold, hold + 0.07, q))); el.style.transform = 'translate3d(0,' + ((1 - v) * 22) + 'px,0)'; };
    sh(b2Text, 0.06, 0.16, 0.4);      // the paragraph, which leaves before any diagram shows
    sh(b2f1, 0.56, 0.64);
    sh(b2f2, 0.68, 0.76);
    sh(b2cap, 0.78, 0.84);
    sh(b2Next, 0.88, 0.95);
  }
  window.addEventListener('scroll', drawBrief2, { passive: true });
  window.addEventListener('resize', drawBrief2);

  let now = 0;
  function placeWords(p, step) {
    const active = p > 0.84 && qv < P1 && !reduce;
    const R = Math.max(110, Math.min(vw, vh) * 0.22) * (1 + ptr.burst * 0.9);
    const settle = reduce ? 0 : smooth(0.74, 0.86, p);
    const t = now / 1000;
    let alive = settle > 0;
    for (const wd of words) {
      const a = reduce ? 1 : ease(smooth(0.46 + wd.k * 0.13, 0.62 + wd.k * 0.13, p));
      const op = reduce ? 1 : (p >= 0.4 ? 1 : 0);
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
      wd.el.style.transform = 'translate3d(' + (bx + wd.ox) + 'px,' + (by + wd.oy) + 'px,0) rotate(' + (wd.rot0 * (1 - a)) + 'deg) scale(' + (wd.s0 + (1 - wd.s0) * a) + ')';
      /* the word has left its post, so the post's own text is hollowed out */
      if (wd.span && !reduce) { const v = op > 0 ? 0 : 1; if (v !== wd.lastSp) { wd.span.style.opacity = String(v); wd.lastSp = v; } }
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
    qv = clamp((window.scrollY - top) / Math.max(1, span));
    progress = clamp(qv / P1);
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

  if (!reduce) setTimeout(() => forum.classList.add('on'), 2300);
  let rt = 0;
  function rebuild() { measureScene(); layoutWords(); readScroll(); request(); }
  window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(rebuild, 120); });
  window.addEventListener('orientationchange', () => setTimeout(rebuild, 250));
  const ready = (document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve();
  rebuild();
  ready.then(rebuild);
  window.addEventListener('load', rebuild);

  /* ---------- analyses: one at a time, a "next" link at the bottom, the top menu shows where we are ---------- */
  const panels = Array.from(document.querySelectorAll('.panel'));
  const panelsEl = $('panels');
  let cur = 0;
  function select(i, push) {
    cur = i;
    panels.forEach((p, j) => { p.hidden = i !== j; });
    document.dispatchEvent(new CustomEvent('panelshown', { detail: i }));
    if (push) history.replaceState(null, '', '#' + panels[i].dataset.hash);
  }
  const menuEl = $('menu');
  /* the analyses are their own page: the intro (landing, brief, map) is hidden while they are open */
  const reveal = () => { if (menuEl.hidden) menuEl.hidden = false; if (!doc.classList.contains('in-analyses')) { doc.classList.add('in-analyses'); document.body.classList.add('in-analyses'); } showNav(); };
  const toPanels = () => { reveal(); window.scrollTo(0, 0); };
  function toBriefEnd() { window.scrollTo(0, brief2.offsetTop + brief2.offsetHeight - (reduce ? 0 : window.innerHeight)); }
  function toIntro(id) {
    document.body.classList.remove('in-analyses'); doc.classList.remove('in-analyses'); menuEl.hidden = true;
    history.replaceState(null, '', '#' + (id || 'brief'));
    window.dispatchEvent(new Event('resize'));
    if (!id || id === 'brief') toBriefEnd(); else { const el = $(id); if (el) el.scrollIntoView(); } showNav();
  }
  panels.forEach((p, i) => {
    const nx = p.querySelector('[data-next]');
    if (nx) nx.addEventListener('click', () => { select(i + 1, true); toPanels(); });
  });


  /* ---------- top menu: a plain paper strip that arrives once the intro is over ---------- */
  const nav = $('topnav');
  const navBtns = [];
  let briefLink = null;
  if (nav) {
    const mark = document.createElement('a'); mark.href = '#brief'; mark.className = 'tn-mark'; mark.textContent = 'HIV Treatment Discussions';
    nav.appendChild(mark);
    const cur0 = document.createElement('span'); cur0.className = 'tn-cur'; cur0.id = 'tnCur'; nav.appendChild(cur0);
    const burger = document.createElement('button'); burger.type = 'button'; burger.className = 'tn-burger'; burger.setAttribute('aria-label', 'Menu'); burger.setAttribute('aria-expanded', 'false'); burger.setAttribute('aria-controls', 'tnTabs');
    burger.innerHTML = '<svg viewBox="0 0 22 18" aria-hidden="true"><path d="M2 3 C 7 2, 14 4, 20 2.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M2 9.5 C 8 8.5, 14 10.5, 20 9" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M2 15.5 C 7 14.5, 14 16.5, 20 15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
    nav.appendChild(burger);
    const setOpen = (o) => { nav.classList.toggle('open', o); burger.setAttribute('aria-expanded', o ? 'true' : 'false'); };
    burger.addEventListener('click', () => setOpen(!nav.classList.contains('open')));
    document.addEventListener('pointerdown', (e) => { if (nav.classList.contains('open') && !nav.contains(e.target)) setOpen(false); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setOpen(false); });
    nav.addEventListener('click', (e) => { if (e.target.closest('.tn')) setOpen(false); });
    const strip = document.createElement('div'); strip.className = 'tn-tabs'; strip.id = 'tnTabs'; nav.appendChild(strip);
    briefLink = document.createElement('a'); briefLink.href = '#brief'; briefLink.className = 'tn'; briefLink.textContent = 'Brief'; strip.appendChild(briefLink);
    panels.forEach((p, i) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'tn';
      b.textContent = p.dataset.title;
      b.addEventListener('click', () => { select(i, true); toPanels(); });
      strip.appendChild(b); navBtns.push(b);
    });
  }
  function markCurrent() {
    const inBrief = menuEl.hidden;
    if (briefLink) { if (inBrief) briefLink.setAttribute('aria-current', 'page'); else briefLink.removeAttribute('aria-current'); }
    const tc = document.getElementById('tnCur'); if (tc) tc.textContent = inBrief ? 'Brief' : (panels[cur] ? panels[cur].dataset.title : '');
    navBtns.forEach((b, j) => { if (!inBrief && j === cur) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  }
  function showNav() {
    if (!nav) return;
    const on = document.body.classList.contains('in-analyses') || window.scrollY > landing.offsetTop + (landing.offsetHeight - window.innerHeight) * (reduce ? 0.2 : 0.74);
    nav.classList.toggle('on', on); doc.classList.toggle('nav-on', on);
    markCurrent();
  }
  window.addEventListener('scroll', showNav, { passive: true });
  document.addEventListener('panelshown', () => {
    markCurrent();
    const b = navBtns[cur]; if (b) b.parentNode.scrollTo({ left: b.offsetLeft - 12, behavior: 'auto' });
  });
  select(0, false);
  const goIntro = (e) => { e.preventDefault(); toIntro('brief'); };
  if (briefLink) briefLink.addEventListener('click', goIntro);
  const nm = nav.querySelector('.tn-mark'); if (nm) nm.addEventListener('click', goIntro);
  showNav();
  const h = location.hash.slice(1), hi = panels.findIndex((p) => p.dataset.hash === h);
  const go = $('introNext'); if (go) go.addEventListener('click', () => { select(0, true); toPanels(); });
  if (hi >= 0) { select(hi, false); reveal(); window.scrollTo(0, 0); }
})();
