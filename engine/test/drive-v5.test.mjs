// Tests de las mejoras v5 del driver: byok-hardfail (no gastar créditos sin creds) y pauseAt configurable.
import { drive, defaultRunAgent, stripAnsi } from '../lib/pipeline/drive.mjs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';

const TMP = join(dirname(fileURLToPath(import.meta.url)), '.tmp-drive-v5');
process.env.CONDUCTOR_CAPTURE = 'fs'; // aislar de git del repo
const fresh = () => { rmSync(TMP, { recursive: true, force: true }); mkdirSync(TMP, { recursive: true }); };
const w = (p, c) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, c); };

function goodAgent({ phase, writeTo, cwd }) {
  if (phase === 'apply' || phase === 'fix') {
    w(join(cwd, 'src', 'c.js'), '// @conductor REQ-C\nexport const x=1;');
    w(join(cwd, 'src', 'c.test.js'), '// @conductor REQ-C\ntest("x",()=>{});');
    return Promise.resolve({ code: 0 });
  }
  const content = {
    propose: '## Why\nx\n## What Changes\n- a\n## Impact\nx',
    spec: '## ADDED Requirements\n<!-- id: REQ-C -->\n### Requirement: C\nThe system SHALL c.\n#### Scenario: s\n- **GIVEN** a\n- **WHEN** b\n- **THEN** c',
    design: '## Context\nx\n## Goals / Non-Goals\ng\n## Decisions\nd\n## Risks / Trade-offs\nr',
    tasks: '- [ ] 1.1 [REQ-C] implement\n- [ ] 1.2 [REQ-C] test',
  }[phase] || 'x';
  w(writeTo, content);
  return Promise.resolve({ code: 0 });
}

await test('drive(v5): byok: sin credenciales se DETIENE (BLOCKED), no gasta créditos del catálogo Business', async () => {
  fresh();
  const home = join(TMP, 'home-noBYOK'); mkdirSync(home, { recursive: true }); // sin byok.json
  const saved = { home: process.env.CONDUCTOR_HOME, base: process.env.COPILOT_PROVIDER_BASE_URL, key: process.env.COPILOT_PROVIDER_API_KEY, model: process.env.CONDUCTOR_MODEL };
  delete process.env.COPILOT_PROVIDER_BASE_URL; delete process.env.COPILOT_PROVIDER_API_KEY;
  process.env.CONDUCTOR_HOME = home;
  process.env.CONDUCTOR_MODEL = 'byok:qwen-inexistente'; // todas las fases piden BYOK
  try {
    // runAgent === defaultRunAgent → el hard-fail aplica; devuelve BLOCKED ANTES de spawnear copilot
    const r = await drive({ changeDir: join(TMP, 'openspec', 'changes', 'blk'), request: 'x', complexity: 'micro', domain: 'x', srcDir: TMP, runAgent: defaultRunAgent });
    eq(r.verdict, 'BLOCKED', 'sin credenciales BYOK el run se bloquea');
    assert(/byok/i.test(r.reason || ''), 'el motivo menciona BYOK');
  } finally {
    // restaurar entorno para no contaminar otros tests
    for (const [k, v] of [['CONDUCTOR_HOME', saved.home], ['COPILOT_PROVIDER_BASE_URL', saved.base], ['COPILOT_PROVIDER_API_KEY', saved.key], ['CONDUCTOR_MODEL', saved.model]]) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  }
});

