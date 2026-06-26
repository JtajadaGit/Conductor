// Tests del driver determinista (Path X). Inyectamos un runAgent stub que simula al agente anfitrión
// ESCRIBIENDO ficheros nativamente (como hace Copilot con Write/Edit). Demuestra la propiedad central:
// la SECUENCIA la impone el CÓDIGO; el agente solo rellena. Captura por snapshot fs (sin git).
import { drive, parseModelSpec, agentArgs, rollbackTo, scrubSecrets } from '../lib/pipeline/drive.mjs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync, existsSync, rmSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const TMP = join(dirname(fileURLToPath(import.meta.url)), '.tmp-drive');
// El TMP vive dentro del repo conductor → forzamos captura fs para aislar (no mezclar con git del repo).
process.env.CONDUCTOR_CAPTURE = 'fs';
const fresh = () => { rmSync(TMP, { recursive: true, force: true }); mkdirSync(TMP, { recursive: true }); };
const w = (p, c) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, c); };

// stub "competente": escribe el artefacto de planificación en writeTo; en apply/fix escribe código en el proyecto.
function goodAgent({ phase, writeTo, cwd }) {
  if (phase === 'apply' || phase === 'fix') {
    w(join(cwd, 'src', 'counter.js'), '// @conductor REQ-COUNTER\nexport let count=0;\nexport const inc=()=>++count;');
    w(join(cwd, 'src', 'counter.test.js'), '// @conductor REQ-COUNTER\ntest("inc",()=>{});');
    return Promise.resolve({ code: 0 });
  }
  const content = {
    explore: 'Existing context: no counting capability.',
    propose: '## Why\nNeed a counter.\n## What Changes\n- add counter\n## Impact\nminimal',
    spec: '## ADDED Requirements\n<!-- id: REQ-COUNTER -->\n### Requirement: Counter\nThe system SHALL maintain a count.\n#### Scenario: increment\n- **GIVEN** a count\n- **WHEN** raised\n- **THEN** +1',
    design: '## Context\nx\n## Goals / Non-Goals\ng\n## Decisions\nd\n## Risks / Trade-offs\nr',
    tasks: '- [ ] 1.1 [REQ-COUNTER] implement\n- [ ] 1.2 [REQ-COUNTER] test',
  }[phase] || 'x';
  w(writeTo, content);
  return Promise.resolve({ code: 0 });
}

await test('drive(Path X): recorre TODAS las fases en orden, captura los ficheros nativos y cierra GREEN', async () => {
  fresh();
  const changeDir = join(TMP, 'openspec', 'changes', 'add-counter');
  const r = await drive({ changeDir, request: 'add a counter', complexity: 'medium', domain: 'counter', srcDir: TMP, runAgent: goodAgent });
  eq(r.verdict, 'GREEN', 'verdict final');
  eq(r.trail, ['explore', 'propose', 'spec', 'design', 'tasks', 'apply', 'verify'], 'todas las fases en orden');
  assert(existsSync(join(TMP, 'src', 'counter.js')), 'código escrito nativamente y capturado');
  assert(existsSync(join(changeDir, 'apply-report.md')), 'apply-report sintetizado por el driver');
  const dash = readFileSync(join(changeDir, 'dashboard.html'), 'utf8');
  assert(/Timeline del run/.test(dash) && /apply/.test(dash), 'dashboard.html generado automáticamente (artefacto humano)');
});

await test('drive(Path X): el apply-report (driver) lista los ficheros del DIFF, no del texto del modelo', async () => {
  fresh();
  const changeDir = join(TMP, 'openspec', 'changes', 'c2');
  await drive({ changeDir, request: 'x', complexity: 'simple', domain: 'counter', srcDir: TMP, runAgent: goodAgent });
  const report = readFileSync(join(changeDir, 'apply-report.md'), 'utf8');
  assert(/Status: done/.test(report) && /counter\.js/.test(report) && /counter\.test\.js/.test(report), 'report determinista del diff');
});

await test('drive(Path X): un agente que NO escribe la spec NO puede saltarse la fase — aborta en spec', async () => {
  fresh();
  const changeDir = join(TMP, 'openspec', 'changes', 'lazy');
  const lazy = (a) => (a.phase === 'spec' ? Promise.resolve({ code: 0 }) : goodAgent(a)); // no escribe nada en spec
  const r = await drive({ changeDir, request: 'x', complexity: 'simple', domain: 'counter', srcDir: TMP, runAgent: lazy, maxRetries: 1 });
  eq(r.verdict, 'ABORTED'); eq(r.phase, 'spec'); eq(r.trail, ['propose'], 'apply jamás se ejecutó');
  assert(!existsSync(join(TMP, 'src', 'counter.js')), 'NO se aplicó código sin pasar por la spec');
});

