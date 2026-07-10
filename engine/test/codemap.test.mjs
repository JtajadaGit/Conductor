// Tests del mapa de relaciones de código (lib/analysis/codemap.mjs): extracción JS/TS por regex,
// resolución de imports internos, usedBy inverso, vecindad (blast-radius), determinismo y anti-inyección.
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractJs, buildCodeMap, neighborhood, renderCodeMap } from '../lib/analysis/codemap.mjs';

const TMP = join(dirname(fileURLToPath(import.meta.url)), '.tmp-codemap');
const w = (rel, content) => { const p = join(TMP, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, content); };

rmSync(TMP, { recursive: true, force: true });
w('src/app.ts', `import { helper } from './util';\nimport Big from './big/index';\nimport React from 'react';\nconst api = require('./legacy.cjs');\nexport default function App() { return helper(); }\nexport const VERSION = '1';\n`);
w('src/util.ts', `import { deep } from './big';\nexport function helper() { return deep(); }\nexport { helper as helperAlias };\nfunction privada() {}\n  function anidada() {}\n`);
w('src/big/index.ts', `export const deep = () => 42;\n`);
w('src/legacy.cjs', `module.exports = { go: () => import('./util') };\nexports.extra = 1;\n`);
w('node_modules/trap/index.ts', `export const NUNCA = 1;\n`); // dir pesado: JAMÁS debe entrar al índice

await test('codemap: extractJs saca imports (from/require/dinámico), exports (named/default/alias/CJS) y defs top-level', () => {
  const r = extractJs(`import { a } from './x';\nexport * from './y';\nconst z = require('./z');\nimport('./dyn');\nexport default class Foo {}\nexport { a as b };\nmodule.exports = {};\nexports.pub = 1;\nfunction top() {}\n  function nested() {}\n`);
  eq([...r.imports].sort(), ['./dyn', './x', './y', './z'], 'los 4 estilos de import');
  assert(r.exports.includes('default') && r.exports.includes('b') && r.exports.includes('pub'), 'default + alias expuesto + CJS: ' + r.exports.join(','));
  assert(r.defines.includes('top') && !r.defines.includes('nested'), 'solo defs top-level (sin indentación)');
});

await test('codemap: comentarios // y JSDoc * NO generan aristas falsas (import citado en docs ≠ dependencia)', () => {
  const r = extractJs(`// import { fake } from './comentario';\n * import { fake2 } from './jsdoc';\n  // otro: export function inventada() {}\nimport { real } from './real';\nconst url = 'http://sitio/x'; // http:// mid-línea intacto\n`);
  eq(r.imports, ['./real'], 'solo el import real (comentarios filtrados)');
  assert(!r.defines.includes('inventada'), 'defs citadas en comentarios fuera');
  assert(r.defines.includes('url'), 'la línea con http:// NO se rompió (const url sobrevive)');
});

await test('codemap: buildCodeMap resuelve imports internos (extensión + barrel index), marca externos null y arma usedBy', () => {
  const map = buildCodeMap(TMP);
  const app = map.files['src/app.ts'];
  eq(app.imports.find((i) => i.spec === './util').to, 'src/util.ts', './util → src/util.ts');
  eq(app.imports.find((i) => i.spec === './big/index').to, 'src/big/index.ts', 'ruta con extensión implícita');
  eq(app.imports.find((i) => i.spec === 'react').to, null, 'bare specifier = externo (null, no se inventa)');
  eq(app.imports.find((i) => i.spec === './legacy.cjs').to, 'src/legacy.cjs', 'require con extensión explícita');
  eq(map.files['src/util.ts'].imports.find((i) => i.spec === './big').to, 'src/big/index.ts', 'barrel ./big → index.ts');
  eq(map.usedBy['src/util.ts'].sort(), ['src/app.ts', 'src/legacy.cjs'], 'usedBy inverso (incluye import dinámico)');
  assert(!Object.keys(map.files).some((f) => f.includes('node_modules')), 'node_modules JAMÁS entra al índice');
});

await test('codemap: determinista byte-a-byte (mismo repo ⇒ mismo índice) y rutas SIEMPRE con / (cross-OS)', () => {
  const a = JSON.stringify(buildCodeMap(TMP));
  const b = JSON.stringify(buildCodeMap(TMP));
  eq(a === b, true, 'dos builds idénticos');
  assert(!a.includes('\\\\'), 'sin backslashes en rutas del índice (Windows normalizado)');
});

await test('codemap: neighborhood = deps internas + quién-lo-usa (blast-radius 1er nivel); acepta backslash Windows', () => {
  const map = buildCodeMap(TMP);
  const nb = neighborhood(map, ['src/util.ts']);
  assert(nb.files.includes('src/big/index.ts'), 'incluye su dependencia');
  assert(nb.files.includes('src/app.ts') && nb.files.includes('src/legacy.cjs'), 'incluye a quienes lo usan');
  eq(neighborhood(map, ['src\\util.ts']).focus, ['src/util.ts'], 'backslash de Windows se normaliza');
  eq(neighborhood(map, ['no/existe.ts']).focus, [], 'foco inexistente = vacío (no inventa)');
});

await test('codemap: renderCodeMap — foco = blast-radius con usedBy; sin foco = top del proyecto; una línea por fichero (anti-inyección)', () => {
  const map = buildCodeMap(TMP);
  const fRender = renderCodeMap(map, { focus: ['src/util.ts'] });
  assert(/blast-radius/.test(fRender), 'cabecera de foco');
  assert(/usedBy\(2\)/.test(fRender), 'cuenta de usuarios visible: ' + fRender.split('\n').find((l) => l.includes('util')));
  const full = renderCodeMap(map, {});
  assert(/most-referenced/.test(full), 'cabecera general');
  for (const line of full.split('\n').slice(1)) assert(line.startsWith('- '), 'cada entrada es UNA línea con guion: ' + line);
  eq(renderCodeMap(map, { focus: ['no/existe.ts'] }), '', 'foco fuera del índice → bloque vacío (nada engañoso)');
  eq(renderCodeMap({ files: {} }, {}), '', 'índice vacío → sin bloque');
});

await test('codemap: maxFiles acota el barrido (repos gigantes no cuelgan el arranque del run)', () => {
  const map = buildCodeMap(TMP, { maxFiles: 2 });
  eq(Object.keys(map.files).length, 2, 'respeta el tope');
});

rmSync(TMP, { recursive: true, force: true });
