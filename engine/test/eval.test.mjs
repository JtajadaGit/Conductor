import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { scoreCandidate, buildConsensusTable } from '../lib/gates/eval.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CASE = join(HERE, '..', 'eval', 'cases', 'login-feature');
const rubric = JSON.parse(readFileSync(join(CASE, 'rubric.json'), 'utf8'));

await test('eval: candidato good → 100% PASS', () => {
  const r = scoreCandidate(join(CASE, 'candidates', 'good'), rubric);
  eq(r.verdict, 'PASS'); eq(r.pct, 100);
});

await test('eval: candidato bad (deriva) → FAIL', () => {
  const r = scoreCandidate(join(CASE, 'candidates', 'bad'), rubric);
  eq(r.verdict, 'FAIL');
  assert(r.pct < 100);
  assert(r.criteria.find((c) => c.name === 'gate').pass === false, 'gate falla');
  assert(r.criteria.find((c) => c.name === 'traceability').pass === false, 'traza falla');
});

await test('eval: el scorer pondera por rúbrica (max = suma de pesos presentes)', () => {
  const r = scoreCandidate(join(CASE, 'candidates', 'good'), { gate: 40, trace: { src: 'src', maxGaps: 0, weight: 30 }, requirements: { ids: ['User Login'], weight: 30 } });
  eq(r.max, 100);
});

await test('eval(consenso): 0 findings → sin consenso', () => {
  const t = buildConsensusTable([]);
  eq(t.numLenses, 0); eq(t.consensus.length, 0);
});
await test('eval(consenso): ≥2 lentes coinciden → Confirmed (+error bloquea)', () => {
  const t = buildConsensusTable([
    { rule: 'trace.gap', severity: 'error', message: 'falta test', lensId: 'a' },
    { rule: 'trace.gap', severity: 'error', message: 'falta test', lensId: 'b' },
  ]);
  eq(t.consensus.length, 1); eq(t.consensus[0].verdict, 'Confirmed'); eq(t.consensus[0].agree, 2); eq(t.blockers, 1);
});
await test('eval(consenso): 1 sola lente → Suspect, NO bloquea', () => {
  const t = buildConsensusTable([{ rule: 'style', severity: 'warning', message: 'naming', lensId: 'a' }]);
  eq(t.consensus[0].verdict, 'Suspect'); eq(t.blockers, 0);
});
await test('eval(consenso): real-vs-teórico → warning teórico baja a INFO y no bloquea', () => {
  const t = buildConsensusTable([
    { rule: 'security', severity: 'warning', message: 'would require impossible path to exploit', lensId: 'a' },
    { rule: 'security', severity: 'warning', message: 'would require impossible path to exploit', lensId: 'b' },
  ]);
  eq(t.consensus[0].severity, 'info'); eq(t.blockers, 0);
});