await test('drive(Path X): el diff capturado IGNORA el ruido del agente (copilot-session/.log)', async () => {
  fresh();
  const changeDir = join(TMP, 'openspec', 'changes', 'noise');
  const noisyAgent = (a) => {
    if (a.phase === 'apply' || a.phase === 'fix') {
      w(join(TMP, 'src', 'counter.js'), '// @conductor REQ-COUNTER\nexport let count=0;');
      w(join(TMP, 'copilot-session-abc.md'), 'session transcript noise');
      w(join(TMP, 'debug.log'), 'noise');
      return Promise.resolve({ code: 0 });
    }
    return goodAgent(a);
  };
  await drive({ changeDir, request: 'x', complexity: 'simple', domain: 'counter', srcDir: TMP, runAgent: noisyAgent });
  const report = readFileSync(join(changeDir, 'apply-report.md'), 'utf8');
  assert(/counter\.js/.test(report), 'el código real sí aparece');
  assert(!/copilot-session|debug\.log/.test(report), 'el ruido del agente NO aparece en el report');
});

await test('drive(Path X): el gate bloquea en verify si la spec no traza (requisito sin scenario)', async () => {
  fresh();
  const changeDir = join(TMP, 'openspec', 'changes', 'gatefail');
  const badSpec = (a) => {
    if (a.phase === 'spec') { w(a.writeTo, '## ADDED Requirements\n<!-- id: REQ-X -->\n### Requirement: X\nThe system SHALL x.'); return Promise.resolve({ code: 0 }); }
    return goodAgent(a);
  };
  const r = await drive({ changeDir, request: 'x', complexity: 'simple', domain: 'x', srcDir: TMP, runAgent: badSpec, maxRetries: 0 });
  assert(r.verdict !== 'GREEN', 'el gate no deja cerrar en verde con spec incoherente');
});

await test('drive(Path X): emite run-timeline.json con telemetría por fase (rol, modelo, ficheros)', async () => {
  fresh();
  process.env.CONDUCTOR_MODEL_CODER = 'strong-model';
  const changeDir = join(TMP, 'openspec', 'changes', 'timeline');
  const r = await drive({ changeDir, request: 'x', complexity: 'simple', domain: 'counter', srcDir: TMP, runAgent: goodAgent });
  delete process.env.CONDUCTOR_MODEL_CODER;
  const tl = JSON.parse(readFileSync(join(changeDir, '.conductor', 'timeline.json'), 'utf8'));
  eq(tl.verdict, 'GREEN');
  eq(tl.phases.length, 4, 'una entrada por fase (simple = 4)');
  const apply = tl.phases.find((p) => p.phase === 'apply');
  assert(apply && apply.role === 'coder' && apply.model === 'strong-model', 'apply registra rol+modelo');
  assert(apply.files.some((f) => /counter\.js/.test(f.p)), 'apply registra los ficheros tocados');
  assert(apply.files.every((f) => ['create', 'edit', 'delete'].includes(f.k)), 'cada fichero lleva su tipo (create/edit/delete)');
  assert(tl.phases.every((p) => typeof p.ms === 'number'), 'cada fase registra duración');
});

await test('drive(Path X): un run GREEN auto-sella la provenance (cambio auditable)', async () => {
  fresh();
  const changeDir = join(TMP, 'openspec', 'changes', 'sealed');
  const r = await drive({ changeDir, request: 'x', complexity: 'simple', domain: 'counter', srcDir: TMP, runAgent: goodAgent });
  eq(r.verdict, 'GREEN');
  const provPath = join(changeDir, 'provenance.json');
  assert(existsSync(provPath), 'provenance.json escrito');
  const doc = JSON.parse(readFileSync(provPath, 'utf8'));
  assert(doc.verdict && doc.signature, 'sello con verdict + firma');
  eq(doc.verdict, r.verdict, 'el verdict del sello COINCIDE con el del pipeline (consistencia gate↔sello)');
});

await test('drive(Path X): modelo por fase NATIVO (planner vs coder) vía CONDUCTOR_MODEL_*', async () => {
  fresh();
  process.env.CONDUCTOR_MODEL_PLANNER = 'fast-model';
  process.env.CONDUCTOR_MODEL_CODER = 'strong-model';
  const seen = {};
  const rec = (a) => { seen[a.phase] = a.model; return goodAgent(a); };
  await drive({ changeDir: join(TMP, 'openspec', 'changes', 'models'), request: 'x', complexity: 'simple', domain: 'counter', srcDir: TMP, runAgent: rec });
  eq(seen.propose, 'fast-model', 'planner usa el modelo rápido');
  eq(seen.spec, 'fast-model', 'planner usa el modelo rápido');
  eq(seen.apply, 'strong-model', 'coder usa el modelo fuerte');
  delete process.env.CONDUCTOR_MODEL_PLANNER; delete process.env.CONDUCTOR_MODEL_CODER;
});

