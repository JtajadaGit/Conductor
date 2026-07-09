// tests-gate.test.mjs — FASE TEST (modelo apply → test → fix-loop → verify): ejecutar las pruebas REALES del proyecto
// es una FASE DETERMINISTA opcional ANTES de verify (no un gate post-GREEN). Si fallan → ciclo `fix` (re-codifica) →
// re-test → … hasta pasar o, tras N intentos, BLOCKED. `verify` (gobierno) sigue terminal. Anti-RCE: la fase solo
// EJECUTA con consentimiento del USUARIO (toggle "test" por-run / env CONDUCTOR_ALLOW_CHECKS) — NUNCA por un flag
// del fichero del repo (allowChecks-en-config sería RCE-por-config); en el pipeline pero sin consentimiento = no-op.
import { drive } from '../lib/pipeline/drive.mjs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';

const TMP = join(dirname(fileURLToPath(import.meta.url)), '.tmp-tests-gate');
process.env.CONDUCTOR_CAPTURE = 'fs';
const ENVK = ['CONDUCTOR_MODEL', 'COPILOT_MODEL', 'CONDUCTOR_MODEL_CODER', 'CONDUCTOR_MODEL_PLANNER', 'CONDUCTOR_MODEL_REVIEWER', 'CONDUCTOR_PRESET', 'CONDUCTOR_ALLOW_CHECKS'];
const clearEnv = () => { const s = Object.fromEntries(ENVK.map((k) => [k, process.env[k]])); for (const k of ENVK) delete process.env[k]; return s; };
const restoreEnv = (s) => { for (const k of ENVK) { if (s[k] === undefined) delete process.env[k]; else process.env[k] = s[k]; } };

// comandos deterministas SIN depender de npm/stack: node siempre está en PATH durante los tests.
const PASS = 'node --version'; // exit 0
const FAIL = 'node -e "process.exit(1)"'; // exit 1

const w2 = (abs, c) => { mkdirSync(dirname(abs), { recursive: true }); writeFileSync(abs, c); };
// agente FALSO coherente: produce artefactos/código/test que hacen pasar el gate ESTRUCTURAL (→ verify GREEN).
const mkAgent = () => (a) => {
  const { phase, writeTo, cwd } = a;
  if (phase === 'apply' || phase === 'fix') {
    w2(join(cwd, 'src', 'c.js'), '// @conductor REQ-C\nexport const x = 1;');
    w2(join(cwd, 'src', 'c.test.js'), '// @conductor REQ-C\ntest("c", () => { expect(x).toBe(1); });');
    return Promise.resolve({ code: 0 });
  }
  const content = { propose: '## Why\nx\n## What Changes\n- a\n## Impact\nx', spec: '## ADDED Requirements\n<!-- id: REQ-C -->\n### Requirement: C\nThe system SHALL c.\n#### Scenario: s\n- **GIVEN** a\n- **WHEN** b\n- **THEN** c' }[phase] || 'x';
  w2(writeTo, content); return Promise.resolve({ code: 0 });
};

const fresh = (cfg = {}) => {
  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(join(TMP, 'openspec'), { recursive: true });
  writeFileSync(join(TMP, 'openspec', 'conductor.json'), JSON.stringify({ maxRetries: 0, lenses: false, serve: false, ...cfg }));
};
// pipeline con la fase `test` (entre apply y verify). resolvePhases la reubica justo antes de la verify terminal.
const runT = (name, opts = {}) => drive({ changeDir: join(TMP, 'openspec', 'changes', name), request: 'x', complexity: 'simple', domain: 'c', srcDir: TMP, runAgent: mkAgent(), pipeline: ['propose', 'spec', 'apply', 'test'], ...opts });
const tl = (name) => { try { return JSON.parse(readFileSync(join(TMP, 'openspec', 'changes', name, '.conductor', 'timeline.json'), 'utf8')); } catch { return null; } };

// ── 1) test PASA → apply→test→verify→GREEN; el timeline registra tests.passed y test va ANTES de verify ──
await test('tests-gate: fase test con pruebas que PASAN → GREEN; test corre ANTES de verify', async () => {
  const saved = clearEnv();
  try {
    fresh({ checks: [PASS] });
    const r = await runT('t-pass', { runTests: true });
    eq(r.verdict, 'GREEN', 'pruebas pasan → el run cierra GREEN en verify');
    const phases = r.trail;
    assert(phases.includes('test') && phases.indexOf('test') < phases.indexOf('verify'), 'test corre ANTES de verify: ' + phases.join('>'));
    const t = tl('t-pass')?.tests;
    assert(t && t.ran === true && t.passed === true, 'el timeline registra que las pruebas corrieron y pasaron');
  } finally { restoreEnv(saved); }
});

