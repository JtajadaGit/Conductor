// conductor/lib/openapi-diff.mjs
// Motor nativo de detección de breaking-changes OpenAPI 3.0/3.1 — SIN dependencias.
// Clasifica cambios entre dos specs (base → revision) con severidad y JSON-pointer.
// Cubre paths, operations, parameters, requestBody, responses, y schemas de components
// con resolución de $ref local y semántica direccional (request vs response).
//
// Severidades: 'breaking' | 'warning' | 'info'. Exporta diffOpenApi(base, head) → findings[].
// Cada finding: { rule, severity, pointer, message, was?, now? }

const SEV = { BREAKING: 'breaking', WARN: 'warning', INFO: 'info' };

// existencia de clave PROPIA (no heredada): `name in obj` daba true para "constructor"/"valueOf"/"toString"
// vía Object.prototype → una propiedad/media-type con ese nombre, al eliminarse, no se reportaba (false GREEN).
const own = (o, k) => Object.prototype.hasOwnProperty.call(o || {}, k);
// OpenAPI 3.1: `type` puede ser un array (p.ej. ["string","null"]). Normalizamos: tipo(s) sin "null" + flag
// nullable (3.0 usa nullable:true; 3.1 lo expresa con "null" en el array de tipos).
const typesOf = (s) => Array.isArray(s.type) ? s.type.filter((t) => t !== 'null') : (s.type != null ? [s.type] : []);
const isNullable = (s) => s.nullable === true || (Array.isArray(s.type) && s.type.includes('null'));