await test('drive(Path X): captura tokens por fase del export OTel de Copilot (best-effort)', async () => {
  fresh();
  const changeDir = join(TMP, 'openspec', 'changes', 'tok');
  const otelAgent = (a) => {
    if (a.otelFile) w(a.otelFile, JSON.stringify({ type: 'span', name: 'invoke_agent', attributes: { 'gen_ai.usage.input_tokens': 1200, 'gen_ai.usage.output_tokens': 340 } }) + '\n');
    return goodAgent(a);
  };
  await drive({ changeDir, request: 'x', complexity: 'simple', domain: 'counter', srcDir: TMP, runAgent: otelAgent });
  const tl = JSON.parse(readFileSync(join(changeDir, '.conductor', 'timeline.json'), 'utf8'));
  const apply = tl.phases.find((p) => p.phase === 'apply');
  eq(apply.tokens, { in: 1200, out: 340 }, 'tokens in/out capturados del OTel');
});

await test('drive(Path X): OTel corrupto o ausente NO rompe (tokens=null)', async () => {
  fresh();
  const changeDir = join(TMP, 'openspec', 'changes', 'tokbad');
  const badOtel = (a) => { if (a.otelFile && a.phase === 'spec') w(a.otelFile, 'esto no es json{{{\n'); return goodAgent(a); };
  const r = await drive({ changeDir, request: 'x', complexity: 'simple', domain: 'counter', srcDir: TMP, runAgent: badOtel });
  eq(r.verdict, 'GREEN', 'el run cierra igual');
  const tl = JSON.parse(readFileSync(join(changeDir, '.conductor', 'timeline.json'), 'utf8'));
  eq(tl.phases.find((p) => p.phase === 'spec').tokens, null, 'corrupto → null, sin crash');
});

await test('drive(Path X): RESUME — un run abortado se reanuda sin re-pagar las fases hechas', async () => {
  fresh();
  const changeDir = join(TMP, 'openspec', 'changes', 'resume');
  // 1ª pasada: el agente falla en spec → ABORTED con propose ya hecho
  const failsSpec = (a) => (a.phase === 'spec' ? Promise.resolve({ code: 0 }) : goodAgent(a));
  const r1 = await drive({ changeDir, request: 'add counter', complexity: 'simple', domain: 'counter', srcDir: TMP, runAgent: failsSpec, maxRetries: 0 });
  eq(r1.verdict, 'ABORTED'); eq(r1.phase, 'spec');
  // 2ª pasada (mismo request): debe REANUDAR — propose NO se vuelve a ejecutar
  const called = [];
  const counting = (a) => { called.push(a.phase); return goodAgent(a); };
  const r2 = await drive({ changeDir, request: 'add counter', complexity: 'simple', domain: 'counter', srcDir: TMP, runAgent: counting });
  eq(r2.verdict, 'GREEN', 'el run reanudado cierra GREEN');
  assert(!called.includes('propose'), `propose NO se re-ejecuta (llamadas: ${called.join(',')})`);
  assert(called.includes('spec') && called.includes('apply'), 'sí ejecuta lo pendiente');
  const tl = JSON.parse(readFileSync(join(changeDir, '.conductor', 'timeline.json'), 'utf8'));
  eq(tl.resumed, true, 'la telemetría marca resumed');
});

await test('drive(Path X): cada GREEN encadena el sello al LEDGER del proyecto (audit trail)', async () => {
  fresh();
  await drive({ changeDir: join(TMP, 'openspec', 'changes', 'l1'), request: 'a', complexity: 'simple', domain: 'counter', srcDir: TMP, runAgent: goodAgent });
  await drive({ changeDir: join(TMP, 'openspec', 'changes', 'l2'), request: 'b', complexity: 'simple', domain: 'counter', srcDir: TMP, runAgent: goodAgent });
  const ledgerPath = join(TMP, 'openspec', 'provenance.ledger.jsonl');
  assert(existsSync(ledgerPath), 'ledger creado');
  const lines = readFileSync(ledgerPath, 'utf8').trim().split('\n');
  eq(lines.length, 2, 'dos sellos encadenados');
  const e2 = JSON.parse(lines[1]);
  eq(e2.seq, 1, 'seq 0-based'); eq(e2.prev, JSON.parse(lines[0]).hash, 'cada entrada ata a la anterior (hash-chain)');
});

