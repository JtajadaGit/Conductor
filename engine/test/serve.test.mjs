// Tests de la mini-web del run (serve.mjs). Offline: server en 127.0.0.1 con puerto efímero.
import { createRunServer, createProjectServer, listChanges, runState } from '../lib/serving/serve.mjs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { EventEmitter } from 'node:events';

process.env.CONDUCTOR_HOME = join(dirname(fileURLToPath(import.meta.url)), '.tmp-home');
const TMP = join(dirname(fileURLToPath(import.meta.url)), '.tmp-serve');
rmSync(TMP, { recursive: true, force: true }); mkdirSync(TMP, { recursive: true });
const w = (rel, c) => { const p = join(TMP, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, c); };

await test('serve: estado EN CURSO — fases hechas + plan + fase actual (del timeline)', () => {
  w('.conductor/timeline.json', JSON.stringify({ request: 'add counter', complexity: 'simple', verdict: 'running', current: { phase: 'spec', role: 'planner', attempt: 1, startedAt: 1, timeoutMs: 600000 }, phases: [{ phase: 'propose', role: 'planner', ms: 1000, ok: true }] }));
  w('.conductor/state.json', JSON.stringify({ request: 'add counter', status: 'running', idx: 1, phases: ['propose', 'spec', 'apply', 'verify'] }));
  const s = runState(TMP);
  eq(s.verdict, null, 'en curso → sin veredicto');
  eq(s.done, false);
  eq(s.current.phase, 'spec', 'la fase actual viene del timeline (la publica el driver)');
  eq(s.plan.length, 4, 'el plan completo para pintar pendientes');
  eq(s.phases.length, 1, 'una fase completada');
});

await test('serve: la fase EN CURSO viaja con intento/timeout/error (para barra y badges)', () => {
  w('.conductor/timeline.json', JSON.stringify({ request: 'x', verdict: 'running', current: { phase: 'apply', role: 'coder', model: 'm', attempt: 2, maxAttempts: 2, startedAt: 123, timeoutMs: 600000, lastError: 'boom' }, phases: [] }));
  w('.conductor/state.json', JSON.stringify({ status: 'running', idx: 2, phases: ['propose', 'spec', 'apply', 'verify'] }));
  const s = runState(TMP);
  eq(s.current.phase, 'apply'); eq(s.current.attempt, 2); eq(s.current.lastError, 'boom');
  assert(typeof s.now === 'number', 'referencia de reloj del server para elapsed');
});

await test('serve: estado FINAL — verdict y done', () => {
  w('.conductor/timeline.json', JSON.stringify({ request: 'x', verdict: 'GREEN', phases: [{ phase: 'propose', ok: true }, { phase: 'verify', ok: true }] }));
  w('.conductor/state.json', JSON.stringify({ status: 'done', verdict: 'GREEN' }));
  const s = runState(TMP);
  eq(s.verdict, 'GREEN'); eq(s.done, true);
});

await test('serve: aprobación human-in-the-loop — waitApproval se resuelve con POST /api/continue', async () => {
  const srv = await createRunServer({ changeDir: TMP });
  let approved = false;
  const wait = srv.waitApproval({ before: 'apply' }).then(() => { approved = true; });
  const st = await (await fetch(srv.url + 'api/state')).json();
  eq(st.pending, { before: 'apply' }, 'el estado expone la pausa pendiente');
  const res = await fetch(srv.url + 'api/continue', { method: 'POST' });
  eq((await res.json()).ok, true);
  await wait;
  eq(approved, true, 'el botón de la web desbloquea el driver');
  const st2 = await (await fetch(srv.url + 'api/state')).json();
  eq(st2.pending, null, 'pausa limpiada');
  await srv.close();
});

await test('serve: STOP — POST /api/stop activa la señal y desbloquea una pausa hacia el abort', async () => {
  const srv = await createRunServer({ changeDir: TMP });
  eq(srv.stopSignal.requested, false);
  const wait = srv.waitApproval({ before: 'apply' });
  await fetch(srv.url + 'api/stop', { method: 'POST' });
  eq(srv.stopSignal.requested, true, 'señal activada');
  eq(await wait, { stop: true }, 'la pausa se resuelve con stop:true (el driver aborta)');
  const st = await (await fetch(srv.url + 'api/state')).json();
  eq(st.stopRequested, true);
  await srv.close();
});

await test('serve: /api/artifact y /api/diff — confinados y útiles (visibilidad developer)', async () => {
  w('proposal.md', '## Why\ndemo');
  w('.conductor/log.txt', '[09:00:01] ⏳ propose (planner)\n[09:00:45] ✅ propose\n');
  const srv = await createRunServer({ changeDir: TMP, srcDir: TMP });
  const art = await fetch(srv.url + 'api/artifact?p=proposal.md');
  assert((await art.text()).includes('demo'), 'artefacto legible');
  const esc = await fetch(srv.url + 'api/artifact?p=..%2F..%2Fsecreto.txt');
  eq(esc.status, 404, 'path traversal rechazado');
  const noPlumb = await fetch(srv.url + 'api/artifact?p=.conductor%2Fstate.json');
  eq(noPlumb.status, 404, 'la fontanería interna no se sirve como artefacto');
  w('src/nuevo.js', 'export const x=1;');
  const diff = await fetch(srv.url + 'api/diff?p=src/nuevo.js');
  assert((await diff.text()).includes('x=1'), 'diff/contenido de fichero del proyecto');
  const st = await (await fetch(srv.url + 'api/state')).json();
  assert(st.logTail.some((l) => l.includes('propose')), 'el registro del run viaja en el estado');
  await srv.close();
});

