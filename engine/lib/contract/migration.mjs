// conductor/lib/migration.mjs — linter de SEGURIDAD de migraciones de BD (sin dependencias).
// Para grandes migraciones con deploy rolling: detecta operaciones destructivas, irreversibles,
// bloqueantes o que rompen la compatibilidad expand-contract. Lee ficheros .sql y devuelve findings.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, basename } from 'node:path';

export const RULES = [
  // destructivas / pérdida de datos
  { re: /\bdrop\s+table\b/i, rule: 'migration.drop-table', sev: 'breaking', msg: 'DROP TABLE (pérdida de datos; usa expand-contract y borra en una fase posterior)' },
  { re: /\b(alter\s+table\s+\S+\s+)?drop\s+column\b/i, rule: 'migration.drop-column', sev: 'breaking', msg: 'DROP COLUMN (rompe lectores del esquema viejo durante el rolling deploy)' },
  { re: /\btruncate\b/i, rule: 'migration.truncate', sev: 'breaking', msg: 'TRUNCATE (pérdida de datos irreversible)' },
  { re: /\b(rename\s+table|alter\s+table\s+\S+\s+rename)\b/i, rule: 'migration.rename', sev: 'breaking', msg: 'RENAME (rompe el código viejo; usa add+backfill+switch+drop)' },
  // peligrosas
  { re: /\badd\s+column\b[\s\S]{0,120}?\bnot\s+null\b(?![\s\S]{0,40}\bdefault\b)/i, rule: 'migration.add-notnull-no-default', sev: 'breaking', msg: 'ADD COLUMN NOT NULL sin DEFAULT (falla/locka con filas existentes)' },
  { re: /\b(update|delete)\b(?![\s\S]*\bwhere\b)/i, rule: 'migration.unscoped-dml', sev: 'breaking', msg: 'UPDATE/DELETE sin WHERE (afecta toda la tabla)' },
  // bloqueantes (Postgres): índice no concurrente
  { re: /\bcreate\s+(unique\s+)?index\b(?![\s\S]{0,30}\bconcurrently\b)/i, rule: 'migration.blocking-index', sev: 'warning', msg: 'CREATE INDEX sin CONCURRENTLY (bloquea escrituras en tablas grandes)' },
  { re: /\bdrop\s+(table|index|column)\b(?![\s\S]{0,30}\bif\s+exists\b)/i, rule: 'migration.drop-no-if-exists', sev: 'warning', msg: 'DROP sin IF EXISTS (migración no idempotente)' },
];

const isDown = (name) => /(down|rollback|undo)/i.test(name);
const hasInlineDown = (txt) => /--\s*(down|rollback|\+migrate\s+down|@undo)/i.test(txt);

function walk(dir, acc = []) {
  for (const n of readdirSync(dir)) {
    const f = join(dir, n); let s; try { s = statSync(f); } catch { continue; }
    if (s.isDirectory()) walk(f, acc); else if (/\.sql$/i.test(n)) acc.push(f);
  }
  return acc;
}

export function lintMigrations(target) {
  const files = existsSync(target) && statSync(target).isDirectory() ? walk(target) : [target];
  const out = [];
  const upFiles = [];
  for (const f of files) {
    let txt; try { txt = readFileSync(f, 'utf8'); } catch { continue; }
    const rel = basename(f);
    if (isDown(rel)) continue; // los rollbacks pueden ser destructivos legítimamente
    upFiles.push({ f, rel, txt });
    const code = txt.replace(/--[^\n]*/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');
    // POR SENTENCIA (split en ';'): si se probaba el fichero entero, un WHERE en una sentencia POSTERIOR
    // satisfacía el lookahead negativo de unscoped-dml y colaba un DELETE/UPDATE sin filtro de la sentencia
    // anterior (hallazgo adversarial H4). Por sentencia solo se pueden AÑADIR hallazgos → fail-closed seguro.
    const statements = code.split(';');
    for (const r of RULES) if (statements.some((st) => r.re.test(st))) out.push({ rule: r.rule, severity: r.sev, message: r.msg, file: rel });
  }
  // reversibilidad: cada migración up debería tener un down (fichero pareado o sección inline)
  const downNames = new Set(files.filter((f) => isDown(basename(f))).map((f) => basename(f).replace(/[._-]?(down|rollback|undo)/i, '')));
  for (const { rel, txt } of upFiles) {
    const stem = rel.replace(/\.sql$/i, '');
    const paired = [...downNames].some((d) => d.includes(stem) || stem.includes(d.replace(/\.sql$/i, '')));
    if (!paired && !hasInlineDown(txt)) out.push({ rule: 'migration.no-rollback', severity: 'warning', message: 'migración sin rollback/down (no reversible)', file: rel });
  }
  return out;
}
