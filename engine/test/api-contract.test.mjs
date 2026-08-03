// api-contract.test.mjs — CONTRATO HTTP DEL PANEL. Barriendo los ~25 endpoints salieron dos
// fallos que solo se ven ejercitando: `rollback` sin `phase` devolvía 500 con «sin checkpoint para la fase »
// (en blanco) — un campo que falta es culpa de la PETICIÓN, no del servidor, y el 500 se pinta como caída y
// ensucia la monitorización —; y cualquier /api/* desconocido caía al app-shell devolviendo HTML con 200, así
// que el cliente que esperaba JSON fallaba mucho más tarde, lejos de la petición culpable.
// OJO CON QUÉ SERVIDOR SE PRUEBA: hay tres factorías y producción arranca `createAppServer` (bin:307/315/348).
// `createProjectServer` NO lo usa nadie salvo serve.test.mjs — por eso estos dos fallos llegaron vivos hasta
// hoy: la suite estaba en verde sobre un servidor que ningún usuario ejecuta.
import { createAppServer } from '../lib/serving/serve.mjs';
import { plumbPath } from '../lib/core/plumb.mjs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));
process.env.CONDUCTOR_HOME = join(HERE, '.tmp-home-apic'); // registro fuera del HOME real
rmSync(process.env.CONDUCTOR_HOME, { recursive: true, force: true });
const ROOT = join(HERE, '.tmp-apic');
rmSync(ROOT, { recursive: true, force: true });
const ch = plumbPath(join(ROOT, 'openspec', 'changes', 'feature-x'));
mkdirSync(ch, { recursive: true });
writeFileSync(join(ch, 'timeline.json'), JSON.stringify({ request: 'x', verdict: 'GREEN', phases: [{ phase: 'apply', ok: true }] }));
const srv = await createAppServer({ root: ROOT, engine: 'ENGINE.mjs', spawnRun: () => ({ pid: 1 }) });
const post = (p, body) => fetch(srv.url + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

await test('api: un endpoint /api/* desconocido responde 404 JSON, nunca el HTML del panel con 200', async () => {
  for (const p of ['api/no-existe', 'api/run', 'api/models/extra']) {
    const r = await fetch(srv.url + p);
    const ct = r.headers.get('content-type') || '';
    assert(!/text\/html/.test(ct), `${p} devolvió HTML (${ct}) — un cliente de API recibe la shell y falla más tarde`);
    eq(r.status, 404, `${p} debe ser 404`);
    const j = await r.json();
    eq(j.ok, false);
  }
});

await test('api: rollback SIN phase es 400 y dice qué falta (antes: 500 con la fase en blanco)', async () => {
  for (const body of [{}, { phase: '' }, { phase: '   ' }, { phase: 42 }]) {
    const r = await post('api/run/feature-x/rollback', body);
    eq(r.status, 400, `body ${JSON.stringify(body)} debe ser 400, no 500`);
    const j = await r.json();
    assert(/phase/i.test(j.error || ''), `el error nombra el campo que falta — dijo: ${j.error}`);
  }
});

await test('api: rollback de una fase SIN checkpoint es 400 (petición inválida), no 500 (servidor roto)', async () => {
  const r = await post('api/run/feature-x/rollback', { phase: 'fase-que-nunca-existio' });
  eq(r.status, 400);
  assert((await r.json()).ok === false);
});

await test('api: entradas hostiles en el nombre del run → 400, sin filtrar rutas ni reventar', async () => {
  for (const name of ['..%2f..%2fetc', 'MAYUSCULAS', 'a'.repeat(200), 'con espacio']) {
    const r = await fetch(srv.url + `api/run/${name}/state`);
    assert(r.status < 500, `${name} no puede dar 5xx (dio ${r.status})`);
    assert([400, 404].includes(r.status), `${name} debe rechazarse con 400/404, dio ${r.status}`);
  }
});

await test('api: ningún POST con cuerpo malformado devuelve 5xx', async () => {
  const casos = [
    ['api/launch', 'no soy json'],
    ['api/launch', '{}'],
    ['api/register', '{}'],
    ['api/focus', '{"id":"inventado~aaaaaa"}'],
    ['api/run/feature-x/continue', '{}'],
  ];
  for (const [p, body] of casos) {
    const r = await fetch(srv.url + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
    assert(r.status < 500, `${p} con ${body.slice(0, 20)} dio ${r.status}`);
  }
});

await test('api: el guard anti-CSRF exige content-type JSON en los POST que mutan', async () => {
  const r = await fetch(srv.url + 'api/launch', { method: 'POST', body: 'request=x&name=y' });
  eq(r.status, 403, 'un formulario cross-site no puede fijar application/json → se rechaza');
});

// HUMO DE SUPERFICIE: el panel entero se alimenta de estos endpoints. Ejercitarlos de verdad es lo que
// destapó los dos fallos de arriba; sin esto, `serving/serve.mjs` (118 KB) se quedaba en el 74% sin tocar.
await test('api-humo: todos los endpoints de lectura responden sin 5xx y con el tipo que promete cada uno', async () => {
  const rotos = [];
  const GET = ['api/ping', 'api/stats', 'api/changes', 'api/skills', 'api/files', 'api/search?q=x', 'api/estimate?change=feature-x&complexity=simple', 'api/explain'];
  const ACC = ['state', 'receipt', 'files', 'events', 'aiact', 'diff', 'raw?phase=apply', 'artifact?path=proposal.md', 'specdiff?domain=core'];
  for (const p of [...GET, ...ACC.map((a) => `api/run/feature-x/${a}`)]) {
    let r; try { r = await fetch(srv.url + p); } catch (e) { rotos.push(`${p}: sin respuesta (${e.message})`); continue; }
    const txt = await r.text();
    if (r.status >= 500) rotos.push(`${p}: HTTP ${r.status}`);
    if (/is not defined|Cannot read (properties|property)|TypeError|ReferenceError/.test(txt)) rotos.push(`${p}: filtra error interno`);
    // lo que se anuncia como JSON tiene que parsear: un JSON roto rompe el panel en silencio
    if ((r.headers.get('content-type') || '').includes('application/json')) { try { JSON.parse(txt); } catch { rotos.push(`${p}: dice JSON y no parsea`); } }
  }
  eq(rotos, [], `endpoints con problemas:\n   ${rotos.join('\n   ')}`);
});

await test('api(state): change inexistente => {missing:true} y, con archivado homonimo, archivedAs — jamas un run vivo FALSO', async () => {
  const r1 = await fetch(srv.url + 'api/run/fantasma/state');
  const j1 = await r1.json();
  eq(j1.missing, true, 'inexistente => missing (la UI pinta la verdad, no EN CURSO 0/0)');
  eq(j1.archivedAs, null, 'sin archivado homonimo => null');
  mkdirSync(join(ROOT, 'openspec', 'changes', 'archive', '2026-01-01-fantasma'), { recursive: true });
  const j2 = await (await fetch(srv.url + 'api/run/fantasma/state')).json();
  eq(j2.missing, true);
  eq(j2.archivedAs, '2026-01-01-fantasma', 'archivado homonimo => la UI enlaza el destino');
});

await srv.close();
rmSync(ROOT, { recursive: true, force: true });
rmSync(process.env.CONDUCTOR_HOME, { recursive: true, force: true });
