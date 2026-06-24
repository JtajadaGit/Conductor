// drive-harness.test.mjs — mejoras del harness del driver (Vía 1 §4):
// model-allowlist-driver (R-G4), pause-timeout (R-A3), backoff+failureKind (R-A1/R-A7),
// ctxfiles-wire (R-T2), self-repair-rate en timeline.json (R-E3).
import { drive, classifyFailure } from '../lib/pipeline/drive.mjs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';

const TMP = join(dirname(fileURLToPath(import.meta.url)), '.tmp-harness');
process.env.CONDUCTOR_CAPTURE = 'fs';
const fresh = () => { rmSync(TMP, { recursive: true, force: true }); mkdirSync(TMP, { recursive: true }); };
const w = (p, c) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, c); };
const ENVK = ['CONDUCTOR_MODEL', 'COPILOT_MODEL', 'CONDUCTOR_MODEL_CODER', 'CONDUCTOR_MODEL_PLANNER', 'CONDUCTOR_MODEL_REVIEWER'];
const clearEnv = () => { const s = Object.fromEntries(ENVK.map((k) => [k, process.env[k]])); for (const k of ENVK) delete process.env[k]; return s; };
const restoreEnv = (s) => { for (const k of ENVK) { if (s[k] === undefined) delete process.env[k]; else process.env[k] = s[k]; } };

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

await test('classifyFailure: timeout / provider(429,5xx) / crash / no-progress / none', () => {
  eq(classifyFailure({ err: 'request timeout exceeded' }, false), 'timeout');
  eq(classifyFailure({ err: 'HTTP 429 rate limit' }, false), 'provider');
  eq(classifyFailure({ err: 'upstream 503 bad gateway' }, false), 'provider');
  eq(classifyFailure({ code: -1 }, false), 'crash');
  eq(classifyFailure({ code: 0 }, false), 'no-progress');
  eq(classifyFailure({ code: 0 }, true), 'none');
  eq(classifyFailure(null, false), 'unknown');
});

await test('drive(R-G4): modelo fuera de allowedModels de openspec/policy.json → BLOCKED', async () => {
  fresh();
  const saved = clearEnv();
  try {
    mkdirSync(join(TMP, 'openspec'), { recursive: true });
    writeFileSync(join(TMP, 'openspec', 'policy.json'), JSON.stringify({ version: 1, blockSeverity: 'error', allowedModels: ['only-this-one'] }));
    writeFileSync(join(TMP, 'openspec', 'conductor.json'), JSON.stringify({ models: { coder: 'forbidden-model' }, maxRetries: 0, lenses: false }));
    const r = await drive({ changeDir: join(TMP, 'openspec', 'changes', 'al'), request: 'x', complexity: 'simple', domain: 'c', srcDir: TMP, runAgent: goodAgent });
    eq(r.verdict, 'BLOCKED');
    assert(/allowedModels/.test(r.reason || ''), 'el motivo cita la allowlist');
    eq(r.phase, 'apply', 'bloquea en la fase coder (el modelo prohibido)');
  } finally { restoreEnv(saved); }
});

await test('drive(R-G4): sin policy.json no se bloquea ningún modelo (cero regresión)', async () => {
  fresh();
  const saved = clearEnv();
  try {
    mkdirSync(join(TMP, 'openspec'), { recursive: true });
    writeFileSync(join(TMP, 'openspec', 'conductor.json'), JSON.stringify({ models: { coder: 'cualquier-modelo' }, maxRetries: 0, lenses: false }));
    const r = await drive({ changeDir: join(TMP, 'openspec', 'changes', 'na'), request: 'x', complexity: 'simple', domain: 'c', srcDir: TMP, runAgent: goodAgent });
    eq(r.verdict, 'GREEN');
  } finally { restoreEnv(saved); }
});

await test('drive(R-A3): onReviewTimeout=continue → la pausa sin atender no cuelga el run', async () => {
  fresh();
  const saved = clearEnv();
  try {
    mkdirSync(join(TMP, 'openspec'), { recursive: true });
    writeFileSync(join(TMP, 'openspec', 'conductor.json'), JSON.stringify({ onReviewTimeout: 'continue', reviewTimeoutMs: 40, maxRetries: 0, lenses: false }));
    let pausedAt = null;
    const r = await drive({
      changeDir: join(TMP, 'openspec', 'changes', 'rt'), request: 'x', complexity: 'simple', domain: 'c', srcDir: TMP,
      runAgent: goodAgent, pauseAt: ['apply'], onPause: (i) => { pausedAt = i.before; return new Promise(() => {}); }, // nunca resuelve
    });
    eq(pausedAt, 'apply', 'se llamó a la pausa');
    eq(r.verdict, 'GREEN', 'el run continuó pese a no atender la revisión (continue)');
  } finally { restoreEnv(saved); }
});