await test('serve: el server responde la página y /api/state por HTTP', async () => {
  const srv = await createRunServer({ changeDir: TMP });
  assert(/^http:\/\/127\.0\.0\.1:\d+\/$/.test(srv.url), `url local efímera: ${srv.url}`);
  const html = await (await fetch(srv.url)).text();
  assert(/SIGUE EL RUN|Aprobar|registro del run/.test(html) || /conductor/.test(html), 'página live servida');
  const st = await (await fetch(srv.url + 'api/state')).json();
  eq(st.verdict, 'GREEN', 'estado servido por la API');
  await srv.close();
});

await test('serve: PANEL de proyecto — lista runs, lanza y reanuda por HTTP (spawner inyectado)', async () => {
  const ROOT = join(dirname(fileURLToPath(import.meta.url)), '.tmp-panel');
  rmSync(ROOT, { recursive: true, force: true });
  const ch = join(ROOT, 'openspec', 'changes', 'feature-x', '.conductor');
  mkdirSync(ch, { recursive: true });
  writeFileSync(join(ch, 'timeline.json'), JSON.stringify({ request: 'add feature x', complexity: 'simple', verdict: 'STOPPED', phases: [{ phase: 'propose', ok: true, tokens: { in: 100, out: 10 } }] }));
  const spawned = [];
  const srv = await createProjectServer({ root: ROOT, engine: 'ENGINE.mjs', spawnRun: (a) => { spawned.push(a); return { pid: 123 }; } });
  const d = await (await fetch(srv.url + 'api/changes')).json();
  eq(d.changes.length, 1);
  eq(d.changes[0].name, 'feature-x');
  eq(d.changes[0].verdict, 'STOPPED');
  eq(d.changes[0].resumable, true, 'no-GREEN sin lock → reanudable');
  const l = await (await fetch(srv.url + 'api/launch', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ request: 'new thing', name: 'new-thing', complexity: 'simple' }) })).json();
  eq(l.ok, true);
  eq(spawned[0].name, 'new-thing'); eq(spawned[0].request, 'new thing');
  const r = await (await fetch(srv.url + 'api/resume', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'feature-x' }) })).json();
  eq(r.ok, true);
  eq(spawned[1].request, 'add feature x', 'resume con el MISMO request (clave del resume)');
  eq((await fetch(srv.url + 'api/launch', { method: 'POST', body: '{"request":"x","name":"MAL NOMBRE"}' })).status, 400, 'nombre no-kebab rechazado');
  const html = await (await fetch(srv.url)).text();
  assert(/<!doctype html>/i.test(html), 'el panel responde una página HTML (la UI Vite vive en assets/ui)');
  await srv.close();
  rmSync(ROOT, { recursive: true, force: true });
});

rmSync(TMP, { recursive: true, force: true });

await test('serve: el JS de AMBAS páginas (run + panel) compila — nunca más un "cargando..." mudo', async () => {
  const s1 = await createRunServer({ changeDir: TMP });
  const s2 = await createProjectServer({ root: TMP, engine: 'x' });
  for (const [nm, srv] of [['run', s1], ['panel', s2]]) {
    const html = await (await fetch(srv.url)).text();
    const js = html.match(/<script>([\s\S]*?)<\/script>/)?.[1] || '';
    let err = null; try { new Function(js); } catch (e) { err = e; }
    assert(!err, 'JS de ' + nm + ' con SyntaxError: ' + (err && err.message));
    await srv.close();
  }
});

