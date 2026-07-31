// run-changes.test.mjs — endpoint /api/run/.../files: el CHANGESET del run (experiencia Git) — ficheros × tipo × líneas
// +/− vs HEAD, incluido lo untracked, vía índice propio (no toca el índice del usuario). Excluye .conductor (plumbing).
import { createAppServer } from '../lib/serving/serve.mjs';
import { plumbPath } from '../lib/core/plumb.mjs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync, rmSync, renameSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
if (!process.env.CONDUCTOR_HOME) process.env.CONDUCTOR_HOME = join(HERE, '.tmp-home');
const git = (cwd, ...a) => execFileSync('git', a, { cwd, stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });

await test('run-changes: /api/run/.../files → changeset git (tipo + líneas +/−), excluye plumbing', async () => {
  const ROOT = join(HERE, '.tmp-run-changes');
  rmSync(ROOT, { recursive: true, force: true });
  mkdirSync(join(ROOT, 'src'), { recursive: true });
  mkdirSync(plumbPath(join(ROOT, 'openspec', 'changes', 'feat')), { recursive: true });
  writeFileSync(join(ROOT, 'openspec', 'conductor.json'), '{}');
  writeFileSync(join(ROOT, 'src', 'a.js'), 'const a = 1;\nconst b = 2;\n');
  git(ROOT, 'init'); git(ROOT, 'config', 'user.email', 't@t'); git(ROOT, 'config', 'user.name', 't');
  git(ROOT, 'add', '-A'); git(ROOT, 'commit', '-m', 'base');
  // el "run" toca: MODIFICA a.js (+1 línea) y CREA b.js (nuevo)
  writeFileSync(join(ROOT, 'src', 'a.js'), 'const a = 1;\nconst b = 2;\nconst c = 3;\n');
  writeFileSync(join(ROOT, 'src', 'b.js'), 'export const nuevo = true;\n');
  const srv = await createAppServer({ root: ROOT, engine: 'E.mjs', spawnRun: () => ({ on() {}, send() {}, kill() {} }) });
  try {
    const r = await (await fetch(srv.url + 'api/run/feat/files')).json();
    eq(r.fromGit, true, 'usa el changeset REAL de git');
    const by = Object.fromEntries(r.files.map((f) => [f.p, f]));
    assert(by['src/a.js'] && by['src/a.js'].k === 'edit', 'a.js modificado → edit');
    assert(by['src/b.js'] && by['src/b.js'].k === 'create', 'b.js nuevo → create');
    eq(by['src/a.js'].added, 1, 'a.js: +1 línea');
    eq(by['src/b.js'].added, 1, 'b.js: +1 línea (fichero nuevo, contado)');
    eq(r.totals.files, 2, 'solo los 2 ficheros de código (conductor.json ya commiteado; .conductor excluido)');
    assert(r.totals.added >= 2, 'total de líneas añadidas coherente');
  } finally { await srv.close(); rmSync(ROOT, { recursive: true, force: true }); }
});

await test('run-changes: con BASELINE del run, /api/files muestra SOLO lo que tocó el run (no lo pre-existente sin commitear)', async () => {
  const ROOT = join(HERE, '.tmp-run-baseline');
  rmSync(ROOT, { recursive: true, force: true });
  mkdirSync(join(ROOT, 'src'), { recursive: true });
  const cdir = plumbPath(join(ROOT, 'openspec', 'changes', 'feat2')); mkdirSync(cdir, { recursive: true });
  writeFileSync(join(ROOT, 'openspec', 'conductor.json'), '{}');
  writeFileSync(join(ROOT, 'src', 'a.js'), 'const a = 1;\n');
  git(ROOT, 'init'); git(ROOT, 'config', 'user.email', 't@t'); git(ROOT, 'config', 'user.name', 't');
  git(ROOT, 'add', '-A'); git(ROOT, 'commit', '-m', 'base');
  // PRE-EXISTENTE (antes del run): a.js modificado sin commitear
  writeFileSync(join(ROOT, 'src', 'a.js'), 'const a = 999; // toqueteado ANTES del run\n');
  // BASELINE del run = árbol AHORA (con el cambio pre-existente dentro), como hace captureBaseTree al arrancar
  const bidx = join(cdir, 'base-index'); const benv = { ...process.env, GIT_INDEX_FILE: bidx };
  execFileSync('git', ['add', '-A'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true, env: benv });
  const tree = execFileSync('git', ['write-tree'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true, env: benv }).trim();
  writeFileSync(join(cdir, 'base-tree'), tree);
  // el RUN crea b.js (su único cambio real)
  writeFileSync(join(ROOT, 'src', 'b.js'), 'export const delRun = true;\n');
  const srv = await createAppServer({ root: ROOT, engine: 'E.mjs', spawnRun: () => ({ on() {}, send() {}, kill() {} }) });
  try {
    const r = await (await fetch(srv.url + 'api/run/feat2/files')).json();
    const by = Object.fromEntries(r.files.map((f) => [f.p, f]));
    assert(by['src/b.js'], 'b.js (creado por el run) SÍ aparece');
    assert(!by['src/a.js'], 'a.js (cambio pre-existente sin commitear) NO aparece — el baseline lo excluye');
    eq(r.totals.files, 1, 'solo 1 fichero: el del run');
  } finally { await srv.close(); rmSync(ROOT, { recursive: true, force: true }); }
});

