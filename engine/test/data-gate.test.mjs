// data-gate.test.mjs — R-G7/R-S4: gate de DATOS para migraciones. Linter DDL + PII en columnas sobre el SQL
// escrito; bloquea el GREEN ante operaciones destructivas. Y sello estricto (traceAffectsVerdict) con strict.
import { scanData } from '../lib/gates/data.mjs';
import { drive } from '../lib/pipeline/drive.mjs';
import { plumbPath } from '../lib/core/plumb.mjs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';

const TMP = join(dirname(fileURLToPath(import.meta.url)), '.tmp-datagate');
process.env.CONDUCTOR_CAPTURE = 'fs';
const fresh = () => { rmSync(TMP, { recursive: true, force: true }); mkdirSync(TMP, { recursive: true }); };
const w = (rel, c) => { const p = join(TMP, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, c); return rel; };
const ENVK = ['CONDUCTOR_MODEL', 'COPILOT_MODEL', 'CONDUCTOR_MODEL_CODER', 'CONDUCTOR_MODEL_PLANNER', 'CONDUCTOR_MODEL_REVIEWER', 'CONDUCTOR_PRESET'];
const clearEnv = () => { const s = Object.fromEntries(ENVK.map((k) => [k, process.env[k]])); for (const k of ENVK) delete process.env[k]; return s; };
const restoreEnv = (s) => { for (const k of ENVK) { if (s[k] === undefined) delete process.env[k]; else process.env[k] = s[k]; } };

await test('data-gate: detecta DDL destructivo (DROP TABLE / DROP COLUMN / TRUNCATE / DELETE sin WHERE)', () => {
  fresh();
  const files = [
    w('m1.sql', 'DROP TABLE users;'),
    w('m2.sql', 'ALTER TABLE users DROP COLUMN email;'),
    w('m3.sql', 'TRUNCATE logs;'),
    w('m4.sql', 'DELETE FROM sessions;'),
  ];
  const f = scanData(TMP, files);
  const rules = f.map((x) => x.rule);
  assert(rules.includes('data.drop-table'));
  assert(rules.includes('data.drop-column'));
  assert(rules.includes('data.truncate'));
  assert(rules.includes('data.unscoped-dml'));
  assert(f.filter((x) => x.severity === 'breaking').length >= 4, 'las destructivas son breaking');
});

await test('data-gate: PII en nombre de columna → warning', () => {
  fresh();
  const f = scanData(TMP, [w('m.sql', 'CREATE TABLE clients (id int, credit_card varchar(20), ssn varchar(11));')]);
  assert(f.some((x) => x.rule === 'data.pii-column' && x.severity === 'warning'), 'marca columnas PII');
});

await test('data-gate: migración segura (expand-contract con WHERE) → 0 findings; ignora no-SQL', () => {
  fresh();
  const ok = w('safe.sql', 'ALTER TABLE users ADD COLUMN nickname varchar(50) DEFAULT \'\';\nUPDATE users SET nickname = name WHERE nickname = \'\';');
  const js = w('app.js', 'DROP TABLE everything; // esto es JS, no SQL — no se escanea');
  eq(scanData(TMP, [ok]).length, 0, 'migración segura limpia');
  eq(scanData(TMP, [js]).length, 0, 'un .js no se escanea (solo .sql)');
});

// agente que escribe código tagueado (trace ok) + un SQL parametrizable
const mkAgent = (sql) => (a) => {
  const { phase, writeTo, cwd } = a;
  if (phase === 'apply' || phase === 'fix') {
    w2(join(cwd, 'src', 'c.js'), '// @conductor REQ-C\nexport const x=1;');
    w2(join(cwd, 'src', 'c.test.js'), '// @conductor REQ-C\ntest("x",()=>{});');
    if (sql) w2(join(cwd, 'db', 'migration_001.sql'), sql);
    return Promise.resolve({ code: 0 });
  }
  const content = { propose: '## Why\nx\n## What Changes\n- a\n## Impact\nx', spec: '## ADDED Requirements\n<!-- id: REQ-C -->\n### Requirement: C\nThe system SHALL c.\n#### Scenario: s\n- **GIVEN** a\n- **WHEN** b\n- **THEN** c' }[phase] || 'x';
  w2(writeTo, content); return Promise.resolve({ code: 0 });
};
const w2 = (abs, c) => { mkdirSync(dirname(abs), { recursive: true }); writeFileSync(abs, c); };

await test('data-gate(drive): cfg.dataGate + migración destructiva → NOT-GREEN (DATA-FAIL)', async () => {
  fresh();
  const saved = clearEnv();
  try {
    mkdirSync(join(TMP, 'openspec'), { recursive: true });
    writeFileSync(join(TMP, 'openspec', 'conductor.json'), JSON.stringify({ dataGate: true, maxRetries: 0, lenses: false }));
    const r = await drive({ changeDir: join(TMP, 'openspec', 'changes', 'd'), request: 'x', complexity: 'simple', domain: 'c', srcDir: TMP, runAgent: mkAgent('DROP TABLE users;') });
    eq(r.verdict, 'NOT-GREEN');
    eq(r.gate, 'DATA-FAIL');
    assert((r.dataFindings || []).some((f) => f.rule === 'data.drop-table'));
  } finally { restoreEnv(saved); }
});

