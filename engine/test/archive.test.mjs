// Board de archive + búsqueda ligera (Ola 3).
import { listArchive, searchChanges } from '../lib/analysis/archive.mjs';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '.tmp-archive');
const w = (p, c) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, c); };
const CH = (sub) => join(ROOT, 'openspec', 'changes', sub);

function seed() {
  rmSync(ROOT, { recursive: true, force: true });
  // activo
  w(join(CH('login'), '.conductor', 'timeline.json'), JSON.stringify({ verdict: 'GREEN', request: 'añade login con OAuth', phases: [{}, {}] }));
  w(join(CH('login'), 'specs', 'auth', 'spec.md'), '## ADDED Requirements\nThe system SHALL authenticate via OAuth token.');
  // archivado
  w(join(CH('archive/2026-06-10-counter'), '.conductor', 'timeline.json'), JSON.stringify({ verdict: 'GREEN', request: 'añade un counter', phases: [{}, {}, {}] }));
}

await test('archive: listArchive lee fecha, nombre y verdict de los archivados', () => {
  seed();
  const a = listArchive(ROOT);
  eq(a.length, 1, 'un archivado');
  eq(a[0].name, 'counter'); eq(a[0].date, '2026-06-10'); eq(a[0].verdict, 'GREEN'); eq(a[0].phases, 3);
});

await test('archive: searchChanges encuentra en activos y archivados (request/spec)', () => {
  seed();
  const oauth = searchChanges(ROOT, 'oauth');
  assert(oauth.some((h) => h.name === 'login' && !h.archived), 'encuentra "oauth" en el spec del activo');
  const counter = searchChanges(ROOT, 'counter');
  assert(counter.some((h) => h.name === 'counter' && h.archived), 'encuentra "counter" en el archivado');
  eq(searchChanges(ROOT, ''), [], 'query vacía = sin resultados');
  rmSync(ROOT, { recursive: true, force: true });
});
