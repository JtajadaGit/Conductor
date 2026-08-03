// GUARDIA DEL EMPAQUETADO (vía ÚNICA: npm i -g git+…): si alguien rompe el manifest, la suite grita ANTES
// de que un dev de Mac/Linux/Windows se estrelle instalando. El contrato: bin válido con shebang, versión
// en package.json (LA fuente desde la retirada de la vía plugin), cero dependencias, private (jamás
// publicable al npm público — confidencialidad), y la superficie dist limpia (producto sí, fábrica no).
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const pj = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

await test('packaging: bin.conductor apunta a un fichero REAL con shebang (npm exige ambos para crear los shims)', () => {
  eq(typeof pj.bin?.conductor, 'string', 'bin.conductor definido');
  const binPath = join(ROOT, pj.bin.conductor);
  assert(existsSync(binPath), `el bin existe: ${pj.bin.conductor}`);
  assert(readFileSync(binPath, 'utf8').startsWith('#!/usr/bin/env node'), 'shebang presente (sin él, el shim POSIX no ejecuta)');
});

await test('packaging: package.json es LA fuente de versión (semver) — bump = editar SOLO ahí', () => {
  assert(/^\d+\.\d+\.\d+/.test(pj.version || ''), `versión semver: ${pj.version}`);
  // la cabecera del README la propaga el build al cambiar de versión; si divergen, el build no corrió
  const rm = readFileSync(join(ROOT, 'README.md'), 'utf8');
  const rmV = (rm.match(/\*\*Versión\*\*: ([0-9][\w.-]*)/) || [])[1];
  if (rmV) eq(rmV, pj.version, 'README en sync con package.json (lo hace engine/build.mjs)');
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

await test('packaging: build-dist genera la superficie LIMPIA — producto dentro (motor+UI+prompts+hook), fábrica y vía-plugin FUERA', () => {
  execSyncReal(`"${process.execPath}" engine/build-dist.mjs`, { cwd: ROOT, stdio: 'pipe' });
  const dist = join(ROOT, 'dist-plugin');
  for (const f of ['assets/conductor.mjs', 'assets/ui/index.html', 'package.json', 'prompts/verify.md', 'prompts/apply.md', 'hooks/guard-hook.mjs']) {
    assert(existsSync(join(dist, f)), `superficie completa: falta ${f}`);
  }
  for (const f of ['engine', 'ui', 'CLAUDE.md', 'task', '.gitattributes', 'plugin', 'plugin.json', '.mcp.json']) {
    assert(!existsSync(join(dist, f)), `la fábrica/vía-plugin JAMÁS en dist: sobra ${f}`);
  }
});

await test('packaging: `conductor doctor` corre, sale 0 e incluye los checks v2 (credenciales · prompts · hosts)', () => {
  const out = execSyncReal(`"${process.execPath}" engine/bin/conductor.mjs doctor`, { cwd: ROOT, encoding: 'utf8', timeout: 60000 });
  assert(out.includes('credenciales LiteLLM'), 'check de credenciales presente');
  assert(out.includes('prompts del pipeline'), 'check de prompts presente');
  assert(out.includes('hosts conectados'), 'check de hosts presente');
});

await test('packaging: files empaqueta assets (motor+UI) + prompts (el alma editable) + hooks (guardián)', () => {
  assert(Array.isArray(pj.files) && pj.files.includes('assets') && pj.files.includes('prompts') && pj.files.includes('hooks'), 'files completo');
  assert(existsSync(join(ROOT, 'assets', 'ui', 'index.html')), 'la UI compilada existe en el árbol (va dentro del paquete)');
  assert(pj.engines?.node, 'engines.node declarado (fail-fast en Node viejos)');
});

await test('packaging: `conductor run` es el gesto app (case unico) y el CLI dice si arranco o si ya estaba', () => {
 // regresion real habia DOS `case 'run'` y ganaba la maquina de estados legacy — la ayuda
  // prometia la miniweb y el usuario aterrizaba en engine/.runs. Un solo case + mensajes honestos.
  const src = readFileSync(join(ROOT, 'engine', 'bin', 'conductor.mjs'), 'utf8');
  eq((src.match(/case 'run'/g) || []).length, 1, "un unico case 'run' (el gesto app)");
  assert(src.includes('ya estaba encendido'), 'mensaje de app ya viva presente');
  assert(src.includes('arrancando conductor v'), 'mensaje de arranque presente');
  assert(src.includes('para pararlo: conductor stop'), 'pista de apagado presente');
});

await test('packaging: engine/package.json en SINCRONIA con la raiz (el resolver de VERSION lo lee primero en dev)', () => {
 // fosil real engine/package.json se quedo en 0.2.0 y el help del checkout decia una version falsa
  const ep = JSON.parse(readFileSync(join(ROOT, 'engine', 'package.json'), 'utf8'));
  eq(ep.version, pj.version, 'misma version que package.json raiz (LA fuente)');
});
