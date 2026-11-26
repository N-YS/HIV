/* Sentiment over time (Impact of Moderation page). Data in sentdata.js: [quarter, mean, 95% margin, n]. */
(function () {
  const D = window.HIVSENT, host = document.getElementById('sentChart'), root = document.getElementById('panel-2');
  if (!D || !host || !root) return;
  const NS = 'http://www.w3.org/2000/svg', INKD = '#3d1a26';
  const f1 = (v) => v.toFixed(1);
  const COL = { HIV: '#4d5f2a', hivaids: '#7a5a8a' };
  function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
  function mk(tag, a, p) { const e = document.createElementNS(NS, tag); for (const k in a) e.setAttribute(k, a[k]); if (p) p.appendChild(e); return e; }
  function wob(r, x0, y0, x1, y1, amp) {
    const n = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0) / 36)), pts = [];
    for (let i = 0; i <= n; i++) { const t = i / n; pts.push([x0 + (x1 - x0) * t + (r() - 0.5) * amp, y0 + (y1 - y0) * t + (r() - 0.5) * amp]); }
    return 'M' + pts.map((p) => f1(p[0]) + ' ' + f1(p[1])).join(' L');
  }
  let mode = 'all';
  function render() {
    const W = Math.round(host.clientWidth); if (W < 40) return;
    const narrow = W < 540, H = Math.round(narrow ? W * 0.9 : Math.min(W * 0.46, 430));
    const m = { l: narrow ? 40 : 52, r: narrow ? 12 : 20, t: 16, b: 34 }, fs = narrow ? 13 : 15;
    const x0 = 2021.75, x1 = 2026.98, ymin = -0.5, ymax = 0.7;
    const X = (v) => m.l + ((v - x0) / (x1 - x0)) * (W - m.l - m.r), Y = (v) => H - m.b - ((v - ymin) / (ymax - ymin)) * (H - m.t - m.b);
    const r = rng(7); host.textContent = '';
    const svg = mk('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, 'aria-hidden': 'true' }, host);
    const defs = mk('defs', {}, svg), hh = Y(ymin) - Y(ymax), rx0 = X(2024), rx1 = X(2025.167);
    mk('rect', { x: rx0, y: Y(ymax), width: rx1 - rx0, height: hh, fill: 'rgba(183,155,196,.22)' }, svg);
    const hc = mk('clipPath', { id: 'snhatch' }, defs); mk('rect', { x: rx0, y: Y(ymax), width: rx1 - rx0, height: hh }, hc);
    const hg = mk('g', { 'clip-path': 'url(#snhatch)' }, svg);
    for (let x = rx0 - hh; x < rx1 + 4; x += 11) mk('path', { d: `M${f1(x)} ${f1(Y(ymin) + 2)} L${f1(x + hh)} ${f1(Y(ymax) - 2)}`, stroke: '#FFFDF5', 'stroke-width': 1.6, opacity: 0.85, fill: 'none', 'stroke-linecap': 'round' }, hg);
    const rt = mk('text', { x: (rx0 + rx1) / 2, y: Y(ymax) + fs + 4, 'text-anchor': 'middle', 'font-size': fs - 1, 'font-style': 'italic' }, svg); rt.textContent = 'restricted';
    for (let v = -0.4; v <= 0.61; v += 0.2) {
      const z = Math.abs(v) < 0.01;
      mk('path', { d: wob(r, m.l, Y(v), W - m.r, Y(v), 1), stroke: INKD, 'stroke-width': z ? 1.4 : 0.8, opacity: z ? 0.45 : 0.18, fill: 'none', 'stroke-dasharray': z ? '' : '2 5' }, svg);
      const t = mk('text', { x: m.l - 8, y: Y(v) + 4.5, 'text-anchor': 'end', 'font-size': fs - 1, opacity: 0.85 }, svg); t.textContent = (v > 0.01 ? '+' : v < -0.01 ? '−' : '') + Math.abs(v).toFixed(1);
    }
    mk('path', { d: wob(r, m.l, Y(ymax), m.l, Y(ymin), 1), stroke: INKD, 'stroke-width': 1.6, fill: 'none', 'stroke-linecap': 'round' }, svg);
    for (let y = 2022; y <= 2026; y++) {
      mk('path', { d: `M${f1(X(y))} ${f1(Y(ymin))} L${f1(X(y))} ${f1(Y(ymin) + 7)}`, stroke: INKD, 'stroke-width': 1.8, 'stroke-linecap': 'round' }, svg);
      const t = mk('text', { x: X(y), y: Y(ymin) + 24, 'text-anchor': 'middle', 'font-size': fs }, svg); t.textContent = y;
    }
    ['HIV', 'hivaids'].forEach((s) => {
      const rows = D[mode][s].filter((q) => q[3] > 0), col = COL[s];
      const ok = rows.filter((q) => q[3] >= 30);
      /* margin band over runs of quarters with at least 30 messages */
      let run = [];
      const flush = () => { if (run.length > 1) mk('path', { d: 'M' + run.map((q) => f1(X(q[0])) + ' ' + f1(Y(q[1] + q[2]))).join(' L') + ' L' + run.slice().reverse().map((q) => f1(X(q[0])) + ' ' + f1(Y(q[1] - q[2]))).join(' L') + ' Z', fill: col, opacity: 0.2, stroke: 'none' }, svg); run = []; };
      rows.forEach((q) => { if (q[3] >= 30) run.push(q); else flush(); }); flush();
      rows.forEach((q, i) => { if (!i) return; const a = rows[i - 1], low = a[3] < 30 || q[3] < 30 || q[0] - a[0] > 0.3;
        mk('path', { d: `M${f1(X(a[0]))} ${f1(Y(a[1]))} L${f1(X(q[0]))} ${f1(Y(q[1]))}`, fill: 'none', stroke: col, opacity: low ? 0.4 : 1, 'stroke-width': 2.6, 'stroke-linecap': 'round', 'stroke-dasharray': low ? '1 6' : '' }, svg); });
      rows.forEach((q) => mk('circle', { cx: f1(X(q[0])), cy: f1(Y(q[1])), r: 3.5, fill: q[3] < 30 ? '#FFFDF5' : col, stroke: col, 'stroke-width': 1.8 }, svg));
      const last = ok.length ? ok[ok.length - 1] : rows[rows.length - 1];
      const lab = mk('text', { x: X(last[0]) - 6, y: Y(last[1]) + (s === 'HIV' ? -(narrow ? 12 : 14) - (mode === 'post' ? 0 : 0) : (narrow ? 20 : 24)), 'text-anchor': 'end', 'font-size': fs + 1, 'font-weight': 700, fill: col }, svg); lab.textContent = s === 'HIV' ? 'r/HIV' : 'r/hivaids';
    });
    host.setAttribute('aria-label', 'Line chart of mean message sentiment by quarter in r/HIV and r/hivaids. r/hivaids stays near +0.15. r/HIV starts near zero (negative in posts), dips in 2024 and rises above r/hivaids after the subreddit reopened.');
  }
  root.querySelectorAll('[data-sent]').forEach((b) => b.addEventListener('click', () => {
    mode = b.dataset.sent; root.querySelectorAll('[data-sent]').forEach((x) => x.classList.toggle('on', x === b)); render();
  }));
  let tm; window.addEventListener('resize', () => { clearTimeout(tm); tm = setTimeout(render, 120); });
  render(); if (document.fonts && document.fonts.ready) document.fonts.ready.then(render);
  const pr = root.closest('.panel') || root; if ('MutationObserver' in window) new MutationObserver(() => render()).observe(root, { attributes: true, attributeFilter: ['hidden'] });
})();
