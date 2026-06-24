// token-budget.test.mjs — R-A2/R-G3: presupuesto DURO de tokens/coste por run. Freno real (no telemetría):
// al superar el techo, el run se DETIENE (BLOCKED) o pide decisión humana (onExceed:pause).
import { drive } from '../lib/pipeline/drive.mjs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';

const TMP = join(dirname(fileURLToPath(import.meta.url)), '.tmp-budget');
process.env.CONDUCTOR_CAPTURE = 'fs';
const fresh = () => { rmSync(TMP, { recursive: true, force: true }); mkdirSync(TMP, { recursive: true }); };
const w = (p, c) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, c); };
const ENVK = ['CONDUCTOR_MODEL', 'COPILOT_MODEL', 'CONDUCTOR_MODEL_CODER', 'CONDUCTOR_MODEL_PLANNER', 'CONDUCTOR_MODEL_REVIEWER', 'CONDUCTOR_PRESET'];
const clearEnv = () => { const s = Object.fromEntries(ENVK.map((k) => [k, process.env[k]])); for (const k of ENVK) delete process.env[k]; return s; };
const restoreEnv = (s) => { for (const k of ENVK) { if (s[k] === undefined) delete process.env[k]; else process.env[k] = s[k]; } };

// agente que reporta tokens por fase vía OTel (gen_ai.usage.*) además de escribir el artefacto
const tokenAgent = (perPhaseTokens) => (a) => {
  if (a.otelFile) w(a.otelFile, JSON.stringify({ type: 'span', name: 'invoke_agent', attributes: { 'gen_ai.usage.input_tokens': perPhaseTokens, 'gen_ai.usage.output_tokens': perPhaseTokens } }) + '\n');
  if (a.phase === 'apply' || a.phase === 'fix') {
    w(join(a.cwd, 'src', 'c.js'), '// @conductor REQ-C\nexport const x=1;');
    w(join(a.cwd, 'src', 'c.test.js'), '// @conductor REQ-C\ntest("x",()=>{});');
    return Promise.resolve({ code: 0 });
  }
  const content = { propose: '## Why\nx\n## What Changes\n- a\n## Impact\nx', spec: '## ADDED Requirements\n<!-- id: REQ-C -->\n### Requirement: C\nThe system SHALL c.\n#### Scenario: s\n- **GIVEN** a\n- **WHEN** b\n- **THEN** c' }[a.phase] || 'x';
  w(a.writeTo, content); return Promise.resolve({ code: 0 });
};

const runBudget = (budget, perPhaseTokens, onPause) => {
  fresh();
  mkdirSync(join(TMP, 'openspec'), { recursive: true });
  writeFileSync(join(TMP, 'openspec', 'conductor.json'), JSON.stringify({ budget, maxRetries: 0, lenses: false }));
  return drive({ changeDir: join(TMP, 'openspec', 'changes', 'b'), request: 'x', complexity: 'simple', domain: 'c', srcDir: TMP, runAgent: tokenAgent(perPhaseTokens), pauseAt: [], onPause });
};

await test('token-budget: maxTokens superado → BLOCKED (freno duro)', async () => {
  const saved = clearEnv();
  try {
    // cada fase = 2000 tokens (1000 in + 1000 out); límite 2500 → se supera tras la 2ª fase (propose+spec=4000)
    const r = await runBudget({ maxTokens: 2500, onExceed: 'block' }, 1000);
    eq(r.verdict, 'BLOCKED');
    assert(/presupuesto superado/.test(r.reason || ''), 'el motivo cita el presupuesto');
  } finally { restoreEnv(saved); }
});

await test('token-budget: dentro del presupuesto → GREEN normal', async () => {
  const saved = clearEnv();
  try {
    const r = await runBudget({ maxTokens: 10_000_000, onExceed: 'block' }, 10);
    eq(r.verdict, 'GREEN', 'con techo holgado el run completa');
  } finally { restoreEnv(saved); }
});

await test('token-budget: sin budget configurado → cero regresión (GREEN)', async () => {
  const saved = clearEnv();
  try {
    fresh();
    mkdirSync(join(TMP, 'openspec'), { recursive: true });
    writeFileSync(join(TMP, 'openspec', 'conductor.json'), JSON.stringify({ maxRetries: 0, lenses: false }));
    const r = await drive({ changeDir: join(TMP, 'openspec', 'changes', 'nb'), request: 'x', complexity: 'simple', domain: 'c', srcDir: TMP, runAgent: tokenAgent(50000) });
    eq(r.verdict, 'GREEN', 'sin budget no se aplica freno alguno');
  } finally { restoreEnv(saved); }
});

await test('token-budget: onExceed=pause con revisor que aprueba → continúa hasta GREEN', async () => {
  const saved = clearEnv();
  try {
    let paused = false;
    const onPause = (i) => { if (i.before === 'budget') paused = true; return Promise.resolve({}); }; // aprueba
    const r = await runBudget({ maxTokens: 2500, onExceed: 'pause' }, 1000, onPause);
    assert(paused, 'pausó por presupuesto');
    eq(r.verdict, 'GREEN', 'el revisor amplió el presupuesto → el run continúa');
  } finally { restoreEnv(saved); }
});

await test('token-budget: onExceed=pause con revisor que para → BLOCKED', async () => {
  const saved = clearEnv();
  try {
    const onPause = (i) => (i.before === 'budget' ? Promise.resolve({ stop: true }) : Promise.resolve());
    const r = await runBudget({ maxTokens: 2500, onExceed: 'pause' }, 1000, onPause);
    eq(r.verdict, 'BLOCKED', 'el revisor detiene el run por presupuesto');
  } finally { restoreEnv(saved); }
});

rmSync(TMP, { recursive: true, force: true });
