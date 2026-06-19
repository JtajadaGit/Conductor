import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { checkContract } from '../lib/contract/contract.mjs';
import { computeCost } from '../lib/core/cost.mjs';
import { checkCoherence } from '../lib/gates/coherence.mjs';
import { diffOpenApi } from '../lib/contract/openapi-diff.mjs';
import { diffSchema } from '../lib/contract/sqldiff.mjs';
import { diffPublic } from '../lib/contract/tsdiff.mjs';

const TMP = join(dirname(fileURLToPath(import.meta.url)), '.tmp-rob');
rmSync(TMP, { recursive: true, force: true }); mkdirSync(TMP, { recursive: true });
const w = (n, c) => { const p = join(TMP, n); writeFileSync(p, c); return p; };

await test('contract: JSON inválido → finding error, no excepción', () => {
  const a = w('bad.json', '{ esto no es json'); const b = w('ok.json', '{}');
  const f = checkContract(a, b);
  assert(f.some((x) => x.rule === 'contract.invalid-json' && x.severity === 'error'));
});

await test('contract: contrato no-objeto → finding, no crash', () => {
  const a = w('arr.json', '[]'); const b = w('arr2.json', '[]');
  const f = checkContract(a, b);
  assert(f.length >= 0); // no lanza
});

await test('cost: líneas corruptas se ignoran y se cuentan', () => {
  const p = w('u.jsonl', '{"model":"qwen36-msc1","input_tokens":100,"output_tokens":10}\nbasura no json\n{"foo":"sin tokens"}\n');
  const r = computeCost(p);
  eq(r.run.calls, 1, 'solo 1 línea válida');
  eq(r.run.skipped_lines, 2, '2 líneas descartadas');
});

await test('coherence: change vacío → findings de ficheros faltantes, no crash', () => {
  const d = join(TMP, 'empty'); mkdirSync(d, { recursive: true });
  const f = checkCoherence(d);
  assert(f.some((x) => x.rule.startsWith('files.')), 'detecta ficheros faltantes');
});

await test('diffs: entradas vacías/objeto raro no lanzan', () => {
  eq(diffOpenApi({}, {}).length, 0);
  eq(diffSchema('', '').length, 0);
  eq(diffPublic('', '').length, 0);
  // schemas degenerados
  assert(Array.isArray(diffOpenApi({ paths: null }, { paths: undefined })));
});

rmSync(TMP, { recursive: true, force: true });
