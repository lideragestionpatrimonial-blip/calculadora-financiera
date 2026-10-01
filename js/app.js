(function () {
  'use strict';

  const F = window.Finance;
  const C = window.Charts;
  const $ = (id) => document.getElementById(id);

  const PERIOD_NAMES = { 12: 'mensual', 4: 'trimestral', 2: 'semestral', 1: 'anual' };
  const PERIOD_UNITS = { 12: 'meses', 4: 'trimestres', 2: 'semestres', 1: 'años' };

  const eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2, minimumFractionDigits: 2 });
  const eur0 = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  const num = (d) => new Intl.NumberFormat('es-ES', { maximumFractionDigits: d, minimumFractionDigits: d });
  const pct = (v, d = 2) => num(d).format(v) + ' %';
  const compactEur = (v) => {
    if (Math.abs(v) >= 1e6) return num(v % 1e6 === 0 ? 0 : 1).format(v / 1e6) + ' M€';
    if (Math.abs(v) >= 1e3) return num(Math.abs(v) < 1e4 && v % 1e3 ? 1 : 0).format(v / 1e3) + ' k€';
    return num(0).format(v) + ' €';
  };

  function yearsText(years) {
    const totalMonths = Math.round(years * 12);
    const y = Math.floor(totalMonths / 12), m = totalMonths % 12;
    const parts = [];
    if (y) parts.push(y + (y === 1 ? ' año' : ' años'));
    if (m) parts.push(m + (m === 1 ? ' mes' : ' meses'));
    return parts.join(' y ') || '0 meses';
  }

  // Definición de las variables del préstamo.
  const VARS = [
    { key: 'principal', name: 'Capital inicial', sub: 'Importe que te prestan', unit: '€', min: 0, max: 1500000, step: 1000, dec: 2 },
    { key: 'annualRate', name: 'Tipo de interés', sub: 'TIN anual', unit: '%', min: 0, max: 15, step: 0.05, dec: 3 },
    { key: 'years', name: 'Plazo', sub: 'Duración del préstamo', unit: 'años', min: 1, max: 40, step: 1, dec: 2 },
    { key: 'payment', name: 'Cuota', sub: 'Pago periódico', unit: '€', min: 0, max: 15000, step: 10, dec: 2 },
    { key: 'final', name: 'Capital final', sub: 'Pendiente al vencimiento (cuota final / balloon)', unit: '€', min: 0, max: 1500000, step: 1000, dec: 2 },
  ];
  const TITLES = { principal: 'Capital inicial', annualRate: 'Tipo de interés (TIN)', years: 'Plazo', payment: 'Cuota', final: 'Capital final' };

  const state = {
    target: 'payment',
    perYear: 12,
    values: { principal: 200000, annualRate: 3, years: 25, payment: 0, final: 0 },
    result: null,
    view: 'year',
    saved: null,
  };

  const SOLVE_KEY = { principal: 'principal', annualRate: 'rate', years: 'term', payment: 'payment', final: 'final' };

  /* ---------- Construcción del panel de variables ---------- */
  const refs = {};
  function buildPanel() {
    const wrap = $('vars');
    VARS.forEach((v) => {
      const box = document.createElement('div');
      box.className = 'var';
      box.innerHTML = `
        <div class="var-head">
          <label class="var-name" for="in-${v.key}">${v.name}<small>${v.sub}</small></label>
          <button type="button" class="solve-btn">Calcular</button>
        </div>
        <div class="var-input">
          <input id="in-${v.key}" type="number" inputmode="decimal" step="any" min="${v.min}">
          <span class="unit">${v.unit}</span>
        </div>
        <input type="range" min="${v.min}" max="${v.max}" step="${v.step}" aria-label="${v.name}">
        <div class="var-extra"></div>`;
      wrap.appendChild(box);
      const r = {
        box,
        input: box.querySelector('input[type=number]'),
        range: box.querySelector('input[type=range]'),
        btn: box.querySelector('.solve-btn'),
        extra: box.querySelector('.var-extra'),
        sub: box.querySelector('small'),
        def: v,
      };
      refs[v.key] = r;
      r.btn.addEventListener('click', () => setTarget(v.key));
      r.range.addEventListener('input', () => {
        if (state.target === v.key) return;
        state.values[v.key] = parseFloat(r.range.value);
        r.input.value = state.values[v.key];
        recalc();
      });
      r.input.addEventListener('input', () => {
        if (state.target === v.key) return;
        const val = parseFloat(r.input.value);
        if (!isFinite(val)) return;
        state.values[v.key] = val;
        r.range.value = val;
        recalc({ keepInput: v.key });
      });
    });
  }

  function paymentMax() { return Math.round(15000 * 12 / state.perYear); }

  function syncPanel(keepInput) {
    refs.payment.range.max = paymentMax();
    refs.payment.sub.textContent = 'Pago ' + PERIOD_NAMES[state.perYear];
    VARS.forEach((v) => {
      const r = refs[v.key];
      const isT = state.target === v.key;
      r.box.classList.toggle('target', isT);
      r.btn.textContent = isT ? '✓ Calculando' : 'Calcular';
      r.btn.setAttribute('aria-pressed', isT);
      r.input.readOnly = isT;
      r.range.disabled = isT;
      const val = state.values[v.key];
      if (keepInput !== v.key) r.input.value = isFinite(val) ? +val.toFixed(v.dec) : '';
      // Amplía el rango del slider si el valor lo supera.
      if (val > +r.range.max && !isT) r.range.max = Math.ceil(val / v.step) * v.step;
      r.range.value = val;
    });
    updateExtras();
  }

  function updateExtras() {
    const v = state.values, m = state.perYear;
    const n = v.years * m;
    refs.years.extra.textContent = `${yearsText(v.years)} · ${num(Number.isInteger(+n.toFixed(6)) ? 0 : 1).format(n)} ${PERIOD_UNITS[m]}`;
    const tae = (Math.pow(1 + v.annualRate / 100 / m, m) - 1) * 100;
    refs.annualRate.extra.textContent = `TAE equivalente ≈ ${pct(tae)} (sin comisiones)`;
    refs.payment.extra.textContent = `${eur0.format(v.payment * m)} al año`;
    refs.final.extra.textContent = v.principal > 0 ? `${pct((v.final / v.principal) * 100, 1)} del capital inicial` : '';
    refs.principal.extra.textContent = '';
  }

  function setTarget(key) {
    if (state.target === key) return;
    state.target = key;
    recalc();
  }

  /* ---------- Cálculo ---------- */
  function validate(r) {
    if (!isFinite(r.principal) || r.principal <= 0) throw new Error('Con estos datos el capital inicial resultaría nulo o negativo.');
    if (!isFinite(r.years) || r.years <= 0) throw new Error('El plazo debe ser mayor que cero.');
    if (r.years > 100) throw new Error('El plazo resultante supera los 100 años: aumenta la cuota.');
    if (!isFinite(r.final) || r.final < -0.005) throw new Error('La cuota es mayor de lo necesario: amortizarías el préstamo antes de terminar el plazo. Baja la cuota o calcula el plazo.');
    if (!isFinite(r.annualRate) || r.annualRate < 0) throw new Error('Haría falta un tipo de interés negativo: la cuota es demasiado baja para devolver el capital.');
    if (!isFinite(r.payment) || r.payment < 0) throw new Error('La cuota resultante sería negativa: revisa el capital final.');
    if (r.final > r.principal + 1e-6) throw new Error('El capital final no puede ser mayor que el capital inicial.');
  }

  function recalc(opts) {
    opts = opts || {};
    const err = $('error');
    try {
      const r = F.solve(SOLVE_KEY[state.target], Object.assign({}, state.values, { perYear: state.perYear }));
      if (r.final < 0 && r.final > -0.005) r.final = 0;
      validate(r);
      state.values[state.target] = { principal: r.principal, annualRate: r.annualRate, years: r.years, payment: r.payment, final: r.final }[state.target];
      state.result = { v: r, s: F.schedule(r) };
      err.hidden = true;
      document.querySelectorAll('.results > .card').forEach((c) => c.classList.remove('stale'));
    } catch (e) {
      err.textContent = '⚠ ' + e.message;
      err.hidden = false;
      document.querySelectorAll('.results > .card').forEach((c) => c.classList.add('stale'));
    }
    syncPanel(opts.keepInput);
    if (!err.hidden) return;
    renderResults();
    saveHash();
  }

  /* ---------- Resultados ---------- */
  function renderResults() {
    const { v, s } = state.result;
    const t = state.target;
    $('heroLabel').textContent = t === 'payment' ? 'Cuota ' + PERIOD_NAMES[state.perYear] : TITLES[t];
    let value, note = '';
    if (t === 'annualRate') {
      value = pct(v.annualRate, 3);
      note = 'TAE equivalente ≈ ' + pct((Math.pow(1 + v.annualRate / 100 / v.perYear, v.perYear) - 1) * 100);
    } else if (t === 'years') {
      value = yearsText(v.years);
      const last = s.rows[s.rows.length - 1];
      note = Number.isInteger(+(v.years * v.perYear).toFixed(6)) ? `${s.rows.length} cuotas` : `${s.rows.length} cuotas, la última de ${eur.format(last.payment)}`;
    } else {
      value = eur.format(v[t]);
      if (t === 'payment') note = `${eur0.format(v.payment * v.perYear)} al año`;
      if (t === 'final' && v.final > 0) note = 'Se paga de una vez junto a la última cuota';
    }
    $('heroValue').textContent = value;
    $('heroNote').textContent = note;
    $('kInterest').textContent = eur0.format(s.totInterest);
    $('kPaid').textContent = eur0.format(s.totPaid + v.final);
    $('kCount').textContent = s.rows.length;
    $('kRatio').textContent = pct((s.totInterest / v.principal) * 100, 1);

    renderBalance();
    renderDonut();
    renderBars();
    renderSensitivity();
    renderTable();
  }

  function balancePoints(v, s) {
    return [[0, v.principal]].concat(s.rows.map((r) => [r.period / v.perYear, r.balance]));
  }
  function balanceAt(sched, perYear, x) {
    const k = Math.round(x * perYear);
    if (k <= 0) return null;
    return sched.rows[k - 1] || null;
  }

  function renderBalance() {
    const { v, s } = state.result;
    const series = [{ points: balancePoints(v, s), color: 'var(--balance)', area: true }];
    const sv = state.saved;
    if (sv) series.push({ points: balancePoints(sv.v, sv.s), color: 'var(--compare)', dashed: true });
    C.line($('balanceChart'), {
      series,
      xMin: 0,
      xFmt: (x) => 'Año ' + num(0).format(x),
      yFmt: compactEur,
      tooltip: (x) => {
        const row = balanceAt(s, v.perYear, x);
        let h = `<b>Año ${num(x % 1 ? 2 : 0).format(x)}</b>${row ? ` · cuota nº ${row.period}` : ''}<br>Pendiente: ${eur0.format(row ? row.balance : v.principal)}`;
        if (row) h += `<br>Intereses de esta cuota: ${eur.format(row.interest)}`;
        if (sv) {
          const r2 = balanceAt(sv.s, sv.v.perYear, x);
          const b2 = r2 ? r2.balance : x <= 0 ? sv.v.principal : null;
          if (b2 != null) h += `<br><span style="opacity:.8">Fijado: ${eur0.format(b2)}</span>`;
        }
        return h;
      },
    });
    renderCompare();
  }

  function renderCompare() {
    const box = $('compare');
    const sv = state.saved;
    $('clearScenario').hidden = !sv;
    if (!sv) { box.hidden = true; return; }
    const { v, s } = state.result;
    const diff = (a, b, fmt, lowerIsBetter = true) => {
      const d = a - b;
      if (Math.abs(d) < 0.005) return '<b>igual</b>';
      const good = lowerIsBetter ? d < 0 : d > 0;
      return `<b class="${good ? 'down' : 'up'}">${d > 0 ? '+' : '−'}${fmt(Math.abs(d))}</b>`;
    };
    box.hidden = false;
    box.innerHTML = `<span style="color:var(--compare)">- - -</span> Escenario fijado (${eur0.format(sv.v.principal)}, ${pct(sv.v.annualRate)}, ${yearsText(sv.v.years)}). Respecto a él: cuota ${diff(v.payment * v.perYear / 12, sv.v.payment * sv.v.perYear / 12, eur.format)} al mes · intereses ${diff(s.totInterest, sv.s.totInterest, eur0.format)} · plazo ${diff(v.years * 12, sv.v.years * 12, (m) => num(0).format(m) + ' meses')}`;
  }

  function renderDonut() {
    const { v, s } = state.result;
    const parts = [
      { label: 'Capital', value: v.principal, color: 'var(--capital)', fmt: eur0.format(v.principal) },
      { label: 'Intereses', value: s.totInterest, color: 'var(--interest)', fmt: eur0.format(s.totInterest) },
    ];
    C.donut($('donut'), parts, ['Total a pagar', compactEur(v.principal + s.totInterest)]);
  }

  function yearly(v, s) {
    const out = [];
    s.rows.forEach((r) => {
      const y = Math.ceil(r.period / v.perYear);
      if (!out[y - 1]) out[y - 1] = { year: y, payment: 0, interest: 0, principal: 0, balance: 0, count: 0 };
      const o = out[y - 1];
      o.payment += r.payment; o.interest += r.interest; o.principal += r.principal; o.balance = r.balance; o.count++;
    });
    return out;
  }

  function renderBars() {
    const { v, s } = state.result;
    const ys = yearly(v, s);
    C.bars($('barsChart'), {
      labels: ys.map((y) => String(y.year)),
      stacks: [
        { values: ys.map((y) => y.principal), color: 'var(--capital)' },
        { values: ys.map((y) => y.interest), color: 'var(--interest)' },
      ],
      yFmt: compactEur,
      tooltip: (k) => {
        const y = ys[k];
        const share = y.payment > 0 ? (y.interest / y.payment) * 100 : 0;
        return `<b>Año ${y.year}</b><br><span style="color:var(--capital)">■</span> Capital: ${eur0.format(y.principal)}<br><span style="color:var(--interest)">■</span> Intereses: ${eur0.format(y.interest)} (${pct(share, 0)})<br>Pendiente al final: ${eur0.format(y.balance)}`;
      },
    });
  }

  function renderSensitivity() {
    const { v } = state.result;
    const top = Math.max(8, Math.ceil(v.annualRate * 1.6));
    const pts = [];
    for (let r = 0; r <= top + 1e-9; r += top / 120) {
      pts.push([r, F.solve('payment', Object.assign({}, v, { annualRate: r })).payment]);
    }
    C.line($('sensChart'), {
      series: [{ points: pts, color: 'var(--accent)', area: true }],
      xMin: 0,
      xFmt: (x) => num(x % 1 ? 1 : 0).format(x) + ' %',
      yFmt: compactEur,
      marker: { x: v.annualRate, y: v.payment, color: 'var(--interest)' },
      tooltip: (x) => {
        const p = F.solve('payment', Object.assign({}, v, { annualRate: x })).payment;
        const d = p - v.payment;
        return `<b>Tipo ${pct(x)}</b><br>Cuota: ${eur.format(p)}<br>${d >= 0 ? '+' : '−'}${eur.format(Math.abs(d))} vs. actual`;
      },
    });
  }

  function renderTable() {
    const { v, s } = state.result;
    const tbl = $('table');
    let head, body;
    if (state.view === 'year') {
      head = '<tr><th>Año</th><th>Cuotas</th><th>Pagado</th><th>Intereses</th><th>Amortización</th><th>Pendiente</th></tr>';
      body = yearly(v, s).map((y) => `<tr><td>${y.year}</td><td>${y.count}</td><td>${eur.format(y.payment)}</td><td>${eur.format(y.interest)}</td><td>${eur.format(y.principal)}</td><td>${eur.format(y.balance)}</td></tr>`).join('');
    } else {
      head = '<tr><th>Nº</th><th>Año</th><th>Cuota</th><th>Intereses</th><th>Amortización</th><th>Pendiente</th></tr>';
      body = s.rows.map((r) => `<tr><td>${r.period}</td><td>${Math.ceil(r.period / v.perYear)}</td><td>${eur.format(r.payment)}</td><td>${eur.format(r.interest)}</td><td>${eur.format(r.principal)}</td><td>${eur.format(r.balance)}</td></tr>`).join('');
    }
    const foot = `<tr><td>Total</td><td></td><td>${eur.format(s.totPaid)}</td><td>${eur.format(s.totInterest)}</td><td>${eur.format(s.totPrincipal)}</td><td>${v.final > 0 ? eur.format(v.final) + ' final' : ''}</td></tr>`;
    tbl.innerHTML = `<thead>${head}</thead><tbody>${body}</tbody><tfoot>${foot}</tfoot>`;
  }

  function downloadCsv() {
    if (!state.result) return;
    const { v, s } = state.result;
    const f = (x) => x.toFixed(2).replace('.', ',');
    const lines = ['Nº;Año;Cuota;Intereses;Amortización;Capital pendiente'];
    s.rows.forEach((r) => lines.push([r.period, Math.ceil(r.period / v.perYear), f(r.payment), f(r.interest), f(r.principal), f(r.balance)].join(';')));
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'cuadro-amortizacion.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  /* ---------- Estado en la URL (para compartir) ---------- */
  function saveHash() {
    const v = state.values;
    const p = new URLSearchParams({ t: state.target, f: state.perYear, c: v.principal, i: v.annualRate, n: v.years, q: v.payment, r: v.final });
    history.replaceState(null, '', '#' + p.toString());
  }
  function loadHash() {
    const p = new URLSearchParams(location.hash.slice(1));
    if (!p.has('t')) return;
    const keys = { c: 'principal', i: 'annualRate', n: 'years', q: 'payment', r: 'final' };
    if (SOLVE_KEY[p.get('t')]) state.target = p.get('t');
    if (PERIOD_NAMES[p.get('f')]) state.perYear = +p.get('f');
    for (const k in keys) {
      const val = parseFloat(p.get(k));
      if (isFinite(val)) state.values[keys[k]] = val;
    }
  }

  /* ---------- Eventos generales ---------- */
  const PRESETS = {
    primera: { principal: 250000, annualRate: 2.9, years: 30, final: 0 },
    balloon: { principal: 300000, annualRate: 3.5, years: 15, final: 90000 },
    corta: { principal: 150000, annualRate: 2.5, years: 10, final: 0 },
  };

  function bindGlobal() {
    $('perYear').value = String(state.perYear);
    $('perYear').addEventListener('change', (e) => {
      // Mantiene el préstamo y recalcula la cuota para la nueva periodicidad.
      state.perYear = +e.target.value;
      if (state.target !== 'payment') {
        try { state.values.payment = F.solve('payment', Object.assign({}, state.values, { perYear: state.perYear })).payment; } catch (_) { /* se mostrará el error al recalcular */ }
      }
      recalc();
    });
    document.querySelectorAll('[data-preset]').forEach((b) => b.addEventListener('click', () => {
      Object.assign(state.values, PRESETS[b.dataset.preset]);
      state.target = 'payment';
      recalc();
    }));
    $('saveScenario').addEventListener('click', () => {
      if (!state.result) return;
      state.saved = JSON.parse(JSON.stringify(state.result));
      renderBalance();
    });
    $('clearScenario').addEventListener('click', () => { state.saved = null; renderBalance(); });
    document.querySelectorAll('.seg-btn').forEach((b) => b.addEventListener('click', () => {
      state.view = b.dataset.view;
      document.querySelectorAll('.seg-btn').forEach((x) => x.classList.toggle('active', x === b));
      renderTable();
    }));
    $('csv').addEventListener('click', downloadCsv);
    $('themeToggle').addEventListener('click', () => {
      const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      const next = cur === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      try { localStorage.setItem('theme', next); } catch (_) { /* sin almacenamiento */ }
    });
    let rt;
    window.addEventListener('resize', () => {
      clearTimeout(rt);
      rt = setTimeout(() => { if (state.result) { renderBalance(); renderBars(); renderSensitivity(); } }, 120);
    });
  }

  try { const th = localStorage.getItem('theme'); if (th) document.documentElement.dataset.theme = th; } catch (_) { /* sin almacenamiento */ }
  loadHash();
  buildPanel();
  bindGlobal();
  recalc();
})();
