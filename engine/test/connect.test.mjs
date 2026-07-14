// Tests de la CONEXIÓN OFICIAL a hosts MCP (lib/sysops/connect.mjs + `conductor connect`): un comando,
// fusión no destructiva, idempotente, y jamás pisar una config que no entendemos.
import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { mergeMcpEntry } from '../lib/sysops/connect.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const BIN = resolve(HERE, '..', 'bin', 'conductor.mjs');
const ENG = 'C:/motor/conductor.mjs';

await test('connect: fichero vacío → crea la clave estándar mcpServers con la entrada de conductor', () => {
  const r = mergeMcpEntry('', ENG);
  eq(r.changed, true); eq(r.key, 'mcpServers');
  eq(JSON.parse(r.text).mcpServers.conductor, { command: 'node', args: [ENG, 'mcp'] });
});

await test('connect: detecta el formato del host por la clave existente (servers / mcp-array) y RESPETA lo demás', () => {
  const vsc = mergeMcpEntry(JSON.stringify({ servers: { otro: { command: 'x' } } }), ENG);
  eq(vsc.key, 'servers');
  const j = JSON.parse(vsc.text);
  eq(j.servers.otro, { command: 'x' }, 'las entradas del usuario quedan intactas');
  eq(j.servers.conductor.type, 'stdio');
  const arr = mergeMcpEntry(JSON.stringify({ mcp: {}, logLevel: 'DEBUG' }), ENG);
  eq(arr.key, 'mcp');
  const j2 = JSON.parse(arr.text);
  eq(j2.mcp.conductor, { type: 'local', command: ['node', ENG, 'mcp'], enabled: true }, 'formato command-en-ARRAY');
  eq(j2.logLevel, 'DEBUG', 'el resto de la config sobrevive');
});

await test('connect: idempotente (2ª pasada changed:false) y clave explícita gana a la detección', () => {
  const first = mergeMcpEntry('', ENG, { key: 'mcp' });
  eq(first.key, 'mcp');
  const again = mergeMcpEntry(first.text, ENG, { key: 'mcp' });
  eq(again.changed, false, 'nada que cambiar si ya está la entrada exacta');
});

await test('connect: JSON inválido → error y NO toca nada (jamás pisar la config del usuario)', () => {
  const r = mergeMcpEntry('{rota', ENG);
  assert(r.error && r.error.includes('no la toco'), 'se niega con explicación');
  assert(mergeMcpEntry('[1,2]', ENG).error, 'un array tampoco es una config válida');
});

await test('connect: config REAL de un host corporativo (provider+modelos+permisos) sobrevive INTACTA a la fusión', () => {
  // forma real de la config de un host de agentes de la empresa (sanitizada): provider con modelos y
  // variantes de reasoning, permisos, logLevel. La fusión añade el MCP y NO descuadra ni un byte del resto.
  const hostCfg = {
    $schema: 'https://host.example/config.json',
    provider: {
      litellm: {
        npm: '@ai-sdk/openai-compatible',
        options: { baseURL: 'https://proxy.example', apiKey: 'sk-XXXX', timeout: 300000 },
        models: {
          'deepseek-v4-pro': { tool_call: true, reasoning: true, limit: { context: 250000, output: 16384 }, variants: { high: { options: { chat_template_kwargs: { thinking: true, reasoning_effort: 'high' } } } } },
          'glm-v52': { tool_call: true, limit: { context: 250000, output: 16384 } },
        },
      },
    },
    permission: { doom_loop: 'ask' },
    logLevel: 'DEBUG',
  };
  const r = mergeMcpEntry(JSON.stringify(hostCfg, null, 1), ENG);
  eq(r.key, 'mcpServers', 'sin clave MCP previa → crea la estándar (se fuerza el formato del host con --key mcp)');
  const j = JSON.parse(r.text);
  eq(j.provider, hostCfg.provider, 'el bloque provider (modelos, variantes, límites) queda byte a byte');
  eq(j.permission, hostCfg.permission); eq(j.logLevel, 'DEBUG'); eq(j.$schema, hostCfg.$schema);
  const r2 = mergeMcpEntry(JSON.stringify(hostCfg), ENG, { key: 'mcp' });
  const j2 = JSON.parse(r2.text);
  eq(j2.mcp.conductor.command, ['node', ENG, 'mcp'], 'formato command-array con clave explícita');
  eq(j2.provider, hostCfg.provider, 'también intacto con clave explícita');
});

await test('connect(CLI): --vscode crea .vscode/mcp.json con clave "servers" (PATH capado → jamás toca un VS Code real)', () => {
  const dir = join(HERE, '.tmp-connect-vsc');
  rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
  // PATH solo con node: el CLI `code` no se encuentra → en TODO OS cae a la fusión del fichero (determinista)
  const out = execFileSync(process.execPath, [BIN, 'connect', '--vscode', dir], {
    encoding: 'utf8', stdio: 'pipe', windowsHide: true, timeout: 20000,
    env: { ...process.env, PATH: dirname(process.execPath), Path: dirname(process.execPath) },
  });
  assert(out.includes('✅'), 'conectado: ' + out.trim().split('\n')[0]);
  const j = JSON.parse(readFileSync(join(dir, '.vscode', 'mcp.json'), 'utf8'));
  eq(j.servers.conductor.type, 'stdio', 'formato del editor (clave servers, stdio)');
  eq(j.servers.conductor.command, 'node');
  assert(String(j.servers.conductor.args[0]).endsWith('conductor.mjs'), 'ruta absoluta al motor');
  rmSync(dir, { recursive: true, force: true });
});

await test('connect(CLI): --to fusiona en el fichero con backup y la 2ª pasada no cambia nada', () => {
  const dir = join(HERE, '.tmp-connect');
  rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
  const cfg = join(dir, 'host.json');
  writeFileSync(cfg, JSON.stringify({ mcp: { previo: { enabled: true } } }));
  const run = () => execFileSync(process.execPath, [BIN, 'connect', '--to', cfg], { encoding: 'utf8', stdio: 'pipe', windowsHide: true, timeout: 20000 });
  const out1 = run();
  assert(out1.includes('✅'), 'primera pasada conecta: ' + out1.trim());
  const j = JSON.parse(readFileSync(cfg, 'utf8'));
  assert(j.mcp.conductor && j.mcp.previo, 'entrada añadida + la previa intacta');
  assert(readFileSync(cfg + '.bak', 'utf8').includes('previo'), 'backup del estado anterior');
  const out2 = run();
  assert(out2.includes('ya estaba conectado'), 'idempotente: ' + out2.trim());
  rmSync(dir, { recursive: true, force: true });
});
