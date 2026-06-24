// Board de archive + búsqueda ligera (Ola 3).
import { listArchive, searchChanges, promoteSpec, archiveChange } from '../lib/analysis/archive.mjs';
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
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

await test('archive(#69): promoteSpec promueve SOLO ADDED (aditivo), crea skeleton, conserva id y quita la cabecera delta', () => {
  rmSync(ROOT, { recursive: true, force: true });
  w(join(CH('feat-login'), 'specs', 'auth', 'spec.md'),
    '## ADDED Requirements\n\n<!-- id: REQ-AUTH -->\n### Requirement: Login\nThe system SHALL authenticate users.\n#### Scenario: valid\n- **GIVEN** a user\n- **WHEN** they log in\n- **THEN** a session starts\n');
  const specsRoot = join(ROOT, 'openspec', 'specs');
  const r = promoteSpec(CH('feat-login'), specsRoot);
  eq(r.needsManualMerge, false, 'solo ADDED → sin merge manual');
  eq(r.promoted.length, 1); eq(r.promoted[0].domain, 'auth'); eq(r.promoted[0].created, true);
  const out = readFileSync(join(specsRoot, 'auth', 'spec.md'), 'utf8');
  assert(/# Auth Specification/.test(out) && /## Purpose/.test(out), 'skeleton con título y propósito');
  assert(/### Requirement: Login/.test(out) && /#### Scenario: valid/.test(out), 'promueve requirement + scenario');
  assert(/<!-- id: REQ-AUTH -->/.test(out), 'conserva el ancla de trazabilidad');
  assert(!/## ADDED Requirements/.test(out), 'la cabecera delta NO se promueve (regla dura)');
});

await test('archive(#69): promoteSpec con MODIFIED → needsManualMerge y NO toca lo no-aditivo', () => {
  rmSync(ROOT, { recursive: true, force: true });
  w(join(CH('feat-x'), 'specs', 'core', 'spec.md'),
    '## ADDED Requirements\n\n### Requirement: New\nThe system SHALL do new.\n#### Scenario: s\n- **GIVEN** a\n- **WHEN** b\n- **THEN** c\n\n## MODIFIED Requirements\n\n### Requirement: Old\nThe system SHALL do old differently.\n');
  const specsRoot = join(ROOT, 'openspec', 'specs');
  const r = promoteSpec(CH('feat-x'), specsRoot);
  eq(r.needsManualMerge, true, 'MODIFIED presente → merge manual marcado');
  const out = readFileSync(join(specsRoot, 'core', 'spec.md'), 'utf8');
  assert(/### Requirement: New/.test(out), 'promueve el ADDED');
  assert(!/Requirement: Old/.test(out), 'NO promueve el MODIFIED (lo deja a la skill/humano)');
});

await test('archive(#69): promoteSpec preserva # Title/## Purpose al añadir a un spec existente', () => {
  rmSync(ROOT, { recursive: true, force: true });
  const specsRoot = join(ROOT, 'openspec', 'specs');
  w(join(specsRoot, 'auth', 'spec.md'), '# Auth Specification\n\n## Purpose\n\nEl dominio de autenticación.\n\n### Requirement: Existing\nThe system SHALL keep working.\n');
  w(join(CH('feat-2fa'), 'specs', 'auth', 'spec.md'), '## ADDED Requirements\n\n### Requirement: TwoFactor\nThe system SHALL support 2FA.\n#### Scenario: s\n- **GIVEN** a\n- **WHEN** b\n- **THEN** c\n');
  const r = promoteSpec(CH('feat-2fa'), specsRoot);
  eq(r.promoted[0].created, false, 'el target existía → no se recrea');
  const out = readFileSync(join(specsRoot, 'auth', 'spec.md'), 'utf8');
  assert(/El dominio de autenticación\./.test(out) && /### Requirement: Existing/.test(out), 'conserva propósito y requirement previo');
  assert(/### Requirement: TwoFactor/.test(out), 'añade el nuevo requirement');
});

await test('archive(#69): archiveChange mueve a archive/YYYY-MM-DD-name; idempotente; confina a openspec/changes/', () => {
  rmSync(ROOT, { recursive: true, force: true });
  w(join(CH('feat-done'), '.conductor', 'timeline.json'), JSON.stringify({ verdict: 'GREEN', request: 'x', phases: [{}] }));
  const archiveBase = join(ROOT, 'openspec', 'changes', 'archive');
  const res = archiveChange(CH('feat-done'), archiveBase, '2026-06-23');
  eq(res.archivedDir, '2026-06-23-feat-done');
  assert(!existsSync(CH('feat-done')), 'el change se movió (origen ya no existe)');
  assert(existsSync(join(archiveBase, '2026-06-23-feat-done', '.conductor', 'timeline.json')), 'el contenido está en archive');
  eq(listArchive(ROOT).some((a) => a.name === 'feat-done'), true, 'listArchive lo ve');
  w(join(CH('feat-done'), 'x.txt'), 'dup');
  let threw = false; try { archiveChange(CH('feat-done'), archiveBase, '2026-06-23'); } catch (e) { threw = /Already archived/.test(e.message); }
  assert(threw, 'destino existente → Already archived (idempotente)');
  let blocked = false; try { archiveChange(join(ROOT, 'openspec', 'specs'), archiveBase, '2026-06-23'); } catch (e) { blocked = /rechazado|fuera/.test(e.message); }
  assert(blocked, 'ruta fuera de openspec/changes/ rechazada');
  rmSync(ROOT, { recursive: true, force: true });
});
