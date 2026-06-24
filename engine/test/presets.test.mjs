// presets.test.mjs — #67 presets de gobierno + R-S1 (trazabilidad bloqueante) + R-S2 (id obligatorio).
// El preset es un paquete de knobs sobre el MISMO driver; verify SIEMPRE presente; el knob explícito gana.
import { resolvePreset, suggestPreset, PRESETS, DEFAULT_PRESET } from '../lib/pipeline/presets.mjs';
import { drive } from '../lib/pipeline/drive.mjs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';

const TMP = join(dirname(fileURLToPath(import.meta.url)), '.tmp-presets');
process.env.CONDUCTOR_CAPTURE = 'fs';
const fresh = () => { rmSync(TMP, { recursive: true, force: true }); mkdirSync(TMP, { recursive: true }); };
const w = (p, c) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, c); };
const ENVK = ['CONDUCTOR_MODEL', 'COPILOT_MODEL', 'CONDUCTOR_MODEL_CODER', 'CONDUCTOR_MODEL_PLANNER', 'CONDUCTOR_MODEL_REVIEWER', 'CONDUCTOR_PRESET'];
const clearEnv = () => { const s = Object.fromEntries(ENVK.map((k) => [k, process.env[k]])); for (const k of ENVK) delete process.env[k]; return s; };
const restoreEnv = (s) => { for (const k of ENVK) { if (s[k] === undefined) delete process.env[k]; else process.env[k] = s[k]; } };

const SPEC_ID = '## ADDED Requirements\n<!-- id: REQ-C -->\n### Requirement: C\nThe system SHALL c.\n#### Scenario: s\n- **GIVEN** a\n- **WHEN** b\n- **THEN** c';
const SPEC_NOID = '## ADDED Requirements\n### Requirement: C\nThe system SHALL c.\n#### Scenario: s\n- **GIVEN** a\n- **WHEN** b\n- **THEN** c';

// agente parametrizable: spec con/sin id, código con/sin tag @conductor
const mkAgent = ({ spec = SPEC_ID, tag = true } = {}) => (a) => {
  const { phase, writeTo, cwd } = a;
  if (phase === 'apply' || phase === 'fix') {
    const c = tag ? '// @conductor REQ-C\nexport const x=1;' : 'export const x=1;';
    w(join(cwd, 'src', 'c.js'), c);
    w(join(cwd, 'src', 'c.test.js'), tag ? '// @conductor REQ-C\ntest("x",()=>{});' : 'test("x",()=>{});');
    return Promise.resolve({ code: 0 });
  }
  w(writeTo, { propose: '## Why\nx\n## What Changes\n- a\n## Impact\nx', spec }[phase] || 'x');
  return Promise.resolve({ code: 0 });
};

const runWith = (cfg, agent, complexity = 'simple') => {
  fresh();
  mkdirSync(join(TMP, 'openspec'), { recursive: true });
  writeFileSync(join(TMP, 'openspec', 'conductor.json'), JSON.stringify({ maxRetries: 0, lenses: false, ...cfg }));
  return drive({ changeDir: join(TMP, 'openspec', 'changes', 'p'), request: 'x', complexity, domain: 'c', srcDir: TMP, runAgent: agent });
};

await test('presets: resolvePreset y suggestPreset (heurística determinista por carpeta)', () => {
  assert(resolvePreset('migration').specFreeze === true && resolvePreset('migration').strict.trace === true);
  assert(resolvePreset('migration').strict.semanticDelta === true, 'R-S6: migration declara semanticDelta (MODIFIED/REMOVED coherentes con la spec viva)');
  assert(!resolvePreset('feature').strict.semanticDelta, 'feature NO activa semanticDelta (solo migración)');
  eq(resolvePreset('nope'), null);
  eq(suggestPreset(['db/migrations/001.sql']), 'migration');
  eq(suggestPreset(['src/styles/app.css']), 'visual');
  eq(suggestPreset(['README.md']), 'quick-fix');
  eq(suggestPreset(['src/app/service.ts']), 'feature');
  eq(suggestPreset([]), DEFAULT_PRESET);
  assert(Object.keys(PRESETS).length === 4);
});

await test('presets(R-S1): preset feature (strictTrace) → un requisito sin código/test BLOQUEA (BLOCKED-NEEDS-HUMAN)', async () => {
  const saved = clearEnv();
  try {
    const r = await runWith({ preset: 'feature' }, mkAgent({ tag: false })); // código SIN tag → coverage-gap
    // strictTrace convierte el hueco en bloqueante; 2 ciclos de fix no lo resuelven (el agente no añade el tag) →
    // BLOCKED-NEEDS-HUMAN (resumable, escalar a humano) en vez del NOT-GREEN genérico (R-A6 FASE 3).
    eq(r.verdict, 'BLOCKED', 'strictTrace: hueco no resuelto tras 2 fix → escalar a humano (BLOCKED, resumable)');
  } finally { restoreEnv(saved); }
});

await test('presets(R-S1): preset quick-fix (laxo) → el mismo hueco es solo warning → GREEN', async () => {
  const saved = clearEnv();
  try {
    const r = await runWith({ preset: 'quick-fix' }, mkAgent({ tag: false }));
    eq(r.verdict, 'GREEN', 'sin strictTrace, la trazabilidad es señal no bloqueante');
  } finally { restoreEnv(saved); }
});

await test('presets(R-S2): preset feature (strictId) → requisito sin id estable → BLOCKED-NEEDS-HUMAN', async () => {
  const saved = clearEnv();
  try {
    const r = await runWith({ preset: 'feature' }, mkAgent({ spec: SPEC_NOID, tag: true }));
    // strictId exige <!-- id: REQ-... -->; el agente no lo añade en 2 fix → BLOCKED-NEEDS-HUMAN (resumable).
    eq(r.verdict, 'BLOCKED', 'strictId: id ausente no resuelto tras 2 fix → escalar a humano (BLOCKED, resumable)');
  } finally { restoreEnv(saved); }
});

await test('presets(R-S2): preset quick-fix → spec sin id pasa (GREEN), cero regresión en modo laxo', async () => {
  const saved = clearEnv();
  try {
    const r = await runWith({ preset: 'quick-fix' }, mkAgent({ spec: SPEC_NOID, tag: true }));
    eq(r.verdict, 'GREEN', 'sin strictId, el id ausente no bloquea');
  } finally { restoreEnv(saved); }
});

await test('presets: el knob explícito GANA sobre el preset (el experto manda)', async () => {
  const saved = clearEnv();
  try {
    // preset feature activaría strictTrace, pero strictTrace:false explícito lo desactiva → GREEN pese al hueco
    const r = await runWith({ preset: 'feature', strictTrace: false, strictId: false }, mkAgent({ tag: false }));
    eq(r.verdict, 'GREEN', 'strictTrace:false explícito gana sobre el preset feature');
  } finally { restoreEnv(saved); }
});

rmSync(TMP, { recursive: true, force: true });
