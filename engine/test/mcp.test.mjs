import { spawn, execFileSync } from 'node:child_process';
import { plumbPath } from '../lib/core/plumb.mjs';
import { createInterface } from 'node:readline';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const BIN = resolve(HERE, '..', 'bin', 'conductor.mjs');
const F1 = resolve(HERE, 'fixtures', 'changes');

function client() {
  const srv = spawn('node', [BIN, 'mcp'], { stdio: ['pipe', 'pipe', 'ignore'] });
  const rl = createInterface({ input: srv.stdout });
  const pending = new Map(); let id = 1;
  rl.on('line', (l) => { const s = l.trim(); if (!s) return; const m = JSON.parse(s); if (m.id !== undefined && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
  const rpc = (method, params) => new Promise((res) => { const i = id++; pending.set(i, res); srv.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: i, method, params }) + '\n'); });
  const callTool = async (name, args) => JSON.parse((await rpc('tools/call', { name, arguments: args })).result.content[0].text);
  // CIERRE LIMPIO en vez de kill(): un proceso MATADO no vuelca su cobertura V8, así que estos 8 tests
  // ejercitaban mcp.mjs y no contaban NADA (se quedaba en 18,8% de funciones medidas aunque las llamáramos).
  // El servidor sale solo al cerrarse stdin — medido: ~330 ms.
  const close = () => new Promise((res) => { srv.once('exit', res); setTimeout(() => { try { srv.kill(); } catch {} res(); }, 4000); try { srv.stdin.end(); } catch { srv.kill(); } });
  return { srv, rpc, callTool, close };
}