await test('drive(Path X): commit por fase OPT-IN (CONDUCTOR_GIT_COMMIT=1) en repo del usuario', async () => {
  const GT = join(dirname(fileURLToPath(import.meta.url)), '.tmp-drive-commit');
  rmSync(GT, { recursive: true, force: true }); mkdirSync(GT, { recursive: true });
  execSync('git init', { cwd: GT, stdio: 'ignore' });
  execSync('git config user.email t@t && git config user.name t', { cwd: GT, stdio: 'ignore', shell: true });
  process.env.CONDUCTOR_GIT_COMMIT = '1';
  const prevCap = process.env.CONDUCTOR_CAPTURE; process.env.CONDUCTOR_CAPTURE = 'git';
  try {
    const r = await drive({ changeDir: join(GT, 'openspec', 'changes', 'c'), request: 'add counter', complexity: 'simple', domain: 'counter', srcDir: GT, runAgent: goodAgent });
    eq(r.verdict, 'GREEN');
    const logOut = execSync('git log --oneline', { cwd: GT, encoding: 'utf8' });
    assert(/conductor\(apply\)/.test(logOut) && /conductor\(propose\)/.test(logOut), `un commit por fase:\n${logOut}`);
  } finally { delete process.env.CONDUCTOR_GIT_COMMIT; process.env.CONDUCTOR_CAPTURE = prevCap; rmSync(GT, { recursive: true, force: true }); }
});

await test('drive(Path X): MCP passthrough por fase — defaults frugales + disable global + enchufar por rol', () => {
  const base = agentArgs('planner', {}, '');
  assert(base.includes('--disable-builtin-mcps') && base.includes('conductor'), 'defaults: builtin y conductor apagados (ahorro)');
  // tool-allowlist por rol (priprity: reducir toolset): planner/reviewer sin shell; coder completo
  assert(base.join(' ').includes('--allow-tool write') && !base.includes('--allow-all-tools'), 'planner: solo write');
  assert(agentArgs('reviewer', {}, '').join(' ').includes('--allow-tool write'), 'reviewer: solo write');
  assert(agentArgs('coder', {}, '').includes('--allow-all-tools'), 'coder: completo (necesita mkdir/convenciones)');
  assert(agentArgs('planner', {}, '', { planner: 'all' }).includes('--allow-all-tools'), 'configurable vía conductor.json allowTools');
  assert(agentArgs('coder', {}, '--mis-flags').join(' ') === '--mis-flags', 'CONDUCTOR_AGENT_ARGS = override total');
  // RCE-safe (auditoría senior 2026-06-17): --additional-mcp-config inyecta JSON arbitrario como argv y,
  // con shell:true, es un vector de RCE-por-config (openspec/conductor.json = entrada NO confiable) →
  // requiere OPT-IN explícito (mcp.allowConfig / CONDUCTOR_ALLOW_MCP_CONFIG=1).
  const aNoOptin = agentArgs('coder', { disable: ['ruidoso'], coder: { postgres: { command: 'npx', args: ['x'] } } }, '');
  assert(aNoOptin.join(' ').includes('--disable-mcp-server ruidoso'), 'disable global del usuario');
  assert(!aNoOptin.includes('--additional-mcp-config'), 'sin opt-in NO se inyecta MCP-config (RCE-por-config gateado)');
  const a = agentArgs('coder', { allowConfig: true, disable: ['ruidoso'], coder: { postgres: { command: 'npx', args: ['x'] } } }, '');
  const i = a.indexOf('--additional-mcp-config');
  assert(i > 0, 'con opt-in (allowConfig) el MCP del dev se enchufa a la fase coder');
  eq(JSON.parse(a[i + 1]).mcpServers.postgres.command, 'npx', 'config JSON bien formada');
  const p = agentArgs('planner', { allowConfig: true, coder: { postgres: {} } }, '');
  assert(!p.includes('--additional-mcp-config'), 'el planner NO recibe el MCP del coder (scoped por rol)');
  // saneo anti-RCE: metacaracteres de shell en allowTools/disable NO llegan al argv (degradan/ignoran)
  const hostile = agentArgs('coder', { disable: ['x" & calc & "'] }, '', { coder: 'all" & calc' });
  assert(!hostile.join(' ').includes('calc'), 'metacaracteres de shell saneados (no RCE-por-config)');
});

