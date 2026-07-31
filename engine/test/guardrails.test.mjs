// guardrails.test.mjs — barandillas de aislamiento de runs (paridad+ con la herramienta de referencia de workflows):
//  1) UN run ACTIVO por repo: lanzar/reanudar OTRO cambio del mismo proyecto se REHÚSA (comparten el working tree src/
//     → dos a la vez se pisarían; en vez de "undefined behavior" como su modo shared, lo bloqueamos del todo).
//  2) preflight de árbol SUCIO: un run FRESCO sobre un working tree con cambios sin commitear marca dirtyTreeAtStart
//     (atribución honesta del diff; NO bloquea — el experto manda).
import { createAppServer } from '../lib/serving/serve.mjs'; // la app REAL multi-proyecto (runs Map + IPC), donde vive el guardrail
import { drive } from '../lib/pipeline/drive.mjs';
import { plumbPath } from '../lib/core/plumb.mjs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
process.env.CONDUCTOR_CAPTURE = 'fs';
if (!process.env.CONDUCTOR_HOME) process.env.CONDUCTOR_HOME = join(HERE, '.tmp-home');
const w2 = (abs, c) => { mkdirSync(dirname(abs), { recursive: true }); writeFileSync(abs, c); };

// ── 1) UN run activo por repo (señal AUTORITATIVA = activeRun/lock con pid vivo, no el flag del Map) ──
await test('guardrail: con un driver VIVO en el repo, lanzar/reanudar OTRO cambio → 409; al liberar el lock, ya pasa', async () => {
  const ROOT = join(HERE, '.tmp-guard-repo');
  rmSync(ROOT, { recursive: true, force: true });
  mkdirSync(plumbPath(join(ROOT, 'openspec', 'changes', 'feat-a')), { recursive: true });
  writeFileSync(join(ROOT, 'openspec', 'conductor.json'), '{}'); // proyecto SDD (pasa el gate de init)
  // simula un DRIVER VIVO en feat-a: un proceso real (pid vivo ≠ self) + su lock.json (lo que escribe takeLock del driver)
  const linger = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1e9)'], { stdio: 'ignore' });
  const lockA = plumbPath(join(ROOT, 'openspec', 'changes', 'feat-a'), 'lock.json');
  writeFileSync(lockA, JSON.stringify({ pid: linger.pid, startedAt: Date.now(), request: 'feature a' }));
  const spawned = [];
  const srv = await createAppServer({ root: ROOT, engine: 'ENGINE.mjs', spawnRun: (a) => { spawned.push(a); return { on() {}, send() {}, kill() {} }; } });
  const post = (path, body) => fetch(srv.url + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  try {
    // lanzar OTRO cambio (feat-b) con feat-a VIVO → 409 (comparten src/)
    const bRes = await post('api/launch', { request: 'feature b', name: 'feat-b' });
    eq(bRes.status, 409, 'un 2º run en el MISMO repo se rehúsa mientras otro driver está vivo');
    const b = await bRes.json();
    eq(b.busyProject, true, 'el motivo es el working tree compartido');
    assert(/feat-a/.test(b.url || ''), 'apunta al run activo para abrirlo');
    eq(spawned.length, 0, 'el 2º driver NO se llegó a spawnear');
    // reanudar feat-b con feat-a vivo también se rehúsa (necesita timeline del cambio a reanudar)
    w2(plumbPath(join(ROOT, 'openspec', 'changes', 'feat-b'), 'timeline.json'), JSON.stringify({ request: 'feature b', complexity: 'simple', verdict: 'STOPPED', phases: [] }));
    eq((await post('api/resume', { name: 'feat-b' })).status, 409, 'reanudar otro cambio con un driver vivo también se rehúsa');
    // cuando feat-a TERMINA, su driver BORRA el lock (releaseLock) → activeRun pasa a falso → feat-b YA arranca (sin falso-bloqueo)
    rmSync(lockA, { force: true });
    eq((await post('api/launch', { request: 'feature b', name: 'feat-b' })).status, 200, 'liberado el lock de feat-a, feat-b arranca (la señal es el lock, no un flag rezagado)');
  } finally { try { linger.kill(); } catch {} await srv.close(); rmSync(ROOT, { recursive: true, force: true }); }
});

// ── 2) preflight de árbol sucio ──
const git = (cwd, ...args) => execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });
const coherentAgent = () => (a) => {
  const { phase, writeTo, cwd } = a;
  if (phase === 'apply' || phase === 'fix') { w2(join(cwd, 'src', 'c.js'), '// @conductor REQ-C\nexport const x = 1;'); w2(join(cwd, 'src', 'c.test.js'), '// @conductor REQ-C\ntest("c", () => {});'); return Promise.resolve({ code: 0 }); }
  const content = { propose: '## Why\nx\n## What Changes\n- a\n## Impact\nx', spec: '## ADDED Requirements\n<!-- id: REQ-C -->\n### Requirement: C\nThe system SHALL c.\n#### Scenario: s\n- **GIVEN** a\n- **WHEN** b\n- **THEN** c' }[phase] || 'x';
  w2(writeTo, content); return Promise.resolve({ code: 0 });
};
const setupRepo = (name) => {
  const ROOT = join(HERE, name);
  rmSync(ROOT, { recursive: true, force: true }); mkdirSync(join(ROOT, 'openspec'), { recursive: true });
  writeFileSync(join(ROOT, 'openspec', 'conductor.json'), JSON.stringify({ maxRetries: 0, lenses: false, serve: false }));
  git(ROOT, 'init'); git(ROOT, 'config', 'user.email', 't@t'); git(ROOT, 'config', 'user.name', 't');
  writeFileSync(join(ROOT, 'base.txt'), 'base'); git(ROOT, 'add', '-A'); git(ROOT, 'commit', '-m', 'base');
  return ROOT;
};
const tlOf = (root, name) => JSON.parse(readFileSync(plumbPath(join(root, 'openspec', 'changes', name), 'timeline.json'), 'utf8'));

await test('guardrail: preflight árbol SUCIO — run fresco sobre cambios sin commitear → dirtyTreeAtStart=true', async () => {
  const ROOT = setupRepo('.tmp-guard-dirty');
  writeFileSync(join(ROOT, 'pre-existing.txt'), 'cambio ajeno sin commitear'); // ← árbol SUCIO antes del run
  await drive({ changeDir: join(ROOT, 'openspec', 'changes', 'dirty'), request: 'x', complexity: 'simple', domain: 'c', srcDir: ROOT, runAgent: coherentAgent() });
  eq(tlOf(ROOT, 'dirty').dirtyTreeAtStart, true, 'un run fresco sobre árbol sucio marca dirtyTreeAtStart');
  rmSync(ROOT, { recursive: true, force: true });
});

await test('guardrail: preflight árbol LIMPIO → SIN dirtyTreeAtStart (cero ruido)', async () => {
  const ROOT = setupRepo('.tmp-guard-clean'); // todo commiteado → árbol limpio
  await drive({ changeDir: join(ROOT, 'openspec', 'changes', 'clean'), request: 'x', complexity: 'simple', domain: 'c', srcDir: ROOT, runAgent: coherentAgent() });
  eq(tlOf(ROOT, 'clean').dirtyTreeAtStart ?? null, null, 'árbol limpio → flag ausente');
  rmSync(ROOT, { recursive: true, force: true });
});