// ── 2) test FALLA → ciclo fix → re-test → … → BLOCKED (gobierno: sin pruebas en verde no hay GREEN) ──
await test('tests-gate: fase test con pruebas que FALLAN → ciclo fix → BLOCKED tras N intentos (no GREEN)', async () => {
  const saved = clearEnv();
  try {
    fresh({ checks: [FAIL] });
    const r = await runT('t-fail', { runTests: true });
    eq(r.verdict, 'BLOCKED', 'las pruebas no pasan tras los ciclos de fix → BLOCKED, nunca GREEN');
    assert((r.trail.filter((p) => p === 'fix').length) >= 1, 'hubo al menos un ciclo de fix antes de bloquear');
  } finally { restoreEnv(saved); }
});

// ── 3) fase test sin comando detectable → no-op que pasa → verify → GREEN ──
await test('tests-gate: fase test sin comando de pruebas → no-op que pasa → GREEN (no bloquea)', async () => {
  const saved = clearEnv();
  try {
    fresh(); // sin checks; TMP no tiene package.json → testCmd null
    const r = await runT('t-none', { runTests: true });
    eq(r.verdict, 'GREEN', 'sin comando que ejecutar, la fase test pasa y el run cierra GREEN');
    eq(tl('t-none')?.tests ?? null, null, 'no se registran pruebas (no corrió ninguna)');
  } finally { restoreEnv(saved); }
});

// ── 4) ANTI-RCE: test en el pipeline pero SIN consentimiento → NO ejecuta el comando (no-op pass) ──
await test('tests-gate: fase test SIN consentimiento (sin runTests/allowChecks/env) → NO ejecuta (anti-RCE), GREEN', async () => {
  const saved = clearEnv();
  try {
    fresh({ checks: [FAIL] }); // un check que FALLARÍA si se ejecutara
    const r = await runT('t-rce'); // sin runTests; allowChecks ausente; env limpio
    eq(r.verdict, 'GREEN', 'config clonada NO se ejecuta sin consentimiento → el check que fallaría ni corre (anti-RCE)');
    eq(tl('t-rce')?.tests ?? null, null, 'no se ejecutó ninguna prueba');
  } finally { restoreEnv(saved); }
});

// ── 5) consentimiento por ENV (CI/headless, sin toggle) → ejecuta; fallo → ciclo fix → BLOCKED ──
// ANTI-RCE (endurecido): el consentimiento NO puede venir del fichero del repo (openspec/conductor.json es
// entrada no confiable → allowChecks-en-config sería RCE-por-config, como los `cmd:` precond gateados por env).
// CI/headless consiente por CONDUCTOR_ALLOW_CHECKS=1 (o el toggle "test" por-run), nunca por el config del repo.
await test('tests-gate: fase test con CONDUCTOR_ALLOW_CHECKS=1 (sin toggle) → ejecuta; fallo → fix → BLOCKED', async () => {
  const saved = clearEnv();
  try {
    process.env.CONDUCTOR_ALLOW_CHECKS = '1';
    fresh({ checks: [FAIL] });
    const r = await runT('t-allow'); // sin runTests; el consentimiento llega por el ENV (CI), no por el repo
    eq(r.verdict, 'BLOCKED', 'el env habilita la ejecución igual que el toggle por-run');
  } finally { restoreEnv(saved); }
});
// ── 5b) allowChecks:true en el CONFIG del repo NO habilita ejecución (anti-RCE-por-config) ──
await test('tests-gate: allowChecks:true en el config del repo NO consiente ejecutar (RCE-por-config cerrado) → GREEN sin correr', async () => {
  const saved = clearEnv();
  try {
    fresh({ checks: [FAIL], allowChecks: true }); // repo clonado hostil: el flag del fichero NO debe bastar
    const r = await runT('t-cfgrce'); // sin runTests, sin env → el check que fallaría NO corre
    eq(r.verdict, 'GREEN', 'un flag del fichero del repo no ejecuta comandos: el check hostil ni corre');
    eq(tl('t-cfgrce')?.tests ?? null, null, 'no se ejecutó ninguna prueba pese a allowChecks:true en el config');
  } finally { restoreEnv(saved); }
});

// ── 6) runTests SIN pipeline explícito → el DRIVER inyecta la fase test en el plan por complejidad ──
await test('tests-gate: runTests sin pipeline explícito → el driver inyecta la fase test (antes de verify) en el plan por defecto', async () => {
  const saved = clearEnv();
  try {
    fresh({ checks: [PASS] });
    const r = await drive({ changeDir: join(TMP, 'openspec', 'changes', 't-inject'), request: 'x', complexity: 'simple', domain: 'c', srcDir: TMP, runAgent: mkAgent(), runTests: true });
    eq(r.verdict, 'GREEN', 'pruebas pasan → GREEN');
    assert(r.trail.includes('test') && r.trail.indexOf('test') < r.trail.indexOf('verify'), 'test inyectada antes de verify sin pipeline explícito: ' + r.trail.join('>'));
  } finally { restoreEnv(saved); }
});