await test('serve(v3-P0): APP ÚNICA — launch IPC, pausa→continue con nota/modelo, stop, rutas y PWA', async () => {
  const { createAppServer } = await import('../lib/serving/serve.mjs');
  const { EventEmitter } = await import('node:events');
  const ROOT = join(dirname(fileURLToPath(import.meta.url)), '.tmp-app');
  rmSync(ROOT, { recursive: true, force: true });
  mkdirSync(join(ROOT, 'openspec', 'changes'), { recursive: true });
  writeFileSync(join(ROOT, 'openspec', 'conductor.json'), '{}'); // proyecto INICIALIZADO (el gate de gobierno de /api/launch exige init)
  // hijo IPC falso: registra lo que el panel le manda
  const spawned = [];
  const mkChild = (a) => { const c = new EventEmitter(); c.sent = []; c.send = (m) => c.sent.push(m); c.kill = () => {}; c.args = a; spawned.push(c); return c; };
  const srv = await createAppServer({ root: ROOT, engine: 'E.mjs', spawnRun: mkChild });
  // PWA + ping
  const man = await (await fetch(srv.url + 'manifest.json')).json();
  eq(man.display, 'standalone', 'manifest PWA instalable');
  assert((await (await fetch(srv.url + 'api/ping')).json()).ok, 'ping');
  // launch
  const l = await (await fetch(srv.url + 'api/launch', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ request: 'add header', name: 'header-x', complexity: 'simple' }) })).json();
  eq(l.ok, true); assert(/^\/run\/[a-z0-9.-]+~[a-f0-9]{6}\/header-x$/.test(l.url), 'url con proyecto: ' + l.url);
  eq(spawned[0].args.name, 'header-x');
  // duplicado mientras vive el hijo → 409
  eq((await fetch(srv.url + 'api/launch', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"request":"x","name":"header-x"}' })).status, 409, 'anti-duplicado en la app');
  // pausa por IPC → state.pending → continue con nota+modelo → llega al hijo
  spawned[0].emit('message', { t: 'pause', before: 'apply', role: 'coder' });
  let st = await (await fetch(srv.url + 'api/run/header-x/state')).json();
  eq(st.pending.before, 'apply', 'la pausa viaja del hijo a la web');
  await fetch(srv.url + 'api/run/header-x/continue', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ note: 'usa signals', model: 'byok:qwen36-msc2' }) });
  eq(spawned[0].sent[0], { t: 'continue', payload: { note: 'usa signals', model: 'byok:qwen36-msc2' } }, 'nota+modelo llegan al driver por IPC');
  // stop
  await fetch(srv.url + 'api/run/header-x/stop', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  eq(spawned[0].sent[1], { t: 'stop' }, 'stop por IPC');
  // la ruta de run responde una página HTML (la UI Vite vive en assets/ui, ya no inline)
  const runHtml = await (await fetch(srv.url + 'run/header-x')).text();
  assert(/<!doctype html>/i.test(runHtml), 'la ruta de run responde una página HTML');
  // tras exit del hijo → relanzable (resume usa el request del timeline)
  spawned[0].emit('exit', 0);
  mkdirSync(join(ROOT, 'openspec', 'changes', 'header-x', '.conductor'), { recursive: true });
  writeFileSync(join(ROOT, 'openspec', 'changes', 'header-x', '.conductor', 'timeline.json'), JSON.stringify({ request: 'add header', complexity: 'simple', verdict: 'STOPPED', phases: [] }));
  const rs = await (await fetch(srv.url + 'api/resume', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'header-x' }) })).json();
  eq(rs.ok, true, 'resume desde la app');
  eq(spawned[1].args.request, 'add header', 'resume con el MISMO request');
  await srv.close();
  rmSync(ROOT, { recursive: true, force: true });
});

await test('serve(seguridad): /api/launch rechaza ruta ARBITRARIA del FS (no ejecuta donde sea)', async () => {
  const { createAppServer } = await import('../lib/serving/serve.mjs');
  const ROOT = join(dirname(fileURLToPath(import.meta.url)), '.tmp-sec');
  const ARB = join(dirname(fileURLToPath(import.meta.url)), '.tmp-arbitrary'); // dir SIN openspec/ ni .git
  for (const d of [ROOT, ARB]) rmSync(d, { recursive: true, force: true });
  mkdirSync(join(ROOT, 'openspec', 'changes'), { recursive: true });
  mkdirSync(ARB, { recursive: true });
  const spawned = [];
  const srv = await createAppServer({ root: ROOT, engine: 'E.mjs', spawnRun: (a) => { spawned.push(a); const c = Object.assign(new EventEmitter(), { send() {}, kill() {} }); setImmediate(() => c.emit('exit', 0)); return c; } });
  const r = await fetch(srv.url + 'api/launch', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ request: 'x', name: 'sec-x', project: ARB }) });
  eq(r.status, 400, 'ruta sin openspec/.git → 400 (RCE/FS-arbitrario cerrado)');
  eq(spawned.length, 0, 'NO se spawneó ningún driver en la ruta arbitraria');
  await srv.close();
  for (const d of [ROOT, ARB]) rmSync(d, { recursive: true, force: true });
});

await test('serve(v3-P1): editar artefacto por POST — confinado (.md, nunca .conductor)', async () => {
  const { createAppServer } = await import('../lib/serving/serve.mjs');
  const ROOT = join(dirname(fileURLToPath(import.meta.url)), '.tmp-app2');
  rmSync(ROOT, { recursive: true, force: true });
  const ch = join(ROOT, 'openspec', 'changes', 'e-x');
  mkdirSync(join(ch, '.conductor'), { recursive: true });
  writeFileSync(join(ch, 'proposal.md'), 'v1');
  writeFileSync(join(ch, '.conductor', 'state.json'), '{}');
  const srv = await createAppServer({ root: ROOT, engine: 'E.mjs', spawnRun: () => ({ on: () => {}, send: () => {}, kill: () => {} }) });
  const ok = await (await fetch(srv.url + 'api/run/e-x/artifact', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ p: 'proposal.md', content: 'v2 EDITADO' }) })).json();
  eq(ok.ok, true);
  eq(readFileSync(join(ch, 'proposal.md'), 'utf8'), 'v2 EDITADO', 'spec editada desde la web');
  eq((await fetch(srv.url + 'api/run/e-x/artifact', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"p":".conductor/state.json","content":"hack"}' })).status, 400, 'la fontanería NO es editable');
  eq((await fetch(srv.url + 'api/run/e-x/artifact', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"p":"../../../x.md","content":"hack"}' })).status, 400, 'path traversal rechazado');
  await srv.close();
  rmSync(ROOT, { recursive: true, force: true });
});

await test('seguridad: POST cross-site ciego (sin Content-Type JSON / Host ajeno) → 403 en TODA la API', async () => {
  const { createAppServer } = await import('../lib/serving/serve.mjs');
  const srv = await createAppServer({ root: TMP, engine: 'x', spawnRun: () => ({ on: () => {}, send: () => {}, kill: () => {} }) });
  // un <form>/fetch malicioso desde una web llega como text/plain → bloqueado
  const evil = await fetch(srv.url + 'api/launch', { method: 'POST', body: '{"request":"pwn","name":"pwn"}' });
  eq(evil.status, 403, 'POST sin application/json → 403');
  const evil2 = await fetch(srv.url + 'api/shutdown', { method: 'POST', body: '{}' });
  eq(evil2.status, 403, 'shutdown ciego → 403');
  // DNS rebinding: Host ajeno → 403 (fetch no deja falsear Host → http crudo)
  const { request } = await import('node:http');
  const port = new URL(srv.url).port;
  const rebStatus = await new Promise((res2) => {
    const rq = request({ host: '127.0.0.1', port, path: '/api/ping', headers: { Host: 'evil.example.com' } }, (r2) => { r2.resume(); res2(r2.statusCode); });
    rq.on('error', () => res2(0)); rq.end();
  });
  eq(rebStatus, 403, 'Host ajeno → 403');
  // el cliente legítimo (JSON) pasa — TMP inicializado (el launch exige init de gobierno)
  mkdirSync(join(TMP, 'openspec'), { recursive: true }); writeFileSync(join(TMP, 'openspec', 'conductor.json'), '{}');
  const okReq = await fetch(srv.url + 'api/launch', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ request: 'x', name: 'sec-ok' }) });
  eq(okReq.status, 200, 'POST legítimo con JSON pasa');
  await srv.close();
});

