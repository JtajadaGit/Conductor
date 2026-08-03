// mcp-smoke.test.mjs — HUMO DE TODAS LAS TOOLS MCP contra un proyecto real de mentira.
// Por qué: `sysops/mcp.mjs` son 32 KB con el 81% de sus funciones sin ejecutar JAMÁS en tests, y son las 17
// tools que un host de chat (Claude Code, Copilot CLI, OpenCode) invoca en producción. Barriéndolas a mano
// salieron dos fallos que la suite no veía: los `required` del schema no se validaban —la
// llamada caía al fs y devolvía el error interno de Node— y `conductor_verify` reventaba si le pasabas el
// sello YA PARSEADO, que es justo lo que hace un modelo. Un tool que nadie ejecuta es un tool sin garantía.
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));
const BIN = resolve(HERE, '..', 'bin', 'conductor.mjs');
const ROOT = join(HERE, '.tmp-mcpsmoke');
const OS = join(ROOT, 'openspec');
const CH = join(OS, 'changes', 'demo-cambio');
const USAGE = join(HERE, 'fixtures', 'usage', 'token-usage.jsonl');
const w = (p, c) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, c); };

rmSync(ROOT, { recursive: true, force: true });
w(join(CH, 'specs', 'core', 'spec.md'), '## ADDED Requirements\n<!-- id: REQ-SUMA -->\n### Requirement: Suma\nThe system SHALL sumar.\n#### Scenario: dos\n- **GIVEN** a\n- **WHEN** b\n- **THEN** c');
w(join(CH, 'proposal.md'), '## Why\nx\n## What Changes\n- suma\n## Impact\nbajo');
w(join(CH, 'tasks.md'), '- [x] 1.1 [REQ-SUMA] implementar');
w(join(CH, 'apply-report.md'), '# Apply Report\nStatus: done\nFiles created: src/suma.js\n');
w(join(CH, 'verify-report.md'), '## Verdict\nPASS');
w(join(ROOT, 'src', 'suma.js'), '// @conductor REQ-SUMA\nexport const suma = (a, b) => a + b;');
w(join(ROOT, 'src', 'suma.test.js'), '// @conductor REQ-SUMA\ntest("s", () => { expect(1).toBe(1); });');
w(join(CH, '.conductor', 'timeline.json'), JSON.stringify({ request: 'suma', verdict: 'GREEN', total_ms: 1000, phases: [{ phase: 'apply', ok: true, ms: 100, model: 'm', tokens: { in: 10, out: 2 }, files: [{ p: 'src/suma.js', k: 'create' }] }] }));
w(join(ROOT, 'a.sql'), 'CREATE TABLE t (id int);');

// cwd FUERA del proyecto de prueba: en Windows el hijo bloquea su cwd y el rmSync final da EBUSY.
// Las tools reciben rutas absolutas, así que el cwd del servidor no influye en lo que se prueba.
const srv = spawn(process.execPath, [BIN, 'mcp'], { stdio: ['pipe', 'pipe', 'ignore'], cwd: HERE });
const rl = createInterface({ input: srv.stdout });
const pend = new Map(); let id = 1;
rl.on('line', (l) => { const s = l.trim(); if (!s) return; try { const m = JSON.parse(s); if (pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } } catch {} });
const rpc = (method, params) => new Promise((res) => { const i = id++; pend.set(i, res); srv.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: i, method, params }) + '\n'); setTimeout(() => { if (pend.has(i)) { pend.delete(i); res({ __timeout: true }); } }, 60000); });
await rpc('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 't', version: '1' } });

// argumentos VÁLIDOS según el inputSchema de cada tool (los nombres importan: con otros solo se prueba el error)
const LLAMADAS = [
  ['echo', { text: 'hola' }],
  ['conductor_gate', { changeDir: CH, srcDir: ROOT }],
  ['conductor_trace', { changeDir: CH, srcDir: ROOT }],
  ['conductor_receipt', { changeDir: CH }],
  ['conductor_seal', { changeDir: CH, srcDir: ROOT }],
  ['conductor_explain', { srcDir: ROOT }],
  ['conductor_drift', { changeDir: CH, srcDir: ROOT }],
  ['conductor_migrate', { target: join(ROOT, 'a.sql') }],
  ['conductor_legacy', { srcDir: ROOT, features: ['sumar dos numeros'] }],
  ['conductor_cost', { jsonl: USAGE }],
  ['conductor_init_config', { openspecDir: OS }],
  ['conductor_contract', { base: join(ROOT, 'a.sql'), head: join(ROOT, 'a.sql') }],
];
const RES = new Map();
for (const [name, args] of LLAMADAS) RES.set(name, await rpc('tools/call', { name, arguments: args }));
const texto = (r) => String(r?.result?.content?.[0]?.text ?? JSON.stringify(r ?? {}));
const LEAK = /is not defined|is not a function|Cannot read (properties|property)|TypeError|ReferenceError|argument must be of type|is not valid JSON/;

await test('mcp-humo: ninguna tool revienta por dentro con argumentos válidos', () => {
  const rotas = [...RES.entries()].filter(([, r]) => r.__timeout || LEAK.test(texto(r)))
    .map(([n, r]) => `${n}: ${r.__timeout ? 'TIMEOUT' : texto(r).slice(0, 110)}`);
  eq(rotas, [], `tools que fallan por dentro:\n   ${rotas.join('\n   ')}`);
});

await test('mcp-humo: cada tool responde con contenido y sin marcar error', () => {
  const malas = [...RES.entries()].filter(([, r]) => r.result?.isError !== false || !texto(r).trim())
    .map(([n, r]) => `${n}: isError=${r.result?.isError} · ${texto(r).slice(0, 90)}`);
  eq(malas, [], `respuestas inesperadas:\n   ${malas.join('\n   ')}`);
});

await test('mcp-humo: el contenido es el esperado (no una cáscara vacía que pase el humo)', () => {
  assert(/REQ-SUMA/.test(texto(RES.get('conductor_trace'))), 'trace ve el requisito trazado');
  assert(/REQ-SUMA/.test(texto(RES.get('conductor_receipt'))), 'el recibo lista el requisito');
  const gate = JSON.parse(texto(RES.get('conductor_gate')));
  assert(typeof gate.verdict === 'string', 'el gate emite veredicto');
  const seal = JSON.parse(texto(RES.get('conductor_seal')));
  assert(seal.spec_version, 'el sello lleva su versión de formato');
});

await test('mcp-humo: el sello recién emitido se verifica pasándolo como objeto (lo que hace un modelo)', async () => {
  const seal = JSON.parse(texto(RES.get('conductor_seal')));
  const v = await rpc('tools/call', { name: 'conductor_verify', arguments: { sealJson: seal } });
  const t = texto(v);
  assert(!LEAK.test(t), `sin errores de parseo: ${t.slice(0, 110)}`);
  assert(/verdict|shaOk/.test(t), `devuelve la verificación: ${t.slice(0, 110)}`);
});

// cierre LIMPIO (stdin.end), no kill: un proceso matado no vuelca su cobertura V8 y todo lo ejercitado aquí
// no contaría. El servidor sale solo en ~330 ms al cerrarse la entrada.
await new Promise((r) => { srv.once('exit', r); setTimeout(() => { try { srv.kill(); } catch {} r(); }, 4000); try { srv.stdin.end(); } catch { srv.kill(); } });
try { rmSync(ROOT, { recursive: true, force: true }); } catch { /* la limpieza jamás tumba la suite */ }