await test('drive(R-A3): onReviewTimeout=abort → la pausa sin atender detiene el run (STOPPED)', async () => {
  fresh();
  const saved = clearEnv();
  try {
    mkdirSync(join(TMP, 'openspec'), { recursive: true });
    writeFileSync(join(TMP, 'openspec', 'conductor.json'), JSON.stringify({ onReviewTimeout: 'abort', reviewTimeoutMs: 40, maxRetries: 0, lenses: false }));
    const r = await drive({
      changeDir: join(TMP, 'openspec', 'changes', 'ra'), request: 'x', complexity: 'simple', domain: 'c', srcDir: TMP,
      runAgent: goodAgent, pauseAt: ['apply'], onPause: () => new Promise(() => {}),
    });
    eq(r.verdict, 'STOPPED');
  } finally { restoreEnv(saved); }
});

await test('drive(R-T2): el prompt de apply inyecta CONTEXT ARTIFACTS con rutas (no contenido)', async () => {
  fresh();
  const saved = clearEnv();
  try {
    let applyPrompt = '';
    const rec = (a) => { if (a.phase === 'apply') applyPrompt = a.prompt; return goodAgent(a); };
    await drive({ changeDir: join(TMP, 'openspec', 'changes', 'cx'), request: 'x', complexity: 'simple', domain: 'c', srcDir: TMP, runAgent: rec });
    assert(/CONTEXT ARTIFACTS/.test(applyPrompt), 'el bloque de contexto aparece');
    assert(/spec\.md —/.test(applyPrompt), 'lista la ruta de la spec con su motivo');
    assert(/do NOT re-read project source files/.test(applyPrompt), 'reitera el no-rescan');
  } finally { restoreEnv(saved); }
});

await test('drive(R-E3): timeline.json expone selfRepair { fixCycles, recovered } en GREEN limpio', async () => {
  fresh();
  const saved = clearEnv();
  try {
    const changeDir = join(TMP, 'openspec', 'changes', 'sr');
    mkdirSync(join(TMP, 'openspec'), { recursive: true });
    writeFileSync(join(TMP, 'openspec', 'conductor.json'), JSON.stringify({ maxRetries: 0, lenses: false }));
    const r = await drive({ changeDir, request: 'x', complexity: 'simple', domain: 'c', srcDir: TMP, runAgent: goodAgent });
    eq(r.verdict, 'GREEN');
    const tl = JSON.parse(readFileSync(join(changeDir, '.conductor', 'timeline.json'), 'utf8'));
    assert(tl.selfRepair && typeof tl.selfRepair.fixCycles === 'number', 'selfRepair presente');
    eq(tl.selfRepair.fixCycles, 0); eq(tl.selfRepair.recovered, false);
  } finally { restoreEnv(saved); }
});

await test('drive(R-A7): una fase que falla persiste failureKind en su entrada de timeline', async () => {
  fresh();
  const saved = clearEnv();
  try {
    const changeDir = join(TMP, 'openspec', 'changes', 'fk');
    mkdirSync(join(TMP, 'openspec'), { recursive: true });
    writeFileSync(join(TMP, 'openspec', 'conductor.json'), JSON.stringify({ maxRetries: 0, lenses: false }));
    // agente que falla en apply (code 1, sin escribir ficheros) → no-progress
    const failApply = (a) => { if (a.phase === 'apply') return Promise.resolve({ code: 1, err: 'boom' }); return goodAgent(a); };
    const r = await drive({ changeDir, request: 'x', complexity: 'simple', domain: 'c', srcDir: TMP, runAgent: failApply });
    eq(r.verdict, 'ABORTED');
    const tl = JSON.parse(readFileSync(join(changeDir, '.conductor', 'timeline.json'), 'utf8'));
    const apply = tl.phases.find((p) => p.phase === 'apply');
    assert(apply && apply.failureKind === 'no-progress', 'la entrada apply lleva failureKind=no-progress');
  } finally { restoreEnv(saved); }
});

