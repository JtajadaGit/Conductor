// prompt-context.test.mjs — experiencia Copilot en el prompt: @fichero (contexto pre-inyectado, CONFINADO) y /skill (fuerza
// la skill invocada). Además de los endpoints que alimentan el autocompletado: /api/files y /api/skills.
import { referencedFiles, mentionedSkills } from '../lib/pipeline/drive.mjs';
import { plumbPath } from '../lib/core/plumb.mjs';
import { createAppServer } from '../lib/serving/serve.mjs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));
if (!process.env.CONDUCTOR_HOME) process.env.CONDUCTOR_HOME = join(HERE, '.tmp-home');
const w2 = (abs, c) => { mkdirSync(dirname(abs), { recursive: true }); writeFileSync(abs, c); };

// ── referencedFiles: @ruta → contenido pre-inyectado, CONFINADO al proyecto ──
await test('prompt-context: referencedFiles inyecta el contenido de los ficheros @-referenciados (confinado)', () => {
  const ROOT = join(HERE, '.tmp-reffiles');
  rmSync(ROOT, { recursive: true, force: true });
  w2(join(ROOT, 'src', 'cart.js'), 'export const total = (xs) => xs.reduce((a, b) => a + b, 0);');
  const blk = referencedFiles('haz un carrito como @src/cart.js pero con cupones', ROOT);
  assert(blk.includes('src/cart.js'), 'lista el fichero referenciado');
  assert(blk.includes('const total'), 'incluye su CONTENIDO (contexto pre-inyectado, el agente lo ve seguro)');
  assert(/untrusted DATA/i.test(blk), 'marca el contenido como DATO no confiable (anti-inyección)');
});

await test('prompt-context: referencedFiles CONFINA — un @../ fuera del proyecto o inexistente se ignora', () => {
  const ROOT = join(HERE, '.tmp-refconfine');
  rmSync(ROOT, { recursive: true, force: true });
  w2(join(ROOT, 'ok.js'), 'const ok = 1;');
  const blk = referencedFiles('mira @../../secretos.env y @no-existe.js y @ok.js', ROOT);
  assert(!/secretos/.test(blk), 'un @../ que escapa del proyecto NO se lee (confinamiento)');
  assert(!/no-existe/.test(blk), 'un fichero inexistente se ignora sin romper');
  assert(blk.includes('ok.js') && blk.includes('const ok'), 'el fichero válido sí se inyecta');
});

await test('prompt-context: sin @-referencias → bloque vacío (cero ruido)', () => {
  eq(referencedFiles('haz un contador simple sin ejemplos', join(HERE, '.tmp-none')), '', 'sin @ → vacío');
});

// presupuesto POR FICHERO + superficie de codemap (deep-search 2026-08-03): un @fichero gigante ya no se
// come el presupuesto global de los demás, y al truncarse el modelo aún ve su superficie (exports/usedBy)
await test('prompt-context: @fichero gigante → cap de 6k POR FICHERO, los demás conservan presupuesto, y la superficie del codemap completa el truncado', () => {
  const ROOT = join(HERE, '.tmp-refbudget');
  rmSync(ROOT, { recursive: true, force: true });
  w2(join(ROOT, 'gordo.js'), 'export const gorda = 1;\n' + '// relleno\n'.repeat(2000)); // ~20k chars
  w2(join(ROOT, 'flaco.js'), 'export const flaca = 2;');
  const cmap = { files: { 'gordo.js': { exports: ['gorda'], imports: [], defines: [] } }, usedBy: { 'gordo.js': ['flaco.js'] } };
  const blk = referencedFiles('mira @gordo.js y @flaco.js', ROOT, cmap);
  assert(blk.includes('… (truncado)'), 'el gigante se trunca al cap por fichero');
  assert(blk.includes('const flaca'), 'el segundo fichero CONSERVA presupuesto (antes el gigante se lo comía)');
  assert(blk.includes('superficie completa (codemap)') && blk.includes('exports: gorda') && blk.includes('usedBy: flaco.js'), 'el truncado se completa con su superficie del codemap');
  const blkSinMapa = referencedFiles('mira @gordo.js y @flaco.js', ROOT);
  assert(!blkSinMapa.includes('superficie completa'), 'sin codemap → sin superficie (cero regresión)');
});

await test('prompt-context: referencedFiles NUNCA inyecta ficheros de secretos (@.env, @*.pem)', () => {
  const ROOT = join(HERE, '.tmp-refsecret');
  rmSync(ROOT, { recursive: true, force: true });
  w2(join(ROOT, '.env'), 'API_KEY=sk-secretazo-123');
  w2(join(ROOT, 'deploy.pem'), '-----BEGIN PRIVATE KEY-----abc');
  w2(join(ROOT, 'app.js'), 'const a = 1;');
  const blk = referencedFiles('usa @.env y @deploy.pem y @app.js', ROOT);
  assert(!/secretazo/.test(blk) && !/BEGIN PRIVATE KEY/.test(blk), 'el contenido de .env/.pem NO se inyecta jamás (denylist)');
  assert(blk.includes('app.js') && blk.includes('const a'), 'el fichero normal sí se inyecta');
});

