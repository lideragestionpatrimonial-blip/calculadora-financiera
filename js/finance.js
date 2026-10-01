/*
 * Motor financiero de la calculadora hipotecaria (sistema francés, cuota constante).
 *
 * Notación:
 *   P   capital inicial (importe prestado)
 *   FV  capital final pendiente al terminar el plazo (valor residual / cuota balloon)
 *   i   tipo de interés por periodo (tipo nominal anual / periodos por año)
 *   n   número de cuotas
 *   PMT cuota periódica
 *
 * Ecuación de equilibrio:  P·(1+i)^n − PMT·((1+i)^n − 1)/i = FV
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Finance = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const EPS = 1e-12;

  function solvePayment(P, FV, i, n) {
    if (n <= 0) throw new Error('El plazo debe ser mayor que cero.');
    if (Math.abs(i) < EPS) return (P - FV) / n;
    const f = Math.pow(1 + i, n);
    return (P * f - FV) * i / (f - 1);
  }

  function solvePrincipal(PMT, FV, i, n) {
    if (n <= 0) throw new Error('El plazo debe ser mayor que cero.');
    if (Math.abs(i) < EPS) return PMT * n + FV;
    const f = Math.pow(1 + i, n);
    return (PMT * (f - 1) / i + FV) / f;
  }

  function solveFinal(P, PMT, i, n) {
    if (Math.abs(i) < EPS) return P - PMT * n;
    const f = Math.pow(1 + i, n);
    return P * f - PMT * (f - 1) / i;
  }

  function solvePeriods(P, PMT, FV, i) {
    if (Math.abs(i) < EPS) {
      if (PMT <= 0) throw new Error('La cuota debe ser positiva.');
      const n = (P - FV) / PMT;
      if (n <= 0) throw new Error('Con estos datos el préstamo no requiere cuotas.');
      return n;
    }
    const num = PMT - i * FV;
    const den = PMT - i * P;
    if (den <= 0) {
      throw new Error('La cuota no cubre ni los intereses: el préstamo nunca se amortizaría. Sube la cuota o baja el tipo.');
    }
    if (num <= 0) throw new Error('El capital final es demasiado alto para esta cuota.');
    const n = Math.log(num / den) / Math.log(1 + i);
    if (!isFinite(n) || n <= 0) throw new Error('No existe un plazo positivo que cumpla estos datos.');
    return n;
  }

  // Tipo por periodo. Bisección robusta: la cuota es creciente en i cuando P > 0.
  function solveRate(P, PMT, FV, n) {
    if (n <= 0) throw new Error('El plazo debe ser mayor que cero.');
    const g = (i) => solvePayment(P, FV, i, n) - PMT;
    let lo = -0.99 / 12, hi = 1;
    let glo = g(lo), ghi = g(hi);
    if (glo > 0) throw new Error('La cuota es demasiado baja: requeriría un tipo de interés irreal.');
    if (ghi < 0) throw new Error('La cuota es demasiado alta: requeriría un tipo de interés irreal.');
    for (let k = 0; k < 200; k++) {
      const mid = (lo + hi) / 2;
      const gm = g(mid);
      if (Math.abs(gm) < 1e-10) return mid;
      if (gm > 0) hi = mid; else lo = mid;
    }
    return (lo + hi) / 2;
  }

  /**
   * Resuelve la variable indicada.
   * @param {'payment'|'principal'|'final'|'rate'|'term'} target
   * @param {{principal:number, final:number, annualRate:number, years:number, payment:number, perYear:number}} v
   *        annualRate en % (p. ej. 3.5), years en años (puede ser fraccionario).
   * @returns copia de v con la variable objetivo calculada.
   */
  function solve(target, v) {
    const m = v.perYear || 12;
    const i = v.annualRate / 100 / m;
    const n = v.years * m;
    const out = Object.assign({}, v, { perYear: m });
    switch (target) {
      case 'payment': out.payment = solvePayment(v.principal, v.final, i, n); break;
      case 'principal': out.principal = solvePrincipal(v.payment, v.final, i, n); break;
      case 'final': out.final = solveFinal(v.principal, v.payment, i, n); break;
      case 'term': out.years = solvePeriods(v.principal, v.payment, v.final, i) / m; break;
      case 'rate': out.annualRate = solveRate(v.principal, v.payment, v.final, n) * m * 100; break;
      default: throw new Error('Variable desconocida: ' + target);
    }
    return out;
  }

  /**
   * Cuadro de amortización. Si n no es entero, la última cuota es parcial.
   */
  function schedule(v) {
    const m = v.perYear || 12;
    const i = v.annualRate / 100 / m;
    const nFull = Math.ceil(v.years * m - 1e-9);
    const rows = [];
    let balance = v.principal;
    let totInterest = 0, totPrincipal = 0, totPaid = 0;
    for (let k = 1; k <= nFull; k++) {
      const interest = balance * i;
      // La última cuota liquida exactamente hasta dejar el capital final.
      const principalPart = k === nFull ? balance - v.final : v.payment - interest;
      const payment = principalPart + interest;
      balance -= principalPart;
      if (Math.abs(balance) < 1e-6) balance = 0;
      totInterest += interest;
      totPrincipal += principalPart;
      totPaid += payment;
      rows.push({ period: k, payment, interest, principal: principalPart, balance });
    }
    return { rows, totInterest, totPrincipal, totPaid };
  }

  return { solve, schedule, solvePayment, solvePrincipal, solveFinal, solvePeriods, solveRate };
});