await test('scrubSecrets: redacta env key, sk-/Bearer y secretos extra (fuga a /api/raw/events)', () => {
  const out = scrubSecrets('usa sk-0YxiQ_6ivBE_x y Bearer abc.def y ENVKEY99 y BYOKDESCIFRADA', { COPILOT_PROVIDER_API_KEY: 'ENVKEY99' }, ['BYOKDESCIFRADA']);
  assert(!out.includes('sk-0YxiQ_6ivBE_x'), 'redacta la virtual key sk-… (LiteLLM)');
  assert(!out.includes('ENVKEY99'), 'redacta la key del env');
  assert(!out.includes('BYOKDESCIFRADA'), 'redacta el secreto extra (key descifrada de byok.json)');
  assert(out.includes('Bearer «REDACTED»'), 'redacta el header Bearer');
});

await test('drive(Path X): FIX DIRIGIDO — el humano elige qué hallazgos del gate van al fix', async () => {
  fresh();
  const changeDir = join(TMP, 'openspec', 'changes', 'dirfix');
  // spec con requisito sin scenario → gate FAIL en verify → fase fix
  const seenFix = [];
  const agent = (a) => {
    if (a.phase === 'spec') { w(a.writeTo, '## ADDED Requirements\n<!-- id: REQ-A -->\n### Requirement: A\nThe system SHALL a.\n<!-- id: REQ-B -->\n### Requirement: B\nThe system SHALL b.'); return Promise.resolve({ code: 0 }); }
    if (a.phase === 'fix') { seenFix.push(a.prompt); w(a.writeTo.replace(/apply-report\.md$/, 'specs/counter/spec.md'), '## ADDED Requirements\n<!-- id: REQ-A -->\n### Requirement: A\nThe system SHALL a.\n#### Scenario: s\n- **GIVEN** g\n- **WHEN** w\n- **THEN** t'); w(join(TMP, 'src', 'fixed.js'), '// @conductor REQ-A\nexport const f=1;'); return Promise.resolve({ code: 0 }); }
    return goodAgent(a);
  };
  const pauses = [];
  await drive({
    changeDir, request: 'x', complexity: 'simple', domain: 'counter', srcDir: TMP, runAgent: agent, maxRetries: 0,
    pauseAt: [], onPause: (i) => { pauses.push(i); return Promise.resolve(i.before === 'fix' ? { selected: [0] } : {}); },
  });
  const fixPause = pauses.find((p) => p.before === 'fix');
  assert(fixPause && Array.isArray(fixPause.findings) && fixPause.findings.length >= 2, 'la pausa de fix expone los hallazgos del gate');
  assert(fixPause.findings.every((f) => f && typeof f.message === 'string'), 'los hallazgos llegan ESTRUCTURADOS ({message, severity, file}) a la decisión humana');
  assert(seenFix.length >= 1, 'el fix se ejecutó');
  const prompt = seenFix[0];
  // findings ahora ESTRUCTURADOS ({message, severity, file}) hacia la decisión humana → se compara por .message.
  assert(prompt.includes(fixPause.findings[0].message), 'el hallazgo seleccionado SÍ va en el prompt');
  assert(!prompt.includes(fixPause.findings[1].message), 'el hallazgo NO seleccionado queda fuera (fix dirigido)');
});

await test('drive(Path X): LOCK anti-duplicado — un 2º lanzamiento concurrente NO hace nada; lock liberado al acabar', async () => {
  fresh();
  const changeDir = join(TMP, 'openspec', 'changes', 'lockd');
  // lock "vivo" (nuestro propio pid está vivo, pero activeRun ignora el pid propio → simulamos otro proceso con un pid real ajeno: el padre)
  const otherPid = process.ppid || process.pid + 1;
  w(join(changeDir, '.conductor', 'lock.json'), JSON.stringify({ pid: otherPid, startedAt: Date.now() }));
  const called = [];
  const r = await drive({ changeDir, request: 'x', complexity: 'simple', domain: 'counter', srcDir: TMP, runAgent: (a) => { called.push(a.phase); return goodAgent(a); } });
  eq(r.verdict, 'DUPLICATE', 'el duplicado se niega a arrancar');
  eq(called.length, 0, 'no lanzó ni una fase');
  // lock muerto (pid inexistente) → arranca con normalidad y al acabar LIBERA el lock
  w(join(changeDir, '.conductor', 'lock.json'), JSON.stringify({ pid: 999999, startedAt: Date.now() }));
  const r2 = await drive({ changeDir, request: 'x', complexity: 'simple', domain: 'counter', srcDir: TMP, runAgent: goodAgent });
  eq(r2.verdict, 'GREEN', 'lock muerto = se ignora');
  assert(!existsSync(join(changeDir, '.conductor', 'lock.json')), 'lock liberado al terminar');
});

