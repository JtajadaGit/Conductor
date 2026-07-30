// EVAL-GATE de prompts (Verification & CI): cambiar prompts/*.md EXIGE re-certificar el golden-set.
// Determinista y sin red: compara el fingerprint actual de prompts/ con el del ÚLTIMO resultado
// committeado en engine/eval/results.jsonl. No re-ejecuta evals (eso es `conductor evals` — la suite
// no se alarga); solo exige que el certificado esté al día y en verde.
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promptsFingerprint, lastEvalResult } from '../lib/pipeline/evals.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');

await test('eval-gate: el último `conductor evals` committeado está EN VERDE y cubre los prompts ACTUALES', () => {
  const sha = promptsFingerprint(join(REPO, 'prompts'));
  assert(sha, 'prompts/ debe existir con sus .md (¿init roto?)');
  const last = lastEvalResult(join(REPO, 'engine', 'eval', 'results.jsonl'));
  assert(last, 'no hay historial de evals — corre `conductor evals` y commitea engine/eval/results.jsonl');
  assert(last.pass === true, `el último eval NO está en verde (${last.ok}/${last.total}) — arregla el harness o los escenarios, re-corre \`conductor evals\` y commitea`);
  assert(last.promptsSha === sha,
    `prompts/*.md cambiaron respecto al último eval verde (${last.promptsSha} → ${sha}) — corre \`conductor evals\` y commitea engine/eval/results.jsonl (cambiar un prompt exige re-demostrar el golden-set)`);
});