await test('data-gate(drive): cfg.dataGate + migración segura → GREEN', async () => {
  fresh();
  const saved = clearEnv();
  try {
    mkdirSync(join(TMP, 'openspec'), { recursive: true });
    writeFileSync(join(TMP, 'openspec', 'conductor.json'), JSON.stringify({ dataGate: true, maxRetries: 0, lenses: false }));
    const r = await drive({ changeDir: join(TMP, 'openspec', 'changes', 'ds'), request: 'x', complexity: 'simple', domain: 'c', srcDir: TMP, runAgent: mkAgent('ALTER TABLE users ADD COLUMN nick varchar(20) DEFAULT \'\';') });
    eq(r.verdict, 'GREEN', 'migración segura no bloquea');
  } finally { restoreEnv(saved); }
});

await test('data-gate(drive): SIN dataGate → la migración destructiva NO se evalúa (GREEN)', async () => {
  fresh();
  const saved = clearEnv();
  try {
    mkdirSync(join(TMP, 'openspec'), { recursive: true });
    writeFileSync(join(TMP, 'openspec', 'conductor.json'), JSON.stringify({ maxRetries: 0, lenses: false }));
    const r = await drive({ changeDir: join(TMP, 'openspec', 'changes', 'dn'), request: 'x', complexity: 'simple', domain: 'c', srcDir: TMP, runAgent: mkAgent('DROP TABLE users;') });
    eq(r.verdict, 'GREEN', 'sin el gate de datos, no se evalúa el SQL (cero regresión)');
  } finally { restoreEnv(saved); }
});

await test('data-gate(seal): strictGate.trace=true → el sello es estricto (traceAffectsVerdict)', async () => {
  fresh();
  const saved = clearEnv();
  try {
    mkdirSync(join(TMP, 'openspec'), { recursive: true });
    // preset feature → strictTrace=true → sello estricto; run honesto (sin huecos) → GREEN sellado
    writeFileSync(join(TMP, 'openspec', 'conductor.json'), JSON.stringify({ preset: 'feature', maxRetries: 0, lenses: false }));
    const changeDir = join(TMP, 'openspec', 'changes', 'sl');
    const r = await drive({ changeDir, request: 'x', complexity: 'simple', domain: 'c', srcDir: TMP, runAgent: mkAgent(null) });
    eq(r.verdict, 'GREEN');
    const prov = JSON.parse(readFileSync(plumbPath(changeDir, 'provenance.json'), 'utf8'));
    eq(prov.verdict, 'GREEN', 'el sello estricto coincide con GREEN (sin huecos de traza)');
  } finally { restoreEnv(saved); }
});

await test('contract-gate(drive): cfg.contractDiff + esquema con cambio INCOMPATIBLE (drop column) → NOT-GREEN (CONTRACT-FAIL)', async () => {
  fresh();
  const saved = clearEnv();
  try {
    mkdirSync(join(TMP, 'openspec'), { recursive: true });
    const base = w('contracts/users.base.sql', 'CREATE TABLE users (id int, email varchar(50));');
    const head = w('contracts/users.head.sql', 'CREATE TABLE users (id int);'); // se eliminó email → breaking
    writeFileSync(join(TMP, 'openspec', 'conductor.json'), JSON.stringify({ contractDiff: [{ base, head }], maxRetries: 0, lenses: false }));
    const r = await drive({ changeDir: join(TMP, 'openspec', 'changes', 'ct'), request: 'x', complexity: 'simple', domain: 'c', srcDir: TMP, runAgent: mkAgent(null) });
    eq(r.verdict, 'NOT-GREEN');
    eq(r.gate, 'CONTRACT-FAIL');
    assert((r.contractFindings || []).some((f) => /column-dropped/.test(f.rule)), 'reporta la columna eliminada como incompatible');
  } finally { restoreEnv(saved); }
});

await test('contract-gate(drive): cfg.contractDiff con cambio COMPATIBLE (añadir columna nullable) → GREEN', async () => {
  fresh();
  const saved = clearEnv();
  try {
    mkdirSync(join(TMP, 'openspec'), { recursive: true });
    const base = w('contracts/users.base.sql', 'CREATE TABLE users (id int);');
    const head = w('contracts/users.head.sql', 'CREATE TABLE users (id int, nick varchar(20));'); // columna nullable nueva = compatible
    writeFileSync(join(TMP, 'openspec', 'conductor.json'), JSON.stringify({ contractDiff: [{ base, head }], maxRetries: 0, lenses: false }));
    const r = await drive({ changeDir: join(TMP, 'openspec', 'changes', 'cc'), request: 'x', complexity: 'simple', domain: 'c', srcDir: TMP, runAgent: mkAgent(null) });
    eq(r.verdict, 'GREEN', 'un cambio aditivo compatible no bloquea');
  } finally { restoreEnv(saved); }
});

await test('contract-gate(drive): rutas de contractDiff CONFINADAS al proyecto (un ../ se ignora, no escala)', async () => {
  fresh();
  const saved = clearEnv();
  try {
    mkdirSync(join(TMP, 'openspec'), { recursive: true });
    writeFileSync(join(TMP, 'openspec', 'conductor.json'), JSON.stringify({ contractDiff: [{ base: '../../etc/passwd', head: '../../etc/shadow' }], maxRetries: 0, lenses: false }));
    const r = await drive({ changeDir: join(TMP, 'openspec', 'changes', 'cf'), request: 'x', complexity: 'simple', domain: 'c', srcDir: TMP, runAgent: mkAgent(null) });
    eq(r.verdict, 'GREEN', 'rutas fuera del proyecto se ignoran (confinamiento) → no evalúa, no escala');
  } finally { restoreEnv(saved); }
});

rmSync(TMP, { recursive: true, force: true });
