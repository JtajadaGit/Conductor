// conductor/lib/tsdiff.mjs — diff de contrato público TypeScript (frontend a escala) SIN deps.
// Para GRANDES DESARROLLOS FRONT: detecta breaking changes en la superficie pública (interfaces /
// types exportados, p.ej. props de componentes y modelos compartidos). Parser ligero por regex
// (no AST completo) suficiente para gobernar el contrato de un design-system / librería.
// parsePublic(src) → { interfaces }. diffPublic(base, head) → findings.

const SEV = { BREAKING: 'breaking', WARN: 'warning', INFO: 'info' };

// extrae `export interface X { ... }` y `export type X = { ... }`
export function parsePublic(src) {
  const code = src.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  const interfaces = {};
  const re = /export\s+(?:interface\s+(\w+)\s*(?:extends\s+[^\{]+)?|type\s+(\w+)\s*=\s*)\{([\s\S]*?)\}/g;
  let m;
  while ((m = re.exec(code))) {
    const name = m[1] || m[2];
    interfaces[name] = parseMembers(m[3]);
  }
  // exports nombrados (funciones/const/clases) para detectar export eliminado
  const exports = new Set();
  for (const mm of code.matchAll(/export\s+(?:async\s+)?(?:function|const|class|enum)\s+(\w+)/g)) exports.add(mm[1]);
  for (const mm of code.matchAll(/export\s+(?:interface|type)\s+(\w+)/g)) exports.add(mm[1]);
  return { interfaces, exports: [...exports] };
}

function parseMembers(body) {
  const members = {};
  for (const raw of body.split(/[;\n]/)) {
    const line = raw.trim();
    if (!line || line.startsWith('//')) continue;
    // name?: type   |   readonly name: type
    const m = line.match(/^(?:readonly\s+)?(\w+)\s*(\?)?\s*:\s*(.+?)\s*$/);
    if (!m) continue;
    members[m[1]] = { optional: !!m[2], type: m[3].replace(/\s+/g, ' ').trim() };
  }
  return members;
}

export function diffPublic(baseSrc, headSrc) {
  const b = parsePublic(baseSrc), h = parsePublic(headSrc);
  const out = [];
  // export eliminado
  for (const e of b.exports) if (!h.exports.includes(e)) out.push({ rule: 'ts.export-removed', severity: SEV.BREAKING, pointer: e, message: `export público eliminado: ${e}` });
  // miembros de interface
  for (const [name, bm] of Object.entries(b.interfaces)) {
    const hm = h.interfaces[name];
    if (!hm) continue; // export-removed ya lo cubre
    for (const [prop, bp] of Object.entries(bm)) {
      const hp = hm[prop];
      const p = `${name}.${prop}`;
      if (!hp) { out.push({ rule: 'ts.prop-removed', severity: SEV.BREAKING, pointer: p, message: `propiedad pública eliminada: ${p}` }); continue; }
      if (bp.optional && !hp.optional) out.push({ rule: 'ts.prop-required-added', severity: SEV.BREAKING, pointer: p, message: `${p} pasó de opcional a requerida (rompe a consumidores)` });
      if (bp.type !== hp.type) out.push({ rule: 'ts.prop-type-changed', severity: SEV.BREAKING, pointer: p, message: `tipo cambiado en ${p}: ${bp.type} → ${hp.type}`, was: bp.type, now: hp.type });
    }
    for (const [prop, hp] of Object.entries(hm)) {
      if (!bm[prop] && !hp.optional) out.push({ rule: 'ts.new-required-prop', severity: SEV.BREAKING, pointer: `${name}.${prop}`, message: `nueva propiedad requerida: ${name}.${prop} (rompe a implementadores)` });
    }
  }
  return out;
}
