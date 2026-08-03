// qa-fixes.test.mjs — regresión de la pasada de QA adversarial. Cubre dos invariantes de gobierno
// que un revisor verificó rotos y se arreglaron: (bug 5) byokChildEnv valida que byok.json produce credenciales
// USABLES antes de strippear las de sesión — un byok.json corrupto NO debe romper un BYOK funcional; (bug 2) el
// hardfail "byok: sin credenciales" cubre TAMBIÉN el runner SDK, no solo el spawn por defecto (no caer a Copilot
// Business gastando AI Credits en silencio), sin dar FALSO BLOCKED cuando sí hay credenciales.
import { drive } from '../lib/pipeline/drive.mjs';
import { byokChildEnv } from '../lib/serving/serve.mjs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';

const TMP = join(dirname(fileURLToPath(import.meta.url)), '.tmp-qa-fixes');
process.env.CONDUCTOR_CAPTURE = 'fs';

// env que toca BYOK/creds: se snapshotea y restaura para no contaminar otros tests (caches por proceso).
const ENVK = ['COPILOT_PROVIDER_BASE_URL', 'COPILOT_PROVIDER_API_KEY', 'COPILOT_PROVIDER_TYPE', 'CONDUCTOR_API_KEY', 'CONDUCTOR_MODEL_URL', 'CONDUCTOR_BYOK_FALLBACK', 'CONDUCTOR_HOME', 'CONDUCTOR_MODEL', 'COPILOT_MODEL', 'CONDUCTOR_MODEL_CODER', 'CONDUCTOR_MODEL_PLANNER', 'CONDUCTOR_MODEL_REVIEWER'];
const snapEnv = () => Object.fromEntries(ENVK.map((k) => [k, process.env[k]]));
const clearEnv = () => { for (const k of ENVK) delete process.env[k]; };
const restoreEnv = (s) => { for (const k of ENVK) { if (s[k] === undefined) delete process.env[k]; else process.env[k] = s[k]; } };
const w2 = (abs, c) => { mkdirSync(dirname(abs), { recursive: true }); writeFileSync(abs, c); };

// ── bug 5: byokChildEnv strippea las creds de sesión SOLO si byok.json produce credenciales usables ──
await test('qa-fix(bug5): byokChildEnv strippea con byok.json VÁLIDO; NO strippea con uno corrupto', () => {
  const saved = snapEnv();
  try {
    clearEnv(); // sin COPILOT_PROVIDER_* en el PROCESO → byokCredsLocal cae a byok.json (lo que queremos validar)
    // (a) byok.json VÁLIDO → strip de las creds de sesión del env del hijo, conserva el resto
    const homeOk = join(TMP, 'home-ok'); rmSync(homeOk, { recursive: true, force: true }); mkdirSync(homeOk, { recursive: true });
    writeFileSync(join(homeOk, 'byok.json'), JSON.stringify({ baseUrl: 'https://litellm.local/v1', apiKey: 'sk-valid-key-1234567890' }));
    process.env.CONDUCTOR_HOME = homeOk;
    const e1 = byokChildEnv({ COPILOT_PROVIDER_API_KEY: 'sess', COPILOT_PROVIDER_BASE_URL: 'u', CONDUCTOR_API_KEY: 'k', FOO: 'bar' });
    assert(!('COPILOT_PROVIDER_API_KEY' in e1) && !('CONDUCTOR_API_KEY' in e1), 'byok.json válido → strip de las creds de sesión (fuente única)');
    eq(e1.FOO, 'bar', 'conserva las env no-BYOK');
    // (b) byok.json CORRUPTO → byokCredsLocal()===null → NO strip (no romper un BYOK que sí funcionaría con las de sesión)
    const homeBad = join(TMP, 'home-bad'); rmSync(homeBad, { recursive: true, force: true }); mkdirSync(homeBad, { recursive: true });
    writeFileSync(join(homeBad, 'byok.json'), '{ esto no es json válido');
    process.env.CONDUCTOR_HOME = homeBad;
    const e2 = byokChildEnv({ COPILOT_PROVIDER_API_KEY: 'sess', CONDUCTOR_API_KEY: 'k' });
    eq(e2.COPILOT_PROVIDER_API_KEY, 'sess', 'byok.json corrupto → NO strip (conserva la cred de sesión usable)');
    eq(e2.CONDUCTOR_API_KEY, 'k', 'byok.json corrupto → conserva CONDUCTOR_API_KEY');
  } finally { restoreEnv(saved); }
});

// agente FALSO coherente (mkAgent): produce artefactos/código/test que pasan el gate estructural → verify GREEN.
const mkCoherentAgent = () => (a) => {
  const { phase, writeTo, cwd } = a;
  if (phase === 'apply' || phase === 'fix') {
    w2(join(cwd, 'src', 'c.js'), '// @conductor REQ-C\nexport const x = 1;');
    w2(join(cwd, 'src', 'c.test.js'), '// @conductor REQ-C\ntest("c", () => { expect(x).toBe(1); });');
    return Promise.resolve({ code: 0 });
  }
  const content = { propose: '## Why\nx\n## What Changes\n- a\n## Impact\nx', spec: '## ADDED Requirements\n<!-- id: REQ-C -->\n### Requirement: C\nThe system SHALL c.\n#### Scenario: s\n- **GIVEN** a\n- **WHEN** b\n- **THEN** c' }[phase] || 'x';
  w2(writeTo, content); return Promise.resolve({ code: 0 });
};
const mkProj = (name, cfg) => {
  const root = join(TMP, name); rmSync(root, { recursive: true, force: true }); mkdirSync(join(root, 'openspec'), { recursive: true });
  writeFileSync(join(root, 'openspec', 'conductor.json'), JSON.stringify({ maxRetries: 0, lenses: false, serve: false, ...cfg }));
  return root;
};
// todas las fases con modelo byok: → cualquiera que sea la 1ª, pide proveedor BYOK (dispara/no el hardfail según creds).
const ALL_BYOK = { models: { planner: 'byok:qwen', coder: 'byok:qwen', reviewer: 'byok:qwen' } };

