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

await test('packaging: files incluye assets (motor+UI) — sin ellos la instalación arranca sin panel', () => {
  assert(Array.isArray(pj.files) && pj.files.includes('assets'), 'assets empaquetado');
  assert(existsSync(join(ROOT, 'assets', 'ui', 'index.html')), 'la UI compilada existe en el árbol (va dentro del paquete)');
  assert(pj.engines?.node, 'engines.node declarado (fail-fast en Node viejos)');
});