await test('seguridad: nombre de archivo hostil en /api/diff no ejecuta nada (sin shell)', async () => {
  const { createAppServer } = await import('../lib/serving/serve.mjs');
  const srv = await createAppServer({ root: TMP, engine: 'x', spawnRun: () => ({ on: () => {}, send: () => {}, kill: () => {} }) });
  const r = await fetch(srv.url + 'api/run/x/diff?p=' + encodeURIComponent('a$(rm -rf x)`touch pwned`.js'));
  assert([200, 404].includes(r.status), 'responde sin reventar');
  const { existsSync } = await import('node:fs');
  assert(!existsSync('pwned'), 'sin ejecución de comandos');
  await srv.close();
});

await test('serve(v4-P2): APP GLOBAL — segundo proyecto vía launch {project}, rutas scoped y registro', async () => {
  const { createAppServer } = await import('../lib/serving/serve.mjs');
  const R1 = join(dirname(fileURLToPath(import.meta.url)), '.tmp-multi-a');
  const R2 = join(dirname(fileURLToPath(import.meta.url)), '.tmp-multi-b');
  for (const r of [R1, R2]) { rmSync(r, { recursive: true, force: true }); mkdirSync(join(r, 'openspec', 'changes'), { recursive: true }); writeFileSync(join(r, 'openspec', 'conductor.json'), '{}'); }
  const spawned = [];
  const srv = await createAppServer({ root: R1, engine: 'E.mjs', spawnRun: (a) => { spawned.push(a); return { on: () => {}, send: () => {}, kill: () => {} }; } });
  // lanzar en el SEGUNDO proyecto (no el default) — se registra solo
  const l = await (await fetch(srv.url + 'api/launch', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ request: 'algo', name: 'feat-b', project: R2 }) })).json();
  eq(l.ok, true);
  assert(/^\/run\/[a-z0-9.-]+~[a-f0-9]{6}\/feat-b$/.test(l.url), 'url scoped al proyecto B: ' + l.url);
  eq(spawned[0].root, R2, 'el driver corre con el ROOT del proyecto B');
  // /api/changes agrupa ambos
  const d = await (await fetch(srv.url + 'api/changes')).json();
  assert(d.projects.length >= 2, 'registro con 2 proyectos: ' + d.projects.length);
  // ping anuncia proyectos (para el launcher)
  const ping = await (await fetch(srv.url + 'api/ping')).json();
  assert(Array.isArray(ping.projects) && ping.projects.length >= 2, 'ping con proyectos');
  // state por ruta scoped funciona
  const pid = l.url.split('/')[2];
  mkdirSync(join(R2, 'openspec', 'changes', 'feat-b', '.conductor'), { recursive: true });
  writeFileSync(join(R2, 'openspec', 'changes', 'feat-b', '.conductor', 'timeline.json'), JSON.stringify({ request: 'algo', verdict: 'GREEN', phases: [] }));
  const st = await (await fetch(srv.url + 'api/run/' + pid + '/feat-b/state')).json();
  eq(st.verdict, 'GREEN', 'state por ruta con proyecto');
  await srv.close();
  for (const r of [R1, R2]) rmSync(r, { recursive: true, force: true });
});

