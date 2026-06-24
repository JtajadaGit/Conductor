#!/usr/bin/env node
// conductor eval runner — mide la calidad de salidas del pipeline SDD contra rúbricas objetivas.
// Estructura: eval/cases/<id>/{task.md, rubric.json, candidates/<name>/...}
// Cada candidato declara su veredicto esperado (candidates/<name>/expected.txt = PASS|FAIL) para que
// el arnés se valide A SÍ MISMO (self-eval): el scorer debe clasificar good→PASS y bad→FAIL.
//
// Modo replay (default, offline): puntúa candidatos pre-generados.
// Modo provider (--provider <model>,<model>): simula K corridas por modelo sobre los candidatos existentes
//   y calcula pass-rate por (modelo, caso). Diseñado para reemplazar con runs LLM reales (drive+fakeAgent).
//   --provider "qwen:qwen36-msc1,copilot:claude-sonnet-4.6"  (K=3 por defecto)
//   --provider-k 5                                            (override K)
//   --provider-only-case <caseId>                            (filtrar un caso)
//
// Modo live (--live): corre el pipeline REAL drive() K veces por escenario y reporta pass-rate = GREEN/K.
//   Offline usa un agente FAKE determinista (perfil 'strong' → GREEN; 'weak' omite el tag → no GREEN con
//   preset estricto), probando que el aparato funciona y DISCRIMINA sin gastar AI Credits. Para medir modelos
//   reales se inyecta un runAgent real (wiring futuro). Ver eval/live.mjs.
//   --live                        corre el harness en vivo (K=3, agente fake-strong)
//   --live-k N                    override K
//   --live-models a,b             labels (fake-weak → perfil degradado; resto → strong) para demo de discriminación
//
// Uso: node eval/run.mjs [--json] [--provider <models>] [--provider-k N] [--provider-only-case <id>] [--live] [--live-k N] [--live-models a,b]
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scoreCandidate, buildConsensusTable } from '../lib/gates/eval.mjs';
import { runLive } from './live.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CASES = join(HERE, 'cases');
const asJson = process.argv.includes('--json');

// --provider mode
const hasProvider = process.argv.includes('--provider');
const providerArg = hasProvider ? (process.argv[process.argv.indexOf('--provider') + 1] || '') : '';
const providerModels = providerArg ? providerArg.split(',').map((m) => m.trim()).filter(Boolean) : [];
const providerK = (() => { const i = process.argv.indexOf('--provider-k'); return i >= 0 ? Math.max(1, Math.min(10, Number(process.argv[i + 1]) || 3)) : 3; })();
const onlyCase = (() => { const i = process.argv.indexOf('--provider-only-case'); return i >= 0 ? process.argv[i + 1] : null; })();

// --live mode
const hasLive = process.argv.includes('--live');
const liveK = (() => { const i = process.argv.indexOf('--live-k'); return i >= 0 ? Math.max(1, Math.min(10, Number(process.argv[i + 1]) || 3)) : 3; })();
const liveModels = (() => {
  const i = process.argv.indexOf('--live-models');
  const labels = i >= 0 ? String(process.argv[i + 1] || '').split(',').map((s) => s.trim()).filter(Boolean) : ['fake-strong'];
  return labels.map((label) => ({ label }));
})();

const results = [];
let selfOk = 0, selfTotal = 0;

// MODO REPLAY (default): puntúa candidatos pre-generados
for (const caseId of dirList(CASES)) {
  if (onlyCase && caseId !== onlyCase) continue;
  const cdir = join(CASES, caseId);
  const rubric = JSON.parse(readFileSync(join(cdir, 'rubric.json'), 'utf8'));
  const candDir = join(cdir, 'candidates');
  for (const cand of dirList(candDir)) {
    const cpath = join(candDir, cand);
    const expected = (readMaybe(join(cpath, 'expected.txt')) || '').trim().toUpperCase() || null;
    const r = scoreCandidate(cpath, rubric);
    const selfPass = expected ? r.verdict === expected : null;
    if (expected) { selfTotal++; if (selfPass) selfOk++; }
    results.push({ caseId, candidate: cand, pct: r.pct, verdict: r.verdict, expected, selfPass, criteria: r.criteria });
  }
}

// MODO PROVIDER (--provider): simula K corridas por modelo sobre candidatos 'good' existentes.
// Mide la CONSISTENCIA del scorer con K repeticiones idénticas (todos deben ser PASS si good existe).
// Diseñado para reemplazar con runs LLM reales (drive() + runAgent real) en FASE 3.
const liveResults = []; // { caseId, model, attempt, verdict, isGreen }

