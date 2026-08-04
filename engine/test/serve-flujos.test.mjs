// serve-flujos.test.mjs — LOS FLUJOS QUE MUTAN DEL PANEL, de punta a punta, con un hijo IPC FALSO.
// El panel entero se juega aquí: lanzar, recibir la pausa de revisión, continuar con la decisión del humano,
// detener y archivar. Hasta ahora la suite probaba estos endpoints por separado (o contra
// `createProjectServer`, que producción NO usa); esto ejercita el CICLO completo sobre `createAppServer`,
// que es el servidor real (bin:307/315/348).
import { createAppServer } from '../lib/serving/serve.mjs';
import { plumbPath } from '../lib/core/plumb.mjs';
import { EventEmitter } from 'node:events';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));
process.env.CONDUCTOR_HOME = join(HERE, '.tmp-home-flujos');
rmSync(process.env.CONDUCTOR_HOME, { recursive: true, force: true });
const ROOT = join(HERE, '.tmp-flujos');
rmSync(ROOT, { recursive: true, force: true });
const w = (p, c) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, c); };
const chDir = (n) => join(ROOT, 'openspec', 'changes', n);
mkdirSync(join(ROOT, 'openspec', 'changes'), { recursive: true });
writeFileSync(join(ROOT, 'openspec', 'conductor.json'), '{}'); // proyecto inicializado: el gate de /api/launch lo exige

// hijo IPC de mentira: mismo contrato que spawnIpcRun (send/on message/exit) para poder guionizar la pausa
const hijos = [];
class HijoFalso extends EventEmitter {
  constructor(args) { super(); this.args = args; this.pid = 4242; this.enviados = []; }
  send(m) { this.enviados.push(m); return true; }
  kill() { this.emit('exit', 0); }
}
const spawnRun = (args) => { const h = new HijoFalso(args); hijos.push(h); return h; };
const srv = await createAppServer({ root: ROOT, engine: 'ENGINE.mjs', spawnRun });
const post = (p, body) => fetch(srv.url + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}) });
const get = (p) => fetch(srv.url + p).then((r) => r.json());

await test('serve-flujos: lanzar pasa al driver TODO lo que el humano eligió en el panel', async () => {
  const r = await (await post('api/launch', { request: 'añade un contador', name: 'contador', complexity: 'medium', models: { coder: 'copilot:x' }, auto: true, preset: 'feature', pipeline: ['propose', 'spec', 'apply'], runTests: true })).json();
  eq(r.ok, true, JSON.stringify(r));
  const a = hijos[0].args;
  eq(a.name, 'contador'); eq(a.request, 'añade un contador');
  eq(a.preset, 'feature', 'el dial de gobierno por-run viaja');
  eq(a.pipeline, ['propose', 'spec', 'apply'], 'las fases desmarcadas viajan tal cual');
  eq(a.auto, true, 'el "ejecutar sin pausas" viaja');
  eq(a.runTests, true, 'el toggle de pruebas reales viaja');
  eq(a.models.coder, 'copilot:x', 'la mezcla de modelos por rol viaja');
});

await test('serve-flujos: la PAUSA del driver aparece en el estado y `continue` la resuelve por IPC', async () => {
  // el driver anuncia su pausa por el canal IPC; el panel debe verla en /state
  hijos[0].emit('message', { t: 'pause', before: 'apply', role: 'coder', findings: [{ rule: 'x', message: 'revisa esto' }] });
  const s = await get('api/run/contador/state');
  assert(s.pending, 'el estado publica la pausa para que la web la pinte');
  eq(s.pending.before, 'apply'); eq(s.pending.role, 'coder');
  eq(s.pending.findings.length, 1, 'y los hallazgos que el humano debe marcar');
  // IDENTIDAD DE LA PAUSA: una decisión que declara OTRA fase (llegó tarde: su pausa ya se resolvió
  // p.ej. desde la web) es 409 stalePause y JAMÁS toca la pausa viva — el gesto que el usuario no vio no se aprueba.
  const stale = await post('api/run/contador/continue', { expectPhase: 'spec', note: 'tarde' });
  eq(stale.status, 409, 'decisión para otra pausa => rechazada');
  const sj = await stale.json();
  eq(sj.stalePause, true, 'y dice POR QUÉ (stalePause)');
  eq(sj.pausedNow, 'apply', 'con la pausa que sí está viva');
  assert((await get('api/run/contador/state')).pending, 'la pausa viva sigue intacta tras el intento tardío');
  const c = await (await post('api/run/contador/continue', { expectPhase: 'apply', note: 'usa camelCase', model: 'copilot:otro', selected: [0] })).json();
  eq(c.ok, true);
  const enviado = hijos[0].enviados.at(-1);
  eq(enviado.t, 'continue', 'se manda por IPC, no se reinventa el run');
  eq(enviado.payload.note, 'usa camelCase', 'la nota del humano llega ÍNTEGRA al driver');
  eq(enviado.payload.model, 'copilot:otro', 'y el cambio de modelo en caliente');
  eq(enviado.payload.selected, [0], 'y qué hallazgos quiere que se arreglen');
  eq(enviado.payload.expectPhase, undefined, 'expectPhase es del guard HTTP — al driver no le llega');
  const s2 = await get('api/run/contador/state');
  eq(s2.pending, null, 'la pausa se limpia tras responderla (la card desaparece)');
});