await test('serve(v3.12): RESUME por ruta scoped /api/run/<pid>/<change>/resume usa la firma correcta de launch(proj,name,…)', async () => {
  const { createAppServer } = await import('../lib/serving/serve.mjs');
  const R = join(dirname(fileURLToPath(import.meta.url)), '.tmp-resume-scoped');
  rmSync(R, { recursive: true, force: true });
  mkdirSync(join(R, 'openspec', 'changes', 'feat-r', '.conductor'), { recursive: true });
  writeFileSync(join(R, 'openspec', 'changes', 'feat-r', '.conductor', 'timeline.json'), JSON.stringify({ request: 'reanuda esto', complexity: 'simple', domain: 'feat', verdict: 'STOPPED', phases: [] }));
  const spawned = [];
  const srv = await createAppServer({ root: R, engine: 'E.mjs', spawnRun: (a) => { spawned.push(a); return { on: () => {}, send: () => {}, kill: () => {} }; } });
  // selecciona el proyecto POR ROOT (no projects[0]): el registro persistido en CONDUCTOR_HOME acumula
  // proyectos de otros tests/runs, así que projects[0] no es fiablemente este → resume al proyecto equivocado.
  const pid = (await (await fetch(srv.url + 'api/ping')).json()).projects.find((p) => /[\\/]\.tmp-resume-scoped$/.test(p.root)).id;
  const rs = await (await fetch(srv.url + 'api/run/' + pid + '/feat-r/resume', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).json();
  eq(rs.ok, true, 'resume scoped responde ok');
  eq(spawned.length, 1, 'lanzó el driver');
  eq(spawned[0].root, R, 'el driver corre con el ROOT del proyecto (no undefined → confirma launch(proj,name,…))');
  eq(spawned[0].name, 'feat-r', 'con el nombre del change');
  eq(spawned[0].request, 'reanuda esto', 'con el request heredado del timeline');
  await srv.close();
  rmSync(R, { recursive: true, force: true });
});

await test('serve(#63): proyecto con SOLO openspec/conductor.json (sin config.yaml) cuenta como SDD (openspec:true)', async () => {
  const { createAppServer } = await import('../lib/serving/serve.mjs');
  const R = join(dirname(fileURLToPath(import.meta.url)), '.tmp-sdd-detect');
  rmSync(R, { recursive: true, force: true });
  mkdirSync(join(R, 'openspec', 'changes'), { recursive: true });
  writeFileSync(join(R, 'openspec', 'conductor.json'), JSON.stringify({ maxRetries: 0 })); // conductor.json, SIN config.yaml
  assert(!existsSync(join(R, 'openspec', 'config.yaml')), 'precondición: el proyecto NO tiene config.yaml');
  const srv = await createAppServer({ root: R, engine: 'E.mjs', spawnRun: () => ({ on: () => {}, send: () => {}, kill: () => {} }) });
  const d = await (await fetch(srv.url + 'api/changes')).json();
  assert(d.projects.some((p) => /[\\/]\.tmp-sdd-detect$/.test(p.root) && p.openspec === true), 'conductor.json basta para marcar el proyecto como SDD (fuente de verdad ejecutable única)');
  await srv.close();
  rmSync(R, { recursive: true, force: true });
});

await test('serve(#69): GET /api/explain devuelve borrador de spec por ingeniería inversa (0 LLM, 0 red)', async () => {
  const { createAppServer } = await import('../lib/serving/serve.mjs');
  const R = join(dirname(fileURLToPath(import.meta.url)), '.tmp-explain');
  rmSync(R, { recursive: true, force: true });
  mkdirSync(join(R, 'src'), { recursive: true });
  writeFileSync(join(R, 'src', 'api.js'), "app.get('/users', (req,res)=>res.json([]));\napp.post('/users', (req,res)=>{});");
  const srv = await createAppServer({ root: R, engine: 'E.mjs', spawnRun: () => ({ on() {}, send() {}, kill() {} }) });
  const d = await (await fetch(srv.url + 'api/explain')).json(); // sin projectId → proyecto default = R
  eq(d.ok, true);
  assert(d.capabilities.length >= 1, 'extrae al menos una capacidad');
  assert(typeof d.capabilities[0].files === 'number', 'devuelve CONTEOS, no el array files[] (token-first)');
  assert(/## ADDED Requirements/.test(d.specDraft), 'el borrador es un delta spec');
  await srv.close();
  rmSync(R, { recursive: true, force: true });
});

await test('serve(#69): POST archive — GREEN promueve+mueve; no-GREEN → 409', async () => {
  const { createAppServer } = await import('../lib/serving/serve.mjs');
  const R = join(dirname(fileURLToPath(import.meta.url)), '.tmp-arch-ep');
  rmSync(R, { recursive: true, force: true });
  const ch = join(R, 'openspec', 'changes', 'feat-x');
  mkdirSync(join(ch, '.conductor'), { recursive: true });
  writeFileSync(join(ch, '.conductor', 'timeline.json'), JSON.stringify({ verdict: 'GREEN', request: 'x', phases: [] }));
  mkdirSync(join(ch, 'specs', 'auth'), { recursive: true });
  writeFileSync(join(ch, 'specs', 'auth', 'spec.md'), '## ADDED Requirements\n\n### Requirement: Login\nThe system SHALL log in.\n#### Scenario: s\n- **GIVEN** a\n- **WHEN** b\n- **THEN** c\n');
  const srv = await createAppServer({ root: R, engine: 'E.mjs', spawnRun: () => ({ on() {}, send() {}, kill() {} }) });
  const pid = (await (await fetch(srv.url + 'api/ping')).json()).projects.find((p) => /[\\/]\.tmp-arch-ep$/.test(p.root)).id;
  const r = await (await fetch(srv.url + 'api/run/' + pid + '/feat-x/archive', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).json();
  eq(r.ok, true, 'archiva un change GREEN');
  assert(/-feat-x$/.test(r.archivedDir), 'mueve a archive/<fecha>-feat-x');
  assert(!existsSync(ch), 'el change se movió fuera de changes/');
  assert(existsSync(join(R, 'openspec', 'specs', 'auth', 'spec.md')), 'promovió el delta spec a openspec/specs/');
  const ch2 = join(R, 'openspec', 'changes', 'feat-y');
  mkdirSync(join(ch2, '.conductor'), { recursive: true });
  writeFileSync(join(ch2, '.conductor', 'timeline.json'), JSON.stringify({ verdict: 'NOT_GREEN', request: 'y', phases: [] }));
  const r2 = await fetch(srv.url + 'api/run/' + pid + '/feat-y/archive', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  eq(r2.status, 409, 'un change no-GREEN no se archiva (409)');
  await srv.close();
  rmSync(R, { recursive: true, force: true });
});

await test('serve(P0): /api/launch propaga el preset de gobierno al driver; uno inválido se ignora; /api/estimate lo propone', async () => {
  const { createAppServer } = await import('../lib/serving/serve.mjs');
  const R = join(dirname(fileURLToPath(import.meta.url)), '.tmp-preset-wire');
  rmSync(R, { recursive: true, force: true });
  mkdirSync(join(R, 'openspec', 'changes'), { recursive: true });
  writeFileSync(join(R, 'openspec', 'conductor.json'), '{}'); // proyecto INICIALIZADO (gate de gobierno)
  const spawned = [];
  const srv = await createAppServer({ root: R, engine: 'E.mjs', spawnRun: (a) => { spawned.push(a); const c = Object.assign(new EventEmitter(), { send() {}, kill() {} }); setImmediate(() => c.emit('exit', 0)); return c; } });
  // preset VÁLIDO viaja al spawn del driver (el dial deja de estar muerto en la UI)
  const l = await (await fetch(srv.url + 'api/launch', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ request: 'migrar tabla', name: 'mig-x', complexity: 'complex', preset: 'migration' }) })).json();
  eq(l.ok, true);
  eq(spawned[0].preset, 'migration', 'el dial de gobierno llega al driver vía launch→spawnRun');
  // preset DESCONOCIDO se ignora (cae a conductor.json/defaults) — tolerante, no rompe el launch
  const l2 = await (await fetch(srv.url + 'api/launch', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ request: 'x', name: 'inv-x', preset: 'no-existe' }) })).json();
  eq(l2.ok, true);
  eq(spawned[1].preset, undefined, 'un nombre de preset desconocido NO se propaga');
  // /api/estimate devuelve un PLAN DE ACCIONES + comprobaciones activadas por contenido (sin buckets de talla)
  const est = await (await fetch(srv.url + 'api/estimate?request=' + encodeURIComponent('migrar la tabla de clientes al nuevo esquema'))).json();
  assert(Array.isArray(est.actions) && est.actions.length > 0, 'el estimate devuelve ACCIONES (no una etiqueta de talla)');
  assert((est.checks || []).some((c) => c.id === 'datos' && c.why), 'el plan activa la comprobación de datos por el contenido (migrar/tabla), con su porqué');
  await srv.close();
  rmSync(R, { recursive: true, force: true });
});

