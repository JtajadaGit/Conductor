// conductor/lib/gates/data.mjs — gate de DATOS para "Gran migración" (R-G7). Escanea los ficheros SQL que
// el agente ESCRIBIÓ y aplica el linter de seguridad de migraciones (DROP/TRUNCATE/ALTER…DROP COLUMN sin
// guarda, DML sin WHERE, índices bloqueantes, irreversibilidad) + detección de PII en NOMBRES de columna.
// Determinista, coste 0 tokens. Reusa las RULES del linter de migraciones (única fuente de verdad).
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { RULES } from '../contract/migration.mjs';

const MAX_BYTES = 2 * 1024 * 1024;

// columnas con nombre que sugiere PII/secreto → deben ir cifradas/tokenizadas, no en claro (warning: revisar).
const PII_COL = /\b(ssn|social_security|tax_id|passport|credit_card|card_number|cvv|iban|password|passwd|secret|api_?key|private_key|dni|nif)\b/i;
const COL_CONTEXT = /\b(create\s+table|add\s+column|alter\s+table)\b/i;

export function scanData(rootDir, relFiles, { onlyMigrations = false } = {}) {
  const findings = [];
  for (const rel of relFiles || []) {
    if (!rel || !/\.sql$/i.test(rel)) continue;
    if (onlyMigrations && !/migrat/i.test(rel)) continue;
    const abs = join(rootDir, rel);
    let txt;
    try { if (statSync(abs).size > MAX_BYTES) continue; txt = readFileSync(abs, 'utf8'); } catch { continue; }
    const code = txt.replace(/--[^\n]*/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');
    const statements = code.split(';');
    // DDL peligroso (mismas reglas que `conductor migrate`, por sentencia → fail-closed)
    for (const r of RULES) { if (r.rule === 'migration.no-rollback') continue; if (statements.some((st) => r.re.test(st))) findings.push({ rule: `data.${r.rule.replace(/^migration\./, '')}`, severity: r.sev, message: r.msg, file: rel }); }
    // PII en nombres de columna (solo en sentencias DDL de definición de tabla/columna)
    for (const st of statements) if (COL_CONTEXT.test(st) && PII_COL.test(st)) { const m = st.match(PII_COL); findings.push({ rule: 'data.pii-column', severity: 'warning', message: `columna con nombre de PII/secreto ("${m[0]}") — cifra/tokeniza, no la guardes en claro`, file: rel }); }
  }
  return findings;
}
