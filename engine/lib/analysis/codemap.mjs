// conductor/lib/analysis/codemap.mjs — ÍNDICE DE RELACIONES DE CÓDIGO (imports/exports/símbolos + quién-usa-a-quién),
// determinista, 0-dep, commit-able. Token-first: se inyecta a las fases para que el modelo NO lea N ficheros solo
// para entender de qué depende un fichero y a quién rompe si lo toca (blast-radius). La "pata" que falta al índice
// verificado (specs+cambios) y al mapa brownfield (stack+dirs).
//
// TÉCNICA (decisión de producto): extracción por PATRONES (regex por lenguaje), NO AST — tree-sitter/embeddings son
// deps nativas por plataforma y matan el 0-dep desplegable a ~150 máquinas. Regex capta el ~80% barato (imports
// top-level, exports, defs top-level); lo ambiguo (re-exports encadenados, DI dinámica, decoradores) se MARCA como
// no-resuelto, JAMÁS se inventa → salida reproducible byte-a-byte. CONFIDENCIALIDAD: solo del propio repo, snapshot
// determinista, sin memoria cross-run, sin red. Idea genérica (grafo de relaciones local); implementación propia.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve, relative, dirname, extname } from 'node:path';

// lenguajes cubiertos hoy: JS/TS (el grueso Angular/React). Añadir lenguaje = añadir una entrada, no un motor nuevo.
const SRC_EXT = new Set(['.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx']);
const RESOLVE_EXT = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']; // orden de tanteo al resolver un import sin extensión
const SKIP_DIR = new Set(['node_modules', 'dist', 'build', 'out', 'coverage', '.next', '.nuxt', 'vendor', '.cache', 'tmp', '.tmp']);
const MAX_BYTES = 512 * 1024; // no parsear ficheros gigantes (bundles/minificados) — coste sin señal

// ruta relativa a root con separador '/' SIEMPRE (determinismo cross-OS: Windows no debe producir otro índice)
const relPath = (root, p) => relative(root, p).split('\\').join('/');
// símbolo seguro para inyectar en un prompt: sin espacios/saltos (anti-inyección) y acotado
const safeSym = (s) => String(s).replace(/[^\w$.-]/g, '').slice(0, 40);

