/* Analysis 1: redrawn Figure A (weekly messages) and Figure B (topic shares),
   the pinned shutter scene, the pencil thread and the soft parallax.
   Data lives in data.js and is drawn exactly as given; only the pen look is added. */
(function () {
  const D = window.HIVDATA;
  const root = document.getElementById('panel-1');
  if (!D || !root) return;
  const NS = 'http://www.w3.org/2000/svg';
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
  const INK = '#673141', INKD = '#3d1a26';
  const fmt = (n) => Number(n).toLocaleString('en-US');

  function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
  function mk(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  const f1 = (v) => v.toFixed(1);
  const poly = (pts) => 'M' + pts.map((p) => f1(p[0]) + ' ' + f1(p[1])).join(' L');

  /* a ruled line with a slight hand wobble (axes, ticks only, never data) */
  function wobble(r, x0, y0, x1, y1, amp) {
    const n = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0) / 36));
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      pts.push([x0 + (x1 - x0) * t + (r() - 0.5) * amp, y0 + (y1 - y0) * t + (r() - 0.5) * amp]);
    }
    return poly(pts);
  }

  const yearOf = (k) => D.A.weekStart + k * D.A.weekStep;
  const monthName = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const around = (y) => 'around ' + monthName[Math.min(11, Math.floor((y % 1) * 12))] + ' ' + Math.floor(y);

  function finish(host) {
    if (reduce || host.dataset.rendered) host.classList.add('static');
    host.dataset.rendered = 1;
    if (host.dataset.seen) host.classList.add('in');
  }

  /* ---------------- Figure A ---------------- */
  function renderA(host) {
    const W = Math.round(host.clientWidth);
    if (W < 40) return;
    const key = host.dataset.key, d = D.A[key], A = D.A;
    const narrow = W < 540;
    const H = Math.round(W * (narrow ? 0.92 : 0.6));
    const m = { l: narrow ? 38 : 46, r: 10, t: narrow ? 116 : 90, b: 34 };
    const fs = narrow ? 13 : 15;
    const r = rng(key === 'hiv' ? 11 : 23);
    const X = (v) => m.l + ((v - A.xdomain[0]) / (A.xdomain[1] - A.xdomain[0])) * (W - m.l - m.r);
    const Y = (v) => H - m.b - (v / d.ylim) * (H - m.t - m.b);
    const id = 'A' + key;
    host.textContent = '';
    const svg = mk('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, 'aria-hidden': 'true' }, host);
    const defs = mk('defs', {}, svg);
    const cp = mk('clipPath', { id: id + 'c' }, defs);
    const rx0 = X(A.restricted[0]), rx1 = X(A.restricted[1]);
    mk('rect', { x: rx0, y: Y(d.ylim), width: rx1 - rx0, height: Y(0) - Y(d.ylim) }, cp);
    const dots = mk('pattern', { id: id + 'd', width: 7, height: 7, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(25)' }, defs);
    mk('circle', { cx: 3.5, cy: 3.5, r: 1, fill: INK, opacity: 0.28 }, dots);

    /* title + legend */
    const tt = mk('text', { x: m.l - 30 + 30, y: narrow ? 28 : 32, 'font-size': narrow ? 26 : 30 }, svg);
    tt.textContent = key === 'hiv' ? 'r/HIV' : 'r/hivaids';
    const leg = [['comments', '#673141', 'Comments'], ['posts', '#C18A1E', 'Posts']];
    leg.forEach((L, i) => {
      const lx = narrow ? m.l : m.l + i * 250, ly = narrow ? 56 + i * 24 : 58;
      mk('path', { d: wobble(r, lx, ly, lx + 30, ly, 1.2), stroke: L[1], 'stroke-width': 3, fill: 'none', 'stroke-linecap': 'round' }, svg);
      const t = mk('text', { x: lx + 38, y: ly + 5, 'font-size': fs + 1 }, svg);
      t.textContent = `${L[2]} (total ${fmt(d.totals[L[0]])})`;
    });
    const yl = mk('text', { x: m.l - 30 + 30, y: m.t - 9, 'font-size': fs - 1, 'font-style': 'italic', opacity: 0.8 }, svg);
    yl.textContent = 'messages per week';

    /* grid, dotted */
    d.ticks.forEach((v) => {
      if (v > 0) mk('path', { d: `M${m.l} ${f1(Y(v))} L${W - m.r} ${f1(Y(v))}`, stroke: '#7690B4', 'stroke-width': 1.7, 'stroke-dasharray': '0.1 6.5', 'stroke-linecap': 'round', opacity: 0.7, fill: 'none' }, svg);
      const t = mk('text', { x: m.l - 8, y: Y(v) + 4.5, 'text-anchor': 'end', 'font-size': fs - 1, opacity: 0.85 }, svg);
      t.textContent = v;
    });

    /* restricted stretch: pen hatching */
    const hg = mk('g', { 'clip-path': `url(#${id}c)` }, svg);
    if (key === 'hiv') mk('rect', { x: rx0, y: Y(d.ylim), width: rx1 - rx0, height: Y(0) - Y(d.ylim), fill: '#8FA9C9', opacity: 0.16 }, hg);
    const top = Y(d.ylim), bot = Y(0), hh = bot - top, gap = narrow ? 10 : 12;
    for (let x = rx0 - hh; key === 'hiv' && x < rx1 + 4; x += gap) {
      const j = () => (r() - 0.5) * 2.2;
      mk('path', { d: `M${f1(x + j())} ${f1(bot + 2)} L${f1(x + hh + j())} ${f1(top - 2)}`, stroke: '#5B7396', 'stroke-width': 1.2, opacity: 0.42, 'stroke-linecap': 'round', fill: 'none' }, hg);
    }
    if (key === 'hiv') {
      mk('path', { d: wobble(r, rx0, top, rx0, bot, 1.2), stroke: '#5B7396', 'stroke-width': 1.5, opacity: 0.7, fill: 'none' }, svg);
      mk('path', { d: wobble(r, rx1, top, rx1, bot, 1.2), stroke: '#5B7396', 'stroke-width': 1.5, opacity: 0.7, fill: 'none' }, svg);
    }

    /* data */
    const series = {
      comments: { v: d.comments, line: '#673141', fill: '#B79BC4', fo: 0.42, o2: 0.4 },
      posts: { v: d.posts, line: '#C18A1E', fill: '#EBCB73', fo: 0.7, o2: 0.45 }
    };
    ['comments', 'posts'].forEach((sn) => {
      const S = series[sn], pts = S.v.map((v, k) => [X(yearOf(k)), Y(v)]);
      const area = poly(pts) + ` L${f1(pts[pts.length - 1][0])} ${f1(Y(0))} L${f1(pts[0][0])} ${f1(Y(0))} Z`;
      const g = mk('g', { class: 'fade' }, svg);
      mk('path', { d: area, fill: S.fill, opacity: S.fo }, g);
      if (sn === 'comments') mk('path', { d: area, fill: `url(#${id}d)` }, g);
    });
    ['comments', 'posts'].forEach((sn) => {
      const S = series[sn], pts = S.v.map((v, k) => [X(yearOf(k)), Y(v)]);
      /* second pen pass: a hair off and slightly shaky; the first pass is the exact data */
      const pts2 = pts.map((p) => [p[0] + 0.7 + (r() - 0.5) * 0.9, p[1] + 0.8 + (r() - 0.5) * 1.1]);
      mk('path', { class: 'draw', pathLength: 1, d: poly(pts2), fill: 'none', stroke: S.line, 'stroke-width': 1, opacity: S.o2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, svg);
      mk('path', { class: 'draw', pathLength: 1, d: poly(pts), fill: 'none', stroke: S.line, 'stroke-width': narrow ? 1.8 : 2.1, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, svg);
    });

    /* axes */
    mk('path', { d: wobble(r, m.l, Y(0), W - m.r, Y(0), 1.2), stroke: INKD, 'stroke-width': 2.2, fill: 'none', 'stroke-linecap': 'round' }, svg);
    mk('path', { d: wobble(r, m.l, Y(0) + 2.6, W - m.r, Y(0) + 2.6, 1.6), stroke: INKD, 'stroke-width': 0.9, opacity: 0.5, fill: 'none' }, svg);
    for (let y = 2022; y <= 2026; y++) {
      const x = X(y);
      mk('path', { d: `M${f1(x)} ${f1(Y(0))} L${f1(x + (r() - 0.5))} ${f1(Y(0) + 7)}`, stroke: INKD, 'stroke-width': 1.8, 'stroke-linecap': 'round' }, svg);
      const t = mk('text', { x, y: Y(0) + 24, 'text-anchor': 'middle', 'font-size': fs }, svg);
      t.textContent = y;
    }

    /* margin notes (hand-lettered, with a curved arrow to the thing they mean) */
    function note(txt, tx, ty, ax, ay, anchor, curve, bg) {
      const g = mk('g', { class: 'fade' }, svg);
      const lines = txt.split('\n');
      if (bg) {
        const w = Math.max(...lines.map((s) => s.length)) * fs * 0.5 + 12;
        mk('rect', { x: anchor === 'middle' ? tx - w / 2 : tx - 6, y: ty - fs - 2, width: w, height: lines.length * (fs + 3) + 6, rx: 5, fill: '#F8FBFD', opacity: 0.92 }, g);
      }
      const t = mk('text', { x: tx, y: ty, 'font-size': fs, 'font-style': 'italic', 'text-anchor': anchor || 'start' }, g);
      lines.forEach((s, i) => { const ts = mk('tspan', { x: tx, dy: i ? fs + 3 : 0 }, t); ts.textContent = s; });
      if (ax != null) {
        const sx = tx + (anchor === 'middle' ? 0 : lines[0].length * fs * 0.2), sy = ty + lines.length * (fs + 3) - fs * 0.5;
        const cx = (sx + ax) / 2 + curve, cy = (sy + ay) / 2 - Math.abs(curve) * 0.4;
        mk('path', { d: `M${f1(sx)} ${f1(sy)} Q${f1(cx)} ${f1(cy)} ${f1(ax)} ${f1(ay)}`, fill: 'none', stroke: INK, 'stroke-width': 1.6, 'stroke-linecap': 'round' }, g);
        const a = Math.atan2(ay - cy, ax - cx), L = 8;
        mk('path', { d: `M${f1(ax - L * Math.cos(a - 0.5))} ${f1(ay - L * Math.sin(a - 0.5))} L${f1(ax)} ${f1(ay)} L${f1(ax - L * Math.cos(a + 0.5))} ${f1(ay - L * Math.sin(a + 0.5))}`, fill: 'none', stroke: INK, 'stroke-width': 1.6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, g);
      }
    }
    if (key === 'hiv') {
      note(narrow ? 'restricted' : 'restricted,\nJan 2024 – Feb 2025', (rx0 + rx1) / 2, Y(d.ylim * 0.62), null, null, 'middle', 0, true);
      const ry = Y(d.posts[d.posts.length ? Math.round((2025.16 - A.weekStart) / A.weekStep) : 0] || 20);
      const ji = Math.round((2026.55 - A.weekStart) / A.weekStep), jy = Y(d.comments[ji]) - 8;
      if (narrow) {
        note('reopening,\nFeb 2025', X(2025.28), Y(d.ylim * 0.42), rx1 + 3, ry - 6, 'start', -6);
        note('moderation relaxed,\nJuly 2026', X(2026.92), Y(d.ylim * 0.8), X(2026.55), jy, 'end', 10);
      } else {
        note('reopening with rules,\nFeb 2025', X(2025.36), Y(d.ylim * 0.5), rx1 + 3, ry - 6, 'start', -22);
        note('moderation relaxed,\nJuly 2026', X(2026.12) - 8, Y(d.ylim * 0.68), X(2026.52), jy, 'start', 14);
      }
    } else {
      const by = Y(d.ylim * 0.9), bx0 = X(A.restricted[0]), bx1 = X(A.restricted[1]);
      const g = mk('g', { class: 'fade' }, svg);
      mk('path', { d: `M${f1(bx0)} ${f1(by + 8)} L${f1(bx0)} ${f1(by)} L${f1(bx1)} ${f1(by)} L${f1(bx1)} ${f1(by + 8)}`, fill: 'none', stroke: INK, 'stroke-width': 1.6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, g);
      const t = mk('text', { x: (bx0 + bx1) / 2, y: by - 7, 'text-anchor': 'middle', 'font-size': fs, 'font-style': 'italic' }, g);
      t.textContent = 'Jan 2024 – Feb 2025';
    }
    finish(host);
  }

  /* ---------------- Figure B ---------------- */
  const TC = ['#5B7396', '#8FA9C9', '#B79BC4', '#9C5F86', '#C77B8F', '#E6A9A3', '#F1D98A', '#D9A93A', '#A9A24F', '#B6CFA6'];
  const TC2 = ['#8FA9C9', '#B6C8E0', '#D2C0DB', '#C9A0BC', '#E2A9B7', '#F1CBC6', '#F8EAB8', '#EBCB73', '#C7C37A', '#D6E4CC'];
  const TOL = ['#22314a', '#2d3f5c', '#46264f', '#46264f', '#6b2a3a', '#6b2a3a', '#6b4a0c', '#6b4a0c', '#3f3d14', '#3d4f2a'];
  const bstate = {};

  function renderB(host) {
    const W = Math.round(host.clientWidth);
    if (W < 40) return;
    const key = host.dataset.key, B = D.B, S = B[key].shares, yrs = B.years, narrow = W < 540;
    const H = Math.round(W * (narrow ? 1.0 : 0.62));
    const m = { l: narrow ? 36 : 42, r: 8, t: 12, b: 32 }, fs = narrow ? 13 : 15;
    const r = rng(key === 'hiv' ? 5 : 9);
    const X = (v) => m.l + ((v - B.xdomain[0]) / (B.xdomain[1] - B.xdomain[0])) * (W - m.l - m.r);
    const Y = (v) => H - m.b - (v / 100) * (H - m.t - m.b);
    const id = 'B' + key;
    const cum = S.map((row) => { let c = 0; return row.map((v) => (c += v)); });
    host.textContent = '';
    const svg = mk('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, 'aria-hidden': 'true' }, host);
    const defs = mk('defs', {}, svg);
    const cp = mk('clipPath', { id: id + 'c' }, defs);
    const rx0 = X(B.restricted[0]), rx1 = X(B.restricted[1]);
    mk('rect', { x: rx0, y: Y(100), width: rx1 - rx0, height: Y(0) - Y(100) }, cp);

    for (let v = 0; v <= 100; v += 20) {
      const t = mk('text', { x: m.l - 7, y: Y(v) + 4.5, 'text-anchor': 'end', 'font-size': fs - 1, opacity: 0.85 }, svg);
      t.textContent = v + '%';
    }
    const bands = [];
    const bg = mk('g', {}, svg);
    for (let k = 0; k < 10; k++) {
      const top = yrs.map((y, j) => [X(y), Y(cum[j][k])]);
      const bot = yrs.map((y, j) => [X(y), Y(k ? cum[j][k - 1] : 0)]).reverse();
      const g = mk('g', { class: 'band', 'data-t': k }, bg);
      mk('path', { d: poly(top.concat(bot)) + ' Z', fill: TC[k], stroke: 'none' }, g);
      if (k % 3 === 1) {
        const dp = 'dots' + id + k;
        const p = mk('pattern', { id: dp, width: 6, height: 6, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(30)' }, defs);
        mk('circle', { cx: 3, cy: 3, r: 0.9, fill: TOL[k], opacity: 0.3 }, p);
        mk('path', { d: poly(top.concat(bot)) + ' Z', fill: `url(#${dp})` }, g);
      }
      mk('path', { d: poly(top), fill: 'none', stroke: TOL[k], 'stroke-width': 1.4, opacity: 0.7, 'stroke-linejoin': 'round' }, g);
      bands.push(g);
    }
    /* hatching for the restricted stretch */
    const hg = mk('g', { 'clip-path': `url(#${id}c)` }, svg);
    const hh = Y(0) - Y(100);
    for (let x = rx0 - hh; key === 'hiv' && x < rx1 + 4; x += narrow ? 10 : 12) {
      const j = () => (r() - 0.5) * 2;
      mk('path', { d: `M${f1(x + j())} ${f1(Y(0) + 2)} L${f1(x + hh + j())} ${f1(Y(100) - 2)}`, stroke: '#FFFDF5', 'stroke-width': 1.5, opacity: 0.8, 'stroke-linecap': 'round', fill: 'none' }, hg);
    }
    /* frame and axes */
    mk('path', { d: wobble(r, m.l, Y(100), W - m.r, Y(100), 1.0), stroke: INKD, 'stroke-width': 1.2, opacity: 0.55, fill: 'none' }, svg);
    mk('path', { d: wobble(r, m.l, Y(100), m.l, Y(0), 1.0), stroke: INKD, 'stroke-width': 1.6, fill: 'none', 'stroke-linecap': 'round' }, svg);
    mk('path', { d: wobble(r, m.l, Y(0), W - m.r, Y(0), 1.2), stroke: INKD, 'stroke-width': 2.2, fill: 'none', 'stroke-linecap': 'round' }, svg);
    mk('path', { d: wobble(r, m.l, Y(0) + 2.6, W - m.r, Y(0) + 2.6, 1.6), stroke: INKD, 'stroke-width': 0.9, opacity: 0.5, fill: 'none' }, svg);
    for (let y = 2022; y <= 2026; y++) {
      const x = X(y);
      mk('path', { d: `M${f1(x)} ${f1(Y(0))} L${f1(x)} ${f1(Y(0) + 7)}`, stroke: INKD, 'stroke-width': 1.8, 'stroke-linecap': 'round' }, svg);
      const t = mk('text', { x, y: Y(0) + 24, 'text-anchor': 'middle', 'font-size': fs }, svg);
      t.textContent = y;
    }
    /* labels written on the chart */
    const lab = (txt, x, y, fill, size, anchor) => {
      const t = mk('text', { x, y, 'font-size': size || fs, 'font-style': 'italic', 'text-anchor': anchor || 'middle', fill: fill || '#FFFDF5' }, svg);
      t.textContent = txt; t.setAttribute('style', 'fill:' + (fill || '#FFFDF5')); return t;
    };
    if (key === 'hiv') {
      lab(narrow ? 'restricted' : 'restricted', (rx0 + rx1) / 2, Y(97) + fs + 6, INKD, fs, 'middle');
      lab('~14%', X(2022.9), Y(6) + 5, '#FFFDF5', fs - 1, 'middle');
      lab('~60%', X(2025.95), Y(30), '#FFFDF5', fs + 1, 'middle');
      const jx = X(2026.5);
      mk('path', { d: wobble(r, jx, Y(100), jx, Y(0), 1.2), stroke: INKD, 'stroke-width': 1.5, 'stroke-dasharray': '2 6', 'stroke-linecap': 'round', opacity: 0.8 }, svg);
      const jt = mk('text', { x: jx - 6, y: Y(100) + fs + 6, 'text-anchor': 'end', 'font-size': fs - 1, 'font-style': 'italic' }, svg);
      jt.textContent = 'July 2026';
    }

    /* hover / touch: find the band under the pointer */
    const st = bstate[key] || (bstate[key] = { locked: -1 });
    const fig = host.closest('figure'), readout = fig.querySelector('.readout');
    function highlight(k, j) {
      bands.forEach((g, i) => { g.style.opacity = k < 0 || i === k ? 1 : 0.22; g.style.transition = 'opacity .2s'; });
      fig.querySelectorAll('.pillrow').forEach((b) => b.classList.toggle('on', +b.dataset.t === k));
      if (k < 0) { readout.textContent = ''; return; }
      const sh = j == null ? null : S[j][k];
      readout.textContent = `${k}: ${B[key].kw[k]}` + (sh == null ? '' : ` \u00b7 ${Math.round(sh)}%`);
    }
    st.highlight = highlight;
    function probe(e) {
      const b = svg.getBoundingClientRect(), sc = W / b.width;
      const px = (e.clientX - b.left) * sc, py = (e.clientY - b.top) * sc;
      const yr = B.xdomain[0] + ((px - m.l) / (W - m.l - m.r)) * (B.xdomain[1] - B.xdomain[0]);
      const pct = ((H - m.b - py) / (H - m.t - m.b)) * 100;
      if (px < m.l || px > W - m.r || pct < 0 || pct > 100) return highlight(st.locked);
      let j = 0, bd = 1e9; yrs.forEach((y, i) => { const dd = Math.abs(y - yr); if (dd < bd) { bd = dd; j = i; } });
      let k = 0; while (k < 9 && cum[j][k] < pct) k++;
      highlight(k, j);
    }
    svg.addEventListener('pointermove', probe);
    svg.addEventListener('pointerdown', probe);
    svg.addEventListener('pointerleave', () => highlight(st.locked));
    finish(host);
    if (st.locked >= 0) highlight(st.locked);

    /* legend of pills, top topic first like the stack */
    const lg = fig.querySelector('.legend');
    if (!lg.children.length) {
      for (let k = 9; k >= 0; k--) {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'pillrow'; b.dataset.t = k; b.setAttribute('aria-pressed', 'false');
        b.innerHTML = `<span class="pill" style="--c:${TC[k]};--c2:${TC2[k]};--oc:${TOL[k]};--tx:${k === 0 || k === 3 ? '#fff' : '#3d1a26'}">${k}</span><span class="kw">${B[key].kw[k]}</span>`;
        b.addEventListener('pointerenter', () => { if (st.locked < 0) st.highlight(k); });
        b.addEventListener('focus', () => { if (st.locked < 0) st.highlight(k); });
        b.addEventListener('pointerleave', () => st.highlight(st.locked));
        b.addEventListener('blur', () => st.highlight(st.locked));
        b.addEventListener('click', () => {
          st.locked = st.locked === k ? -1 : k;
          lg.querySelectorAll('.pillrow').forEach((x) => x.setAttribute('aria-pressed', +x.dataset.t === st.locked));
          st.highlight(st.locked);
        });
        lg.appendChild(b);
      }
    }
  }

  /* ---------------- drawing in on view, and resize ---------------- */
  const charts = Array.from(root.querySelectorAll('.chart'));
  function draw(host) { (host.dataset.chart === 'A' ? renderA : renderB)(host); }
  const io = 'IntersectionObserver' in window ? new IntersectionObserver((es) => es.forEach((e) => {
    if (e.isIntersecting) { e.target.dataset.seen = 1; e.target.classList.add('in'); io.unobserve(e.target); }
  }), { threshold: 0.25 }) : null;
  charts.forEach((c) => { if (io && !reduce) io.observe(c); else { c.dataset.seen = 1; c.classList.add('in'); } });
  const widths = new Map();
  const ro = 'ResizeObserver' in window ? new ResizeObserver((es) => es.forEach((e) => {
    const w = Math.round(e.contentRect.width);
    if (w && widths.get(e.target) !== w) { widths.set(e.target, w); draw(e.target); }
  })) : null;
  charts.forEach((c) => { if (ro) ro.observe(c); else draw(c); });
  document.fonts && document.fonts.ready && document.fonts.ready.then(() => charts.forEach((c) => c.clientWidth && draw(c)));

  /* ---------------- the shutter, thread, pencil, parallax ---------------- */
  const shutter = root.querySelector('#shutter'), slats = root.querySelector('#slats'), shop = root.querySelector('.shop');
  const caps = Array.from(root.querySelectorAll('.cap'));
  const pars = Array.from(root.querySelectorAll('[data-par]'));
  const thread = root.querySelector('#thread'), tpath = root.querySelector('#threadPath'), treveal = root.querySelector('#threadReveal'), pencil = root.querySelector('#pencil');
  const OPEN_H = 292;
  let tlen = 0, tw = 0, th = 0;

  function buildThread() {
    const w = root.offsetWidth, h = root.offsetHeight;
    if (!w || !h) return;
    tw = w; th = h;
    thread.setAttribute('viewBox', `0 0 ${w} ${h}`);
    const P = [[.06, 0], [.04, .05], [.3, .09], [.12, .17], [.5, .24], [.9, .31], [.93, .4], [.5, .47], [.08, .53], [.12, .6], [.55, .67], [.93, .72], [.9, .8], [.45, .86], [.1, .91], [.2, .97], [.4, 1]];
    const pts = P.map((p) => [p[0] * w, p[1] * h]);
    let d = `M${f1(pts[0][0])} ${f1(pts[0][1])}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
      d += ` C${f1(p1[0] + (p2[0] - p0[0]) / 6)} ${f1(p1[1] + (p2[1] - p0[1]) / 6)} ${f1(p2[0] - (p3[0] - p1[0]) / 6)} ${f1(p2[1] - (p3[1] - p1[1]) / 6)} ${f1(p2[0])} ${f1(p2[1])}`;
    }
    tpath.setAttribute('d', d); treveal.setAttribute('d', d);
    tlen = tpath.getTotalLength();
  }

  let ticking = false;
  function update() {
    ticking = false;
    if (!root.offsetParent) return;
    const vh = window.innerHeight, rect = root.getBoundingClientRect();
    if (Math.abs(rect.height - th) > 4 || Math.abs(rect.width - tw) > 4) buildThread();

    /* parallax: background drawings drift a little against the scroll */
    if (!reduce) pars.forEach((p) => {
      const b = p.getBoundingClientRect(), mid = b.top + b.height / 2 - vh / 2;
      p.style.transform = `translate3d(0,${(-mid * parseFloat(p.dataset.par)).toFixed(1)}px,0)`;
    });

    /* thread and pencil: the dashed line is revealed through a mask that the pencil "draws" */
    if (tlen && !reduce) {
      const prog = clamp((vh * 0.55 - rect.top) / Math.max(1, rect.height));
      const L = tlen * prog;
      treveal.style.strokeDasharray = tlen + ' ' + (tlen + 50);
      treveal.style.strokeDashoffset = (tlen - L).toFixed(1);
      if (prog > 0.003 && prog < 0.995) {
        const pt = tpath.getPointAtLength(L), pt2 = tpath.getPointAtLength(Math.min(tlen, L + 6));
        const ang = Math.atan2(pt2.y - pt.y, pt2.x - pt.x) * 180 / Math.PI;
        pencil.style.opacity = 1;
        pencil.style.transform = `translate3d(${pt.x.toFixed(1)}px,${(pt.y - 15).toFixed(1)}px,0) rotate(${(ang + 180).toFixed(1)}deg)`;
      } else pencil.style.opacity = 0;
    }

    /* shutter: pinned scroll scene */
    if (shutter) {
      const sr = shutter.getBoundingClientRect(), span = sr.height - vh;
      let p = reduce ? 0.5 : clamp(-sr.top / Math.max(1, span));
      let c = smooth(0.24, 0.42, p) - smooth(0.64, 0.82, p);
      if (reduce) c = 0.55;
      slats.setAttribute('transform', `translate(0,${(-(1 - c) * OPEN_H).toFixed(1)})`);
      const state = reduce ? -1 : p < 0.27 ? 0 : p < 0.68 ? 1 : 2;
      caps.forEach((cp, i) => cp.classList.toggle('on', state === -1 ? true : i === state));
      shop.classList.toggle('rules', reduce || state === 2);
    }
  }
  const req = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
  window.addEventListener('scroll', req, { passive: true });
  window.addEventListener('resize', () => { buildThread(); req(); });
  document.addEventListener('panelshown', () => setTimeout(() => { buildThread(); req(); }, 30));
  buildThread(); req();
  window.addEventListener('load', () => { buildThread(); req(); });
  if (reduce) document.documentElement.classList.add('reduce');
})();
