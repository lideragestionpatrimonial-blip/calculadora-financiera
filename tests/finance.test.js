const test = require('node:test');
const assert = require('node:assert');
const F = require('../js/finance.js');

const near = (a, b, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `${a} ≉ ${b}`);

const base = { principal: 200000, final: 0, annualRate: 3, years: 25, payment: 0, perYear: 12 };

test('cuota de referencia (200.000 €, 3 %, 25 años)', () => {
  near(F.solve('payment', base).payment, 948.42);
});

test('tipo 0 %', () => {
  near(F.solve('payment', { ...base, annualRate: 0 }).payment, 200000 / 300);
});

test('cada variable se recupera a partir de las demás', () => {
  const full = F.solve('payment', { ...base, final: 50000 });
  near(F.solve('principal', { ...full, principal: 0 }).principal, 200000);
  near(F.solve('final', { ...full, final: 0 }).final, 50000);
  near(F.solve('rate', { ...full, annualRate: 0 }).annualRate, 3, 1e-6);
  near(F.solve('term', { ...full, years: 0 }).years, 25, 1e-6);
});

test('plazo imposible si la cuota no cubre intereses', () => {
  assert.throws(() => F.solve('term', { ...base, payment: 400 }));
});

test('el cuadro deja el capital final y cuadra totales', () => {
  const v = F.solve('payment', { ...base, final: 30000 });
  const s = F.schedule(v);
  assert.strictEqual(s.rows.length, 300);
  near(s.rows.at(-1).balance, 30000);
  near(s.totPrincipal, 170000);
  near(s.totPaid, s.totPrincipal + s.totInterest);
});

test('plazo fraccionario: última cuota parcial', () => {
  const v = F.solve('term', { ...base, payment: 1200 });
  const s = F.schedule(v);
  near(s.rows.at(-1).balance, 0);
  assert.ok(s.rows.at(-1).payment < 1200);
});
