/* Gráficos SVG ligeros, sin dependencias. */
(function (root) {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const M = { top: 12, right: 14, bottom: 26, left: 64 };
  const tip = () => document.getElementById('tooltip');

  function el(name, attrs, parent) {
    const n = document.createElementNS(NS, name);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }

  function niceTicks(max, count) {
    if (!(max > 0)) return [0, 1];
    const raw = max / count;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map((s) => s * mag).find((s) => s >= raw);
    const ticks = [];
    for (let v = 0; v <= max + step * 0.999; v += step) ticks.push(v);
    return ticks;
  }

  function showTip(evt, html) {
    const t = tip();
    t.innerHTML = html;
    t.hidden = false;
    const pad = 14;
    let x = evt.clientX + pad, y = evt.clientY + pad;
    const r = t.getBoundingClientRect();
    if (x + r.width > window.innerWidth - 8) x = evt.clientX - r.width - pad;
    if (y + r.height > window.innerHeight - 8) y = evt.clientY - r.height - pad;
    t.style.left = x + 'px';
    t.style.top = y + 'px';
  }
  function hideTip() { tip().hidden = true; }

  function frame(container) {
    container.innerHTML = '';
    const W = Math.max(container.clientWidth, 260);
    const H = container.clientHeight || 260;
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none' }, container);
    return { svg, W, H, iw: W - M.left - M.right, ih: H - M.top - M.bottom };
  }

  function yAxis(g, ticks, y, iw, fmt) {
    const grid = el('g', { class: 'grid' }, g);
    const ax = el('g', { class: 'axis' }, g);
    ticks.forEach((t) => {
      el('line', { x1: 0, x2: iw, y1: y(t), y2: y(t) }, grid);
      const tx = el('text', { x: -8, y: y(t) + 4, 'text-anchor': 'end' }, ax);
      tx.textContent = fmt(t);
    });
  }

  function xAxis(g, values, x, ih, fmt, maxLabels) {
    const ax = el('g', { class: 'axis' }, g);
    const every = Math.max(1, Math.ceil(values.length / maxLabels));
    values.forEach((v, idx) => {
      if (idx % every !== 0 && idx !== values.length - 1) return;
      const tx = el('text', { x: x(v), y: ih + 18, 'text-anchor': 'middle' }, ax);
      tx.textContent = fmt(v);
    });
  }

  /**
   * Gráfico de líneas/áreas.
   * opts.series: [{ points: [[x,y]...], color, area, dashed }]
   * opts.marker: { x, y, color } punto destacado
   * opts.tooltip(x) → html
   */
  function line(container, opts) {
    const { svg, iw, ih } = frame(container);
    const all = opts.series.flatMap((s) => s.points);
    if (!all.length) return;
    const xMin = opts.xMin != null ? opts.xMin : Math.min(...all.map((p) => p[0]));
    const xMax = Math.max(...all.map((p) => p[0]), xMin + 1e-9);
    const ticks = niceTicks(Math.max(...all.map((p) => p[1]), 0), 4);
    const yMax = ticks[ticks.length - 1];
    const x = (v) => ((v - xMin) / (xMax - xMin)) * iw;
    const y = (v) => ih - (v / yMax) * ih;
    const g = el('g', { transform: `translate(${M.left},${M.top})` }, svg);
    yAxis(g, ticks, y, iw, opts.yFmt);
    const xs = niceTicks(xMax - xMin, Math.min(8, Math.max(2, Math.floor(iw / 70)))).map((t) => t + xMin).filter((t) => t <= xMax + 1e-9);
    xAxis(g, xs, x, ih, opts.xFmt, 12);

    opts.series.forEach((s) => {
      const d = s.points.map((p, k) => `${k ? 'L' : 'M'}${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join('');
      if (s.area) {
        const last = s.points[s.points.length - 1], first = s.points[0];
        el('path', { d: `${d}L${x(last[0])},${ih}L${x(first[0])},${ih}Z`, fill: s.color, 'fill-opacity': 0.14 }, g);
      }
      el('path', { d, fill: 'none', stroke: s.color, 'stroke-width': 2.2, 'stroke-dasharray': s.dashed ? '6 5' : '', 'stroke-linejoin': 'round' }, g);
    });

    if (opts.marker) {
      const mk = opts.marker;
      el('line', { x1: x(mk.x), x2: x(mk.x), y1: y(mk.y), y2: ih, stroke: mk.color, 'stroke-dasharray': '3 3' }, g);
      el('circle', { cx: x(mk.x), cy: y(mk.y), r: 5.5, fill: mk.color, stroke: 'var(--surface)', 'stroke-width': 2 }, g);
    }

    const cursor = el('line', { y1: 0, y2: ih, stroke: 'var(--muted)', 'stroke-width': 1, visibility: 'hidden' }, g);
    const dot = el('circle', { r: 4, fill: opts.series[0].color, visibility: 'hidden' }, g);
    const hit = el('rect', { width: iw, height: ih, fill: 'transparent' }, g);
    const base = opts.series[0].points;
    hit.addEventListener('mousemove', (e) => {
      const rect = hit.getBoundingClientRect();
      const xv = xMin + ((e.clientX - rect.left) / rect.width) * (xMax - xMin);
      let best = base[0];
      for (const p of base) if (Math.abs(p[0] - xv) < Math.abs(best[0] - xv)) best = p;
      cursor.setAttribute('x1', x(best[0])); cursor.setAttribute('x2', x(best[0]));
      dot.setAttribute('cx', x(best[0])); dot.setAttribute('cy', y(best[1]));
      cursor.setAttribute('visibility', 'visible'); dot.setAttribute('visibility', 'visible');
      showTip(e, opts.tooltip(best[0]));
    });
    hit.addEventListener('mouseleave', () => {
      cursor.setAttribute('visibility', 'hidden'); dot.setAttribute('visibility', 'hidden'); hideTip();
    });
  }

  /**
   * Barras apiladas.
   * opts.labels: [..], opts.stacks: [{ values, color }], opts.tooltip(idx) → html
   */
  function bars(container, opts) {
    const { svg, iw, ih } = frame(container);
    const n = opts.labels.length;
    if (!n) return;
    const totals = opts.labels.map((_, k) => opts.stacks.reduce((a, s) => a + Math.max(0, s.values[k]), 0));
    const ticks = niceTicks(Math.max(...totals), 4);
    const yMax = ticks[ticks.length - 1];
    const y = (v) => ih - (v / yMax) * ih;
    const band = iw / n;
    const bw = Math.max(1, band * 0.72);
    const g = el('g', { transform: `translate(${M.left},${M.top})` }, svg);
    yAxis(g, ticks, y, iw, opts.yFmt);
    xAxis(g, opts.labels.map((_, k) => k), (k) => k * band + band / 2, ih, (k) => opts.labels[k], Math.floor(iw / 34));

    opts.labels.forEach((_, k) => {
      let acc = 0;
      const col = el('g', {}, g);
      opts.stacks.forEach((s) => {
        const v = Math.max(0, s.values[k]);
        el('rect', { x: k * band + (band - bw) / 2, y: y(acc + v), width: bw, height: Math.max(0, y(acc) - y(acc + v)), fill: s.color, rx: Math.min(3, bw / 4) }, col);
        acc += v;
      });
      const hit = el('rect', { x: k * band, y: 0, width: band, height: ih, fill: 'transparent' }, col);
      hit.addEventListener('mousemove', (e) => { col.style.opacity = 0.8; showTip(e, opts.tooltip(k)); });
      hit.addEventListener('mouseleave', () => { col.style.opacity = 1; hideTip(); });
    });
  }

  /** Donut. parts: [{ label, value, color }] */
  function donut(container, parts, center) {
    container.innerHTML = '';
    const svg = el('svg', { viewBox: '0 0 200 200' }, container);
    const total = parts.reduce((a, p) => a + Math.max(0, p.value), 0) || 1;
    const R = 88, r = 58, cx = 100, cy = 100;
    let a0 = -Math.PI / 2;
    parts.forEach((p) => {
      const frac = Math.max(0, p.value) / total;
      if (frac <= 0) return;
      const a1 = a0 + frac * Math.PI * 2 - (frac >= 1 ? 1e-4 : 0);
      const large = a1 - a0 > Math.PI ? 1 : 0;
      const pt = (rad, ang) => `${cx + rad * Math.cos(ang)},${cy + rad * Math.sin(ang)}`;
      const d = `M${pt(R, a0)}A${R},${R} 0 ${large} 1 ${pt(R, a1)}L${pt(r, a1)}A${r},${r} 0 ${large} 0 ${pt(r, a0)}Z`;
      const path = el('path', { d, fill: p.color }, svg);
      path.addEventListener('mousemove', (e) => showTip(e, `<b>${p.label}</b><br>${p.fmt} · ${(frac * 100).toFixed(1)} %`));
      path.addEventListener('mouseleave', hideTip);
      a0 = a1;
    });
    const t1 = el('text', { x: 100, y: 96, 'text-anchor': 'middle', fill: 'var(--muted)', 'font-size': 11 }, svg);
    t1.textContent = center[0];
    const t2 = el('text', { x: 100, y: 116, 'text-anchor': 'middle', fill: 'var(--text)', 'font-size': 17, 'font-weight': 700 }, svg);
    t2.textContent = center[1];
    const lg = document.createElement('div');
    lg.className = 'legend';
    lg.innerHTML = parts.map((p) => `<span><i style="background:${p.color}"></i>${p.label}: <b>${p.fmt}</b></span>`).join('');
    container.appendChild(lg);
  }

  root.Charts = { line, bars, donut, hideTip };
})(window);
