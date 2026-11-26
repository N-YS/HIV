/* Analysis 3, User Analysis: pies of who also writes in the other subreddit, a zoom into the shared
   wedge, then two charts (posts, comments per month by people who write in both) revealed by scrolling. */
(function () {
  const D = window.HIVDATA3, root = document.getElementById('panel-3'), stage = document.getElementById('u3Stage');
  if (!D || !root || !stage) return;
  const NS = 'http://www.w3.org/2000/svg';
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
  const INKD = '#3d1a26', INK = '#673141';
  const f1 = (v) => v.toFixed(1);
  const COL = { HIV: '#4d5f2a', hivaids: '#7a5a8a' };
  const SL = [
    { k: 'post', c: '#D9A93A', oc: '#6b4a0c', t: 'also posts in the other' },
    { k: 'comment', c: '#8FA9C9', oc: '#2d3f5c', t: 'also comments in the other' },
    { k: 'both', c: '#B7586F', oc: '#6b2a3a', t: 'does both in the other' },
    { k: 'none', c: '#E8E0CF', oc: '#6b5f4a', t: 'only writes here' },
  ];
  function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
  function mk(tag, a, p) { const e = document.createElementNS(NS, tag); for (const k in a) e.setAttribute(k, a[k]); if (p) p.appendChild(e); return e; }
  function wob(r, x0, y0, x1, y1, amp) {
    const n = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0) / 36)), pts = [];
    for (let i = 0; i <= n; i++) { const t = i / n; pts.push([x0 + (x1 - x0) * t + (r() - 0.5) * amp, y0 + (y1 - y0) * t + (r() - 0.5) * amp]); }
    return 'M' + pts.map((p) => f1(p[0]) + ' ' + f1(p[1])).join(' L');
  }
  const pct = (n, t) => (n / t * 100).toFixed(1).replace(/\.0$/, '') + '%';
  const nf = (n) => n.toLocaleString('en-US');

  /* ---------- pies ---------- */
  const pies = [];
  function buildPie(sheet) {
    const sub = sheet.dataset.sub, other = sub === 'HIV' ? 'r/hivaids' : 'r/HIV', host = sheet.querySelector('.u3-pieplot'), P = D.pies[sub];
    function render() {
      const W = Math.round(host.clientWidth), H = Math.round(host.clientHeight);
      if (W < 40 || H < 40) return;
      const narrow = W < 520, fs = narrow ? 13 : 15, r = rng(sub === 'HIV' ? 11 : 23);
      const R = narrow ? Math.min(W * 0.3, H * 0.28) : Math.min(H * 0.42, W * 0.25);
      const cx = narrow ? W / 2 : W * 0.3, cy = narrow ? R + 14 : H / 2;
      host.textContent = '';
      const svg = mk('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, 'aria-hidden': 'true' }, host);
      const defs = mk('defs', {}, svg);
      const hp = mk('pattern', { id: 'u3h' + sub, width: 7, height: 7, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(40)' }, defs);
      mk('line', { x1: 0, y1: 0, x2: 0, y2: 7, stroke: '#6b5f4a', 'stroke-width': 1, opacity: 0.45 }, hp);
      const cl = mk('clipPath', { id: 'u3c' + sub }, defs), sweep = mk('path', { d: '' }, cl);
      const g = mk('g', { 'clip-path': `url(#u3c${sub})` }, svg);
      let a0 = -Math.PI / 2; const info = [];
      SL.forEach((s) => {
        const n = P[s.k], a1 = a0 + (n / P.n) * Math.PI * 2, pts = [[cx, cy]];
        const steps = Math.max(3, Math.ceil((a1 - a0) / 0.07));
        for (let i = 0; i <= steps; i++) { const a = a0 + (a1 - a0) * i / steps; pts.push([cx + Math.cos(a) * R + (r() - .5) * 1.6, cy + Math.sin(a) * R + (r() - .5) * 1.6]); }
        const d = 'M' + pts.map((p) => f1(p[0]) + ' ' + f1(p[1])).join(' L') + ' Z';
        const fl = mk('g', { transform: 'translate(3.5,3)' }, g); mk('path', { d, fill: s.c }, fl);
        if (s.k === 'none') mk('path', { d, fill: `url(#u3h${sub})` }, fl);
        mk('path', { d, fill: 'none', stroke: s.oc, 'stroke-width': 2.2, 'stroke-linejoin': 'round' }, g);
        info.push({ s, n, a0, a1 }); a0 = a1;
      });
      /* legend */
      const lg = mk('g', {}, svg), lx = narrow ? 18 : cx + R + 34, ly0 = narrow ? cy + R + 28 : cy - R * 0.9, rowH = narrow ? 18 : 44;
      info.forEach((it, i) => {
        const y = ly0 + i * rowH;
        mk('rect', { x: lx, y: y - 12, width: 15, height: 15, fill: it.s.c, stroke: it.s.oc, 'stroke-width': 1.8, rx: 2 }, lg);
        const t = mk('text', { x: lx + 23, y: y, 'font-size': fs, fill: INKD }, lg);
        const lab = it.s.k === 'none' ? `only writes in ${sub === 'HIV' ? 'r/HIV' : 'r/hivaids'}` : it.s.t.replace('the other', other);
        if (narrow) t.textContent = `${lab}: ${nf(it.n)} (${pct(it.n, P.n)})`;
        else {
          t.textContent = lab;
          const t2 = mk('text', { x: lx + 23, y: y + 17, 'font-size': fs - 1, 'font-style': 'italic', fill: INKD, opacity: 0.8 }, lg); t2.textContent = `${nf(it.n)} users, ${pct(it.n, P.n)}`;
        }
      });
      /* pen circle round the shared wedge */
      const sh = P.post + P.comment + P.both, aS = -Math.PI / 2, aE = aS + sh / P.n * Math.PI * 2, am = (aS + aE) / 2;
      const rc = R * (0.34 + 0.9 * Math.sin(Math.min(Math.PI / 2, (aE - aS) / 2)) * 0.5), ccx = cx + Math.cos(am) * R * 0.6, ccy = cy + Math.sin(am) * R * 0.6;
      let d = ''; for (let i = 0; i <= 40; i++) { const a = -2.2 + i / 40 * 6.9, k = 1 + (r() - .5) * 0.05 + (i / 40) * 0.05; d += (i ? ' L' : 'M') + f1(ccx + Math.cos(a) * rc * k * 1.12) + ' ' + f1(ccy + Math.sin(a) * rc * k); }
      const pen = mk('path', { d, fill: 'none', stroke: '#8E2F4A', 'stroke-width': 2.8, 'stroke-linecap': 'round', pathLength: 1, 'stroke-dasharray': 1, 'stroke-dashoffset': 1 }, svg);
      const note = mk('text', { x: Math.max(8, Math.min(W - 8, ccx + (narrow ? 0 : 0))), y: Math.max(fs + 2, ccy - rc - 8), 'text-anchor': 'middle', 'font-size': fs, 'font-style': 'italic', fill: '#8E2F4A', opacity: 0 }, svg);
      note.textContent = `${nf(sh)} also write in ${other}`;
      pie.sweep = sweep; pie.pen = pen; pie.note = note; pie.cx = cx; pie.cy = cy; pie.R = R; pie.W = W; pie.H = H; pie.ccx = ccx; pie.ccy = ccy;
      const sr = sheet.getBoundingClientRect(), hr = host.getBoundingClientRect();
      /* the zoom goes into the blue "also comments" slice */
      const bA0 = aS + P.post / P.n * Math.PI * 2, bA1 = bA0 + P.comment / P.n * Math.PI * 2, bAm = (bA0 + bA1) / 2;
      const zx = cx + Math.cos(bAm) * R * 0.62, zy = cy + Math.sin(bAm) * R * 0.62;
      pie.origin = `${f1(hr.left - sr.left + zx)}px ${f1(hr.top - sr.top + zy)}px`; sheet.style.transformOrigin = pie.origin;
      setSweep(pie, pie.sw == null ? 1 : pie.sw);
    }
    const pie = { sheet, render, sw: null };
    return pie;
  }
  function setSweep(pie, v) {
    pie.sw = v; if (!pie.sweep) return;
    const { cx, cy, R } = pie, RR = R + 30;
    if (v >= 0.999) { pie.sweep.setAttribute('d', `M${cx - RR} ${cy - RR} H${cx + RR} V${cy + RR} H${cx - RR} Z`); return; }
    const ang = Math.max(0.0001, v) * Math.PI * 2, a0 = -Math.PI / 2, a1 = a0 + ang;
    pie.sweep.setAttribute('d', `M${f1(cx)} ${f1(cy)} L${f1(cx + Math.cos(a0) * RR)} ${f1(cy + Math.sin(a0) * RR)} A${RR} ${RR} 0 ${ang > Math.PI ? 1 : 0} 1 ${f1(cx + Math.cos(a1) * RR)} ${f1(cy + Math.sin(a1) * RR)} Z`);
  }
  stage.querySelectorAll('.u3-pie').forEach((s) => pies.push(buildPie(s)));

  /* ---------- charts ---------- */
  const charts = [];
  function buildChart(sheet) {
    const kind = sheet.dataset.kind, host = sheet.querySelector('.u3-plot'), ymax = kind === 'post' ? 50 : 440, step = kind === 'post' ? 10 : 100;
    function render() {
      const W = Math.round(host.clientWidth), H = Math.round(host.clientHeight);
      if (W < 40 || H < 40) return;
      const narrow = W < 540, fs = narrow ? 12 : 14, m = { l: narrow ? 34 : 44, r: 14, t: 10, b: 26 };
      const x0 = 2021.8, x1 = 2026.98, X = (v) => m.l + ((v - x0) / (x1 - x0)) * (W - m.l - m.r), Y = (v) => H - m.b - (v / ymax) * (H - m.t - m.b);
      const r = rng(kind === 'post' ? 5 : 9); host.textContent = '';
      const svg = mk('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, 'aria-hidden': 'true' }, host), defs = mk('defs', {}, svg);
      const rx0 = X(2024), rx1 = X(2025.167), hh = Y(0) - Y(ymax);
      mk('rect', { x: rx0, y: Y(ymax), width: rx1 - rx0, height: hh, fill: 'rgba(183,155,196,.22)' }, svg);
      const hc = mk('clipPath', { id: 'u3hh' + kind }, defs); mk('rect', { x: rx0, y: Y(ymax), width: rx1 - rx0, height: hh }, hc);
      const hg = mk('g', { 'clip-path': `url(#u3hh${kind})` }, svg);
      for (let x = rx0 - hh; x < rx1 + 4; x += 11) mk('path', { d: `M${f1(x)} ${f1(Y(0) + 2)} L${f1(x + hh)} ${f1(Y(ymax) - 2)}`, stroke: '#FFFDF5', 'stroke-width': 1.6, opacity: 0.85, fill: 'none', 'stroke-linecap': 'round' }, hg);
      const rt = mk('text', { x: (rx0 + rx1) / 2, y: Y(0) - 7, 'text-anchor': 'middle', 'font-size': fs - 1, 'font-style': 'italic', fill: INKD }, svg); rt.textContent = 'restricted';
      for (let v = 0; v <= ymax; v += step) {
        if (v) mk('path', { d: wob(r, m.l, Y(v), W - m.r, Y(v), 1), stroke: INKD, 'stroke-width': 0.8, opacity: 0.18, fill: 'none', 'stroke-dasharray': '2 5' }, svg);
        const t = mk('text', { x: m.l - 7, y: Y(v) + 4.5, 'text-anchor': 'end', 'font-size': fs - 1, fill: INKD, opacity: 0.85 }, svg); t.textContent = v;
      }
      mk('path', { d: wob(r, m.l, Y(ymax), m.l, Y(0), 1), stroke: INKD, 'stroke-width': 1.6, fill: 'none', 'stroke-linecap': 'round' }, svg);
      mk('path', { d: wob(r, m.l, Y(0), W - m.r, Y(0), 1.2), stroke: INKD, 'stroke-width': 2.2, fill: 'none', 'stroke-linecap': 'round' }, svg);
      for (let y = 2022; y <= 2026; y++) {
        mk('path', { d: `M${f1(X(y))} ${f1(Y(0))} L${f1(X(y))} ${f1(Y(0) + 6)}`, stroke: INKD, 'stroke-width': 1.8, 'stroke-linecap': 'round' }, svg);
        const t = mk('text', { x: X(y), y: Y(0) + 20, 'text-anchor': 'middle', 'font-size': fs, fill: INKD }, svg); t.textContent = y;
      }
      const cp = mk('clipPath', { id: 'u3cl' + kind }, defs), cr = mk('rect', { x: 0, y: 0, width: 0, height: H }, cp);
      const lines = mk('g', { 'clip-path': `url(#u3cl${kind})` }, svg);
      ['HIV', 'hivaids'].forEach((s) => {
        const pts = D.t.map((t, i) => [X(t), Y(D[kind][s][i])]);
        mk('path', { d: 'M' + pts.map((p) => f1(p[0]) + ' ' + f1(p[1])).join(' L'), fill: 'none', stroke: COL[s], 'stroke-width': 2.6, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, lines);
      });
      /* key, top left */
      [['HIV', 'r/HIV'], ['hivaids', 'r/hivaids']].forEach((q, i) => {
        const kx = m.l + 12 + i * (narrow ? 78 : 100);
        mk('path', { d: `M${kx} ${m.t + 12} L${kx + 16} ${m.t + 12}`, stroke: COL[q[0]], 'stroke-width': 3, 'stroke-linecap': 'round' }, svg);
        const t = mk('text', { x: kx + 21, y: m.t + 16.5, 'font-size': fs, fill: INKD }, svg); t.textContent = q[1];
      });
      chart.cr = cr; chart.m = m; chart.W = W;
      setReveal(chart, chart.rv == null ? 1 : chart.rv);
    }
    const chart = { sheet, render, rv: null };
    return chart;
  }
  function setReveal(c, v) { c.rv = v; if (c.cr) c.cr.setAttribute('width', f1(c.m.l + v * (c.W - c.m.l - c.m.r) + 2)); }
  stage.querySelectorAll('.u3-chart').forEach((s) => charts.push(buildChart(s)));

  /* ---------- scroll ---------- */
  const wash = document.getElementById('u3Wash'), piesEl = document.getElementById('u3Pies'), chartsEl = document.getElementById('u3Charts'), cap = document.getElementById('u3Cap');
  const CAP1 = cap.textContent, CAP2 = cap.textContent;
  let capState = 1;
  function progress() {
    const sr = stage.getBoundingClientRect(), nav = 68, span = sr.height - (window.innerHeight - nav);
    return span > 0 ? clamp((nav - sr.top) / span) : 1;
  }
  function apply(p) {
    const sw = smooth(0.0, 0.14, p), pen = smooth(0.16, 0.28, p), zt = smooth(0.3, 0.54, p);
    pies.forEach((pi, i) => {
      setSweep(pi, sw);
      pi.pen && pi.pen.setAttribute('stroke-dashoffset', f1(1 - pen));
      pi.note && pi.note.setAttribute('opacity', f1(smooth(0.2, 0.3, p) * (1 - smooth(0.34, 0.42, p))));
      const s = 1 + 11 * zt * zt; pi.sheet.style.transform = `scale(${s.toFixed(3)})`;
      /* only the first pie is zoomed; the other one leaves before the zoom starts, the zoomed one is opaque until the blue wash covers it */
      pi.sheet.style.opacity = String(i === 0 ? 1 - smooth(0.535, 0.545, p) : 1 - smooth(0.3, 0.38, p));
    });
    wash.style.opacity = String(smooth(0.42, 0.54, p) * (1 - smooth(0.56, 0.66, p)));
    const cf = smooth(0.56, 0.66, p);
    piesEl.style.pointerEvents = p > 0.5 ? 'none' : '';
    chartsEl.style.opacity = String(cf); chartsEl.style.transform = `translateY(${f1((1 - cf) * 40)}px)`;
    setReveal(charts[0], smooth(0.66, 0.82, p)); setReveal(charts[1], smooth(0.82, 0.98, p));
    const want = p > 0.5 ? 2 : 1;
    if (want !== capState) { capState = want; cap.textContent = want === 2 ? CAP2 : CAP1; }
  }
  function renderAll() { pies.forEach((p) => p.render()); charts.forEach((c) => c.render()); frame(); }
  let busy = false;
  function frame() {
    if (root.hidden) return;
    if (reduce) { pies.forEach((pi) => { setSweep(pi, 1); pi.pen && pi.pen.setAttribute('stroke-dashoffset', 0); pi.note && pi.note.setAttribute('opacity', 1); }); charts.forEach((c) => setReveal(c, 1)); return; }
    apply(progress());
  }
  window.addEventListener('scroll', () => { if (!busy) { busy = true; requestAnimationFrame(() => { busy = false; frame(); }); } }, { passive: true });
  let tm; window.addEventListener('resize', () => { clearTimeout(tm); tm = setTimeout(renderAll, 120); });
  if ('MutationObserver' in window) new MutationObserver(() => { if (!root.hidden) setTimeout(renderAll, 30); }).observe(root, { attributes: true, attributeFilter: ['hidden'] });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(renderAll);
  renderAll();
})();
