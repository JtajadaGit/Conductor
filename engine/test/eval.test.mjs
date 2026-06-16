import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { scoreCandidate } from '../lib/eval.mjs';

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