await test('drive(v5): byok: sin creds PERO byokFallback:true → NO bloquea (opt-in consciente)', async () => {
  fresh();
  mkdirSync(join(TMP, 'openspec'), { recursive: true });
  writeFileSync(join(TMP, 'openspec', 'conductor.json'), JSON.stringify({ byokFallback: true, maxRetries: 0 }));
  const home = join(TMP, 'home2'); mkdirSync(home, { recursive: true });
  const saved = { home: process.env.CONDUCTOR_HOME, model: process.env.CONDUCTOR_MODEL };
  process.env.CONDUCTOR_HOME = home;
  process.env.CONDUCTOR_MODEL = 'byok:qwen-inexistente';
  try {
    // con opt-in, el hard-fail NO dispara; usamos un fake runAgent para no spawnear copilot de verdad
    const r = await drive({ changeDir: join(TMP, 'openspec', 'changes', 'ok'), request: 'x', complexity: 'simple', domain: 'c', srcDir: TMP, runAgent: goodAgent });
    assert(r.verdict !== 'BLOCKED', 'con byokFallback:true no se bloquea');
  } finally {
    for (const [k, v] of [['CONDUCTOR_HOME', saved.home], ['CONDUCTOR_MODEL', saved.model]]) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
});

await test('drive(v5): pauseAt configurable por openspec/conductor.json (gana sobre el default del llamador)', async () => {
  fresh();
  mkdirSync(join(TMP, 'openspec'), { recursive: true });
  writeFileSync(join(TMP, 'openspec', 'conductor.json'), JSON.stringify({ pauseAt: ['spec'], maxRetries: 0 }));
  const paused = [];
  await drive({
    changeDir: join(TMP, 'openspec', 'changes', 'pa'), request: 'x', complexity: 'simple', domain: 'c', srcDir: TMP,
    runAgent: goodAgent, pauseAt: ['apply', 'verify'], onPause: (i) => { paused.push(i.before); return Promise.resolve(); },
  });
  assert(paused.includes('spec'), 'pausa en spec (definido en la config)');
  assert(!paused.includes('apply'), 'NO pausa en apply: la config gana sobre el pauseAt del llamador');
});

await test('drive(v5): pipeline declarativo (conductor.json) reordena/omite fases manteniendo el gate', async () => {
  fresh();
  mkdirSync(join(TMP, 'openspec'), { recursive: true });
  // omite explore/propose/design/clarify; el gate (spec+tasks+trace) sigue intacto y verify se exige
  writeFileSync(join(TMP, 'openspec', 'conductor.json'), JSON.stringify({ pipeline: ['spec', 'tasks', 'apply', 'verify'], maxRetries: 0, lenses: false }));
  const seen = [];
  const r = await drive({ changeDir: join(TMP, 'openspec', 'changes', 'pipe'), request: 'x', complexity: 'medium', domain: 'c', srcDir: TMP, runAgent: (a) => { seen.push(a.phase); return goodAgent(a); } });
  eq(r.verdict, 'GREEN', 'el pipeline declarativo llega a GREEN');
  eq(seen, ['spec', 'tasks', 'apply', 'verify'], 'solo las fases declaradas, en orden (sin explore/propose/design)');
});

await test('drive(v5): fase condicional — when no se cumple → la fase se OMITE (sin LLM), gate intacto', async () => {
  fresh();
  mkdirSync(join(TMP, 'openspec'), { recursive: true });
  const chDir = join(TMP, 'openspec', 'changes', 'cond');
  mkdirSync(chDir, { recursive: true });
  // proposal.md ya existe en el change → la condición "missing:proposal.md" es FALSA → explore se omite
  writeFileSync(join(chDir, 'proposal.md'), '## Why\nx\n## What Changes\n- a\n## Impact\nx');
  writeFileSync(join(TMP, 'openspec', 'conductor.json'), JSON.stringify({ pipeline: [{ phase: 'explore', when: 'missing:proposal.md' }, 'spec', 'tasks', 'apply', 'verify'], maxRetries: 0, lenses: false }));
  const seen = [];
  const r = await drive({ changeDir: chDir, request: 'x', complexity: 'medium', domain: 'c', srcDir: TMP, runAgent: (a) => { seen.push(a.phase); return goodAgent(a); } });
  eq(r.verdict, 'GREEN', 'llega a GREEN sin la fase condicional');
  assert(!seen.includes('explore'), 'explore se omitió porque proposal.md ya existía');
  eq(seen, ['spec', 'tasks', 'apply', 'verify'], 'solo las fases activas, en orden');
});

await test('drive(v5): decisiones del revisor (nota + modelo en caliente) quedan auditadas en el timeline', async () => {
  fresh();
  const changeDir = join(TMP, 'openspec', 'changes', 'dec');
  let paused = false;
  await drive({
    changeDir, request: 'x', complexity: 'simple', domain: 'c', srcDir: TMP, runAgent: goodAgent,
    pauseAt: ['apply'], onPause: (i) => { if (i.before === 'apply' && !paused) { paused = true; return Promise.resolve({ note: 'usa convención X', model: 'byok:qwen-test' }); } return Promise.resolve(); },
  });
  const tl = JSON.parse(readFileSync(join(changeDir, '.conductor', 'timeline.json'), 'utf8'));
  const kinds = (tl.decisions || []).map((d) => d.kind);
  assert(kinds.includes('note') && kinds.includes('model-override'), 'nota y override de modelo auditados en timeline.decisions');
});

await test('drive(v5): los patrones de equipo (.conductor/skills) se inyectan en el prompt de apply', async () => {
  fresh();
  const dir = join(TMP, '.conductor', 'skills'); mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'pat.md'), '# Patrón\nUsa el patrón XYZ del equipo.');
  let applyPrompt = '';
  const rec = (a) => { if (a.phase === 'apply') applyPrompt = a.prompt; return goodAgent(a); };
  await drive({ changeDir: join(TMP, 'openspec', 'changes', 'sk'), request: 'x', complexity: 'simple', domain: 'c', srcDir: TMP, runAgent: rec });
  assert(/TEAM PATTERNS/.test(applyPrompt) && /patrón XYZ/.test(applyPrompt), 'el prompt de apply incluye el patrón del equipo');
});