await test('drive(Path X): STOP limpio — conserva lo hecho, marca STOPPED, y el resume retoma después', async () => {
  fresh();
  const changeDir = join(TMP, 'openspec', 'changes', 'stoppable');
  const sig = { requested: false };
  const stopAtSpec = (a) => { if (a.phase === 'spec') sig.requested = true; return goodAgent(a); }; // el usuario pulsa Detener durante spec
  const r1 = await drive({ changeDir, request: 'add counter', complexity: 'simple', domain: 'counter', srcDir: TMP, runAgent: stopAtSpec, stopSignal: sig });
  eq(r1.verdict, 'STOPPED', 'detenido, no GREEN ni ABORTED');
  assert(!existsSync(join(TMP, 'src', 'counter.js')), 'apply NO llegó a ejecutarse');
  const tl = JSON.parse(readFileSync(join(changeDir, '.conductor', 'timeline.json'), 'utf8'));
  eq(tl.verdict, 'STOPPED');
  // reanudar con el mismo comando completa el run sin re-pagar propose
  const called = [];
  const r2 = await drive({ changeDir, request: 'add counter', complexity: 'simple', domain: 'counter', srcDir: TMP, runAgent: (a) => { called.push(a.phase); return goodAgent(a); } });
  // la web del run reanudado debe ver el run COMPLETO: las fases pre-stop heredadas (resumed) + las nuevas
  const tlr = JSON.parse(readFileSync(join(changeDir, '.conductor', 'timeline.json'), 'utf8'));
  const names = tlr.phases.map((p) => p.phase);
  assert(names.indexOf('propose') >= 0 && names.indexOf('propose') < names.indexOf('apply'), 'fases heredadas presentes y en orden: ' + names.join('>'));
  assert(tlr.phases.find((p) => p.phase === 'propose').resumed === true, 'heredadas marcadas resumed');
  eq(r2.verdict, 'GREEN', 'resume tras stop → GREEN');
  assert(!called.includes('propose'), 'propose no se re-paga');
});

await test('drive(Path X): MEZCLA de proveedores por fase — byok:/copilot:/ambiente y telemetría con provider', async () => {
  eq(parseModelSpec('byok:qwen36-msc1'), { model: 'qwen36-msc1', provider: 'byok' });
  eq(parseModelSpec('copilot:claude-sonnet-4.6'), { model: 'claude-sonnet-4.6', provider: 'copilot' });
  eq(parseModelSpec('qwen36-msc2'), { model: 'qwen36-msc2', provider: null });
  fresh();
  process.env.CONDUCTOR_MODEL_PLANNER = 'byok:qwen36-msc1';
  process.env.CONDUCTOR_MODEL_CODER = 'copilot:claude-sonnet-4.6';
  const changeDir = join(TMP, 'openspec', 'changes', 'mix');
  await drive({ changeDir, request: 'x', complexity: 'simple', domain: 'counter', srcDir: TMP, runAgent: goodAgent });
  delete process.env.CONDUCTOR_MODEL_PLANNER; delete process.env.CONDUCTOR_MODEL_CODER;
  const tl = JSON.parse(readFileSync(join(changeDir, '.conductor', 'timeline.json'), 'utf8'));
  const prop = tl.phases.find((p) => p.phase === 'propose'), apply = tl.phases.find((p) => p.phase === 'apply');
  eq([prop.model, prop.provider], ['qwen36-msc1', 'byok'], 'planner en BYOK');
  eq([apply.model, apply.provider], ['claude-sonnet-4.6', 'copilot'], 'coder en catálogo Business — mismo run');
});

await test('drive(Path X): PAUSA de revisión antes de apply/verify (human-in-the-loop) y orden correcto', async () => {
  fresh();
  const events = [];
  const rec = (a) => { events.push('run:' + a.phase); return goodAgent(a); };
  const r = await drive({
    changeDir: join(TMP, 'openspec', 'changes', 'hitl'), request: 'x', complexity: 'simple', domain: 'counter', srcDir: TMP,
    runAgent: rec, pauseAt: ['apply', 'verify'], onPause: (i) => { events.push('pause:' + i.before); return Promise.resolve(); },
  });
  eq(r.verdict, 'GREEN');
  assert(events.indexOf('pause:apply') > events.indexOf('run:spec') && events.indexOf('pause:apply') < events.indexOf('run:apply'), 'pausa DESPUÉS del planning y ANTES de apply');
  // con lentes (default v3) el verify corre como run:verify:<lente> — la pausa va antes de TODAS
  const firstVerifyRun = events.findIndex((e) => e.startsWith('run:verify'));
  assert(events.indexOf('pause:verify') < firstVerifyRun && firstVerifyRun >= 0, 'pausa antes de verify');
  assert(events.filter((e) => e.startsWith('run:verify:')).length >= 3, 'P2: lentes paralelas por defecto en verify');
});

