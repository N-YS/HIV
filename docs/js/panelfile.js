/* User profile page: a mock case file for one user, with activity per subreddit, topic mix over time and example comments. */
(function () {
  const D = window.HIVDATA4, root = document.querySelector('.fl'), host3 = document.getElementById('panel-3');
  if (!D || !root || !host3) return;
  const NS = 'http://www.w3.org/2000/svg';
  const INKD = '#3d1a26';
  const TC = ['#5B7396', '#8FA9C9', '#B79BC4', '#9C5F86', '#C77B8F', '#E6A9A3', '#F1D98A', '#D9A93A', '#A9A24F', '#B6CFA6'];
  const OC = ['#22314a', '#2d3f5c', '#46264f', '#5c2a4a', '#6b2a3a', '#6b3a36', '#6b5a1c', '#6b4a0c', '#3d4f2a', '#3d5a35'];
  const SUBC = { HIV: '#4d5f2a', hivaids: '#7a5a8a' };
  const REMARKS = { Mrtrad: 'Almost all comments, 2 posts. Very little in r/HIV after the 2024 restriction; steady in r/hivaids.' };
  function mk(tag, a, p) { const e = document.createElementNS(NS, tag); for (const k in a) e.setAttribute(k, a[k]); if (p) p.appendChild(e); return e; }
  function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
  const f1 = (v) => v.toFixed(1);
  const nf = (n) => n.toLocaleString('en-US');
  function makeFile(F, alias) {
  const cur = { u: alias, k: 'all', hl: -1 };
  const user = () => D.users[cur.u];
  const kw = (i) => D.kw[i];

  /* ---------- the typed fields ---------- */
  function fields() {
    const u = user(), el = F.querySelector('.fl-fields'), tot = u.tot;
    const all = u.topics.all, sums = Array(10).fill(0); all.forEach((r) => r.forEach((v, i) => { sums[i] += v; }));
    const order = sums.map((v, i) => i).sort((a, b) => sums[b] - sums[a]).slice(0, 3);
    const rows = [
      ['Username', 'u/' + u.alias],  ['First seen', u.first], ['Last seen', u.last],
      ['Messages', `${nf(u.n)} (${nf(tot.HIV.c + tot.hivaids.c)} comments, ${tot.HIV.p + tot.hivaids.p} posts)`],
      ['In r/HIV', `${nf(tot.HIV.c)} comments, ${tot.HIV.p} posts`], ['In r/hivaids', `${nf(tot.hivaids.c)} comments, ${tot.hivaids.p} posts`],
           ['Usual subjects', order.map((i) => `<span class="fl-sw" style="background:${TC[i]};border-color:${OC[i]}"></span>${kw(i)} <em>${Math.round(sums[i] / u.n * 100)}%</em>`).join('<br>')],
      ['Note', 'Lorem ipsum dolor sit amet.'],
    ];
    el.innerHTML = rows.map((r) => `<div><dt>${r[0]}</dt><dd>${r[1]}</dd></div>`).join('');
  }

  /* ---------- exhibit A ---------- */
  function activity() {
    const u = user(), t = [];
    for (let i = 0; i < 61; i++) t.push(2021 + (10 + i) / 12);
    const ymax = Math.max(1, ...['HIV', 'hivaids'].map((s) => Math.max(...u.monthly[s].c, ...u.monthly[s].p)));
    const nice = ymax <= 10 ? 10 : ymax <= 20 ? 20 : ymax <= 30 ? 30 : ymax <= 40 ? 40 : Math.ceil(ymax / 20) * 20, step = nice <= 10 ? 5 : nice <= 40 ? 10 : 20;
    F.querySelectorAll('.fl-sheet[data-sub]').forEach((sh) => {
      const sub = sh.dataset.sub, host = sh.querySelector('.fl-act'), W = Math.round(host.clientWidth), H = Math.round(host.clientHeight);
      if (W < 60 || H < 60) return;
      const narrow = W < 520, fs = narrow ? 12 : 14, m = { l: narrow ? 28 : 36, r: 10, t: 10, b: 24 }, r = rng(sub === 'HIV' ? 3 : 8);
      const x0 = 2021.85, x1 = 2027.0, X = (v) => m.l + ((v - x0) / (x1 - x0)) * (W - m.l - m.r), Y = (v) => H - m.b - (v / nice) * (H - m.t - m.b);
      host.textContent = '';
      const svg = mk('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, 'aria-hidden': 'true' }, host), defs = mk('defs', {}, svg);
      const rx0 = X(2024), rx1 = X(2025.167), hh = Y(0) - Y(nice);
      mk('rect', { x: rx0, y: Y(nice), width: rx1 - rx0, height: hh, fill: 'rgba(183,155,196,.22)' }, svg);
      const hc = mk('clipPath', { id: 'flh' + alias + sub }, defs); mk('rect', { x: rx0, y: Y(nice), width: rx1 - rx0, height: hh }, hc);
      const hg = mk('g', { 'clip-path': `url(#flh${alias}${sub})` }, svg);
      for (let x = rx0 - hh; x < rx1 + 4; x += 11) mk('path', { d: `M${f1(x)} ${f1(Y(0) + 2)} L${f1(x + hh)} ${f1(Y(nice) - 2)}`, stroke: '#FFFDF5', 'stroke-width': 1.6, opacity: .85, fill: 'none', 'stroke-linecap': 'round' }, hg);
      for (let v = 0; v <= nice; v += step) {
        if (v) mk('path', { d: `M${m.l} ${f1(Y(v))} L${W - m.r} ${f1(Y(v) + (r() - .5))}`, stroke: INKD, 'stroke-width': .8, opacity: .18, fill: 'none', 'stroke-dasharray': '2 5' }, svg);
        const tx = mk('text', { x: m.l - 6, y: Y(v) + 4.5, 'text-anchor': 'end', 'font-size': fs - 1, fill: INKD, opacity: .85 }, svg); tx.textContent = v;
      }
      const bw = Math.max(2, (W - m.l - m.r) / 61 * 0.62), bars = mk('g', { class: 'fl-bars' }, svg);
      t.forEach((tv, i) => {
        const c = u.monthly[sub].c[i]; if (!c) return;
        const rc = mk('rect', { x: f1(X(tv) - bw / 2), y: f1(Y(c)), width: f1(bw), height: f1(Y(0) - Y(c)), fill: SUBC[sub], stroke: INKD, 'stroke-width': 1, rx: 1, class: 'fl-bar', style: `transition-delay:${(i * 12)}ms` }, bars);
        const ti = mk('title', {}, rc); ti.textContent = `${Math.floor(2021 + (10 + i) / 12 - 0.04)}: ${c} comments`;
      });
      mk('path', { d: `M${m.l} ${f1(Y(0))} L${W - m.r} ${f1(Y(0))}`, stroke: INKD, 'stroke-width': 2.2, 'stroke-linecap': 'round' }, svg);
      mk('path', { d: `M${m.l} ${f1(Y(nice))} L${m.l} ${f1(Y(0))}`, stroke: INKD, 'stroke-width': 1.6, 'stroke-linecap': 'round' }, svg);
      for (let y = 2022; y <= 2026; y++) {
        mk('path', { d: `M${f1(X(y))} ${f1(Y(0))} L${f1(X(y))} ${f1(Y(0) + 6)}`, stroke: INKD, 'stroke-width': 1.8, 'stroke-linecap': 'round' }, svg);
        const tx = mk('text', { x: X(y), y: Y(0) + 19, 'text-anchor': 'middle', 'font-size': fs, fill: INKD }, svg); tx.textContent = y;
      }
      t.forEach((tv, i) => {
        const p = u.monthly[sub].p[i]; if (!p) return;
        const c = u.monthly[sub].c[i], cy = Y(c) - 9;
        mk('circle', { cx: f1(X(tv)), cy: f1(Math.max(m.t + 6, cy)), r: 5.5, fill: '#D9A93A', stroke: '#6b4a0c', 'stroke-width': 2 }, svg);
      });
      const kx = m.l + 10;
      mk('rect', { x: kx, y: m.t + 2, width: 11, height: 11, fill: SUBC[sub], stroke: INKD, 'stroke-width': 1 }, svg);
      let tx = mk('text', { x: kx + 16, y: m.t + 12, 'font-size': fs, fill: INKD }, svg); tx.textContent = 'comments';
      mk('circle', { cx: kx + 98, cy: m.t + 8, r: 5, fill: '#D9A93A', stroke: '#6b4a0c', 'stroke-width': 2 }, svg);
      tx = mk('text', { x: kx + 108, y: m.t + 12, 'font-size': fs, fill: INKD }, svg); tx.textContent = 'posts';
    });
  }

  /* ---------- exhibit B ---------- */
  function topics() {
    const u = user(), host = F.querySelector('.fl-top-plot'), W = Math.round(host.clientWidth), H = Math.round(host.clientHeight);
    const legend = F.querySelector('.fl-leg');
    const rows = u.topics[cur.k], halves = u.halves;
    if (W >= 60 && H >= 60) {
      const narrow = W < 520, fs = narrow ? 11 : 13, m = { l: narrow ? 34 : 42, r: 8, t: 8, b: 36 };
      const n = halves.length, pw = (W - m.l - m.r) / n, bw = pw * 0.72, Y = (v) => H - m.b - v * (H - m.t - m.b);
      host.textContent = '';
      const svg = mk('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, 'aria-hidden': 'true' }, host);
      [0, 0.25, 0.5, 0.75, 1].forEach((v) => {
        if (v) mk('path', { d: `M${m.l} ${f1(Y(v))} L${W - m.r} ${f1(Y(v))}`, stroke: INKD, 'stroke-width': .8, opacity: .18, 'stroke-dasharray': '2 5', fill: 'none' }, svg);
        const tx = mk('text', { x: m.l - 6, y: Y(v) + 4, 'text-anchor': 'end', 'font-size': fs - 1, fill: INKD, opacity: .85 }, svg); tx.textContent = Math.round(v * 100) + '%';
      });
      rows.forEach((row, hi) => {
        const tot = row.reduce((a, b) => a + b, 0), cx = m.l + pw * hi + pw / 2;
        if (!tot) { const tx = mk('text', { x: cx, y: Y(0) - 6, 'text-anchor': 'middle', 'font-size': fs - 1, 'font-style': 'italic', fill: INKD, opacity: .6 }, svg); tx.textContent = 'none'; return; }
        let acc = 0;
        row.forEach((v, k) => {
          if (!v) return;
          const y1 = Y(acc / tot), y0 = Y((acc + v) / tot); acc += v;
          const rc = mk('rect', { x: f1(cx - bw / 2), y: f1(y0), width: f1(bw), height: f1(Math.max(0, y1 - y0)), fill: TC[k], stroke: OC[k], 'stroke-width': 1.6, class: 'fl-seg', 'data-k': k, opacity: cur.hl < 0 || cur.hl === k ? 1 : 0.25 }, svg);
          const ti = mk('title', {}, rc); ti.textContent = `${kw(k)}: ${v} of ${tot}`;
        });
      });
      mk('path', { d: `M${m.l} ${f1(Y(0))} L${W - m.r} ${f1(Y(0))}`, stroke: INKD, 'stroke-width': 2.2, 'stroke-linecap': 'round' }, svg);
      mk('path', { d: `M${m.l} ${f1(Y(1))} L${m.l} ${f1(Y(0))}`, stroke: INKD, 'stroke-width': 1.6, 'stroke-linecap': 'round' }, svg);
      halves.forEach((h, hi) => {
        const cx = m.l + pw * hi + pw / 2, tot = rows[hi].reduce((a, b) => a + b, 0), lab = h.slice(2, 4) + ' ' + h.slice(4);
        const t1 = mk('text', { x: cx, y: Y(0) + 15, 'text-anchor': 'middle', 'font-size': fs, fill: INKD }, svg); t1.textContent = narrow ? h.slice(4) : h.slice(0, 4) + ' ' + h.slice(4);
        const t2 = mk('text', { x: cx, y: Y(0) + 29, 'text-anchor': 'middle', 'font-size': fs - 1, 'font-style': 'italic', fill: INKD, opacity: .75 }, svg); t2.textContent = narrow ? (h.slice(4) === 'H1' ? h.slice(2, 4) : '') : 'n=' + tot;
      });
    }
    const sums = Array(10).fill(0); rows.forEach((r) => r.forEach((v, i) => { sums[i] += v; }));
    const order = sums.map((v, i) => i).sort((a, b) => sums[b] - sums[a]);
    legend.innerHTML = order.map((i) => `<li><button type="button" class="fl-lg${cur.hl === i ? ' hl' : ''}" data-k="${i}"><span class="fl-sw" style="background:${TC[i]};border-color:${OC[i]}"></span><span class="fl-lt">${kw(i)}</span><em>${sums[i]}</em></button></li>`).join('');
  }

  /* ---------- exhibit C ---------- */
  function slips() {
    const u = user(), el = F.querySelector('.fl-slips');
    el.innerHTML = u.ex.map((e, i) => `<figure class="fl-slip b-${e.sub} s${i % 4}"><figcaption>${e.sub === 'HIV' ? 'r/HIV' : 'r/hivaids'} &middot; ${e.date} &middot; ${e.kind}</figcaption><blockquote>${e.text.replace(/</g, '&lt;')}</blockquote><p class="fl-tp"><span class="fl-sw" style="background:${TC[e.topic]};border-color:${OC[e.topic]}"></span>${kw(e.topic)}</p></figure>`).join('');
  }

  function renderAll() {
    if (host3.hidden) return;
    fields(); activity(); topics(); slips(); reveal();
  }
  function reveal() {
    F.querySelectorAll('.fl-sheet').forEach((s) => {
      if (!('IntersectionObserver' in window)) { s.classList.add('in'); return; }
      if (s._io) return; const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { s.classList.add('in'); io.disconnect(); } }), { threshold: 0.25 });
      io.observe(s); s._io = io;
    });
  }
  F.querySelector('.fl-chips').addEventListener('click', (e) => {
    const b = e.target.closest('.chip'); if (!b) return; cur.k = b.dataset.k;
    F.querySelectorAll('.fl-chips .chip').forEach((c) => c.classList.toggle('on', c === b)); topics();
  });
  F.querySelector('.fl-leg').addEventListener('click', (e) => {
    const b = e.target.closest('.fl-lg'); if (!b) return; const k = +b.dataset.k; cur.hl = cur.hl === k ? -1 : k; topics();
  });
    return renderAll;
  }
  const files = Array.from(document.querySelectorAll('.fl')), tpl = files[0], names = Object.keys(D.users);
  names.forEach((u, i) => {
    let F = files[i];
    if (!F) { F = tpl.cloneNode(true); files[files.length - 1].after(F); files.push(F); }
    F.dataset.u = u; F.querySelector('.fl-top h3').textContent = 'u/' + u; F.querySelector('.fl-agency').textContent = 'User spotlight';
    F.querySelector('.fl-top h3').id = 'fl-h' + i; F.setAttribute('aria-labelledby', 'fl-h' + i);
    F._r = makeFile(F, u);
    F.querySelectorAll('.fl-tabs').forEach((x) => x.remove());
    const tabs = document.createElement('div'); tabs.className = 'fl-tabs'; tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', 'Users');
    names.forEach((n, k) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'fl-tab'; b.setAttribute('role', 'tab'); b.dataset.i = k; b.textContent = 'u/' + n;
      b.addEventListener('click', () => activate(k)); tabs.appendChild(b);
    });
    F.insertBefore(tabs, F.firstChild);
  });
  function activate(i) {
    files.forEach((F, k) => { F.hidden = k !== i; F.querySelectorAll('.fl-tab').forEach((b) => { const on = +b.dataset.i === i; b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); }); });
    setTimeout(() => files[i] && files[i]._r && files[i]._r(), 20);
  }
  document.addEventListener('flselect', (e) => activate(e.detail || 0));
  activate(0);
  const all = () => files.forEach((F) => { if (!F.hidden && F._r) F._r(); });
  let tm; window.addEventListener('resize', () => { clearTimeout(tm); tm = setTimeout(all, 120); });
  if ('MutationObserver' in window) new MutationObserver(() => { if (!host3.hidden) setTimeout(all, 30); }).observe(host3, { attributes: true, attributeFilter: ['hidden'] });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(all);
  all();
})();
