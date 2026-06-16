#!/usr/bin/env node
// conductor eval runner — mide la calidad de salidas del pipeline SDD contra rúbricas objetivas.
// Estructura: eval/cases/<id>/{task.md, rubric.json, candidates/<name>/...}
// Cada candidato declara su veredicto esperado (candidates/<name>/expected.txt = PASS|FAIL) para que
// el arnés se valide A SÍ MISMO (self-eval): el scorer debe clasificar good→PASS y bad→FAIL.
//
// Modo replay (hoy, offline): puntúa candidatos pre-generados.
// Modo live (futuro): un --provider genera el candidato con un LLM y luego se puntúa igual.
//
// Uso: node eval/run.mjs [--json]   → informe + exit 0 si el scorer clasifica bien todos los casos.
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scoreCandidate } from '../lib/eval.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CASES = join(HERE, 'cases');
const asJson = process.argv.includes('--json');

const results = [];
let selfOk = 0, selfTotal = 0;

for (const caseId of dir(CASES)) {
  const cdir = join(CASES, caseId);
  const rubric = JSON.parse(readFileSync(join(cdir, 'rubric.json'), 'utf8'));
  const candDir = join(cdir, 'candidates');
  for (const cand of dir(candDir)) {
    const cpath = join(candDir, cand);
    const expected = (readMaybe(join(cpath, 'expected.txt')) || '').trim().toUpperCase() || null;
    const r = scoreCandidate(cpath, rubric);
    const selfPass = expected ? r.verdict === expected : null;
    if (expected) { selfTotal++; if (selfPass) selfOk++; }
    results.push({ caseId, candidate: cand, pct: r.pct, verdict: r.verdict, expected, selfPass, criteria: r.criteria });
  }
}

if (asJson) { console.log(JSON.stringify({ results, selfEval: { ok: selfOk, total: selfTotal } }, null, 2)); process.exit(selfOk === selfTotal ? 0 : 1); }

console.log('\nconductor eval — calidad del pipeline (scorer determinista)\n');
console.log('  caso/candidato                     score  verdict  esperado  self');
console.log('  ' + '-'.repeat(64));
for (const r of results) {
  const tag = r.selfPass === null ? '   ' : r.selfPass ? ' ✓ ' : ' ✗ ';
  console.log(`  ${(r.caseId + '/' + r.candidate).padEnd(34)} ${String(r.pct + '%').padStart(4)}   ${r.verdict.padEnd(6)}  ${(r.expected || '—').padEnd(8)} ${tag}`);
  for (const c of r.criteria) console.log(`      - ${c.name.padEnd(14)} ${c.pass ? 'OK ' : 'XX '} ${c.detail}`);
}
console.log('\n  self-eval del arnés (clasifica good/bad correctamente): ' + selfOk + '/' + selfTotal +
  (selfOk === selfTotal ? '  → MÉTODO VÁLIDO' : '  → REVISAR SCORER') + '\n');
process.exit(selfOk === selfTotal ? 0 : 1);

function dir(p) { return existsSync(p) ? readdirSync(p).filter((n) => { try { return statSync(join(p, n)).isDirectory(); } catch { return false; } }) : []; }
function readMaybe(p) { return existsSync(p) ? readFileSync(p, 'utf8') : null; }