// EXTRACCIÓN JS/TS por regex. Devuelve { imports:[spec…], exports:[name…], defines:[name…] } (sin ordenar aquí).
// LÍMITE honesto (regex ≠ AST): un import citado dentro de un string/template puede colarse como arista falsa;
// dirección conservadora (blast-radius de más, nunca de menos). La clase COMÚN (comentarios // y JSDoc *) sí se
// filtra: fuera líneas que EMPIEZAN por // o * — un import/export real jamás empieza así, y no toca http:// (mid-línea)
// ni bloques /*…*/ (strippearlos rompería strings con globs tipo **/*.js).
export function extractJs(src) {
  src = String(src).replace(/^[ \t]*(?:\/\/|\*).*$/gm, '');
  const imports = new Set(), exports = new Set(), defines = new Set();
  // import … from 'x'  ·  import 'x'  ·  export … from 'x'  ·  require('x')  ·  import('x')
  for (const m of src.matchAll(/\bimport\s+(?:[^'"();]*?\bfrom\s+)?['"]([^'"]+)['"]/g)) imports.add(m[1]);
  for (const m of src.matchAll(/\bexport\s+[^'"();]*?\bfrom\s+['"]([^'"]+)['"]/g)) imports.add(m[1]);
  for (const m of src.matchAll(/\brequire\(\s*['"]([^'"]+)['"]\s*\)/g)) imports.add(m[1]);
  for (const m of src.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)) imports.add(m[1]);
  // export (default) (async) function|class|const|let|var NAME
  for (const m of src.matchAll(/\bexport\s+(?:default\s+)?(?:async\s+)?(?:function\s*\*?|class|const|let|var)\s+([A-Za-z_$][\w$]*)/g)) exports.add(m[1]);
  // export { A, B as C } → nombre EXPUESTO = el de después de 'as' (o el propio)
  for (const m of src.matchAll(/\bexport\s*\{([^}]*)\}/g)) for (const part of m[1].split(',')) { const nm = part.trim().split(/\s+as\s+/).pop().trim(); if (/^[A-Za-z_$][\w$]*$/.test(nm)) exports.add(nm); }
  if (/\bexport\s+default\b/.test(src)) exports.add('default');
  for (const m of src.matchAll(/\bmodule\.exports\s*=/g)) exports.add('default'); // CommonJS default
  for (const m of src.matchAll(/\bexports\.([A-Za-z_$][\w$]*)\s*=/g)) exports.add(m[1]);
  // DEFINICIONES top-level (la línea empieza SIN indentación → símbolo del módulo, no anidado)
  for (const m of src.matchAll(/^(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function\s*\*?|class)\s+([A-Za-z_$][\w$]*)/gm)) defines.add(m[1]);
  for (const m of src.matchAll(/^(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/gm)) defines.add(m[1]);
  return { imports: [...imports], exports: [...exports], defines: [...defines] };
}

// resuelve un import spec a una ruta-relativa-a-root de ESTE repo, o null (externo/no-resuelto — se marca, no se inventa).
function resolveSpec(root, fromFileAbs, spec, fileSet) {
  if (!spec.startsWith('.')) return null; // bare specifier (react, @angular/core…) = externo → fuera del grafo interno
  const baseAbs = resolve(dirname(fromFileAbs), spec);
  const cands = [];
  const e = extname(baseAbs);
  if (e && SRC_EXT.has(e)) cands.push(baseAbs); // ya trae extensión de fuente
  else {
    for (const x of RESOLVE_EXT) cands.push(baseAbs + x);            // ./foo → ./foo.ts
    for (const x of RESOLVE_EXT) cands.push(join(baseAbs, 'index' + x)); // ./foo → ./foo/index.ts (barrels)
  }
  for (const c of cands) { const r = relPath(root, c); if (fileSet.has(r)) return r; }
  return null;
}

// recorre el árbol de fuentes (determinista: dirs y ficheros ordenados) saltando dirs pesados y ocultos.
function walkSources(root, maxFiles) {
  const out = [];
  const rec = (dir) => {
    if (out.length >= maxFiles) return;
    let ents; try { ents = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const ent of ents.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
      if (out.length >= maxFiles) return;
      const p = join(dir, ent.name);
      if (ent.isDirectory()) { if (!ent.name.startsWith('.') && !SKIP_DIR.has(ent.name)) rec(p); }
      else if (SRC_EXT.has(extname(ent.name))) out.push(p);
    }
  };
  rec(root);
  return out;
}

// ÍNDICE completo: por fichero { exports, imports:[{spec,to}], defines } + inverso usedBy. Determinista.
export function buildCodeMap(projectRoot, { maxFiles = 4000 } = {}) {
  const root = resolve(projectRoot);
  const absFiles = walkSources(root, maxFiles);
  const fileSet = new Set(absFiles.map((p) => relPath(root, p)));
  const files = {};
  for (const abs of absFiles) {
    const rp = relPath(root, abs);
    let src = '';
    try { const buf = readFileSync(abs); if (buf.length > MAX_BYTES) { files[rp] = { exports: [], imports: [], defines: [], skipped: 'large' }; continue; } src = buf.toString('utf8'); } catch { files[rp] = { exports: [], imports: [], defines: [] }; continue; }
    const { imports, exports, defines } = extractJs(src);
    const resolved = imports.map((spec) => ({ spec, to: resolveSpec(root, abs, spec, fileSet) })).sort((a, b) => (a.spec < b.spec ? -1 : a.spec > b.spec ? 1 : 0));
    files[rp] = { exports: [...new Set(exports)].sort(), imports: resolved, defines: [...new Set(defines)].sort() };
  }
  // inverso usedBy: para cada fichero interno, quién lo importa (blast-radius de 1er nivel)
  const usedBy = {};
  for (const rp of Object.keys(files).sort()) for (const imp of files[rp].imports) if (imp.to) (usedBy[imp.to] ||= []).push(rp);
  for (const k of Object.keys(usedBy)) usedBy[k] = [...new Set(usedBy[k])].sort();
  return { root: relPath(root, root) || '.', files, usedBy, generatedFrom: 'regex-jsts' };
}

// vecindad (blast-radius) de un conjunto de ficheros foco: sus deps internas resueltas + quién los usa (1er nivel).
export function neighborhood(map, focusRel) {
  const focus = (Array.isArray(focusRel) ? focusRel : [focusRel]).map((f) => String(f).split('\\').join('/')).filter((f) => map.files[f]);
  const nb = new Set(focus);
  for (const f of focus) {
    for (const imp of map.files[f].imports) if (imp.to) nb.add(imp.to);       // de qué depende
    for (const u of (map.usedBy[f] || [])) nb.add(u);                          // quién lo rompe si lo tocas
  }
  return { focus, files: [...nb].sort() };
}

// RENDER token-first: bloque DENSO (una línea por fichero) inyectable a las fases. Si hay `focus`, solo su vecindad;
// si no, un top del proyecto (domain-first) acotado. Anti-inyección: símbolos/rutas saneados y en una sola línea.
export function renderCodeMap(map, { focus = [], domain = '', maxFiles = 50, maxSyms = 6 } = {}) {
  if (!map || !map.files || !Object.keys(map.files).length) return '';
  let list;
  const focusSet = new Set();
  if (focus && focus.length) {
    const nb = neighborhood(map, focus);
    if (!nb.focus.length) return ''; // los ficheros foco no están en el índice → nada fiable que decir
    for (const f of nb.focus) focusSet.add(f);
    list = nb.files;
  } else {
    list = Object.keys(map.files);
    if (domain) list = list.sort((a, b) => (a.includes(domain) ? -1 : b.includes(domain) ? 1 : 0)); // dominio del cambio primero
    else list = list.sort((a, b) => ((map.usedBy[b]?.length || 0) - (map.usedBy[a]?.length || 0)) || (a < b ? -1 : 1)); // más usados primero
  }
  const lines = [];
  for (const rp of list.slice(0, maxFiles)) {
    const f = map.files[rp]; if (!f) continue;
    const exps = f.exports.slice(0, maxSyms).map(safeSym).filter(Boolean);
    const deps = f.imports.filter((i) => i.to).map((i) => i.to).slice(0, maxSyms);
    const users = map.usedBy[rp] || [];
    const parts = [`- ${rp}`];
    if (exps.length) parts.push(`exports: ${exps.join(', ')}${f.exports.length > exps.length ? '…' : ''}`);
    if (deps.length) parts.push(`uses→ ${deps.join(', ')}${f.imports.filter((i) => i.to).length > deps.length ? '…' : ''}`);
    if (users.length) parts.push(`usedBy(${users.length}): ${users.slice(0, maxSyms).join(', ')}${users.length > maxSyms ? '…' : ''}`);
    lines.push(parts.join(' · '));
  }
  if (!lines.length) return '';
  const head = focusSet.size
    ? 'CODE RELATIONSHIP MAP — blast-radius around the files this change touches (deterministic, from source; do NOT re-scan these files to rediscover their imports/exports/who-uses-them):'
    : 'CODE RELATIONSHIP MAP — most-referenced modules (deterministic index of exports/dependencies/usedBy; use it to LOCATE relevant files without scanning the repo):';
  return [head, ...lines].join('\n');
}
