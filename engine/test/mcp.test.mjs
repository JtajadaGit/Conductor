import { spawn, execFileSync } from 'node:child_process';
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
  return { srv, rpc, callTool };
}

await test('mcp: handshake initialize 2025-11-25', async () => {
  const c = client();
  const init = await c.rpc('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 't', version: '1' } });
  eq(init.result.protocolVersion, '2025-11-25');
  eq(init.result.serverInfo.name, 'conductor');
  assert(init.result.capabilities.tools);
  c.srv.kill();
});
await test('mcp: tools/list expone el motor completo', async () => {
  const c = client();
  await c.rpc('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 't', version: '1' } });
  const list = await c.rpc('tools/list', {});
  const names = list.result.tools.map((t) => t.name);
  for (const n of ['conductor_gate', 'conductor_contract', 'conductor_trace', 'conductor_cost', 'conductor_seal', 'conductor_verify', 'conductor_explain', 'conductor_drift', 'conductor_app'])
    assert(names.includes(n), `falta ${n}`);
  assert(list.result.tools.every((t) => t.inputSchema?.type === 'object'));
  // conductor_app = la ENTRADA universal (equivale a /sdd-run desde cualquier host MCP): projectRoot opcional
  const app = list.result.tools.find((t) => t.name === 'conductor_app');
  assert(app.inputSchema.properties.projectRoot && !(app.inputSchema.required || []).length, 'conductor_app: projectRoot opcional');
  c.srv.kill();
});
await test('mcp: conductor_gate ejecuta el gate real', async () => {
  const c = client();
  await c.rpc('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 't', version: '1' } });
  const pass = await c.callTool('conductor_gate', { changeDir: join(F1, 'change-pass') });
  eq(pass.verdict, 'PASS');
  const fail = await c.callTool('conductor_gate', { changeDir: join(F1, 'change-fail') });
  eq(fail.verdict, 'FAIL');
  c.srv.kill();
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
  // el protocolo MCP publica el 2026-07-28 su mayor revisión: stateless, sin initialize. Los clientes nuevos
  // llamarán directo; este server debe servirles igual que a los viejos (que sí hacen handshake). Guard anti-regresión.
  const c = client();
  const list = await c.rpc('tools/list', {}); // SIN initialize previo, a propósito
  assert(Array.isArray(list.result?.tools) && list.result.tools.length >= 14, 'tools/list responde sin handshake');
  const echo = await c.callTool('echo', { text: 'stateless' });
  eq(echo.text, 'stateless', 'tools/call responde sin handshake');
  c.srv.kill();
});

await test('mcp: ping y errores JSON-RPC', async () => {
  const c = client();
  await c.rpc('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 't', version: '1' } });
  eq(JSON.stringify((await c.rpc('ping', {})).result), '{}');
  eq((await c.rpc('tools/call', { name: 'nope', arguments: {} })).error.code, -32602);
  eq((await c.rpc('frobnicate', {})).error.code, -32601);
  c.srv.kill();
});