await test('run-changes: un RENAME → una fila con la ruta DESTINO (parsing -z desambigua old→new; -M fuerza detección)', async () => {
  const ROOT = join(HERE, '.tmp-run-rename');
  rmSync(ROOT, { recursive: true, force: true });
  mkdirSync(join(ROOT, 'src'), { recursive: true });
  mkdirSync(plumbPath(join(ROOT, 'openspec', 'changes', 'feat3')), { recursive: true });
  writeFileSync(join(ROOT, 'openspec', 'conductor.json'), '{}');
  const content = Array.from({ length: 8 }, (_, i) => `export const v${i} = ${i};`).join('\n') + '\n';
  writeFileSync(join(ROOT, 'src', 'old.js'), content);
  git(ROOT, 'init'); git(ROOT, 'config', 'user.email', 't@t'); git(ROOT, 'config', 'user.name', 't');
  git(ROOT, 'add', '-A'); git(ROOT, 'commit', '-m', 'base');
  renameSync(join(ROOT, 'src', 'old.js'), join(ROOT, 'src', 'renamed.js')); // el run renombra (mismo contenido → R100)
  const srv = await createAppServer({ root: ROOT, engine: 'E.mjs', spawnRun: () => ({ on() {}, send() {}, kill() {} }) });
  try {
    const r = await (await fetch(srv.url + 'api/run/feat3/files')).json();
    const by = Object.fromEntries(r.files.map((f) => [f.p, f]));
    assert(by['src/renamed.js'], 'la ruta DESTINO del rename aparece (antes quedaba huérfana por el desajuste numstat↔name-status)');
    assert(!by['src/old.js'], 'la ruta ORIGEN no aparece por separado (git lo reporta como rename, no delete+create)');
  } finally { await srv.close(); rmSync(ROOT, { recursive: true, force: true }); }
});

await test('run-changes: rutas no-ASCII llegan intactas al changeset (core.quotePath=false)', async () => {
  const ROOT = join(HERE, '.tmp-run-utf8');
  rmSync(ROOT, { recursive: true, force: true });
  mkdirSync(join(ROOT, 'src'), { recursive: true });
  mkdirSync(plumbPath(join(ROOT, 'openspec', 'changes', 'feat4')), { recursive: true });
  writeFileSync(join(ROOT, 'openspec', 'conductor.json'), '{}');
  writeFileSync(join(ROOT, 'src', 'a.js'), 'const a = 1;\n');
  git(ROOT, 'init'); git(ROOT, 'config', 'user.email', 't@t'); git(ROOT, 'config', 'user.name', 't');
  git(ROOT, 'add', '-A'); git(ROOT, 'commit', '-m', 'base');
  writeFileSync(join(ROOT, 'src', 'café.js'), 'export const cafe = true;\n'); // fichero nuevo con nombre no-ASCII
  const srv = await createAppServer({ root: ROOT, engine: 'E.mjs', spawnRun: () => ({ on() {}, send() {}, kill() {} }) });
  try {
    const r = await (await fetch(srv.url + 'api/run/feat4/files')).json();
    const by = Object.fromEntries(r.files.map((f) => [f.p, f]));
    assert(by['src/café.js'] && by['src/café.js'].k === 'create', 'el nombre no-ASCII llega crudo (sin octal-escape \\303\\251)');
  } finally { await srv.close(); rmSync(ROOT, { recursive: true, force: true }); }
});
