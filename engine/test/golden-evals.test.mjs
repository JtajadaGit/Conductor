// GOLDEN-SET del harness — subset representativo en la suite (el barrido completo es `conductor evals`;
// aquí solo 3 escenarios K=1 para que un fresh clone detecte roturas del aparato sin duplicar coste).
import { mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runGolden, GOLDEN_SCENARIOS, promptsFingerprint, appendEvalResult, lastEvalResult } from '../lib/pipeline/evals.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

await test('golden: subset representativo — secret bloquea, retry recupera con attempts=2, weak-trace NO llega a GREEN', async () => {
  const T = join(HERE, '.tmp-golden-subset');
  rmSync(T, { recursive: true, force: true });
  const subset = GOLDEN_SCENARIOS.filter((s) => ['secret-scan', 'retry-recovery', 'feature-weak-trace'].includes(s.id));
  eq(subset.length, 3, 'los 3 escenarios del subset existen en el golden-set');
  const rows = await runGolden({ tmpRoot: T, K: 1, scenarios: subset });
  for (const r of rows) assert(r.ok, `${r.id}: ${r.why || r.verdicts.join(',')}`);
  rmSync(T, { recursive: true, force: true });
});

await test('golden: promptsFingerprint es estable ante CRLF (Windows/autocrlf no cambia el certificado)', () => {
  const D1 = join(HERE, '.tmp-fp-lf'); const D2 = join(HERE, '.tmp-fp-crlf');
  for (const d of [D1, D2]) { rmSync(d, { recursive: true, force: true }); mkdirSync(d, { recursive: true }); }
  writeFileSync(join(D1, 'apply.md'), 'line one\nline two\n');
  writeFileSync(join(D2, 'apply.md'), 'line one\r\nline two\r\n');
  eq(promptsFingerprint(D1), promptsFingerprint(D2), 'LF y CRLF producen el MISMO sha');
  writeFileSync(join(D2, 'apply.md'), 'line one\r\nline CHANGED\r\n');
  assert(promptsFingerprint(D1) !== promptsFingerprint(D2), 'contenido distinto => sha distinto');
  eq(promptsFingerprint(join(D1, 'no-existe')), null, 'dir ausente => null (el gate lo trata como error accionable)');
  for (const d of [D1, D2]) rmSync(d, { recursive: true, force: true });
});

await test('golden: appendEvalResult acumula historial JSONL y lastEvalResult lee la última entrada', () => {
  const F = join(HERE, '.tmp-evals-hist', 'results.jsonl');
  rmSync(dirname(F), { recursive: true, force: true });
  appendEvalResult(F, { at: 'a', pass: false, promptsSha: 'x' });
  appendEvalResult(F, { at: 'b', pass: true, promptsSha: 'y' });
  const lines = readFileSync(F, 'utf8').trim().split('\n');
  eq(lines.length, 2, 'append, no overwrite (historial = tendencia de pass-rate en git)');
  eq(lastEvalResult(F).at, 'b', 'la última entrada manda');
  eq(lastEvalResult(join(dirname(F), 'nope.jsonl')), null, 'sin fichero => null');
  rmSync(dirname(F), { recursive: true, force: true });
});