await test('serve(checkboxes): /api/launch propaga el pipeline POR-RUN al driver; fases basura se filtran', async () => {
  const { createAppServer } = await import('../lib/serving/serve.mjs');
  const R = join(dirname(fileURLToPath(import.meta.url)), '.tmp-pipeline-wire');
  rmSync(R, { recursive: true, force: true });
  mkdirSync(join(R, 'openspec', 'changes'), { recursive: true });
  writeFileSync(join(R, 'openspec', 'conductor.json'), '{}'); // proyecto INICIALIZADO (gate de gobierno)
  const spawned = [];
  const srv = await createAppServer({ root: R, engine: 'E.mjs', spawnRun: (a) => { spawned.push(a); const c = Object.assign(new EventEmitter(), { send() {}, kill() {} }); setImmediate(() => c.emit('exit', 0)); return c; } });
  // las fases elegidas en los checkboxes viajan al driver; las desconocidas se SANEAN (allowlist KNOWN_PHASES)
  const l = await (await fetch(srv.url + 'api/launch', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ request: 'algo', name: 'pp-x', complexity: 'medium', pipeline: ['explore', 'spec', 'apply', 'verify', 'rm-rf', 'eval'] }) })).json();
  eq(l.ok, true);
  eq(spawned[0].pipeline, ['explore', 'spec', 'apply', 'verify'], 'el pipeline elegido llega al driver, saneado a fases conocidas');
  // sin pipeline → undefined (el motor cae al plan por complejidad; nunca un array vacío)
  const l2 = await (await fetch(srv.url + 'api/launch', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ request: 'x', name: 'pp-none', complexity: 'simple' }) })).json();
  eq(l2.ok, true);
  eq(spawned[1].pipeline, undefined, 'sin checkboxes no se fuerza pipeline (plan determinista por complejidad)');
  await srv.close();
  rmSync(R, { recursive: true, force: true });
});

