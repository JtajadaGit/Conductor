// GUARDIA DEL EMPAQUETADO ENTERPRISE (npm i -g git+…): si alguien rompe el manifest, la suite grita ANTES
// de que un dev de Mac/Linux/Windows se estrelle instalando. El contrato: bin válido con shebang, versión
// única (plugin.json manda), cero dependencias, private (jamás publicable al npm público — confidencialidad).
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const pj = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const plugin = JSON.parse(readFileSync(join(ROOT, 'plugin.json'), 'utf8'));

await test('packaging: bin.conductor apunta a un fichero REAL con shebang (npm exige ambos para crear los shims)', () => {
  eq(typeof pj.bin?.conductor, 'string', 'bin.conductor definido');
  const binPath = join(ROOT, pj.bin.conductor);
  assert(existsSync(binPath), `el bin existe: ${pj.bin.conductor}`);
  assert(readFileSync(binPath, 'utf8').startsWith('#!/usr/bin/env node'), 'shebang presente (sin él, el shim POSIX no ejecuta)');
});

await test('packaging: versión ÚNICA (package.json === plugin.json — el build la sincroniza; el drift mentiría en npm ls)', () => {
  eq(pj.version, plugin.version, `package ${pj.version} vs plugin ${plugin.version}`);
});

await test('packaging: private:true (Regla de confidencialidad: JAMÁS publicable al npm público) y CERO dependencias', () => {
  eq(pj.private, true, 'private obligatorio');
  eq(pj.dependencies ?? {}, {}, 'cero dependencias (el motor es un único fichero)');
  eq(pj.devDependencies ?? {}, {}, 'cero devDependencies en el manifest de instalación');
});

await test('packaging: git archive (= tarball de codeload que usa npm-desde-GitHub) INCLUYE la UI y EXCLUYE lo confidencial', () => {
  // El bug real: un patrón sin anclar en .gitattributes ("ui/") se comía assets/ui → instalación npm SIN panel.
  // Este guard corre el archive con los atributos del árbol de trabajo y verifica ambas direcciones.
  const list = execSyncReal('git archive --worktree-attributes HEAD', { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 });
  const names = listTarNames(list);
  assert(names.some((n) => n === 'assets/ui/index.html'), 'la UI compilada viaja en el archive (sin ella: panel en blanco)');
  assert(names.filter((n) => n.startsWith('assets/ui/assets/')).length >= 5, 'los chunks de la UI viajan');
  assert(!names.some((n) => n === 'CLAUDE.md'), 'CLAUDE.md JAMÁS sale en la distribución (confidencialidad)');
  assert(!names.some((n) => n.startsWith('task/')), 'task/ (notas internas) jamás sale');
  assert(!names.some((n) => n.startsWith('engine/lib/')), 'las fuentes del motor no viajan (solo el bundle)');
});
// tar listing SIN dependencias: cabeceras de 512B, nombre en los primeros 100 bytes (formato ustar).
function listTarNames(buf) {
  const names = [];
  for (let o = 0; o + 512 <= buf.length; ) {
    const name = buf.subarray(o, o + 100).toString('utf8').replace(/\0.*$/, '');
    if (!name) break;
    names.push(name);
    const size = parseInt(buf.subarray(o + 124, o + 136).toString('utf8').replace(/\0.*$/, '').trim() || '0', 8) || 0;
    o += 512 + Math.ceil(size / 512) * 512;
  }
  return names;
}
import { execSync as execSyncReal } from 'node:child_process';

await test('packaging: build-dist genera la superficie LIMPIA (dos-repos) — producto dentro, fábrica y notas FUERA', () => {
  // el repo instalable ("pro") debe poder ser SOLO esto: da igual si el instalador de plugins clona o filtra.
  execSyncReal(`"${process.execPath}" engine/build-dist.mjs`, { cwd: ROOT, stdio: 'pipe' });
  const dist = join(ROOT, 'dist-plugin');
  for (const f of ['assets/conductor.mjs', 'assets/ui/index.html', 'plugin.json', 'package.json', '.mcp.json', 'plugin/skills/sdd-run/SKILL.md', 'docs/MAPA.md', 'CHANGELOG.md']) {
    assert(existsSync(join(dist, f)), `superficie completa: falta ${f}`);
  }
  for (const f of ['engine', 'ui', 'CLAUDE.md', 'task', '.gitattributes']) {
    assert(!existsSync(join(dist, f)), `la fábrica/notas JAMÁS en dist: sobra ${f}`);
  }
});

await test('packaging: files incluye assets (motor+UI) — sin ellos la instalación arranca sin panel', () => {
  assert(Array.isArray(pj.files) && pj.files.includes('assets'), 'assets empaquetado');
  assert(existsSync(join(ROOT, 'assets', 'ui', 'index.html')), 'la UI compilada existe en el árbol (va dentro del paquete)');
  assert(pj.engines?.node, 'engines.node declarado (fail-fast en Node viejos)');
});
