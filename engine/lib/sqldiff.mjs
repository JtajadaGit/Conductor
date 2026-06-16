// conductor/lib/sqldiff.mjs — diff de esquema SQL (breaking changes de BD) SIN dependencias.
// Para GRANDES MIGRACIONES: compara dos snapshots de schema (CREATE TABLE …) y clasifica los
// cambios que romperían el contrato de datos o el deploy rolling (expand-contract).
// parseSchema(sql) → { tables }. diffSchema(base, head) → findings unificados.

const SEV = { BREAKING: 'breaking', WARN: 'warning', INFO: 'info' };

// parser tolerante de CREATE TABLE (subconjunto ANSI suficiente para diff de migraciones)
export function parseSchema(sql) {
  const tables = {};
  const clean = sql.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  const re = /create\s+table\s+(?:if\s+not\s+exists\s+)?[`"\[]?(\w+)[`"\]]?\s*\(([\s\S]*?)\)\s*;/gi;
  let m;
  while ((m = re.exec(clean))) {
    const name = m[1].toLowerCase();
    const body = m[2];
    const cols = {};
    let pk = new Set();
    // separa por comas de nivel superior
    for (const raw of splitTopLevel(body)) {
      const line = raw.trim();
      if (!line) continue;
      const lower = line.toLowerCase();
      // constraint PRIMARY KEY (a,b)
      const pkm = lower.match(/primary\s+key\s*\(([^)]*)\)/);
      if (pkm) { pkm[1].split(',').forEach((c) => pk.add(c.trim().replace(/[`"\[\]]/g, ''))); continue; }
      if (/^(constraint|foreign\s+key|unique|check|key|index)\b/.test(lower)) continue;
      // columna: name type [modifiers]. El tipo es todo hasta el primer modificador conocido,
      // así soporta tipos multi-palabra: "double precision", "timestamp with time zone", "character varying(10)".
      const cm = line.match(/^[`"\[]?(\w+)[`"\]]?\s+(.+)$/s);
      if (!cm) continue;
      const col = cm[1].toLowerCase();
      const rest = cm[2];
      const modMatch = rest.match(/\b(not\s+null|null|default|primary\s+key|references|unique|check|generated|collate|auto_increment|comment)\b/i);
      const typeStr = (modMatch ? rest.slice(0, modMatch.index) : rest).trim().replace(/,$/, '');
      const type = typeStr.toLowerCase().replace(/\s+/g, ' ').trim();
      const mods = rest.toLowerCase();
      cols[col] = {
        type,
        nullable: !/\bnot\s+null\b/.test(mods),
        hasDefault: /\bdefault\b/.test(mods),
        pk: /\bprimary\s+key\b/.test(mods),
      };
      if (cols[col].pk) pk.add(col);
    }
    for (const c of pk) if (cols[c]) cols[c].pk = true;
    tables[name] = { name, columns: cols, pk: [...pk].sort() };
  }
  return { tables };
}

function splitTopLevel(s) {
  const out = []; let depth = 0, cur = '';
  for (const ch of s) {
    if (ch === '(') depth++; if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { out.push(cur); cur = ''; } else cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

export function diffSchema(baseSql, headSql) {
  const b = parseSchema(baseSql).tables, h = parseSchema(headSql).tables;
  const out = [];
  for (const [name, bt] of Object.entries(b)) {
    if (!h[name]) { out.push({ rule: 'sql.table-dropped', severity: SEV.BREAKING, pointer: name, message: `tabla eliminada: ${name}` }); continue; }
    const ht = h[name];
    for (const [col, bc] of Object.entries(bt.columns)) {
      const p = `${name}.${col}`;
      const hc = ht.columns[col];
      if (!hc) { out.push({ rule: 'sql.column-dropped', severity: SEV.BREAKING, pointer: p, message: `columna eliminada: ${p} (rompe lecturas/escrituras existentes)` }); continue; }
      if (bc.type !== hc.type) out.push({ rule: 'sql.type-changed', severity: SEV.BREAKING, pointer: p, message: `tipo cambiado en ${p}: ${bc.type} → ${hc.type}`, was: bc.type, now: hc.type });
      if (bc.nullable && !hc.nullable && !hc.hasDefault) out.push({ rule: 'sql.not-null-added', severity: SEV.BREAKING, pointer: p, message: `NOT NULL añadido sin DEFAULT en ${p} (filas existentes fallan)` });
    }
    for (const [col, hc] of Object.entries(ht.columns)) {
      if (!bt.columns[col]) {
        if (!hc.nullable && !hc.hasDefault) out.push({ rule: 'sql.new-required-column', severity: SEV.BREAKING, pointer: `${name}.${col}`, message: `columna nueva NOT NULL sin DEFAULT: ${name}.${col} (inserts existentes fallan)` });
        else out.push({ rule: 'sql.column-added', severity: SEV.INFO, pointer: `${name}.${col}`, message: `columna nueva: ${name}.${col}` });
      }
    }
    if (JSON.stringify(bt.pk) !== JSON.stringify(ht.pk)) out.push({ rule: 'sql.primary-key-changed', severity: SEV.BREAKING, pointer: name, message: `PRIMARY KEY cambiada en ${name}: [${bt.pk}] → [${ht.pk}]` });
  }
  for (const name of Object.keys(h)) if (!b[name]) out.push({ rule: 'sql.table-added', severity: SEV.INFO, pointer: name, message: `tabla nueva: ${name}` });
  return out;
}