await test('mcp: handshake initialize 2025-11-25', async () => {
  const c = client();
  const init = await c.rpc('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 't', version: '1' } });
  eq(init.result.protocolVersion, '2025-11-25');
  eq(init.result.serverInfo.name, 'conductor');
  assert(init.result.capabilities.tools);
  await c.close();
});
await test('mcp: tools/list expone el motor completo', async () => {
  const c = client();
  await c.rpc('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 't', version: '1' } });
  const list = await c.rpc('tools/list', {});
  const names = list.result.tools.map((t) => t.name);
  for (const n of ['conductor_gate', 'conductor_contract', 'conductor_trace', 'conductor_cost', 'conductor_seal', 'conductor_verify', 'conductor_explain', 'conductor_drift', 'conductor_app', 'conductor_drive', 'conductor_receipt', 'conductor_feature', 'conductor_continue'])
    assert(names.includes(n), `falta ${n}`);
  assert(list.result.tools.every((t) => t.inputSchema?.type === 'object'));
  // conductor_app = la ENTRADA universal (equivale a /sdd-run desde cualquier host MCP): projectRoot opcional
  const app = list.result.tools.find((t) => t.name === 'conductor_app');
  assert(app.inputSchema.properties.projectRoot && !(app.inputSchema.required || []).length, 'conductor_app: projectRoot opcional');
  // el /conductor VACIO del chat responde EN el chat: open:false = sin navegador + resumen de runs
  assert(app.inputSchema.properties.open && app.inputSchema.properties.open.type === 'boolean', 'conductor_app: modo open:false declarado (chat educado, sin ventanas)');
  // MODO CHAT (pausas conversacionales): el contrato de las dos tools que hacen del chat el cockpit
  const feat = list.result.tools.find((t) => t.name === 'conductor_feature');
  eq(feat.inputSchema.required, ['request', 'projectRoot'], 'conductor_feature: request + projectRoot obligatorios');
  const cont = list.result.tools.find((t) => t.name === 'conductor_continue');
  eq(cont.inputSchema.required, ['projectRoot', 'changeName'], 'conductor_continue: projectRoot + changeName obligatorios');
  eq(cont.inputSchema.properties.action.enum, ['continue', 'stop', 'wait'], 'conductor_continue: acciones cerradas');
  await c.close();
});
await test('mcp: conductor_gate ejecuta el gate real', async () => {
  const c = client();
  await c.rpc('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 't', version: '1' } });
  const pass = await c.callTool('conductor_gate', { changeDir: join(F1, 'change-pass') });
  eq(pass.verdict, 'PASS');
  const fail = await c.callTool('conductor_gate', { changeDir: join(F1, 'change-fail') });
  eq(fail.verdict, 'FAIL');
  await c.close();
});
await test('mcp(pausa): specClip conserva SHALL y títulos de escenario al compactar — el revisor JAMÁS aprueba requisitos vacíos', async () => {
  const { specClip } = await import('../lib/sysops/mcp.mjs');
  const bloque = '<!-- id: REQ-CAMPO-USUARIO -->\n### Requirement: Campo Usuario\nThe system SHALL mostrar un campo de usuario editable.\n#### Scenario: usuario escribe su nombre\n- **GIVEN** un formulario vacio\n- **WHEN** el usuario teclea su nombre\n- **THEN** el campo refleja el texto\n';
  const spec = '## ADDED Requirements\n' + bloque.repeat(30); // >4000 chars
  const out = specClip(spec, 2000);
  assert(out.length < spec.length, 'se compacta');
  assert(/The system SHALL mostrar un campo/.test(out), 'la línea SHALL SOBREVIVE (es el objeto de la aprobación)');
  assert(/#### Scenario: usuario escribe su nombre/.test(out), 'los títulos de escenario sobreviven');
  assert(!/\*\*GIVEN\*\*/.test(out), 'los GIVEN/WHEN/THEN caen primero (detalle, no objeto)');
  assert(/spec compactada/.test(out), 'el recorte se DECLARA (nunca en silencio)');
  eq(specClip('corta', 2000), 'corta', 'por debajo del cap viaja entera');
});

await test('mcp(poll anti-timeout): pollRun devuelve paused/done al instante y "working" DENTRO del presupuesto (los hosts matan tool-calls largas)', async () => {
  const { pollRun } = await import('../lib/sysops/mcp.mjs');
  const { createServer } = await import('node:http');
  const { mkdirSync, rmSync, writeFileSync } = await import('node:fs');
  // change de mentira con un artefacto para el bundle de la pausa
  const CH = join(HERE, '.tmp-pollrun-change');
  rmSync(CH, { recursive: true, force: true }); mkdirSync(plumbPath(CH), { recursive: true });
  writeFileSync(join(CH, 'proposal.md'), '## Why\nporque sí');
  // servidor fake: el estado que toque según el escenario activo
  let state = {};
  const srv = createServer((req, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(state)); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${srv.address().port}/`;
  try {
    // 1) PAUSA → retorna al primer poll con los artefactos recortados y la instrucción del bucle
    state = { pending: { before: 'apply' } };
    const p = await pollRun(url, 'api/run/x', CH);
    eq(p.status, 'paused'); eq(p.phase, 'apply');
    assert(p.artifacts['proposal.md']?.includes('porque sí'), 'artefacto de la pausa incluido');
    // 2) SIN FIN → retorna "working" dentro del presupuesto (no 30 min): el bucle lo lleva el agente,
 // y CON PROGRESO narrable (caja negra de OpenCode el chat no tenía nada que contar)
    state = {
      verdict: 'running', alive: true,
      phases: [{ phase: 'explore', ms: 56000, model: 'claude-sonnet-5', tokens: { in: 22000, out: 631 } }, { phase: 'propose', ms: 35000, model: 'claude-sonnet-5', tokens: { in: 21000, out: 485 } }],
      plan: ['explore', 'propose', 'spec', 'apply', 'verify'], current: { phase: 'spec', attempt: 2 },
      logTail: ['[08:12] explore ok', '[08:13] propose ok', '[08:13] spec (planner)'],
    };
    const t0 = Date.now();
    const w = await pollRun(url, 'api/run/x', CH, { timeoutMs: 1200 });
    eq(w.status, 'working');
    assert(Date.now() - t0 < 15000, 'retornó rápido (presupuesto corto respetado)');
    assert(/action:"wait"/.test(w.next), 'instruye el re-llamado con action:"wait"');
    assert(/explore ✓ 56s/.test(w.progress.fases) && /▸ spec EN CURSO \(intento 2\)/.test(w.progress.fases), 'fases hechas + fase actual narrables: ' + w.progress.fases);
    eq(w.progress.hecho, '2/5 fases');
    eq(w.progress.tokens, '↓43k ↑1.1k');
    assert(w.progress.registro.length === 2 && /spec \(planner\)/.test(w.progress.registro[1]), 'cola del registro incluida (2 líneas: payload a dieta)');
    assert(/1 línea/.test(w.next) && w.next.length < 120, 'instruye narrar SIN sermón (payload a dieta)');
    // 3) TERMINAL → done con el veredicto
    state = { verdict: 'GREEN', alive: false };
    const d = await pollRun(url, 'api/run/x', CH);
    eq(d.status, 'done'); eq(d.verdict, 'GREEN');
  } finally { srv.close(); rmSync(CH, { recursive: true, force: true }); }
});

await test('mcp-config: imprime el snippet con la ruta REAL del motor resuelta en runtime (docs sin rutas de nadie)', () => {
  const out = execFileSync(process.execPath, [BIN, 'mcp-config'], { encoding: 'utf8', windowsHide: true });
  const enginePath = resolve(BIN).split('\\').join('/');
  assert(out.includes(enginePath), 'la ruta impresa es la del PROPIO motor que corre: ' + enginePath);
  assert(out.includes('"servers"') && out.includes('"mcpServers"') && out.includes('"mcp"'), 'las TRES formas de config (VS Code, mcpServers estándar, y clave "mcp" con command en array)');
  assert(out.includes('vscode:mcp/install?name=conductor&config='), 'deeplink one-click con el formato oficial');
  assert(out.includes('PORTABLE'), 'la forma portable (sin rutas, post npm -g) se ofrece primero');
  assert(/"command":\s*\[\s*\n?\s*"node"/.test(out.replace(/\s+/g, ' ')) || out.includes('"command": ['), 'el formato array presente (hosts que no usan mcpServers)');
  assert(out.includes('"mcp"') && out.includes('"node"'), 'command node + subcomando mcp (absoluto: en macOS los GUI no heredan PATH)');
});

await test('mcp: STATELESS-tolerante — tools/list y tools/call funcionan SIN initialize (spec 2026-07-28 elimina el handshake)', async () => {
 // el protocolo MCP publica el su mayor revisión: stateless, sin initialize. Los clientes nuevos
  // llamarán directo; este server debe servirles igual que a los viejos (que sí hacen handshake). Guard anti-regresión.
  const c = client();
  const list = await c.rpc('tools/list', {}); // SIN initialize previo, a propósito
  assert(Array.isArray(list.result?.tools) && list.result.tools.length >= 14, 'tools/list responde sin handshake');
  const echo = await c.callTool('echo', { text: 'stateless' });
  eq(echo.text, 'stateless', 'tools/call responde sin handshake');
  await c.close();
});

await test('mcp: conductor_receipt devuelve el recibo de PR de un run (feature completa desde el chat, sin miniweb)', async () => {
  const { mkdirSync, writeFileSync, rmSync } = await import('node:fs');
  const tmp = join(HERE, '.tmp-mcp-receipt');
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(plumbPath(tmp), { recursive: true });
  writeFileSync(plumbPath(tmp, 'timeline.json'), JSON.stringify({ verdict: 'GREEN', request: 'probar recibo por chat', phases: [{ phase: 'apply', model: 'm-x', provider: 'byok', tokens: { in: 10, out: 5 }, files: [{ p: 'src/x.js', k: 'create' }] }] }));
  const c = client();
  await c.rpc('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 't', version: '1' } });
  const r = await c.callTool('conductor_receipt', { changeDir: tmp });
  assert(r.markdown.includes('verificado con conductor') && r.markdown.includes('src/x.js'), 'recibo markdown completo por MCP');
  const err = await c.rpc('tools/call', { name: 'conductor_receipt', arguments: { changeDir: join(tmp, 'no-existe') } });
  assert(err.result?.isError || err.error, 'sin timeline → error claro, no un recibo vacío');
  await c.close();
  rmSync(tmp, { recursive: true, force: true });
});

await test('mcp: ping y errores JSON-RPC', async () => {
  const c = client();
  await c.rpc('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 't', version: '1' } });
  eq(JSON.stringify((await c.rpc('ping', {})).result), '{}');
  eq((await c.rpc('tools/call', { name: 'nope', arguments: {} })).error.code, -32602);
  eq((await c.rpc('frobnicate', {})).error.code, -32601);
  await c.close();
});

// Quien rellena estos argumentos es un MODELO, así que omitir uno es el caso NORMAL, no el raro. Antes la
// llamada caía directa al fs y devolvía el error interno de Node ('The "path" argument must be of type
// string. Received undefined'), que no le dice al agente QUÉ arreglar. Detectado barriendo las 17 tools
// mcp.mjs tenía 18,8% de cobertura de funciones, así que nada de esto se ejecutaba en tests.
await test('mcp: argumento obligatorio ausente → el mensaje NOMBRA el que falta (sin filtrar errores internos)', async () => {
  const c = client();
  await c.rpc('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 't', version: '1' } });
  for (const [name, missing] of [['conductor_migrate', 'target'], ['conductor_cost', 'jsonl'], ['conductor_legacy', 'features'], ['conductor_explain', 'srcDir']]) {
    const r = await c.rpc('tools/call', { name, arguments: {} });
    eq(r.result.isError, true, `${name} debe marcar isError`);
    const t = String(r.result.content[0].text);
    assert(t.includes(missing), `${name}: el mensaje debe nombrar "${missing}" — dijo: ${t}`);
    assert(!/argument must be of type|is not valid JSON|is not defined|Cannot read/i.test(t), `${name}: no se filtra el error interno de Node — dijo: ${t}`);
  }
  await c.close();
});

await test('mcp: conductor_verify acepta el sello YA PARSEADO (lo natural para un modelo) y el string, con el MISMO resultado', async () => {
  const c = client();
  await c.rpc('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 't', version: '1' } });
  const seal = { spec_version: 'conductor-provenance/2', verdict: 'GREEN', algo: 'SHA-256', sha256: 'abc' };
  const a = await c.rpc('tools/call', { name: 'conductor_verify', arguments: { sealJson: seal } });
  const b = await c.rpc('tools/call', { name: 'conductor_verify', arguments: { sealJson: JSON.stringify(seal) } });
  for (const r of [a, b]) assert(!/is not valid JSON/i.test(r.result.content[0].text), `sin error de parseo: ${r.result.content[0].text}`);
  eq(a.result.content[0].text, b.result.content[0].text, 'objeto y string deben dar el mismo veredicto');
  await c.close();
});