// ---- resolución de $ref local ("#/components/schemas/Foo") ----
function resolveRef(root, node, seen = new Set()) {
  let cur = node;
  while (cur && typeof cur === 'object' && typeof cur.$ref === 'string') {
    if (seen.has(cur.$ref)) return {}; // ciclo
    seen.add(cur.$ref);
    const parts = cur.$ref.replace(/^#\//, '').split('/');
    cur = parts.reduce((o, k) => (o ? o[decodeURIComponent(k.replace(/~1/g, '/').replace(/~0/g, '~'))] : undefined), root);
  }
  return cur || {};
}

const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'];
const isSuccess = (code) => /^2\d\d$/.test(String(code)) || code === 'default';

// ---- diff recursivo de schemas, con contexto direccional ----
// ctx.dir: 'request' (lo que el cliente envía) | 'response' (lo que el servidor devuelve)
function diffSchema(root, baseRoot, headRoot, base, head, pointer, ctx, out, depth = 0) {
  // C2 (auditoría adversarial): un schema con $ref recursivo (Tree/Category que se referencia a sí mismo)
  // hacía recursión infinita → RangeError que TUMBA todo el diff y enmascara los breaking-changes reales.
  // Cap de profundidad como backstop (los $ref cíclicos de un mismo nivel ya los corta resolveRef).
  if (depth > 100) return;
  const b = resolveRef(baseRoot, base);
  const h = resolveRef(headRoot, head);
  if (!b || !h || typeof b !== 'object' || typeof h !== 'object') return;

  // tipo (normalizado para 3.1: type puede ser array con "null")
  const bT = typesOf(b), hT = typesOf(h);
  if (bT.length && hT.length && bT.join(',') !== hT.join(',')) {
    out.push({ rule: 'schema.type-changed', severity: SEV.BREAKING, pointer: `${pointer}/type`,
      message: `type cambiado ${bT.join('|')} → ${hT.join('|')}`, was: b.type, now: h.type });
  }
  // format endurecido (p.ej. de string a string/date-time es restrictivo en request)
  if (b.format !== h.format && (b.format || h.format)) {
    out.push({ rule: 'schema.format-changed', severity: ctx.dir === 'request' && h.format ? SEV.BREAKING : SEV.WARN,
      pointer: `${pointer}/format`, message: `format ${b.format || '∅'} → ${h.format || '∅'}`, was: b.format, now: h.format });
  }
  // nullable retirado (incluye la forma 3.1 type:[...,"null"]): en response rompe a consumidores
  const bNull = isNullable(b), hNull = isNullable(h);
  if (bNull && !hNull) {
    out.push({ rule: 'schema.nullable-removed', severity: SEV.BREAKING, pointer: `${pointer}/nullable`,
      message: 'nullable retirado (restringe valores aceptados/garantizados)' });
  }
  // enum: quitar valores rompe (narrowing). Comparación por VALOR (JSON) — dos objetos estructuralmente
  // idénticos con distinta referencia NO deben marcarse como cambio (false breaking, hallazgo adversarial).
  if (Array.isArray(b.enum) && Array.isArray(h.enum)) {
    const key = (v) => JSON.stringify(v);
    const hKeys = new Set(h.enum.map(key)), bKeys = new Set(b.enum.map(key));
    const removed = b.enum.filter((v) => !hKeys.has(key(v)));
    if (removed.length) out.push({ rule: 'schema.enum-narrowed', severity: SEV.BREAKING, pointer: `${pointer}/enum`,
      message: `valores de enum eliminados: ${JSON.stringify(removed)}`, was: b.enum, now: h.enum });
    const added = h.enum.filter((v) => !bKeys.has(key(v)));
    if (added.length && ctx.dir === 'response') out.push({ rule: 'schema.enum-widened-response', severity: SEV.WARN,
      pointer: `${pointer}/enum`, message: `valores de enum añadidos en response: ${JSON.stringify(added)} (consumidores pueden no esperarlos)` });
  }
  // límites numéricos endurecidos
  const tighter = (a, c, dir) => a !== undefined && c !== undefined && (dir === 'gt' ? c > a : c < a);
  if (tighter(b.minimum, h.minimum, 'gt')) out.push({ rule: 'schema.minimum-increased', severity: ctx.dir === 'request' ? SEV.BREAKING : SEV.WARN, pointer: `${pointer}/minimum`, message: `minimum ${b.minimum} → ${h.minimum}`, was: b.minimum, now: h.minimum });
  if (tighter(b.maximum, h.maximum, 'lt')) out.push({ rule: 'schema.maximum-decreased', severity: ctx.dir === 'request' ? SEV.BREAKING : SEV.WARN, pointer: `${pointer}/maximum`, message: `maximum ${b.maximum} → ${h.maximum}`, was: b.maximum, now: h.maximum });
  if (tighter(b.maxLength, h.maxLength, 'lt')) out.push({ rule: 'schema.maxLength-decreased', severity: ctx.dir === 'request' ? SEV.BREAKING : SEV.WARN, pointer: `${pointer}/maxLength`, message: `maxLength ${b.maxLength} → ${h.maxLength}` });
  if (tighter(b.minLength, h.minLength, 'gt')) out.push({ rule: 'schema.minLength-increased', severity: ctx.dir === 'request' ? SEV.BREAKING : SEV.WARN, pointer: `${pointer}/minLength`, message: `minLength ${b.minLength} → ${h.minLength}` });

  // required
  const bReq = new Set(b.required || []), hReq = new Set(h.required || []);
  for (const r of hReq) if (!bReq.has(r)) {
    // nuevo required: en request rompe (cliente debe enviarlo); en response es info (servidor garantiza más)
    out.push({ rule: 'schema.required-added', severity: ctx.dir === 'request' ? SEV.BREAKING : SEV.INFO,
      pointer: `${pointer}/required`, message: `propiedad ahora requerida: "${r}"`, now: r });
  }
  for (const r of bReq) if (!hReq.has(r)) {
    // required retirado: en response rompe (consumidor ya no la tiene garantizada)
    if (ctx.dir === 'response') out.push({ rule: 'schema.required-removed-response', severity: SEV.BREAKING,
      pointer: `${pointer}/required`, message: `propiedad ya no garantizada en response: "${r}"`, was: r });
  }

  // properties
  const bProps = b.properties || {}, hProps = h.properties || {};
  for (const [name, bp] of Object.entries(bProps)) {
    const p = `${pointer}/properties/${name}`;
    if (!own(hProps, name)) {
      // propiedad eliminada: en response rompe a consumidores; en request es info
      out.push({ rule: 'schema.property-removed', severity: ctx.dir === 'response' ? SEV.BREAKING : SEV.INFO,
        pointer: p, message: `propiedad eliminada: "${name}"`, was: name });
    } else {
      diffSchema(root, baseRoot, headRoot, bp, hProps[name], p, ctx, out, depth + 1);
    }
  }
  for (const name of Object.keys(hProps)) {
    if (!own(bProps, name)) {
      // propiedad nueva: en request, si es required ya se reportó arriba; si no, info
      out.push({ rule: 'schema.property-added', severity: SEV.INFO, pointer: `${pointer}/properties/${name}`, message: `propiedad nueva: "${name}"`, now: name });
    }
  }
  // additionalProperties: true→false restringe
  if (b.additionalProperties !== false && h.additionalProperties === false) {
    out.push({ rule: 'schema.additionalProperties-restricted', severity: ctx.dir === 'request' ? SEV.BREAKING : SEV.WARN,
      pointer: `${pointer}/additionalProperties`, message: 'additionalProperties pasó a false (rechaza campos extra)' });
  }
  // items (arrays) + límites de tamaño
  if (b.items && h.items) diffSchema(root, baseRoot, headRoot, b.items, h.items, `${pointer}/items`, ctx, out, depth + 1);
  if (b.minItems !== undefined && h.minItems !== undefined && h.minItems > b.minItems) out.push({ rule: 'schema.minItems-increased', severity: ctx.dir === 'request' ? SEV.BREAKING : SEV.WARN, pointer: `${pointer}/minItems`, message: `minItems ${b.minItems} → ${h.minItems}` });
  if (b.maxItems !== undefined && h.maxItems !== undefined && h.maxItems < b.maxItems) out.push({ rule: 'schema.maxItems-decreased', severity: ctx.dir === 'request' ? SEV.BREAKING : SEV.WARN, pointer: `${pointer}/maxItems`, message: `maxItems ${b.maxItems} → ${h.maxItems}` });

  // discriminator (polimorfismo): cambio = breaking
  if (b.discriminator?.propertyName !== h.discriminator?.propertyName && (b.discriminator || h.discriminator))
    out.push({ rule: 'schema.discriminator-changed', severity: SEV.BREAKING, pointer: `${pointer}/discriminator`, message: `discriminator ${b.discriminator?.propertyName || '∅'} → ${h.discriminator?.propertyName || '∅'}` });

  // composición oneOf/anyOf/allOf: quitar miembros estrecha el contrato
  for (const kw of ['oneOf', 'anyOf', 'allOf']) {
    if (Array.isArray(b[kw]) && Array.isArray(h[kw]) && h[kw].length < b[kw].length)
      out.push({ rule: `schema.${kw}-narrowed`, severity: SEV.BREAKING, pointer: `${pointer}/${kw}`, message: `${kw}: ${b[kw].length} → ${h[kw].length} miembros (estrecha el contrato)` });
  }
}

// security: exigir auth nueva, o quitar un scheme, rompe a clientes existentes
function securityNames(arr) { return new Set((arr || []).flatMap((req) => Object.keys(req))); }
function diffSecurity(base, head, pointer, out) {
  const b = securityNames(base.security), h = securityNames(head.security);
  if ((base.security?.length || 0) === 0 && (head.security?.length || 0) > 0)
    out.push({ rule: 'security.added', severity: SEV.BREAKING, pointer: `${pointer}/security`, message: 'requisito de seguridad nuevo (clientes existentes sin auth fallarán)' });
  for (const s of h) if (!b.has(s) && b.size) out.push({ rule: 'security.scheme-added', severity: SEV.BREAKING, pointer: `${pointer}/security`, message: `nuevo scheme de seguridad requerido: ${s}` });
}

function diffParameters(baseRoot, headRoot, baseParams = [], headParams = [], pointer, out) {
  const key = (p) => `${p.in}:${p.name}`;
  const bMap = new Map(baseParams.map((p) => [key(resolveRef(baseRoot, p)), resolveRef(baseRoot, p)]));
  const hMap = new Map(headParams.map((p) => [key(resolveRef(headRoot, p)), resolveRef(headRoot, p)]));
  for (const [k, hp] of hMap) {
    if (!bMap.has(k)) {
      out.push({ rule: 'parameter.added', severity: hp.required ? SEV.BREAKING : SEV.INFO, pointer: `${pointer}/parameters`,
        message: `parámetro ${hp.required ? 'requerido ' : ''}nuevo: ${hp.in} "${hp.name}"`, now: hp.name });
    } else {
      const bp = bMap.get(k);
      if (!bp.required && hp.required) out.push({ rule: 'parameter.required-added', severity: SEV.BREAKING, pointer: `${pointer}/parameters/${k}`, message: `parámetro ${hp.in} "${hp.name}" pasó a requerido` });
      if (bp.schema && hp.schema) diffSchema(headRoot, baseRoot, headRoot, bp.schema, hp.schema, `${pointer}/parameters/${k}/schema`, { dir: 'request' }, out);
    }
  }
  for (const [k, bp] of bMap) if (!hMap.has(k)) {
    out.push({ rule: 'parameter.removed', severity: bp.required ? SEV.WARN : SEV.INFO, pointer: `${pointer}/parameters/${k}`,
      message: `parámetro eliminado: ${bp.in} "${bp.name}"`, was: bp.name });
  }
}

function diffOperation(baseRoot, headRoot, bOp, hOp, pointer, out) {
  // security a nivel de operación
  diffSecurity(bOp, hOp, pointer, out);
  // parameters
  diffParameters(baseRoot, headRoot, bOp.parameters, hOp.parameters, pointer, out);
  // requestBody
  if (bOp.requestBody || hOp.requestBody) {
    const bRB = resolveRef(baseRoot, bOp.requestBody || {});
    const hRB = resolveRef(headRoot, hOp.requestBody || {});
    if (!bRB.required && hRB.required) out.push({ rule: 'requestBody.required-added', severity: SEV.BREAKING, pointer: `${pointer}/requestBody`, message: 'requestBody pasó a requerido' });
    const bMedia = (bRB.content || {}); const hMedia = (hRB.content || {});
    for (const mt of Object.keys(bMedia)) {
      if (!own(hMedia, mt)) { out.push({ rule: 'requestBody.mediaType-removed', severity: SEV.BREAKING, pointer: `${pointer}/requestBody/content/${mt}`, message: `media type de request eliminado: ${mt}` }); continue; }
      if (bMedia[mt].schema && hMedia[mt].schema) diffSchema(headRoot, baseRoot, headRoot, bMedia[mt].schema, hMedia[mt].schema, `${pointer}/requestBody/content/${mt}/schema`, { dir: 'request' }, out);
    }
  }
  // responses
  const bResp = bOp.responses || {}, hResp = hOp.responses || {};
  for (const code of Object.keys(bResp)) {
    if (!own(hResp, code)) {
      if (isSuccess(code)) out.push({ rule: 'response.success-removed', severity: SEV.BREAKING, pointer: `${pointer}/responses/${code}`, message: `respuesta de éxito eliminada: ${code}` });
      else out.push({ rule: 'response.removed', severity: SEV.WARN, pointer: `${pointer}/responses/${code}`, message: `respuesta eliminada: ${code}` });
      continue;
    }
    const bR = resolveRef(baseRoot, bResp[code]); const hR = resolveRef(headRoot, hResp[code]);
    const bMedia = bR.content || {}, hMedia = hR.content || {};
    for (const mt of Object.keys(bMedia)) {
      if (!own(hMedia, mt)) { out.push({ rule: 'response.mediaType-removed', severity: SEV.BREAKING, pointer: `${pointer}/responses/${code}/content/${mt}`, message: `media type de response eliminado: ${mt} en ${code}` }); continue; }
      if (bMedia[mt].schema && hMedia[mt].schema) diffSchema(headRoot, baseRoot, headRoot, bMedia[mt].schema, hMedia[mt].schema, `${pointer}/responses/${code}/content/${mt}/schema`, { dir: 'response' }, out);
    }
  }
}

export function diffOpenApi(base, head) {
  const out = [];
  // security global
  diffSecurity(base, head, '', out);
  // securitySchemes eliminados
  const bSec = base.components?.securitySchemes || {}, hSec = head.components?.securitySchemes || {};
  for (const name of Object.keys(bSec)) if (!hSec[name]) out.push({ rule: 'security.scheme-removed', severity: SEV.BREAKING, pointer: `/components/securitySchemes/${name}`, message: `security scheme eliminado: ${name}` });
  const bPaths = base.paths || {}, hPaths = head.paths || {};
  for (const [path, bItem] of Object.entries(bPaths)) {
    const ptr = `/paths/${path.replace(/\//g, '~1')}`;
    if (!hPaths[path]) { out.push({ rule: 'path.removed', severity: SEV.BREAKING, pointer: ptr, message: `endpoint eliminado: ${path}`, was: path }); continue; }
    for (const m of HTTP_METHODS) {
      if (bItem[m] && !hPaths[path][m]) { out.push({ rule: 'operation.removed', severity: SEV.BREAKING, pointer: `${ptr}/${m}`, message: `operación eliminada: ${m.toUpperCase()} ${path}` }); continue; }
      if (bItem[m] && hPaths[path][m]) diffOperation(base, head, bItem[m], hPaths[path][m], `${ptr}/${m}`, out);
    }
  }
  for (const path of Object.keys(hPaths)) if (!bPaths[path]) out.push({ rule: 'path.added', severity: SEV.INFO, pointer: `/paths/${path.replace(/\//g, '~1')}`, message: `endpoint nuevo: ${path}`, now: path });

  // schemas de components (tratados como response por defecto: contrato que el servidor garantiza)
  const bSchemas = base.components?.schemas || {}, hSchemas = head.components?.schemas || {};
  for (const [name, bs] of Object.entries(bSchemas)) {
    const ptr = `/components/schemas/${name}`;
    if (!hSchemas[name]) { out.push({ rule: 'components.schema-removed', severity: SEV.BREAKING, pointer: ptr, message: `schema eliminado: ${name}`, was: name }); continue; }
    diffSchema(head, base, head, bs, hSchemas[name], ptr, { dir: 'response' }, out);
  }
  return out;
}

export function summarize(findings) {
  const c = { breaking: 0, warning: 0, info: 0 };
  for (const f of findings) c[f.severity]++;
  return c;
}
