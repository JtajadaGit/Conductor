// Estimador estático de tokens por fase (Ola 1: preflight sin API).
import { estimateRun, tokensOf } from '../lib/core/estimate.mjs';

await test('estimate: tokensOf ≈ chars/4', () => {
  eq(tokensOf('abcd'.repeat(4)), 4); // 16 chars / 4
  eq(tokensOf(''), 0);
  eq(tokensOf(null), 0);
});

await test('estimate: nº de fases por complejidad + totales coherentes', () => {
  const micro = estimateRun({ complexity: 'micro', request: 'x' });
  eq(micro.phases.length, 1, 'micro = 1 fase (apply)');
  const cx = estimateRun({ complexity: 'complex', request: 'añade un componente con test' });
  eq(cx.phases.length, 8, 'complex = 8 fases');
  assert(cx.total === cx.totalIn + cx.totalOut, 'total = in + out');
  assert(cx.total > micro.total, 'complex estima más tokens que micro');
  assert(cx.phases.every((p) => p.estIn > 0 && p.estOut > 0), 'cada fase estima in/out > 0');
});

await test('estimate: el contexto se acumula (la entrada de fases tardías ≥ la de las primeras)', () => {
  const r = estimateRun({ complexity: 'medium', request: 'algo' });
  const first = r.phases[0].estIn, last = r.phases[r.phases.length - 1].estIn;
  assert(last >= first, 'el contexto acumulado hace crecer la entrada estimada');
});

await test('estimate: noRescanSaved estima el ahorro de entrada del no-rescan (fases derivadas)', () => {
  const micro = estimateRun({ complexity: 'micro', request: 'x' });
  eq(micro.noRescanSaved, 0, 'micro (solo apply) no tiene fases derivadas → 0');
  const cx = estimateRun({ complexity: 'complex', request: 'x' });
  assert(cx.noRescanSaved > 0, 'complex tiene fases de planner → ahorro estimado > 0');
  const simple = estimateRun({ complexity: 'simple', request: 'x' });
  assert(cx.noRescanSaved > simple.noRescanSaved, 'más fases derivadas → más ahorro estimado');
});