await test('drive(v5): tiers enrutan el modelo por fase cuando no hay modelo explícito', async () => {
  fresh();
  mkdirSync(join(TMP, 'openspec'), { recursive: true });
  writeFileSync(join(TMP, 'openspec', 'conductor.json'), JSON.stringify({ tiers: { economy: 'eco-m', balanced: 'bal-m', premium: 'prem-m' }, maxRetries: 0, lenses: false }));
  const saved = { m: process.env.CONDUCTOR_MODEL, c: process.env.COPILOT_MODEL, cc: process.env.CONDUCTOR_MODEL_CODER, cp: process.env.CONDUCTOR_MODEL_PLANNER, cr: process.env.CONDUCTOR_MODEL_REVIEWER };
  for (const k of ['CONDUCTOR_MODEL', 'COPILOT_MODEL', 'CONDUCTOR_MODEL_CODER', 'CONDUCTOR_MODEL_PLANNER', 'CONDUCTOR_MODEL_REVIEWER']) delete process.env[k];
  const seen = {};
  try {
    await drive({ changeDir: join(TMP, 'openspec', 'changes', 'tier'), request: 'x', complexity: 'simple', domain: 'c', srcDir: TMP, runAgent: (a) => { if (!a.phase.startsWith('verify:')) seen[a.phase] = a.model; return goodAgent(a); } });
    eq(seen.propose, 'bal-m', 'propose usa el tier balanced');
    eq(seen.apply, 'bal-m', 'apply usa balanced');
    eq(seen.verify, 'prem-m', 'verify usa el tier premium');
  } finally {
    for (const [k, v] of [['CONDUCTOR_MODEL', saved.m], ['COPILOT_MODEL', saved.c], ['CONDUCTOR_MODEL_CODER', saved.cc], ['CONDUCTOR_MODEL_PLANNER', saved.cp], ['CONDUCTOR_MODEL_REVIEWER', saved.cr]]) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
});

await test('drive(v5): stripAnsi quita secuencias ANSI y conserva los corchetes del código', () => {
  eq(stripAnsi('\x1b[32mok\x1b[0m a[1] obj["k"]'), 'ok a[1] obj["k"]');
  eq(stripAnsi(''), '');
});

await test('drive(v5): pre-condición de fase no cumplida → BLOCKED sin gastar tokens', async () => {
  fresh();
  mkdirSync(join(TMP, 'openspec'), { recursive: true });
  writeFileSync(join(TMP, 'openspec', 'conductor.json'), JSON.stringify({ preconditions: { spec: ['exists:no-existe.xyz'] }, maxRetries: 0, lenses: false }));
  const r = await drive({ changeDir: join(TMP, 'openspec', 'changes', 'pre'), request: 'x', complexity: 'simple', domain: 'c', srcDir: TMP, runAgent: goodAgent });
  eq(r.verdict, 'BLOCKED', 'la pre-condición incumplida bloquea el run');
  assert(/spec/.test(r.reason || ''), 'el motivo señala la fase spec');
});

await test('drive(v5): un pipeline sin "verify" recupera el gate (verify se añade al final)', async () => {
  fresh();
  mkdirSync(join(TMP, 'openspec'), { recursive: true });
  writeFileSync(join(TMP, 'openspec', 'conductor.json'), JSON.stringify({ pipeline: ['spec', 'tasks', 'apply'], maxRetries: 0, lenses: false }));
  const seen = [];
  const r = await drive({ changeDir: join(TMP, 'openspec', 'changes', 'noverify'), request: 'x', complexity: 'medium', domain: 'c', srcDir: TMP, runAgent: (a) => { seen.push(a.phase); return goodAgent(a); } });
  assert(seen.includes('verify'), 'verify se añadió aunque la config lo omitía (gate innegociable)');
  eq(r.verdict, 'GREEN');
});