await test('drive(Path X): config del USUARIO (openspec/conductor.json) — modelos por fase sin env ni flags', async () => {
  fresh();
  mkdirSync(join(TMP, 'openspec'), { recursive: true });
  writeFileSync(join(TMP, 'openspec', 'conductor.json'), JSON.stringify({ models: { planner: 'cfg-fast', coder: 'cfg-strong' }, maxRetries: 0 }));
  const seen = {};
  const rec = (a) => { seen[a.phase] = a.model; return goodAgent(a); };
  await drive({ changeDir: join(TMP, 'openspec', 'changes', 'cfg'), request: 'x', complexity: 'simple', domain: 'counter', srcDir: TMP, runAgent: rec });
  eq(seen.propose, 'cfg-fast', 'planner desde la config del usuario');
  eq(seen.apply, 'cfg-strong', 'coder desde la config del usuario');
  // y el env explícito GANA a la config (capas)
  process.env.CONDUCTOR_MODEL_CODER = 'env-wins';
  const seen2 = {};
  await drive({ changeDir: join(TMP, 'openspec', 'changes', 'cfg2'), request: 'y', complexity: 'simple', domain: 'counter', srcDir: TMP, runAgent: (a) => { seen2[a.phase] = a.model; return goodAgent(a); } });
  delete process.env.CONDUCTOR_MODEL_CODER;
  eq(seen2.apply, 'env-wins', 'env explícito > config de usuario');
});

await test('drive(Path X): captura por git status cuando el proyecto es repo (baseline acumulativo)', async () => {
  const GT = join(dirname(fileURLToPath(import.meta.url)), '.tmp-drive-git');
  rmSync(GT, { recursive: true, force: true }); mkdirSync(GT, { recursive: true });
  execSync('git init', { cwd: GT, stdio: 'ignore' });
  const prev = process.env.CONDUCTOR_CAPTURE; process.env.CONDUCTOR_CAPTURE = 'git';
  try {
    const r = await drive({ changeDir: join(GT, 'openspec', 'changes', 'c'), request: 'x', complexity: 'simple', domain: 'counter', srcDir: GT, runAgent: goodAgent });
    eq(r.verdict, 'GREEN', 'captura vía git → GREEN');
    assert(existsSync(join(GT, 'src', 'counter.js')), 'código escrito y detectado por git');
  } finally { process.env.CONDUCTOR_CAPTURE = prev; rmSync(GT, { recursive: true, force: true }); }
});

await test('drive(Path X): captura aunque el agente escriba con RETARDO (settle anti-flush-lag)', async () => {
  fresh();
  const lateApply = (a) => {
    if (a.phase === 'apply' || a.phase === 'fix') { setTimeout(() => w(join(TMP, 'src', 'counter.js'), '// @conductor REQ-COUNTER\nexport let c=0;'), 300); return Promise.resolve({ code: 0 }); }
    return goodAgent(a);
  };
  const r = await drive({ changeDir: join(TMP, 'openspec', 'changes', 'late'), request: 'x', complexity: 'simple', domain: 'counter', srcDir: TMP, runAgent: lateApply });
  eq(r.verdict, 'GREEN', 'el settle captura el write tardío en vez de abortar');
});

rmSync(TMP, { recursive: true, force: true });

await test('drive(v3-P1): nota del humano y MODELO EN CALIENTE — solo para la fase aprobada', async () => {
  fresh();
  const changeDir = join(TMP, 'openspec', 'changes', 'p1');
  const seen = [];
  const r = await drive({
    changeDir, request: 'x', complexity: 'simple', domain: 'counter', srcDir: TMP,
    runAgent: (a) => { seen.push({ phase: a.phase, model: a.model, prompt: a.prompt }); return goodAgent(a); },
    pauseAt: ['apply', 'verify'],
    onPause: (i) => Promise.resolve(i.before === 'apply' ? { note: 'use signals, never BehaviorSubject', model: 'byok:qwen-hot' } : {}),
  });
  eq(r.verdict, 'GREEN');
  const apply = seen.find((s2) => s2.phase === 'apply');
  assert(apply.prompt.includes('USER NOTE') && apply.prompt.includes('never BehaviorSubject'), 'la nota viaja en el prompt de apply');
  eq(apply.model, 'byok:qwen-hot', 'modelo en caliente aplicado a apply');
  const verifies = seen.filter((s2) => s2.phase.startsWith('verify'));
  assert(verifies.every((v) => v.model !== 'byok:qwen-hot'), 'el override NO contamina la fase siguiente');
  assert(verifies.every((v) => !v.prompt.includes('USER NOTE')), 'la nota NO contamina la fase siguiente');
  const tl = JSON.parse(readFileSync(join(changeDir, '.conductor', 'timeline.json'), 'utf8'));
  assert(Array.isArray(tl.approvals) && tl.approvals.some((a) => a.phase === 'apply' && a.via === 'human-web'), 'aprobaciones humanas registradas (AI Act)');
});