await test('serve(test-toggle): /api/launch propaga runTests al driver; /api/estimate expone el testCmd (verify por ejecución)', async () => {
  const { createAppServer } = await import('../lib/serving/serve.mjs');
  const R = join(dirname(fileURLToPath(import.meta.url)), '.tmp-runtests-wire');
  rmSync(R, { recursive: true, force: true });
  mkdirSync(join(R, 'openspec', 'changes'), { recursive: true });
  // cfg.checks declarados → el estimate los muestra como testCmd (consentimiento informado del toggle "test")
  writeFileSync(join(R, 'openspec', 'conductor.json'), JSON.stringify({ checks: ['npm test', 'npm run build'] }));
  const spawned = [];
  const srv = await createAppServer({ root: R, engine: 'E.mjs', spawnRun: (a) => { spawned.push(a); const c = Object.assign(new EventEmitter(), { send() {}, kill() {} }); setImmediate(() => c.emit('exit', 0)); return c; } });
  // el toggle "test" (ejecutar pruebas reales tras el gate) viaja al driver como runTests
  const l = await (await fetch(srv.url + 'api/launch', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ request: 'algo', name: 'rt-x', complexity: 'simple', runTests: true }) })).json();
  eq(l.ok, true);
  eq(spawned[0].runTests, true, 'runTests llega al driver vía launch→spawnRun');
  // sin el toggle → runTests false (no se ejecutan pruebas reales por defecto)
  const l2 = await (await fetch(srv.url + 'api/launch', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ request: 'x', name: 'rt-none', complexity: 'simple' }) })).json();
  eq(l2.ok, true);
  eq(spawned[1].runTests, false, 'sin toggle no se ejecutan pruebas reales (default seguro)');
  // /api/estimate expone el comando de pruebas para habilitar el toggle y mostrar QUÉ se ejecutará
  const est = await (await fetch(srv.url + 'api/estimate?request=' + encodeURIComponent('algo'))).json();
  eq(est.testCmd, 'npm test && npm run build', 'el estimate refleja los checks del proyecto como testCmd (consentimiento informado)');
  await srv.close();
  rmSync(R, { recursive: true, force: true });
});

await test('serve(coherencia): /api/launch RECHAZA un proyecto sin init (needsInit); tras Inicializar, pasa — gating ejecución == visibilidad', async () => {
  const { createAppServer } = await import('../lib/serving/serve.mjs');
  const R = join(dirname(fileURLToPath(import.meta.url)), '.tmp-init-gate');
  rmSync(R, { recursive: true, force: true });
  mkdirSync(join(R, '.git'), { recursive: true }); // tiene .git (pasa el gate de SEGURIDAD) pero NO openspec (sin init)
  const spawned = [];
  const srv = await createAppServer({ root: R, engine: 'E.mjs', spawnRun: (a) => { spawned.push(a); const c = Object.assign(new EventEmitter(), { send() {}, kill() {} }); setImmediate(() => c.emit('exit', 0)); return c; } });
  // SIN init: el motor crearía openspec/changes a medias y correría sin gobierno → ahora se RECHAZA
  const r = await fetch(srv.url + 'api/launch', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ request: 'algo', name: 'ng-x', complexity: 'simple' }) });
  eq(r.status, 400, 'sin init → 400 (no se lanza sobre proyecto sin gobierno)');
  const j = await r.json();
  eq(j.needsInit, true, 'el server marca needsInit para que la web ofrezca "Inicializar"');
  eq(spawned.length, 0, 'no se spawneó ningún driver');
  // tras inicializar desde la web (POST /api/init), el MISMO launch pasa
  const i = await (await fetch(srv.url + 'api/init', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).json();
  eq(i.ok, true, 'init crea openspec/conductor.json');
  const r2 = await (await fetch(srv.url + 'api/launch', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ request: 'algo', name: 'ng-x', complexity: 'simple' }) })).json();
  eq(r2.ok, true, 'inicializado → el launch pasa (gating ejecución == visibilidad)');
  eq(spawned.length, 1, 'ahora sí spawnea el driver');
  await srv.close();
  rmSync(R, { recursive: true, force: true });
});

await test('serve(byok): byokChildEnv elimina las COPILOT_PROVIDER_* heredadas cuando hay byok.json (fuente única, anti creds cruzadas)', async () => {
  const { byokChildEnv } = await import('../lib/serving/serve.mjs');
  const H = join(dirname(fileURLToPath(import.meta.url)), '.tmp-byok-home');
  rmSync(H, { recursive: true, force: true }); mkdirSync(H, { recursive: true });
  const saved = process.env.CONDUCTOR_HOME; process.env.CONDUCTOR_HOME = H;
  try {
    const base = { COPILOT_PROVIDER_BASE_URL: 'https://sesionA/v1', COPILOT_PROVIDER_API_KEY: 'sk-SESION-A', PATH: 'x' };
    // SIN byok.json: se conserva el env (compat durante la transición)
    eq(byokChildEnv(base).COPILOT_PROVIDER_API_KEY, 'sk-SESION-A', 'sin byok.json se hereda el env de la sesión');
    // CON byok.json: se ELIMINAN las creds heredadas → el hijo cae a byok.json (global), no a la sesión que arrancó la app
    writeFileSync(join(H, 'byok.json'), JSON.stringify({ baseUrl: 'https://global/v1', apiKey: 'sk-GLOBAL' }));
    const e2 = byokChildEnv(base);
    eq(e2.COPILOT_PROVIDER_API_KEY, undefined, 'con byok.json NO se hereda la key de la sesión que arrancó la app (#2 arreglado)');
    eq(e2.COPILOT_PROVIDER_BASE_URL, undefined, 'tampoco la baseUrl heredada');
    eq(e2.PATH, 'x', 'el resto del env se conserva intacto');
  } finally { if (saved === undefined) delete process.env.CONDUCTOR_HOME; else process.env.CONDUCTOR_HOME = saved; rmSync(H, { recursive: true, force: true }); }
});

