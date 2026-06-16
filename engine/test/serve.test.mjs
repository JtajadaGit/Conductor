// Tests de la mini-web del run (serve.mjs). Offline: server en 127.0.0.1 con puerto efímero.
import { createRunServer, createProjectServer, listChanges, runState } from '../lib/serve.mjs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';

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
  assert(/Lanzar run/.test(html), 'página del panel servida');
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
  const { createAppServer } = await import('../lib/serve.mjs');
  const { EventEmitter } = await import('node:events');
  const ROOT = join(dirname(fileURLToPath(import.meta.url)), '.tmp-app');
  rmSync(ROOT, { recursive: true, force: true });
  mkdirSync(join(ROOT, 'openspec', 'changes'), { recursive: true });
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
  // página del run con API parametrizada + JS compila
  const runHtml = await (await fetch(srv.url + 'run/header-x')).text();
  assert(runHtml.includes('v-run') && runHtml.includes('v-panel'), 'el shell SPA contiene ambas vistas');
  let err = null; try { new Function(runHtml.match(/<script>([\s\S]*?)<\/script>/)[1]); } catch (e) { err = e; }
  assert(!err, 'JS de /run/<name> compila: ' + (err && err.message));
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

await test('serve(v3-P1): editar artefacto por POST — confinado (.md, nunca .conductor)', async () => {
  const { createAppServer } = await import('../lib/serve.mjs');
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
  const { createAppServer } = await import('../lib/serve.mjs');
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
  // el cliente legítimo (JSON) pasa
  const okReq = await fetch(srv.url + 'api/launch', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ request: 'x', name: 'sec-ok' }) });
  eq(okReq.status, 200, 'POST legítimo con JSON pasa');
  await srv.close();
});

await test('seguridad: nombre de archivo hostil en /api/diff no ejecuta nada (sin shell)', async () => {
  const { createAppServer } = await import('../lib/serve.mjs');
  const srv = await createAppServer({ root: TMP, engine: 'x', spawnRun: () => ({ on: () => {}, send: () => {}, kill: () => {} }) });
  const r = await fetch(srv.url + 'api/run/x/diff?p=' + encodeURIComponent('a$(rm -rf x)`touch pwned`.js'));
  assert([200, 404].includes(r.status), 'responde sin reventar');
  const { existsSync } = await import('node:fs');
  assert(!existsSync('pwned'), 'sin ejecución de comandos');
  await srv.close();
});

await test('serve(v4-P2): APP GLOBAL — segundo proyecto vía launch {project}, rutas scoped y registro', async () => {
  const { createAppServer } = await import('../lib/serve.mjs');
  const R1 = join(dirname(fileURLToPath(import.meta.url)), '.tmp-multi-a');
  const R2 = join(dirname(fileURLToPath(import.meta.url)), '.tmp-multi-b');
  for (const r of [R1, R2]) { rmSync(r, { recursive: true, force: true }); mkdirSync(join(r, 'openspec', 'changes'), { recursive: true }); }
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
  const { createAppServer } = await import('../lib/serve.mjs');
  const R = join(dirname(fileURLToPath(import.meta.url)), '.tmp-resume-scoped');
  rmSync(R, { recursive: true, force: true });
  mkdirSync(join(R, 'openspec', 'changes', 'feat-r', '.conductor'), { recursive: true });
  writeFileSync(join(R, 'openspec', 'changes', 'feat-r', '.conductor', 'timeline.json'), JSON.stringify({ request: 'reanuda esto', complexity: 'simple', domain: 'feat', verdict: 'STOPPED', phases: [] }));
  const spawned = [];
  const srv = await createAppServer({ root: R, engine: 'E.mjs', spawnRun: (a) => { spawned.push(a); return { on: () => {}, send: () => {}, kill: () => {} }; } });
  const pid = (await (await fetch(srv.url + 'api/ping')).json()).projects[0].id;
  const rs = await (await fetch(srv.url + 'api/run/' + pid + '/feat-r/resume', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).json();
  eq(rs.ok, true, 'resume scoped responde ok');
  eq(spawned.length, 1, 'lanzó el driver');
  eq(spawned[0].root, R, 'el driver corre con el ROOT del proyecto (no undefined → confirma launch(proj,name,…))');
  eq(spawned[0].name, 'feat-r', 'con el nombre del change');
  eq(spawned[0].request, 'reanuda esto', 'con el request heredado del timeline');
  await srv.close();
  rmSync(R, { recursive: true, force: true });
});
