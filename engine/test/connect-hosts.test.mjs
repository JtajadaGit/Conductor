// connect-hosts.test.mjs — INSTALACIÓN EN HOSTS MCP. `conductor connect --to <config>` fusiona la entrada
// de conductor en la config de CUALQUIER host sin destruir lo que ya hubiera. Es el camino de instalación
// enterprise y ya dio un fallo real (OpenCode: clave `mcp` y `command/` en singular, corregido en el wizard).
// Aquí se prueba SIEMPRE contra ficheros temporales: `conductor setup` escribe en el HOME REAL del usuario
// (~/.copilot/mcp-config.json, ~/.config/opencode) y por eso NO se ejecuta desde la suite.
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));
const BIN = resolve(HERE, '..', 'bin', 'conductor.mjs');
const ROOT = join(HERE, '.tmp-connect');
rmSync(ROOT, { recursive: true, force: true });
mkdirSync(ROOT, { recursive: true });

const run = (args) => {
  try { return { code: 0, out: execFileSync(process.execPath, [BIN, ...args], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000 }) }; }
  catch (e) { return { code: e.status ?? -1, out: String(e.stdout || '') + String(e.stderr || '') }; }
};
const leer = (f) => JSON.parse(readFileSync(f, 'utf8'));
const LEAK = /ReferenceError|TypeError|is not defined|Cannot read (properties|property)|node:internal/;

await test('connect: crea la entrada en las TRES formas de config de host (servers · mcpServers · mcp)', () => {
  for (const clave of ['servers', 'mcpServers', 'mcp']) {
    const f = join(ROOT, `${clave}.json`);
    writeFileSync(f, '{}\n');
    const r = run(['connect', '--to', f, '--key', clave]);
    eq(r.code, 0, `${clave}: ${r.out.trim().slice(0, 120)}`);
    assert(!LEAK.test(r.out), `${clave} no puede filtrar errores internos`);
    const j = leer(f);
    const e = j[clave]?.conductor;
    assert(e, `${clave}: falta la entrada conductor — quedó ${JSON.stringify(j).slice(0, 120)}`);
    assert(e.command, `${clave}: la entrada necesita command`);
    // OpenCode (clave "mcp") espera `command` como ARRAY — fue un fallo real de la batería E2E
    if (clave === 'mcp') assert(Array.isArray(e.command), `clave "mcp" (OpenCode): command debe ser array, es ${typeof e.command}`);
    else assert(typeof e.command === 'string', `${clave}: command debe ser string, es ${typeof e.command}`);
  }
});

await test('connect: la fusión NO destruye lo que el usuario ya tenía en su config', () => {
  const f = join(ROOT, 'con-cosas.json');
  writeFileSync(f, JSON.stringify({ mcpServers: { otro: { command: 'x', args: ['y'] } }, ajusteMio: { tema: 'oscuro' } }, null, 2));
  const r = run(['connect', '--to', f, '--key', 'mcpServers']);
  eq(r.code, 0, r.out.slice(0, 140));
  const j = leer(f);
  assert(j.mcpServers.otro, 'el servidor MCP que ya existía sigue ahí');
  eq(j.mcpServers.otro.command, 'x', 'y sin tocar');
  assert(j.mcpServers.conductor, 'y se añadió el nuestro');
  eq(j.ajusteMio.tema, 'oscuro', 'las claves ajenas se respetan');
  assert(existsSync(f + '.bak'), 'backup del contenido previo (fusión reversible)');
});

await test('connect: es IDEMPOTENTE — repetirlo no duplica ni reescribe', () => {
  const f = join(ROOT, 'idem.json');
  writeFileSync(f, '{}\n');
  run(['connect', '--to', f, '--key', 'mcpServers']);
  const primera = readFileSync(f, 'utf8');
  const r2 = run(['connect', '--to', f, '--key', 'mcpServers']);
  eq(r2.code, 0);
  assert(/ya estaba conectado/i.test(r2.out), `debe reconocerse a sí mismo — dijo: ${r2.out.trim().slice(0, 110)}`);
  eq(readFileSync(f, 'utf8'), primera, 'el fichero no cambia en la segunda pasada');
});

await test('connect: una config ILEGIBLE se rechaza con mensaje, sin dejarla peor de lo que estaba', () => {
  const f = join(ROOT, 'roto.json');
  const original = '{ esto no es json,, }';
  writeFileSync(f, original);
  const r = run(['connect', '--to', f, '--key', 'mcpServers']);
  assert(r.code !== 0, 'no puede declarar éxito sobre una config que no entiende');
  assert(!LEAK.test(r.out), `mensaje propio, no un volcado de Node — dijo: ${r.out.trim().slice(0, 120)}`);
  eq(readFileSync(f, 'utf8'), original, 'y NO toca el fichero del usuario');
});

await test('connect --command-dir: deja el /conductor del chat con las instrucciones del puente MCP', () => {
  const d = join(ROOT, 'comandos');
  const r = run(['connect', '--command-dir', d]);
  eq(r.code, 0, r.out.slice(0, 140));
  const f = join(d, 'conductor.md');
  assert(existsSync(f), 'escribe conductor.md (el nombre del fichero ES el slash-command)');
  const md = readFileSync(f, 'utf8');
  assert(/conductor_app/.test(md) && /conductor_feature/.test(md), 'instruye al agente a usar las tools, no la terminal');
  assert(/JAMÁS ejecutas git|commitea ÉL/i.test(md), 'y le prohíbe tocar git (el commit es del humano)');
});

await test('mcp-config: TODOS los snippets que imprime son JSON válido (se pegan tal cual en la config del host)', () => {
  const r = run(['mcp-config']);
  eq(r.code, 0);
  // dos formatos conviven: snippets de una línea ({"mcpServers":…}) y bloques indentados a partir de columna 0
  const unaLinea = r.out.match(/\{"[^\n]*\}/g) || [];
  const bloques = r.out.match(/^\{\n[\s\S]*?^\}/gm) || [];
  assert(unaLinea.length + bloques.length >= 3, `debe ofrecer varias formas de config — encontré ${unaLinea.length + bloques.length}`);
  for (const b of [...unaLinea, ...bloques]) {
    let j; try { j = JSON.parse(b); } catch (e) { assert(false, `snippet no parseable (${e.message}): ${b.slice(0, 100)}`); }
    const cont = j.servers || j.mcpServers || j.mcp;
    assert(cont?.conductor, `el snippet debe declarar la entrada conductor: ${b.slice(0, 90)}`);
  }
  // la URL one-click de VS Code lleva el config URL-encodeado: también tiene que ser JSON válido al decodificar
  const url = (r.out.match(/config=([^\s]+)/) || [])[1];
  if (url) JSON.parse(decodeURIComponent(url));
});

rmSync(ROOT, { recursive: true, force: true });