await test('drive(v3-P1): CHECKPOINT por fase + rollbackTo — deshacer el apply sin tocar la rama del usuario', async () => {
  fresh();
  const { execSync } = await import('node:child_process');
  const g = (c) => execSync(c, { cwd: TMP, stdio: 'ignore', windowsHide: true });
  g('git init -q'); g('git config user.email t@t'); g('git config user.name t');
  w(join(TMP, 'src', 'a.js'), 'v1-original');
  g('git add -A'); g('git commit -qm base');
  const changeDir = join(TMP, 'openspec', 'changes', 'rb');
  const NL = '\n';
  const agent = (a) => {
    if (a.phase === 'apply') {
      w(join(TMP, 'src', 'a.js'), '// @conductor REQ-COUNTER' + NL + 'v2-editado');
      w(join(TMP, 'src', 'b.js'), '// @conductor REQ-COUNTER' + NL + 'nuevo');
      w(join(TMP, 'src', 'b.test.js'), '// @conductor REQ-COUNTER' + NL + 'test("x",()=>{})');
      return Promise.resolve({ code: 0 });
    }
    return goodAgent(a);
  };
  const r = await drive({ changeDir, request: 'x', complexity: 'simple', domain: 'counter', srcDir: TMP, runAgent: agent });
  eq(r.verdict, 'GREEN');
  assert(existsSync(join(changeDir, '.conductor', 'checkpoints.json')), 'checkpoint guardado');
  assert(readFileSync(join(TMP, 'src', 'a.js'), 'utf8').includes('v2-editado'), 'el apply editó a.js');
  rollbackTo(TMP, changeDir, 'apply');
  eq(readFileSync(join(TMP, 'src', 'a.js'), 'utf8'), 'v1-original', 'rollback: a.js restaurado al estado pre-apply');
  assert(!existsSync(join(TMP, 'src', 'b.js')), 'rollback: el archivo creado por el apply se elimina');
  const head = execSync('git log --oneline', { cwd: TMP, encoding: 'utf8', windowsHide: true }).trim().split(NL);
  eq(head.length, 1, 'cero commits añadidos: HEAD/rama del usuario intactos');
});

await test('drive(v3.1.2): fix que SOLO edita la spec — capturado (el aborto falso del run de Jorge)', async () => {
  fresh();
  const changeDir = join(TMP, 'openspec', 'changes', 'specfix');
  const NL = '\n';
  const badSpec = '## ADDED Requirements' + NL + '<!-- id: REQ-A -->' + NL + '### Requirement: A' + NL + 'The system SHALL a.'; // SIN scenario → gate FAIL
  const goodSpec = badSpec + NL + '#### Scenario: s' + NL + '- **GIVEN** g' + NL + '- **WHEN** w' + NL + '- **THEN** t';
  let fixCalls = 0;
  const agent = (a) => {
    if (a.phase === 'spec') { w(a.writeTo, badSpec); return Promise.resolve({ code: 0 }); }
    if (a.phase === 'fix') {
      fixCalls++;
      // el agente SOLO toca artefactos del change (spec + fix-cycle), nada de src/ — el caso real
      w(join(changeDir, 'specs', 'counter', 'spec.md'), goodSpec);
      w(join(changeDir, 'apply-report.md'), readFileSync(join(changeDir, 'apply-report.md'), 'utf8') + NL + '## Fix Cycle' + NL + 'spec scenarios added');
      return Promise.resolve({ code: 0 });
    }
    return goodAgent(a);
  };
  const r = await drive({ changeDir, request: 'x', complexity: 'simple', domain: 'counter', srcDir: TMP, runAgent: agent, maxRetries: 1 });
  eq(fixCalls, 1, 'el fix corre UNA vez (sin reintentos fantasma)');
  eq(r.verdict, 'GREEN', 'la edición de spec se captura y el run cierra GREEN (antes: ABORTED falso)');
  const tl = JSON.parse(readFileSync(join(changeDir, '.conductor', 'timeline.json'), 'utf8'));
  const fx = tl.phases.find((p) => p.phase === 'fix');
  assert(fx.ok && fx.files.some((f) => f.p.includes('spec.md')), 'el timeline registra la spec editada por el fix');
});