await test('prompt-context: referencedFiles admite @"ruta con espacios"', () => {
  const ROOT = join(HERE, '.tmp-refspace');
  rmSync(ROOT, { recursive: true, force: true });
  w2(join(ROOT, 'my file.js'), 'const espacio = true;');
  const blk = referencedFiles('mira @"my file.js" por favor', ROOT);
  assert(blk.includes('const espacio'), 'lee el fichero con espacios cuando se cita con comillas');
});

// ── mentionedSkills: /nombre → fuerza SOLO skills existentes ──
await test('prompt-context: mentionedSkills fuerza la skill invocada con / (intersección con las cargadas)', () => {
  const team = [{ name: 'angular-signals', match: ['front'] }, { name: 'php-repo', match: [] }];
  const m = mentionedSkills('aplica /angular-signals aquí y ojo con /rutas/varias', team);
  eq(m.length, 1, 'solo la skill que EXISTE');
  eq(m[0].name, 'angular-signals');
  eq(mentionedSkills('/desconocida hazlo', team).length, 0, 'un /token que no es skill no fuerza nada');
});

// ── endpoints del autocompletado ──
await test('prompt-context: /api/files lista ficheros del proyecto (excluye node_modules) y filtra por ?q=', async () => {
  const ROOT = join(HERE, '.tmp-files-ep');
  rmSync(ROOT, { recursive: true, force: true });
  mkdirSync(join(ROOT, 'openspec'), { recursive: true }); writeFileSync(join(ROOT, 'openspec', 'conductor.json'), '{}');
  w2(join(ROOT, 'src', 'cart.js'), '//');
  w2(join(ROOT, 'src', 'header.ts'), '//');
  w2(join(ROOT, 'node_modules', 'dep', 'index.js'), '//'); // debe EXCLUIRSE
  const srv = await createAppServer({ root: ROOT, engine: 'E.mjs', spawnRun: () => ({ on() {}, send() {}, kill() {} }) });
  try {
    const all = await (await fetch(srv.url + 'api/files')).json();
    assert(all.files.includes('src/cart.js') && all.files.includes('src/header.ts'), 'lista ficheros del proyecto');
    assert(!all.files.some((f) => f.includes('node_modules')), 'node_modules EXCLUIDO');
    const q = await (await fetch(srv.url + 'api/files?q=cart')).json();
    assert(q.files.includes('src/cart.js') && !q.files.includes('src/header.ts'), '?q= filtra por substring');
  } finally { await srv.close(); rmSync(ROOT, { recursive: true, force: true }); }
});

await test('prompt-context: /api/files NUNCA ofrece ficheros de secretos (.env, .pem) al autocompletado @', async () => {
  const ROOT = join(HERE, '.tmp-files-secret');
  rmSync(ROOT, { recursive: true, force: true });
  mkdirSync(join(ROOT, 'openspec'), { recursive: true }); writeFileSync(join(ROOT, 'openspec', 'conductor.json'), '{}');
  w2(join(ROOT, 'src', 'app.js'), '//');
  w2(join(ROOT, '.env'), 'SECRET=x');
  w2(join(ROOT, 'cert.pem'), 'x');
  const srv = await createAppServer({ root: ROOT, engine: 'E.mjs', spawnRun: () => ({ on() {}, send() {}, kill() {} }) });
  try {
    const all = await (await fetch(srv.url + 'api/files')).json();
    assert(all.files.includes('src/app.js'), 'lista ficheros normales');
    assert(!all.files.includes('.env') && !all.files.some((f) => f.endsWith('.pem')), '.env / .pem NUNCA se ofrecen al @');
  } finally { await srv.close(); rmSync(ROOT, { recursive: true, force: true }); }
});

await test('prompt-context: /api/skills lista los patrones de equipo (nombre + título + scope)', async () => {
  const ROOT = join(HERE, '.tmp-skills-ep');
  rmSync(ROOT, { recursive: true, force: true });
  mkdirSync(join(ROOT, 'openspec'), { recursive: true }); writeFileSync(join(ROOT, 'openspec', 'conductor.json'), '{}');
  w2(plumbPath(ROOT, 'skills', 'angular-signals', 'SKILL.md'), '---\nname: angular-signals\ntitle: Angular Signals\nmatch: front\n---\nUsa signals.');
  const srv = await createAppServer({ root: ROOT, engine: 'E.mjs', spawnRun: () => ({ on() {}, send() {}, kill() {} }) });
  try {
    const r = await (await fetch(srv.url + 'api/skills')).json();
    const s = r.skills.find((x) => x.name === 'angular-signals');
    assert(s, 'lista la skill del proyecto');
    eq(s.title, 'Angular Signals', 'con su título');
    eq(s.scope, 'project', 'con su scope');
  } finally { await srv.close(); rmSync(ROOT, { recursive: true, force: true }); }
});