// ── bug 2: el hardfail "byok: sin creds" cubre el runner SDK (no solo el spawn) → BLOCKED, no cae a Copilot ──
await test('qa-fix(bug2): runner SDK + fase byok: SIN credenciales → BLOCKED (no gasta AI Credits en Copilot)', async () => {
  const saved = snapEnv();
  try {
    clearEnv();
    const root = mkProj('proj-sdk-nocreds', ALL_BYOK);
    process.env.CONDUCTOR_HOME = join(root, 'no-home'); // dir sin byok.json → sin credenciales por ninguna vía
    let called = false;
    const fakeSdk = () => { called = true; return Promise.resolve({ code: 0 }); };
    fakeSdk.kind = 'sdk'; // el driver reconoce el runner SDK por .kind
    const r = await drive({ changeDir: join(root, 'openspec', 'changes', 'b2a'), request: 'x', complexity: 'simple', domain: 'core', srcDir: root, runAgent: fakeSdk });
    eq(r.verdict, 'BLOCKED', 'sin creds BYOK el runner SDK NO sigue contra el catálogo Business');
    assert(/byok/i.test(r.reason || ''), 'el motivo del BLOCKED apunta a la falta de credenciales BYOK');
    eq(called, false, 'el agente SDK ni se invoca: se bloquea ANTES de gastar');
  } finally { restoreEnv(saved); }
});

// ── bug 2 (converso): con credenciales de sesión, el runner SDK + byok: NO da un FALSO BLOCKED ──
await test('qa-fix(bug2): runner SDK + fase byok: CON credenciales de sesión → NO bloquea (corre y cierra GREEN)', async () => {
  const saved = snapEnv();
  try {
    clearEnv();
    process.env.COPILOT_PROVIDER_BASE_URL = 'https://litellm.local/v1';
    process.env.COPILOT_PROVIDER_API_KEY = 'sk-test-key-123456';
    const root = mkProj('proj-sdk-creds', ALL_BYOK);
    process.env.CONDUCTOR_HOME = join(root, 'no-home');
    const agent = mkCoherentAgent(); agent.kind = 'sdk';
    const r = await drive({ changeDir: join(root, 'openspec', 'changes', 'b2b'), request: 'x', complexity: 'simple', domain: 'c', srcDir: root, runAgent: agent });
    assert(!(r.verdict === 'BLOCKED' && /byok/i.test(r.reason || '')), 'con creds de sesión, byok: NO debe dar BLOCKED por falta de credenciales');
    eq(r.verdict, 'GREEN', 'el run con creds + agente coherente cierra GREEN (el hardfail no interfiere)');
  } finally { restoreEnv(saved); }
});

// ── bug 1: un fix disparado por VERIFY re-ejecuta las pruebas (con `test` en el pipeline, el fix re-inserta test) ──
// Lever PROBADO (= test de determinismo "gate >2 ciclos → BLOCKED"): un agente que deja artefactos con ❌ hace
// FALLAR verify en cada ronda → bucle de fix. Con la fase `test` en el plan, cada fix de verify debe re-EJECUTAR
// las pruebas antes de reintentar verify. Sin el fix, `test` correría UNA sola vez (antes del 1er verify-FAIL).
await test('qa-fix(bug1): cada fix de verify RE-EJECUTA las pruebas (test se re-inserta en el bucle de verify)', async () => {
  const saved = snapEnv();
  try {
    clearEnv();
    const root = join(TMP, 'proj-bug1'); rmSync(root, { recursive: true, force: true }); mkdirSync(join(root, 'openspec'), { recursive: true });
    writeFileSync(join(root, 'openspec', 'conductor.json'), JSON.stringify({ maxRetries: 0, serve: false, checks: ['node --version'] }));
    const REQSPEC = '## ADDED Requirements\n<!-- id: REQ-X -->\n### Requirement: X\nThe system SHALL x.\n#### Scenario: s\n- **GIVEN** a\n- **WHEN** b\n- **THEN** c';
    const agent = ({ phase, writeTo, cwd }) => {
      if (phase === 'apply' || phase === 'fix') { w2(join(cwd, 'src', 'x.js'), '// @conductor REQ-X\nexport const x = (n) => n + 1;\n'); w2(join(cwd, 'src', 'x.test.js'), '// @conductor REQ-X\nimport { x } from "./x.js";\nif (x(1) !== 2) throw new Error("f");\n'); return Promise.resolve({ code: 0 }); }
      if (writeTo) w2(writeTo, /spec\.md$/.test(writeTo) ? REQSPEC : '❌ Scenario: NOT IMPLEMENTED'); // ❌ → verify falla siempre
      return Promise.resolve({ code: 0 });
    };
    const r = await drive({ changeDir: join(root, 'openspec', 'changes', 'b1'), request: 'do x', complexity: 'simple', domain: 'core', srcDir: root, runAgent: agent, pipeline: ['propose', 'spec', 'apply', 'test'], runTests: true });
    eq(r.verdict, 'BLOCKED', 'el gate nunca converge → BLOCKED (gobierno)');
    const nTest = r.trail.filter((p) => p === 'test').length;
    assert(nTest >= 2, `cada fix de verify re-ejecuta las pruebas: test ×${nTest} (esperado ≥2 por el re-insert): ${r.trail.join('>')}`);
  } finally { restoreEnv(saved); }
});
