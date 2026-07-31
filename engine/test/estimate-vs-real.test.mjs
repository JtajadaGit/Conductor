// T3 — ESTIMADO-vs-REAL: el preflight se persiste en el timeline y la desviación se calcula honesta.
// Observability & Tracing del propio producto: el estimador deja de ser una promesa y pasa a MEDIRSE.
import { rmSync, readFileSync } from 'node:fs';
import { plumbPath } from '../lib/core/plumb.mjs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { driveOnce } from '../lib/pipeline/evals.mjs';
import { estimateDeviation } from '../lib/serving/dashboard.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

await test('estimate-vs-real: el timeline persiste el preflight (fases alineadas con el plan) y el resume lo REUSA', async () => {
  const T = join(HERE, '.tmp-estreal');
  rmSync(T, { recursive: true, force: true });
  const r = await driveOnce({ tmpRoot: T, slug: 'estr', request: 'add estr(n) with a test', complexity: 'simple' });
  const tl = JSON.parse(readFileSync(plumbPath(join(T, 'openspec', 'changes', 'estr'), 'timeline.json'), 'utf8'));
  assert(tl.estimate && Array.isArray(tl.estimate.phases) && tl.estimate.phases.length, 'estimate.phases presente en el timeline');
  for (const p of tl.estimate.phases) assert(Number.isFinite(p.estIn) && Number.isFinite(p.estOut), `fila de estimación completa (${p.phase})`);
  const estPhases = tl.estimate.phases.map((p) => p.phase);
  for (const ph of tl.phases.filter((p) => p.role)) {
    if (ph.phase === 'fix') continue; // fix no se pre-estima (nace del gate)
    assert(estPhases.includes(ph.phase), `la fase ejecutada "${ph.phase}" estaba en el plan estimado`);
  }
  assert(Number.isFinite(tl.estimate.totalIn) && tl.estimate.totalIn > 0, 'totalIn del preflight');
  eq(r.verdict, 'GREEN', 'el run del fixture cierra GREEN');
  rmSync(T, { recursive: true, force: true });
});

await test('estimateDeviation: compara SOLO fases con tokens reales; retry no duplica; sin datos => null (honestidad)', () => {
  const est = { phases: [{ phase: 'apply', estIn: 1000, estOut: 500 }, { phase: 'spec', estIn: 400, estOut: 200 }] };
  const phases = [
    { phase: 'apply', tokens: { in: 1200, out: 600 } },
    { phase: 'apply', tokens: { in: 999, out: 999 } }, // retry: se ignora (primera ocurrencia manda)
    { phase: 'spec', tokens: null },                    // sin medición: fuera de la comparación
  ];
  const d = estimateDeviation(est, phases);
  eq(d.phases.length, 1, 'solo apply compara (spec sin tokens)');
  eq(d.phases[0].realIn, 1200, 'primera ocurrencia');
  eq(d.phases[0].devPct, 20, '(1800/1500)-1 = +20%');
  eq(d.totalDevPct, 20);
  eq(estimateDeviation(null, phases), null, 'sin estimate => null');
  eq(estimateDeviation(est, [{ phase: 'x', tokens: { in: 1, out: 1 } }]), null, 'sin fases comparables => null, no un 0 inventado');
});

await test('stats.estimator: agrega desviación y MAPE solo con datos reales; sin datos => null', async () => {
  const { aggregateStats } = await import('../lib/core/stats.mjs');
  const { mkdirSync, writeFileSync, rmSync } = await import('node:fs');
  const T = join(HERE, '.tmp-est-stats');
  rmSync(T, { recursive: true, force: true });
  const cd = plumbPath(join(T, 'openspec', 'changes', 'one'));
  mkdirSync(cd, { recursive: true });
  writeFileSync(join(cd, 'timeline.json'), JSON.stringify({
    verdict: 'GREEN', request: 'x',
    estimate: { phases: [{ phase: 'apply', estIn: 1000, estOut: 500 }], totalIn: 1000, totalOut: 500 },
    phases: [{ phase: 'apply', role: 'coder', model: 'm', provider: 'copilot', attempts: 1, ms: 1, ok: true, files: [], tokens: { in: 1200, out: 600 } }],
  }));
  const st = aggregateStats([{ id: 'p~1', name: 'p', root: T }]);
  assert(st.estimator, 'estimator presente con datos');
  eq(st.estimator.phases, 1);
  eq(st.estimator.dev_pct, 20, '(1800/1500)-1 = +20%');
  eq(st.estimator.mape_pct, 20);
  // sin estimate en el timeline => null (jamás un 0 inventado)
  writeFileSync(join(cd, 'timeline.json'), JSON.stringify({ verdict: 'GREEN', phases: [{ phase: 'apply', role: 'coder', ok: true, files: [], attempts: 1, ms: 1, tokens: { in: 1, out: 1 } }] }));
  eq(aggregateStats([{ id: 'p~1', name: 'p', root: T }]).estimator, null);
  rmSync(T, { recursive: true, force: true });
});