await test('drive(R-T1): snapshot() honra .copilotignore (un dir excluido no se captura como cambio)', async () => {
  fresh();
  const saved = clearEnv();
  try {
    mkdirSync(join(TMP, 'openspec'), { recursive: true });
    writeFileSync(join(TMP, 'openspec', 'conductor.json'), JSON.stringify({ maxRetries: 0, lenses: false }));
    writeFileSync(join(TMP, '.copilotignore'), 'node_modules/\nvendor/\n*.log\n');
    const changeDir = join(TMP, 'openspec', 'changes', 'ig');
    // agente que ADEMÁS escribe en vendor/ (debe ignorarse) y en src/ (debe capturarse)
    const agent = (a) => {
      const { phase, cwd } = a;
      if (phase === 'apply' || phase === 'fix') {
        w(join(cwd, 'src', 'c.js'), '// @conductor REQ-C\nexport const x=1;');
        w(join(cwd, 'src', 'c.test.js'), '// @conductor REQ-C\ntest("x",()=>{});');
        w(join(cwd, 'vendor', 'junk.js'), 'whatever generated');
        return Promise.resolve({ code: 0 });
      }
      return goodAgent(a);
    };
    const r = await drive({ changeDir, request: 'x', complexity: 'simple', domain: 'c', srcDir: TMP, runAgent: agent });
    eq(r.verdict, 'GREEN');
    const tl = JSON.parse(readFileSync(join(changeDir, '.conductor', 'timeline.json'), 'utf8'));
    const applyFiles = (tl.phases.find((p) => p.phase === 'apply')?.files || []).map((f) => f.p);
    assert(applyFiles.some((p) => p.includes('src/c.js')), 'captura src/c.js');
    assert(!applyFiles.some((p) => p.includes('vendor/')), 'NO captura vendor/ (excluido por .copilotignore)');
  } finally { restoreEnv(saved); }
});

await test('drive(R-A5 FASE 3): resume con tasks.md parcial → prompt de apply inyecta tareas ya hechas', async () => {
  fresh();
  const saved = clearEnv();
  try {
    const changeDir = join(TMP, 'openspec', 'changes', 'partial-resume');
    const domain = 'c';
    const specContent = '## ADDED Requirements\n<!-- id: REQ-C -->\n### Requirement: C\nThe system SHALL c.\n#### Scenario: s\n- **GIVEN** a\n- **WHEN** b\n- **THEN** c';
    mkdirSync(join(TMP, 'openspec'), { recursive: true });
    writeFileSync(join(TMP, 'openspec', 'conductor.json'), JSON.stringify({ maxRetries: 0, lenses: false }));
    mkdirSync(join(changeDir, '.conductor'), { recursive: true });
    mkdirSync(join(changeDir, `specs/${domain}`), { recursive: true });
    // Estado válido: el run anterior llegó hasta apply (idx=2) pero fue interrumpido
    writeFileSync(join(changeDir, '.conductor', 'state.json'), JSON.stringify({ request: 'do x', complexity: 'simple', domain, phases: ['propose', 'spec', 'apply', 'verify'], idx: 2, status: 'running', fixCycles: 0 }));
    // Timeline: propose+spec completadas ok (para que el fast-forward las salte)
    writeFileSync(join(changeDir, '.conductor', 'timeline.json'), JSON.stringify({ request: 'do x', complexity: 'simple', domain, verdict: 'running', phases: [{ phase: 'propose', ok: true, ms: 100 }, { phase: 'spec', ok: true, ms: 100 }] }));
    // Artefactos de las fases completadas
    writeFileSync(join(changeDir, 'proposal.md'), '## Why\nx\n## What Changes\n- a\n## Impact\nx');
    writeFileSync(join(changeDir, `specs/${domain}/spec.md`), specContent);
    // tasks.md con una tarea ya hecha (del run interrumpido)
    writeFileSync(join(changeDir, 'tasks.md'), '- [x] 1.1 [REQ-C] implement\n- [ ] 1.2 [REQ-C] test');
    // apply-report.md NO existe (apply fue interrumpido antes de que el driver lo escribiera)
    let capturedApplyPrompt = '';
    const agent = (a) => {
      if (a.phase === 'apply') {
        capturedApplyPrompt = a.prompt || '';
        w(join(a.cwd, 'src', 'c.js'), '// @conductor REQ-C\nexport const x=1;');
        w(join(a.cwd, 'src', 'c.test.js'), '// @conductor REQ-C\ntest("x",()=>{});');
        return Promise.resolve({ code: 0 });
      }
      if (a.writeTo) w(a.writeTo, /verify/.test(a.writeTo) ? 'Verdict: PASS\n## Per scenario\n✅ s — src/c.js:1\n## Findings\nnone\n## Tests\nok' : 'content');
      return Promise.resolve({ code: 0 });
    };
    const r = await drive({ changeDir, request: 'do x', complexity: 'simple', domain, srcDir: TMP, runAgent: agent });
    eq(r.verdict, 'GREEN', 'el resume termina GREEN');
    assert(capturedApplyPrompt.length > 0, 'el agente de apply recibió un prompt');
    assert(capturedApplyPrompt.includes('ALREADY DONE'), 'el prompt de apply en resume incluye tareas ya hechas del run interrumpido');
    assert(capturedApplyPrompt.includes('1.1 [REQ-C]'), 'la tarea marcada [x] está en el hint');
  } finally { restoreEnv(saved); }
});

rmSync(TMP, { recursive: true, force: true });