await test('serve(multi-foco): /api/changes lleva projectId estable; /api/register registra+enfoca B conscientemente (serve B)', async () => {
  const { createAppServer } = await import('../lib/serving/serve.mjs');
  const R1 = join(dirname(fileURLToPath(import.meta.url)), '.tmp-focus-a');
  const R2 = join(dirname(fileURLToPath(import.meta.url)), '.tmp-focus-b');
  for (const r of [R1, R2]) { rmSync(r, { recursive: true, force: true }); mkdirSync(join(r, 'openspec', 'changes'), { recursive: true }); }
  writeFileSync(join(R1, 'openspec', 'conductor.json'), '{}'); // R1 inicializado
  mkdirSync(join(R2, '.git'), { recursive: true }); // R2 con .git pero SIN init
  const srv = await createAppServer({ root: R1, engine: 'E.mjs', spawnRun: () => ({ on() {}, send() {}, kill() {} }) });
  // /api/changes devuelve el projectId ESTABLE del proyecto servido (R1) — el panel fija el activo por ID, no por nombre
  const d = await (await fetch(srv.url + 'api/changes')).json();
  assert(d.projectId && d.projects.some((p) => p.id === d.projectId && /[\\/]\.tmp-focus-a$/.test(p.root)), 'projectId estable del proyecto servido');
  // /api/register (serve B): registra R2 conscientemente y avisa si necesita init
  const reg = await (await fetch(srv.url + 'api/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ project: R2 }) })).json();
  eq(reg.ok, true); eq(reg.openspec, false, 'R2 registrado pero sin init → la web ofrecerá Inicializar');
  const d2 = await (await fetch(srv.url + 'api/changes')).json();
  assert(d2.projects.some((p) => p.id === reg.id && /[\\/]\.tmp-focus-b$/.test(p.root)), 'R2 en el registro tras serve B (registro consciente)');
  // ruta arbitraria/inexistente → rechazada (mismo gate de seguridad que launch)
  eq((await fetch(srv.url + 'api/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ project: join(R1, 'noexiste') }) })).status, 400, 'ruta inexistente rechazada');
  await srv.close();
  rmSync(R1, { recursive: true, force: true }); rmSync(R2, { recursive: true, force: true });
});

await test('serve(P0): el RESUME reusa el preset de gobierno persistido en el timeline', async () => {
  const { createAppServer } = await import('../lib/serving/serve.mjs');
  const R = join(dirname(fileURLToPath(import.meta.url)), '.tmp-preset-resume');
  rmSync(R, { recursive: true, force: true });
  mkdirSync(join(R, 'openspec', 'changes', 'mig-r', '.conductor'), { recursive: true });
  writeFileSync(join(R, 'openspec', 'changes', 'mig-r', '.conductor', 'timeline.json'), JSON.stringify({ request: 'reanuda migración', complexity: 'complex', domain: 'mig', verdict: 'STOPPED', preset: { name: 'migration', label: 'Gran migración' }, phases: [] }));
  const spawned = [];
  const srv = await createAppServer({ root: R, engine: 'E.mjs', spawnRun: (a) => { spawned.push(a); const c = Object.assign(new EventEmitter(), { send() {}, kill() {} }); setImmediate(() => c.emit('exit', 0)); return c; } });
  const rs = await (await fetch(srv.url + 'api/resume', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'mig-r' }) })).json();
  eq(rs.ok, true);
  eq(spawned[0].preset, 'migration', 'el resume reusa el preset de gobierno del timeline (no degrada a laxo)');
  await srv.close();
  rmSync(R, { recursive: true, force: true });
});

await test('serve(#74): POST /api/init scaffold SDD nativo (conductor.json + .copilotignore), idempotente', async () => {
  const { createAppServer } = await import('../lib/serving/serve.mjs');
  const R = join(dirname(fileURLToPath(import.meta.url)), '.tmp-init-ep');
  rmSync(R, { recursive: true, force: true });
  mkdirSync(R, { recursive: true }); // proyecto SIN openspec
  const srv = await createAppServer({ root: R, engine: 'E.mjs', spawnRun: () => ({ on() {}, send() {}, kill() {} }) });
  const r = await (await fetch(srv.url + 'api/init', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).json();
  eq(r.ok, true); eq(r.created, true, 'crea conductor.json la 1ª vez');
  assert(existsSync(join(R, 'openspec', 'conductor.json')), 'conductor.json creado');
  assert(existsSync(join(R, 'openspec', 'config.yaml')), 'config.yaml (metadata) creado — init ATÓMICO #6, no dos scaffolds');
  assert(existsSync(join(R, '.copilotignore')), '.copilotignore creado en el root del proyecto');
  const r2 = await (await fetch(srv.url + 'api/init', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).json();
  eq(r2.created, false, 'idempotente: no recrea conductor.json del usuario');
  await srv.close();
  rmSync(R, { recursive: true, force: true });
});