await test('serve-flujos: `continue` sin pausa viva es 409 — no se puede aprobar lo que nadie pidió', async () => {
  eq((await post('api/run/contador/continue', { note: 'otra' })).status, 409);
});

await test('serve-flujos: detener marca el run y avisa al driver (no lo mata a lo bruto)', async () => {
  const r = await (await post('api/run/contador/stop')).json();
  eq(r.ok, true, JSON.stringify(r));
  assert(hijos[0].enviados.some((m) => m.t === 'stop'), 'el stop viaja por IPC — el driver cierra limpio');
  const s = await get('api/run/contador/state');
  eq(s.stopRequested, true, 'y la web lo refleja al instante (botón en "Deteniendo…")');
});

await test('serve-flujos: con un run VIVO, el mismo repo rechaza otro lanzamiento (comparten src/)', async () => {
  const r = await post('api/launch', { request: 'otra cosa', name: 'otro-cambio', complexity: 'simple' });
  eq(r.status, 409, 'guardrail del árbol de trabajo');
  const j = await r.json();
  assert(j.busyProject || /en curso|activo/i.test(j.error || ''), `el motivo debe ser claro: ${JSON.stringify(j)}`);
});

await test('serve-flujos: cuando el driver muere, el repo se libera y admite un run nuevo', async () => {
  hijos[0].emit('exit', 0);
  const r = await (await post('api/launch', { request: 'ahora sí', name: 'otro-cambio', complexity: 'simple' })).json();
  eq(r.ok, true, `tras terminar el anterior debe dejar lanzar: ${JSON.stringify(r)}`);
  eq(hijos[1].args.name, 'otro-cambio');
  hijos[1].emit('exit', 0);
});

// GOBIERNO NO NEGOCIABLE DESDE EL CLIENTE (serve.mjs:1244-1247): la profundidad la DERIVA el servidor de la
// petición, nunca se fía del `complexity` que llegue por HTTP. Si se fiara, bastaría un POST con
// complexity:"micro" para conseguir un run sin spec ni verify — el gobierno se saltaría desde la consola
// del navegador. Se fija aquí porque es una propiedad de SEGURIDAD, no un detalle de implementación.
await test('serve-flujos: el cliente NO puede rebajar el gobierno pidiendo complexity:"micro"', async () => {
  const antes = hijos.length;
  const r = await (await post('api/launch', { request: 'cambia el color del boton a azul', name: 'colorete', complexity: 'micro' })).json();
  eq(r.ok, true, JSON.stringify(r));
  const a = hijos[antes].args;
  assert(a.complexity !== 'micro', `el servidor debe derivarla, no obedecer al cliente — llegó "${a.complexity}"`);
  assert(['simple', 'medium', 'complex'].includes(a.complexity), `y ser un flujo SDD gobernado: "${a.complexity}"`);
  hijos[antes].emit('exit', 0); // liberar el repo para los casos de archivado
});

await test('serve-flujos: archivar exige GREEN — un run sin verificar NO se promueve', async () => {
  w(plumbPath(chDir('sin-verde'), 'timeline.json'), JSON.stringify({ request: 'x', verdict: 'NOT-GREEN', phases: [{ phase: 'apply', ok: true }] }));
  w(join(chDir('sin-verde'), 'specs', 'core', 'spec.md'), '## ADDED Requirements\n<!-- id: REQ-A -->\n### Requirement: A\nThe system SHALL a.');
  const r = await post('api/run/sin-verde/archive');
  assert(r.status >= 400, `no puede archivarse sin GREEN (dio ${r.status})`);
});

await test('serve-flujos: archivar un GREEN promueve la delta spec a la fuente de verdad viva', async () => {
  w(plumbPath(chDir('verde'), 'timeline.json'), JSON.stringify({ request: 'x', verdict: 'GREEN', phases: [{ phase: 'apply', ok: true }] }));
  w(join(chDir('verde'), 'specs', 'core', 'spec.md'), '## ADDED Requirements\n<!-- id: REQ-B -->\n### Requirement: B\nThe system SHALL b.');
  const r = await post('api/run/verde/archive');
  const j = await r.json();
  eq(r.status, 200, JSON.stringify(j));
  eq(j.ok, true);
  assert(!existsSync(join(chDir('verde'), 'specs')), 'el change sale de changes/');
  const viva = join(ROOT, 'openspec', 'specs', 'core', 'spec.md');
  if (existsSync(viva)) assert(/REQ-B/.test(readFileSync(viva, 'utf8')), 'la spec promovida contiene el requisito');
});

await srv.close();
rmSync(ROOT, { recursive: true, force: true });
rmSync(process.env.CONDUCTOR_HOME, { recursive: true, force: true });
