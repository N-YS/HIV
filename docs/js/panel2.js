/* Analysis 2: top-keyword tables with the changed words circled, the line that draws as you
   scroll, and the joint topic model (shares for each community). Data lives in data2.js. */
(function () {
  const D = window.HIVDATA2;
  const root = document.getElementById('panel-2');
  if (!D || !root) return;
  const NS = 'http://www.w3.org/2000/svg';
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
  const INK = '#673141', INKD = '#3d1a26';
  const f1 = (v) => v.toFixed(1);
  const poly = (pts) => 'M' + pts.map((p) => f1(p[0]) + ' ' + f1(p[1])).join(' L');
  function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
  function mk(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function wobble(r, x0, y0, x1, y1, amp) {
    const n = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0) / 36)), pts = [];
    for (let i = 0; i <= n; i++) { const t = i / n; pts.push([x0 + (x1 - x0) * t + (r() - 0.5) * amp, y0 + (y1 - y0) * t + (r() - 0.5) * amp]); }
    return poly(pts);
  }

  /* ================= 1. keyword tables ================= */
  const DOWN = '#8E2F4A', UP = '#4d5f2a';
  function buildTable(host, sub) {
    const T = D.TW[sub];
    const inB = new Set(T.before.map((x) => x[0])), inA = new Set(T.after.map((x) => x[0]));
    let h = '<div class="kw-th"></div><div class="kw-th">before 2024</div><div class="kw-th">Mar 2025 and after</div>';
    for (let i = 0; i < 10; i++) {
      const b = T.before[i], a = T.after[i];
      h += `<div class="kw-rk">${i + 1}</div>`;
      h += `<div class="kw-c" data-w="${b[0]}" data-side="b"${sub === 'HIV' && !inA.has(b[0]) ? ' data-circle="down"' : ''}><span>${b[0]}</span><i>${b[1]}</i></div>`;
      h += `<div class="kw-c" data-w="${a[0]}" data-side="a"${sub === 'HIV' && !inB.has(a[0]) ? ' data-circle="up"' : ''}><span>${a[0]}</span><i>${a[1]}</i></div>`;
    }
    host.innerHTML = h;
    host.dataset.sub = sub;
  }
  const kwHIV = root.querySelector('#kwHIV'), kwAIDS = root.querySelector('#kwAIDS');
  buildTable(kwHIV, 'HIV'); buildTable(kwAIDS, 'hivaids');

  /* hand-drawn pen loops around the words that left or entered r/HIV's top ten */
  function drawCircles() {
    const sheet = kwHIV.closest('.kw-sheet');
    let svg = kwHIV.querySelector('svg.kw-pen');
    if (svg) svg.remove();
    const gw = kwHIV.offsetWidth, gh = kwHIV.offsetHeight;
    if (gw < 40) return;
    svg = mk('svg', { class: 'kw-pen', viewBox: `0 0 ${gw} ${gh}`, width: gw, height: gh, 'aria-hidden': 'true' }, kwHIV);
    const r = rng(7);
    const cells = Array.from(kwHIV.querySelectorAll('[data-circle]'));
    cells.forEach((c, i) => {
      const sp = c.querySelector('span');
      const cx = sp.offsetLeft + sp.offsetWidth / 2, cy = sp.offsetTop + sp.offsetHeight / 2;
      const rx = sp.offsetWidth / 2 + 10 + r() * 3, ry = sp.offsetHeight / 2 + 6 + r() * 2;
      const a0 = -0.9 + r() * 0.6, turns = 1.12 + r() * 0.1, N = 34, pts = [];
      for (let k = 0; k <= N; k++) {
        const t = k / N, a = a0 + t * turns * Math.PI * 2;
        const w = 1 + (t - 0.5) * 0.1 + Math.sin(a * 2 + i) * 0.015;
        pts.push([cx + Math.cos(a) * rx * w + (r() - 0.5) * 1.2, cy + Math.sin(a) * ry * w + (r() - 0.5) * 1.2]);
      }
      let d = `M${f1(pts[0][0])} ${f1(pts[0][1])}`;
      for (let k = 0; k < pts.length - 1; k++) {
        const p0 = pts[Math.max(0, k - 1)], p1 = pts[k], p2 = pts[k + 1], p3 = pts[Math.min(pts.length - 1, k + 2)];
        d += ` C${f1(p1[0] + (p2[0] - p0[0]) / 6)} ${f1(p1[1] + (p2[1] - p0[1]) / 6)} ${f1(p2[0] - (p3[0] - p1[0]) / 6)} ${f1(p2[1] - (p3[1] - p1[1]) / 6)} ${f1(p2[0])} ${f1(p2[1])}`;
      }
      const col = c.dataset.circle === 'down' ? DOWN : UP;
      const p = mk('path', { d, pathLength: 1, fill: 'none', stroke: col, 'stroke-width': 2.4, 'stroke-linecap': 'round', class: 'kw-loop' }, svg);
      /* before-2024 words go first, then the new ones, one after another */
      p.style.setProperty('--d', (c.dataset.circle === 'down' ? i * 0.32 : 2.2 + i * 0.32).toFixed(2) + 's');
    });
    sheet.classList.toggle('static', reduce);
  }
  /* hivaids: every word is in both lists, so connect its old rank to its new one */
  function drawSlopes() {
    let svg = kwAIDS.querySelector('svg.kw-pen'); if (svg) svg.remove();
    const gw = kwAIDS.offsetWidth, gh = kwAIDS.offsetHeight; if (gw < 40) return;
    svg = mk('svg', { class: 'kw-pen', viewBox: `0 0 ${gw} ${gh}`, width: gw, height: gh, 'aria-hidden': 'true' }, kwAIDS);
    const r = rng(19), T = D.TW.hivaids;
    T.before.forEach((b, i) => {
      const j = T.after.findIndex((a) => a[0] === b[0]); if (j < 0) return;
      const bc = kwAIDS.querySelector(`[data-w="${b[0]}"][data-side="b"]`), ac = kwAIDS.querySelector(`[data-w="${b[0]}"][data-side="a"]`);
      if (!bc || !ac) return;
      const bi = bc.querySelector('i'), asp = ac.querySelector('span');
      const x0 = bi.offsetLeft + bi.offsetWidth + 8, y0 = bi.offsetTop + bi.offsetHeight / 2 - 2;
      const x1 = asp.offsetLeft - 8, y1 = asp.offsetTop + asp.offsetHeight / 2;
      const mx = (x0 + x1) / 2, jx = (r() - 0.5) * 4;
      const col = j < i ? UP : j > i ? DOWN : INK;
      const p = mk('path', { d: `M${f1(x0)} ${f1(y0)} C${f1(mx + jx)} ${f1(y0)} ${f1(mx - jx)} ${f1(y1)} ${f1(x1)} ${f1(y1)}`, pathLength: 1, class: 'kw-link', stroke: col, opacity: j === i ? 0.55 : 0.9 }, svg);
      p.style.setProperty('--d', (0.15 * i).toFixed(2) + 's');
    });
  }
  const kwSheet = kwHIV.closest('.kw-sheet');
  const kwSheetA = kwAIDS.closest('.kw-sheet');
  if ('IntersectionObserver' in window && !reduce) {
    new IntersectionObserver((es, o) => es.forEach((e) => { if (e.isIntersecting) { setTimeout(() => kwSheetA.classList.add('in'), 500); o.disconnect(); } }), { threshold: 0.55 }).observe(kwSheetA);
  } else kwSheetA.classList.add('in', 'static');
  if ('IntersectionObserver' in window && !reduce) {
    new IntersectionObserver((es, o) => es.forEach((e) => { if (e.isIntersecting) { setTimeout(() => kwSheet.classList.add('in'), 500); o.disconnect(); } }), { threshold: 0.55 }).observe(kwSheet);
  } else kwSheet.classList.add('in', 'static');

  /* ================= 2. the line that draws as you scroll ================= */
  const lnStage = root.querySelector('#lnStage'), lnHost = root.querySelector('#lnChart');
  const LC = { pep: '#8E2F4A', symptom: '#7a5a8a', undetectable: '#4d5f2a', treatment: '#5B7396', exposure: '#B07F14' };
  const fade = (hex) => { const n = parseInt(hex.slice(1), 16), c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.round(v + (200 - v) * 0.42)); return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join(''); };
  let ln = null;
  function renderLine() {
    const W = Math.round(lnHost.clientWidth);
    if (W < 40) return;
    const narrow = W < 540;
    const H = Math.round(Math.min(W * (narrow ? 0.95 : 0.5), Math.max(300, window.innerHeight * 0.52)));
    const m = { l: narrow ? 34 : 42, r: narrow ? 78 : 112, t: 22, b: 32 }, fs = narrow ? 13 : 15;
    const x0 = 2021.8, x1 = 2026.95, ymax = 55;
    const X = (v) => m.l + ((v - x0) / (x1 - x0)) * (W - m.l - m.r);
    const Y = (v) => H - m.b - (v / ymax) * (H - m.t - m.b);
    const r = rng(41);
    lnHost.textContent = '';
    const svg = mk('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, 'aria-hidden': 'true' }, lnHost);
    const defs = mk('defs', {}, svg);
    const cp = mk('clipPath', { id: 'lnclip' }, defs);
    const clipRect = mk('rect', { x: 0, y: 0, width: 0, height: H + 10 }, cp);
    /* restricted stretch, hatched like analysis 1 */
    const rx0 = X(2024.0), rx1 = X(2025.167), hh = Y(0) - Y(ymax);
    const hc = mk('clipPath', { id: 'lnhatch' }, defs); mk('rect', { x: rx0, y: Y(ymax), width: rx1 - rx0, height: hh }, hc);
    mk('rect', { x: rx0, y: Y(ymax), width: rx1 - rx0, height: hh, fill: 'rgba(183,155,196,.22)' }, svg);
    const hg = mk('g', { 'clip-path': 'url(#lnhatch)' }, svg);
    for (let x = rx0 - hh; x < rx1 + 4; x += 11) mk('path', { d: `M${f1(x + (r() - .5) * 2)} ${f1(Y(0) + 2)} L${f1(x + hh + (r() - .5) * 2)} ${f1(Y(ymax) - 2)}`, stroke: '#FFFDF5', 'stroke-width': 1.6, opacity: 0.85, fill: 'none', 'stroke-linecap': 'round' }, hg);
    const rt = mk('text', { x: (rx0 + rx1) / 2, y: Y(ymax) + fs + 4, 'text-anchor': 'middle', 'font-size': fs - 1, 'font-style': 'italic' }, svg); rt.textContent = 'restricted';
    /* grid + axes */
    for (let v = 0; v <= ymax; v += 10) {
      if (v) mk('path', { d: wobble(r, m.l, Y(v), W - m.r, Y(v), 1), stroke: INKD, 'stroke-width': 0.8, opacity: 0.18, fill: 'none', 'stroke-dasharray': '2 5' }, svg);
      const t = mk('text', { x: m.l - 7, y: Y(v) + 4.5, 'text-anchor': 'end', 'font-size': fs - 1, opacity: 0.85 }, svg); t.textContent = v;
    }
    mk('path', { d: wobble(r, m.l, Y(ymax), m.l, Y(0), 1), stroke: INKD, 'stroke-width': 1.6, fill: 'none', 'stroke-linecap': 'round' }, svg);
    mk('path', { d: wobble(r, m.l, Y(0), W - m.r, Y(0), 1.2), stroke: INKD, 'stroke-width': 2.2, fill: 'none', 'stroke-linecap': 'round' }, svg);
    mk('path', { d: wobble(r, m.l, Y(0) + 2.6, W - m.r, Y(0) + 2.6, 1.6), stroke: INKD, 'stroke-width': 0.9, opacity: 0.5, fill: 'none' }, svg);
    for (let y = 2022; y <= 2026; y++) {
      mk('path', { d: `M${f1(X(y))} ${f1(Y(0))} L${f1(X(y))} ${f1(Y(0) + 7)}`, stroke: INKD, 'stroke-width': 1.8, 'stroke-linecap': 'round' }, svg);
      const t = mk('text', { x: X(y), y: Y(0) + 24, 'text-anchor': 'middle', 'font-size': fs }, svg); t.textContent = y;
    }
    /* the five lines, only months with at least 30 messages */
    const lines = mk('g', { 'clip-path': 'url(#lnclip)' }, svg);
    const ends = [];
    /* quarterly: mentions divided by that quarter's messages. Every quarter is drawn, so the line has no gaps;
       points from quarters with fewer than 100 messages are hollow. */
    const Q = {};
    D.months.forEach((mo) => { const q = Math.floor(mo.t * 4) / 4; const o = Q[q] || (Q[q] = { t: q + 0.125, n: 0 }); o.n += mo.n; D.words.forEach((w) => { o[w] = (o[w] || 0) + mo[w]; }); });
    const qs = Object.keys(Q).map(Number).sort((a, b) => a - b).map((k) => Q[k]);
    D.words.forEach((w) => {
      const dots = [];
      qs.forEach((q) => { dots.push([X(q.t), Y((q[w] / q.n) * 100), q.n < 100]); });
      /* quarters under 100 messages: hollow marker and a slightly desaturated stretch of line */
      dots.forEach((p, i) => {
        if (!i) return; const a = dots[i - 1], low = a[2] || p[2];
        mk('path', { d: `M${f1(a[0])} ${f1(a[1])} L${f1(p[0])} ${f1(p[1])}`, fill: 'none', stroke: low ? fade(LC[w]) : LC[w], 'stroke-width': 2.6, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, lines);
      });
      dots.forEach((p) => mk('circle', { cx: f1(p[0]), cy: f1(p[1]), r: 3.4, fill: p[2] ? '#FFFDF5' : LC[w], stroke: p[2] ? fade(LC[w]) : LC[w], 'stroke-width': 1.8 }, lines));
      const lastQ = qs[qs.length - 1], lp = dots.slice(-2);
      ends.push({ w, y: lp.reduce((s2, p) => s2 + p[1], 0) / lp.length, t: lastQ.t });
    });
    /* labels at the line ends, spread so they never overlap; they appear when the pen gets there */
    const order = ends.slice().sort((a, b) => a.y - b.y), gap = fs + 5;
    order.forEach((e, i) => { e.ly = i ? Math.max(e.y, order[i - 1].ly + gap) : e.y; });
    const over = order[order.length - 1].ly - (Y(0) - 4);
    if (over > 0) order.forEach((e) => { e.ly -= over; });
    const labs = ends.map((e) => {
      const g = mk('g', { opacity: 0 }, svg);
      mk('path', { d: `M${f1(X(2026.8) + 3)} ${f1(e.y)} L${f1(X(x1) + 4)} ${f1(e.ly)}`, stroke: LC[e.w], 'stroke-width': 1, opacity: 0.7, fill: 'none' }, g);
      const t = mk('text', { x: X(x1) + 8, y: e.ly + 4.5, 'font-size': fs + 1, 'font-weight': 500 }, g); t.textContent = e.w; t.style.fill = LC[e.w];
      return g;
    });

    /* hover: exact rate and counts for the quarter under the pointer */
    (function () {
      const g = mk('g', { 'pointer-events': 'none', opacity: 0 }, svg);
      const gl = mk('path', { stroke: INKD, 'stroke-width': 1.2, 'stroke-dasharray': '2 4', fill: 'none', opacity: 0.7, d: `M0 ${f1(Y(0))} L0 ${f1(Y(ymax))}` }, g);
      const bx = mk('rect', { rx: 6, fill: '#FFFDF5', stroke: INKD, 'stroke-width': 1.6 }, g);
      const rows = [mk('text', { 'font-size': fs, 'font-style': 'italic' }, g)].concat(D.words.map((w) => { const t = mk('text', { 'font-size': fs, 'font-weight': 600 }, g); t.style.fill = LC[w]; return t; }));
      const foot = mk('text', { 'font-size': fs - 2, 'font-style': 'italic', opacity: 0.8 }, g);
      const dots = D.words.map((w) => mk('circle', { r: 4.4, fill: LC[w], stroke: '#FFFDF5', 'stroke-width': 1.6 }, g));
      const hit = mk('rect', { x: m.l, y: m.t, width: W - m.l - m.r, height: H - m.t - m.b, fill: 'transparent' }, svg);
      const qn = ['Jan\u2013Mar', 'Apr\u2013Jun', 'Jul\u2013Sep', 'Oct\u2013Dec'];
      const mv = (e) => {
        const b = svg.getBoundingClientRect(), sc = W / b.width, px = (e.clientX - b.left) * sc;
        let bi = 0, bd = 1e9; qs.forEach((q, i) => { const dd = Math.abs(X(q.t) - px); if (dd < bd) { bd = dd; bi = i; } });
        const q = qs[bi], x = X(q.t), qi = Math.floor((q.t % 1) * 4), yr = Math.floor(q.t);
        rows[0].textContent = qn[qi] + ' ' + yr;
        D.words.forEach((w, i) => { rows[i + 1].textContent = w + ' ' + ((q[w] / q.n) * 100).toFixed(1) + ' per 100'; dots[i].setAttribute('cx', x); dots[i].setAttribute('cy', Y((q[w] / q.n) * 100)); });
        foot.textContent = q.n.toLocaleString('en-US') + ' messages' + (q.n < 100 ? ' (fewer than 100)' : '');
        const all = rows.concat([foot]); const w = Math.max.apply(null, all.map((t) => t.getComputedTextLength())) + 22, h = (rows.length + 1) * (fs + 4) + 14;
        let bxx = x + 14; if (bxx + w > W - 4) bxx = x - 14 - w;
        const byy = m.t;
        bx.setAttribute('x', bxx); bx.setAttribute('y', byy); bx.setAttribute('width', w); bx.setAttribute('height', h);
        all.forEach((t, i) => { t.setAttribute('x', bxx + 11); t.setAttribute('y', byy + (i + 1) * (fs + 4) + 2); });
        gl.setAttribute('transform', `translate(${f1(x)},0)`);
        g.setAttribute('opacity', 1);
      };
      hit.addEventListener('pointermove', mv); hit.addEventListener('pointerdown', mv);
      hit.addEventListener('pointerleave', () => g.setAttribute('opacity', 0));
    })();
    /* the pen edge and its date */
    const edge = mk('g', { opacity: 0 }, svg);
    mk('path', { d: `M0 ${f1(Y(ymax))} L0 ${f1(Y(0))}`, stroke: INKD, 'stroke-width': 1.3, 'stroke-dasharray': '2 5', 'stroke-linecap': 'round', opacity: 0.8 }, edge);
    const et = mk('text', { x: 0, y: Y(ymax) - 6, 'text-anchor': 'middle', 'font-size': fs - 1, 'font-style': 'italic' }, edge);
    const MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    ln = { X, x0, x1, m, W, clipRect, labs, ends, edge, et, MN, fs };
    setLine(lnProgress());
  }
  function lnProgress() {
    if (reduce) return 1;
    const sr = lnStage.getBoundingClientRect(), span = sr.height - window.innerHeight;
    return clamp(-sr.top / Math.max(1, span));
  }
  function setLine(p) {
    if (!ln) return;
    const k = reduce ? 1 : smooth(0.06, 0.9, p);
    const xv = ln.x0 + (ln.x1 - ln.x0) * k, px = ln.X(xv);
    ln.clipRect.setAttribute('width', k >= 1 ? ln.W : Math.max(0, px - 0).toFixed(1));
    ln.labs.forEach((g, i) => g.setAttribute('opacity', clamp((xv - ln.ends[i].t + 0.08) / 0.16)));
    const showEdge = k > 0.004 && k < 0.995;
    ln.edge.setAttribute('opacity', showEdge ? 1 : 0);
    ln.edge.setAttribute('transform', `translate(${px.toFixed(1)},0)`);
    ln.et.textContent = ln.MN[Math.min(11, Math.floor((xv % 1) * 12))] + ' ' + Math.floor(xv);
  }

  /* ================= 3. joint topic model ================= */
  const TC = ['#5B7396', '#8FA9C9', '#B79BC4', '#9C5F86', '#C77B8F', '#E6A9A3', '#F1D98A', '#D9A93A', '#A9A24F', '#B6CFA6', '#EEC4A4'];
  const TC2 = ['#8FA9C9', '#B6C8E0', '#D2C0DB', '#C9A0BC', '#E2A9B7', '#F1CBC6', '#F8EAB8', '#EBCB73', '#C7C37A', '#D6E4CC', '#F6DEC9'];
  const TOL = ['#22314a', '#2d3f5c', '#46264f', '#46264f', '#6b2a3a', '#6b2a3a', '#6b4a0c', '#6b4a0c', '#3f3d14', '#3d4f2a', '#6b3a1c'];
  const NT = D.topics.length;
  const st = { locked: -1, hl: [] };
  const pillHTML = (k) => `<span class="pill" style="--c:${TC[k]};--c2:${TC2[k]};--oc:${TOL[k]};--tx:${k === 0 || k === 3 ? '#fff' : '#3d1a26'}">${k}</span>`;
  function highlightAll(k) {
    root.querySelectorAll('.jt-legend .pillrow, .cmp .trow').forEach((b) => b.classList.toggle('on', +b.dataset.t === k));
    st.hl.forEach((f) => f(k));
  }
  /* pill legends beside each chart, top topic first like the stack, keywords only */
  root.querySelectorAll('.jt-legend').forEach((lg) => {
    for (let k = NT - 1; k >= 0; k--) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'pillrow'; b.dataset.t = k; b.setAttribute('aria-pressed', 'false');
      b.innerHTML = pillHTML(k) + `<span class="kw">${D.topics[k].kw}</span>`;
      b.addEventListener('pointerenter', () => { if (st.locked < 0) highlightAll(k); });
      b.addEventListener('focus', () => { if (st.locked < 0) highlightAll(k); });
      b.addEventListener('pointerleave', () => highlightAll(st.locked));
      b.addEventListener('blur', () => highlightAll(st.locked));
      b.addEventListener('click', () => {
        st.locked = st.locked === k ? -1 : k;
        root.querySelectorAll('.jt-legend .pillrow').forEach((x) => x.setAttribute('aria-pressed', +x.dataset.t === st.locked));
        highlightAll(st.locked);
      });
      lg.appendChild(b);
    }
  });

  /* ---- comparative bars: whole period, or one quarter at a time ---- */
  const cmpStage = root.querySelector('#cmpStage'), cmpRows = root.querySelector('#cmpRows'), cmpChips = root.querySelector('#cmpChips');
  const cmpOut = root.querySelector('#cmpOut'), cmpPrev = root.querySelector('#cmpPrev'), cmpNext = root.querySelector('#cmpNext');
  const QN = D.shares.HIV.length, MAXB = 45;
  const MON = ['Q1', 'Q2', 'Q3', 'Q4'];
  const qLabel = (t) => { const y = Math.floor(t), q = Math.floor((t - y) * 4 + 0.001); return `${MON[q]} ${y}`; };
  const bars = [];
  D.topics.forEach((t, k) => {
    const row = document.createElement('div'); row.className = 'trow'; row.dataset.t = k;
    row.innerHTML = pillHTML(k) + `<span class="tt"><i>${t.kw}</i></span>` +
      `<span class="bp"><span class="bar b1" style="--w:0%;--c:${TC[k]};--oc:${TOL[k]}"><em data-l="r/HIV "></em></span>` +
      `<span class="bar b2" style="--w:0%;--c:${TC[k]};--oc:${TOL[k]}"><em data-l="r/hivaids "></em></span></span>`;
    row.addEventListener('pointerenter', () => highlightRow(k));
    row.addEventListener('pointerleave', () => highlightRow(-1));
    cmpRows.appendChild(row); bars.push(row.querySelectorAll('.bar'));
  });
  function highlightRow(k) { cmpRows.querySelectorAll('.trow').forEach((r) => { r.style.opacity = k < 0 || +r.dataset.t === k ? 1 : 0.4; }); }
  const labels = ['Whole period'].concat(D.shares.HIV.map((q) => qLabel(q.t)));
  labels.forEach((l, i) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.textContent = i ? l.replace(' ', '\u00a0') : l; b.dataset.i = i;
    b.addEventListener('click', () => { cmp.manual = i; showCmp(i); });
    cmpChips.appendChild(b);
  });
  const cmp = { i: -1, manual: null, lastS: -1 };
  function showCmp(i) {
    if (i === cmp.i) return;
    cmp.i = i;
    D.topics.forEach((t, k) => {
      const h = i ? D.shares.HIV[i - 1].s[k] : t.hiv, a = i ? D.shares.hivaids[i - 1].s[k] : t.aids;
      [[h, 0], [a, 1]].forEach(([v, j]) => {
        const bar = bars[k][j];
        bar.style.setProperty('--w', Math.min(100, v / MAXB * 100).toFixed(1) + '%');
        bar.querySelector('em').textContent = v.toFixed(1) + '%';
      });
    });
    cmpChips.querySelectorAll('.chip').forEach((c) => {
      const on = +c.dataset.i === i; c.classList.toggle('on', on); c.setAttribute('aria-pressed', on);
      if (on) { const box = cmpChips; const x = c.offsetLeft - box.clientWidth / 2 + c.offsetWidth / 2; box.scrollTo ? box.scrollTo({ left: x, behavior: reduce ? 'auto' : 'smooth' }) : (box.scrollLeft = x); }
    });
    cmpOut.textContent = i ? `${labels[i]} \u00b7 r/HIV ${D.shares.HIV[i - 1].n.toLocaleString('en-US')} messages \u00b7 r/hivaids ${D.shares.hivaids[i - 1].n.toLocaleString('en-US')} messages` : 'Whole period';
    cmpPrev.disabled = i <= 0; cmpNext.disabled = i >= QN;
  }
  cmpPrev.addEventListener('click', () => { cmp.manual = Math.max(0, cmp.i - 1); showCmp(cmp.manual); });
  cmpNext.addEventListener('click', () => { cmp.manual = Math.min(QN, cmp.i + 1); showCmp(cmp.manual); });
  function cmpProgress() {
    if (reduce) return 0;
    const sr = cmpStage.getBoundingClientRect(), span = sr.height - window.innerHeight;
    return clamp(-sr.top / Math.max(1, span));
  }
  function updateCmp() {
    const sIdx = Math.min(QN, Math.floor(clamp((cmpProgress() - 0.04) / 0.92) * (QN + 1)));
    if (sIdx !== cmp.lastS) { cmp.lastS = sIdx; cmp.manual = null; }
    showCmp(cmp.manual != null ? cmp.manual : sIdx);
  }

  function renderArea(host) {
    const W = Math.round(host.clientWidth);
    if (W < 40) return;
    const key = host.dataset.key, rows = D.shares[key], narrow = W < 540;
    const H = Math.round(W * (narrow ? 0.95 : 0.52));
    const m = { l: narrow ? 36 : 42, r: 8, t: 14, b: 32 }, fs = narrow ? 13 : 15;
    const x0 = 2021.8, x1 = 2026.95;
    const X = (v) => m.l + ((v - x0) / (x1 - x0)) * (W - m.l - m.r);
    const Y = (v) => H - m.b - (v / 100) * (H - m.t - m.b);
    const r = rng(key === 'HIV' ? 5 : 9), id = 'J' + key;
    const cum = rows.map((q) => { let c = 0; return q.s.map((v) => (c += v)); });
    host.textContent = '';
    const svg = mk('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, 'aria-hidden': 'true' }, host);
    const defs = mk('defs', {}, svg);
    const rx0 = X(2024.0), rx1 = X(2025.167);
    const cpath = mk('clipPath', { id: id + 'c' }, defs); mk('rect', { x: rx0, y: Y(100), width: rx1 - rx0, height: Y(0) - Y(100) }, cpath);
    for (let v = 0; v <= 100; v += 20) { const t = mk('text', { x: m.l - 7, y: Y(v) + 4.5, 'text-anchor': 'end', 'font-size': fs - 1, opacity: 0.85 }, svg); t.textContent = v + '%'; }
    const bands = [], bg = mk('g', {}, svg);
    for (let k = 0; k < NT; k++) {
      const top = rows.map((q, j) => [X(q.t), Y(cum[j][k])]), bot = rows.map((q, j) => [X(q.t), Y(k ? cum[j][k - 1] : 0)]).reverse();
      const g = mk('g', { class: 'band' }, bg);
      mk('path', { d: poly(top.concat(bot)) + ' Z', fill: TC[k] }, g);
      if (k % 3 === 1) {
        const dp = 'dots' + id + k;
        const p = mk('pattern', { id: dp, width: 6, height: 6, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(30)' }, defs);
        mk('circle', { cx: 3, cy: 3, r: 0.9, fill: TOL[k], opacity: 0.3 }, p);
        mk('path', { d: poly(top.concat(bot)) + ' Z', fill: `url(#${dp})` }, g);
      }
      mk('path', { d: poly(top), fill: 'none', stroke: TOL[k], 'stroke-width': 1.4, opacity: 0.7, 'stroke-linejoin': 'round' }, g);
      bands.push(g);
    }
    if (key === 'HIV') {
      const hg = mk('g', { 'clip-path': `url(#${id}c)` }, svg), hh = Y(0) - Y(100);
      for (let x = rx0 - hh; x < rx1 + 4; x += narrow ? 10 : 12) mk('path', { d: `M${f1(x + (r() - .5) * 2)} ${f1(Y(0) + 2)} L${f1(x + hh + (r() - .5) * 2)} ${f1(Y(100) - 2)}`, stroke: '#FFFDF5', 'stroke-width': 1.5, opacity: 0.8, 'stroke-linecap': 'round', fill: 'none' }, hg);
      const t = mk('text', { x: (rx0 + rx1) / 2, y: Y(97) + fs + 6, 'text-anchor': 'middle', 'font-size': fs, 'font-style': 'italic' }, svg); t.textContent = 'restricted'; t.style.fill = INKD;
      const jx = X(2026.5);
      mk('path', { d: wobble(r, jx, Y(100), jx, Y(0), 1.2), stroke: INKD, 'stroke-width': 1.5, 'stroke-dasharray': '2 6', 'stroke-linecap': 'round', opacity: 0.8, fill: 'none' }, svg);
      const jt = mk('text', { x: jx - 6, y: Y(100) + fs + 6, 'text-anchor': 'end', 'font-size': fs - 1, 'font-style': 'italic' }, svg); jt.textContent = 'July 2026';
    }
    mk('path', { d: wobble(r, m.l, Y(100), W - m.r, Y(100), 1), stroke: INKD, 'stroke-width': 1.2, opacity: 0.55, fill: 'none' }, svg);
    mk('path', { d: wobble(r, m.l, Y(100), m.l, Y(0), 1), stroke: INKD, 'stroke-width': 1.6, fill: 'none', 'stroke-linecap': 'round' }, svg);
    mk('path', { d: wobble(r, m.l, Y(0), W - m.r, Y(0), 1.2), stroke: INKD, 'stroke-width': 2.2, fill: 'none', 'stroke-linecap': 'round' }, svg);
    mk('path', { d: wobble(r, m.l, Y(0) + 2.6, W - m.r, Y(0) + 2.6, 1.6), stroke: INKD, 'stroke-width': 0.9, opacity: 0.5, fill: 'none' }, svg);
    for (let y = 2022; y <= 2026; y++) {
      mk('path', { d: `M${f1(X(y))} ${f1(Y(0))} L${f1(X(y))} ${f1(Y(0) + 7)}`, stroke: INKD, 'stroke-width': 1.8, 'stroke-linecap': 'round' }, svg);
      const t = mk('text', { x: X(y), y: Y(0) + 24, 'text-anchor': 'middle', 'font-size': fs }, svg); t.textContent = y;
    }
    const fig = host.closest('figure'), readout = fig.querySelector('.readout');
    const fn = (k, j) => {
      bands.forEach((g, i) => { g.style.opacity = k < 0 || i === k ? 1 : 0.22; g.style.transition = 'opacity .2s'; });
      if (k < 0) { readout.textContent = ''; return; }
      readout.textContent = `${k}: ${D.topics[k].kw}` + (j == null ? '' : ` · ${Math.round(rows[j].s[k])}%`);
    };
    st.hl = st.hl.filter((f) => f.key !== key); fn.key = key; st.hl.push(fn);
    function probe(e) {
      const b = svg.getBoundingClientRect(), sc = W / b.width;
      const px = (e.clientX - b.left) * sc, py = (e.clientY - b.top) * sc;
      const yr = x0 + ((px - m.l) / (W - m.l - m.r)) * (x1 - x0), pct = ((H - m.b - py) / (H - m.t - m.b)) * 100;
      if (px < m.l || px > W - m.r || pct < 0 || pct > 100) return;
      let j = 0, bd = 1e9; rows.forEach((q, i) => { const dd = Math.abs(q.t - yr); if (dd < bd) { bd = dd; j = i; } });
      let k = 0; while (k < NT - 1 && cum[j][k] < pct) k++;
      const prevHl = st.hl.slice(); highlightAll(k); fn(k, j);
    }
    svg.addEventListener('pointermove', probe); svg.addEventListener('pointerdown', probe);
    svg.addEventListener('pointerleave', () => highlightAll(st.locked));
    fn(st.locked);
    if (reduce || host.dataset.rendered) host.classList.add('static');
    host.dataset.rendered = 1;
    if (host.dataset.seen) host.classList.add('in');
  }

  /* ================= wiring ================= */
  const areas = Array.from(root.querySelectorAll('.jtchart'));
  const io = 'IntersectionObserver' in window ? new IntersectionObserver((es) => es.forEach((e) => {
    if (e.isIntersecting) { e.target.dataset.seen = 1; e.target.classList.add('in'); io.unobserve(e.target); }
  }), { threshold: 0.25 }) : null;
  areas.forEach((c) => { if (io && !reduce) io.observe(c); else { c.dataset.seen = 1; c.classList.add('in'); } });
  const widths = new Map();
  const ro = 'ResizeObserver' in window ? new ResizeObserver((es) => es.forEach((e) => {
    const w = Math.round(e.contentRect.width);
    if (w && widths.get(e.target) !== w) {
      widths.set(e.target, w);
      if (e.target === lnHost) renderLine(); else renderArea(e.target);
    }
  })) : null;
  areas.concat([lnHost]).forEach((c) => { if (ro) ro.observe(c); });
  const redo = () => { drawCircles(); drawSlopes(); renderLine(); updateCmp(); areas.forEach((c) => c.clientWidth && renderArea(c)); };
  document.fonts && document.fonts.ready && document.fonts.ready.then(() => { if (root.offsetParent) redo(); });
  document.addEventListener('panelshown', () => setTimeout(() => { if (root.offsetParent) redo(); }, 30));
  window.addEventListener('resize', () => { if (root.offsetParent) { drawCircles(); drawSlopes(); } });
  let tick = false;
  window.addEventListener('scroll', () => {
    if (tick || !root.offsetParent) return;
    tick = true; requestAnimationFrame(() => { tick = false; setLine(lnProgress()); updateCmp(); });
  }, { passive: true });
  showCmp(0);
  if (reduce) document.documentElement.classList.add('reduce');
})();