if (hasProvider && providerModels.length) {
  for (const model of providerModels) {
    for (const caseId of dirList(CASES)) {
      if (onlyCase && caseId !== onlyCase) continue;
      const cdir = join(CASES, caseId);
      const rubric = JSON.parse(readFileSync(join(cdir, 'rubric.json'), 'utf8'));
      const goodPath = join(cdir, 'candidates', 'good');
      if (!existsSync(goodPath)) { liveResults.push({ caseId, model, attempt: 1, verdict: 'NO-CANDIDATE', isGreen: false }); continue; }
      for (let attempt = 1; attempt <= providerK; attempt++) {
        // Replay del candidato 'good' K veces (baseline de consistencia del scorer)
        const r = scoreCandidate(goodPath, rubric);
        liveResults.push({ caseId, model, attempt, verdict: r.verdict, isGreen: r.verdict === 'PASS', pct: r.pct });
      }
    }
  }
}

// consensus de findings del arnés (multi-caso): detecta regresiones que emergen en varios casos
function buildArnésConsensus() {
  if (!results.length) return null;
  const findings = [];
  for (const r of results) {
    for (const c of r.criteria) {
      if (!c.pass) findings.push({ rule: `${r.caseId}.${c.name}`, severity: 'error', message: `${r.caseId}/${r.candidate}: ${c.name} XX ${c.detail}`, lensId: r.caseId });
    }
  }
  return buildConsensusTable(findings);
}

// emitir pass-rate por modelo y caso
function emitPassRates() {
  if (!liveResults.length) return;
  const byModelCase = new Map();
  for (const lr of liveResults) {
    const k = `${lr.model}|${lr.caseId}`;
    if (!byModelCase.has(k)) byModelCase.set(k, { attempts: [], greenCount: 0 });
    const e = byModelCase.get(k); e.attempts.push(lr); if (lr.isGreen) e.greenCount++;
  }
  console.log('\n  MODEL PASS-RATES (--provider mode)\n');
  console.log('  modelo/caso                                  rate    intentos');
  console.log('  ' + '-'.repeat(62));
  for (const [k, v] of byModelCase) {
    const [model, caseId] = k.split('|');
    const rate = ((v.greenCount / v.attempts.length) * 100).toFixed(0) + '%';
    console.log(`  ${(model + '/' + caseId).padEnd(41)} ${String(rate).padStart(4)}   ${v.greenCount}/${v.attempts.length}`);
  }
}

if (asJson) {
  console.log(JSON.stringify({ results, selfEval: { ok: selfOk, total: selfTotal }, liveResults }, null, 2));
  process.exit(selfOk === selfTotal ? 0 : 1);
}

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

if (hasProvider) {
  if (!providerModels.length) console.error('  ⚠ --provider requiere modelos (ej: "copilot:claude-sonnet-4.6,byok:qwen36-msc1")');
  else emitPassRates();
}

// MODO LIVE (--live): pipeline REAL drive() K veces por escenario → pass-rate reproducible (GREEN/K).
if (hasLive) {
  const tmpRoot = join(HERE, '.tmp-live');
  const profileFor = (label) => /weak/i.test(label) ? 'weak' : 'strong';
  const rows = await runLive({ tmpRoot, models: liveModels, K: liveK, profileFor });
  console.log('\n  LIVE PASS-RATES (--live · pipeline real drive() × K)\n');
  console.log('  modelo/escenario                              rate   GREEN/K  veredictos');
  console.log('  ' + '-'.repeat(74));
  for (const r of rows) {
    const rate = (r.rate * 100).toFixed(0) + '%';
    console.log(`  ${(r.model + '/' + r.scenario).padEnd(42)} ${String(rate).padStart(4)}   ${r.green}/${r.K}     ${r.verdicts.join(',')}`);
  }
  console.log('\n  (offline = agente fake determinista; el gate decide GREEN. Para números de MODELO real, inyecta un runAgent real.)\n');
}

process.exit(selfOk === selfTotal ? 0 : 1);

function dirList(p) { return existsSync(p) ? readdirSync(p).filter((n) => { try { return statSync(join(p, n)).isDirectory(); } catch { return false; } }) : []; }
function readMaybe(p) { return existsSync(p) ? readFileSync(p, 'utf8') : null; }
