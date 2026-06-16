import { diffSchema, parseSchema } from '../lib/sqldiff.mjs';
import { lintMigrations } from '../lib/migration.mjs';
import { diffPublic } from '../lib/tsdiff.mjs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';

const TMP = join(dirname(fileURLToPath(import.meta.url)), '.tmp-sql');
mkdirSync(TMP, { recursive: true });

// ---------- SQL schema diff ----------
const SCHEMA_V1 = `
CREATE TABLE orders (
  id INTEGER PRIMARY KEY,
  total DECIMAL(10,2) NOT NULL,
  currency VARCHAR(3),
  notes TEXT
);
CREATE TABLE customers ( id INTEGER PRIMARY KEY, email VARCHAR(255) NOT NULL );`;

await test('sqldiff: parse tablas y columnas', () => {
  const s = parseSchema(SCHEMA_V1);
  assert(s.tables.orders && s.tables.customers, 'dos tablas');
  eq(s.tables.orders.columns.total.nullable, false);
  assert(s.tables.orders.pk.includes('id'));
});

await test('sqldiff: detecta breaking changes de esquema', () => {
  const v2 = `
CREATE TABLE orders (
  id INTEGER PRIMARY KEY,
  total VARCHAR(20) NOT NULL,
  region VARCHAR(5) NOT NULL
);`; // currency/notes eliminadas, total tipo cambiado, region nueva NOT NULL, customers dropped
  const f = diffSchema(SCHEMA_V1, v2);
  const rules = new Set(f.filter((x) => x.severity === 'breaking').map((x) => x.rule));
  assert(rules.has('sql.table-dropped'), 'customers eliminada');
  assert(rules.has('sql.column-dropped'), 'columnas eliminadas');
  assert(rules.has('sql.type-changed'), 'total tipo cambiado');
  assert(rules.has('sql.new-required-column'), 'region NOT NULL nueva');
});

await test('sqldiff: schema idéntico → 0 breaking', () => {
  eq(diffSchema(SCHEMA_V1, SCHEMA_V1).filter((x) => x.severity === 'breaking').length, 0);
});

// ---------- migration linter ----------
await test('migrate: detecta operaciones destructivas/peligrosas', () => {
  const dir = join(TMP, 'mig'); rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, '001_drop.sql'), 'DROP TABLE orders;');
  writeFileSync(join(dir, '002_addcol.sql'), 'ALTER TABLE orders ADD COLUMN region VARCHAR(5) NOT NULL;');
  writeFileSync(join(dir, '003_index.sql'), 'CREATE INDEX idx_o ON orders(total);');
  writeFileSync(join(dir, '004_dml.sql'), 'UPDATE orders SET total = 0;');
  const f = lintMigrations(dir);
  const rules = new Set(f.map((x) => x.rule));
  assert(rules.has('migration.drop-table'));
  assert(rules.has('migration.add-notnull-no-default'));
  assert(rules.has('migration.blocking-index'));
  assert(rules.has('migration.unscoped-dml'));
  assert(rules.has('migration.no-rollback'), 'sin down → warning');
});

await test('migrate: migración segura con rollback → sin breaking', () => {
  const dir = join(TMP, 'safe'); rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, '001_add.up.sql'), 'ALTER TABLE orders ADD COLUMN tag VARCHAR(10) DEFAULT \'\';');
  writeFileSync(join(dir, '001_add.down.sql'), 'ALTER TABLE orders DROP COLUMN tag;');
  const f = lintMigrations(dir);
  eq(f.filter((x) => x.severity === 'breaking').length, 0, 'sin breaking');
});

// ---------- TS public-contract diff ----------
const TS_V1 = `
export interface ButtonProps { label: string; disabled?: boolean; onClick: () => void; }
export type Theme = { color: string; size: number; };
export function render(): void {}`;

await test('tsdiff: parse interfaces públicas', () => {
  const p = require_parse(TS_V1);
  assert(p.interfaces.ButtonProps && p.interfaces.ButtonProps.label.type === 'string');
  eq(p.interfaces.ButtonProps.disabled.optional, true);
});

await test('tsdiff: breaking changes de contrato front', () => {
  const v2 = `
export interface ButtonProps { label: number; disabled: boolean; onClick: () => void; size: string; }
export type Theme = { color: string; size: number; };`;
  const f = diffPublic(TS_V1, v2);
  const rules = new Set(f.map((x) => x.rule));
  assert(rules.has('ts.prop-type-changed'), 'label string→number');
  assert(rules.has('ts.prop-required-added'), 'disabled opcional→requerida');
  assert(rules.has('ts.new-required-prop'), 'size nueva requerida');
  assert(rules.has('ts.export-removed'), 'render eliminada');
});

await test('tsdiff: contrato idéntico → 0 findings', () => {
  eq(diffPublic(TS_V1, TS_V1).length, 0);
});

import { parsePublic } from '../lib/tsdiff.mjs';
function require_parse(s) { return parsePublic(s); }
