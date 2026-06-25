// tests-gate.test.mjs — VERIFY POR EJECUCIÓN (opcional, post-gate): el toggle "test" del panel ejecuta las pruebas
// REALES del proyecto DESPUÉS del GREEN estructural. SEPARADO del gate de gobierno (verify), que es sin-LLM y nunca
// ejecuta nada. Si las pruebas fallan → veredicto TRI-ESTADO 'TESTS-FAIL' (construido bien · pruebas fallan), distinto
// del NOT-GREEN estructural. Prueba: tri-estado, consentimiento (runTests por-run / allowChecks / env), y anti-RCE.
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
// agente FALSO coherente: produce artefactos/código/test que hacen pasar el gate ESTRUCTURAL (→ GREEN estructural).
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
const run = (name, opts = {}) => drive({ changeDir: join(TMP, 'openspec', 'changes', name), request: 'x', complexity: 'simple', domain: 'c', srcDir: TMP, runAgent: mkAgent(), ...opts });
const timelineTests = (name) => { try { return JSON.parse(readFileSync(join(TMP, 'openspec', 'changes', name, '.conductor', 'timeline.json'), 'utf8')).tests ?? null; } catch { return null; } };

// ── 1) toggle "test" por-run + pruebas que PASAN → GREEN con pruebas reales ──
await test('tests-gate: runTests + cfg.checks que PASA → GREEN, y el timeline registra tests.passed', async () => {
  const saved = clearEnv();
  try {
    fresh({ checks: [PASS] });
    const r = await run('t-pass', { runTests: true });
    eq(r.verdict, 'GREEN', 'gate estructural GREEN + pruebas reales pasan → GREEN');
    const t = timelineTests('t-pass');
    assert(t && t.ran === true && t.passed === true, 'el timeline registra que las pruebas corrieron y pasaron');
  } finally { restoreEnv(saved); }
});

// ── 2) tri-estado: pruebas que FALLAN → TESTS-FAIL (NO NOT-GREEN estructural) ──
await test('tests-gate: runTests + cfg.checks que FALLA → TESTS-FAIL (tri-estado: construido bien · pruebas fallan)', async () => {
  const saved = clearEnv();
  try {
    fresh({ checks: [FAIL] });
    const r = await run('t-fail', { runTests: true });
    eq(r.verdict, 'TESTS-FAIL', 'gate estructural pasó pero las pruebas fallan → veredicto tri-estado propio');
    const t = timelineTests('t-fail');
    assert(t && t.ran === true && t.passed === false && t.failed.length === 1, 'timeline registra el fallo de pruebas');
  } finally { restoreEnv(saved); }
});

// ── 3) runTests pero SIN comando detectable (sin cfg.checks, sin package.json) → GREEN estructural, nada que ejecutar ──
await test('tests-gate: runTests sin comando de pruebas detectable → GREEN estructural (no rompe, nada que ejecutar)', async () => {
  const saved = clearEnv();
  try {
    fresh(); // sin checks; el TMP no tiene package.json → detectStack.testCmd = null
    const r = await run('t-none', { runTests: true });
    eq(r.verdict, 'GREEN', 'sin comando que ejecutar, el run queda GREEN estructural');
    eq(timelineTests('t-none'), null, 'no se registran pruebas (no corrió ninguna)');
  } finally { restoreEnv(saved); }
});

// ── 4) ANTI-RCE: cfg.checks declarados pero SIN consentimiento (runTests=false, allowChecks=false, env unset) → NO se ejecutan ──
await test('tests-gate: cfg.checks SIN consentimiento (sin runTests/allowChecks/env) → NO se ejecutan (anti-RCE), GREEN', async () => {
  const saved = clearEnv();
  try {
    fresh({ checks: [FAIL] }); // un check que fallaría SI se ejecutara
    const r = await run('t-rce'); // runTests por defecto false; allowChecks ausente; env limpio
    eq(r.verdict, 'GREEN', 'config clonada NO se ejecuta por defecto → el check que fallaría ni corre (anti-RCE)');
    eq(timelineTests('t-rce'), null, 'no se ejecutó ninguna prueba');
  } finally { restoreEnv(saved); }
});

// ── 5) compat: cfg.checks + allowChecks:true (sin runTests) → se ejecutan (vía CI/headless); fallo → TESTS-FAIL ──
await test('tests-gate: cfg.checks + allowChecks:true (sin toggle) → se ejecutan; un fallo da TESTS-FAIL', async () => {
  const saved = clearEnv();
  try {
    fresh({ checks: [FAIL], allowChecks: true });
    const r = await run('t-allow'); // sin runTests; el consentimiento llega por allowChecks (CI)
    eq(r.verdict, 'TESTS-FAIL', 'allowChecks habilita la ejecución igual que el toggle por-run');
  } finally { restoreEnv(saved); }
});
