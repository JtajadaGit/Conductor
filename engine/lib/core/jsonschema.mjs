// conductor/lib/jsonschema.mjs
// Validador JSON Schema (subconjunto draft 2020-12) SIN dependencias.
// Soporta: type (incl. integer y arrays de tipos), required, properties, additionalProperties,
// items, prefixItems, enum, const, minimum/maximum/exclusive*, multipleOf, minLength/maxLength,
// pattern, minItems/maxItems/uniqueItems, minProperties/maxProperties, format (básico),
// $ref local, allOf/anyOf/oneOf/not, nullable (extensión OpenAPI).
// validate(schema, data, {root}) → { valid, errors: [{instancePath, keyword, message}] }

const typeOf = (v) => {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (Number.isInteger(v)) return 'integer';
  return typeof v === 'number' ? 'number' : typeof v;
};
const matchesType = (v, t) => {
  if (t === 'integer') return typeOf(v) === 'integer';
  if (t === 'number') return typeOf(v) === 'number' || typeOf(v) === 'integer';
  return typeOf(v) === t;
};
const FORMATS = {
  'date-time': (s) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/.test(s),
  date: (s) => /^\d{4}-\d{2}-\d{2}$/.test(s),
  email: (s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s),
  uri: (s) => /^[a-z][a-z0-9+.-]*:\S+$/i.test(s),
  uuid: (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s),
  ipv4: (s) => /^(\d{1,3}\.){3}\d{1,3}$/.test(s),
};

function resolveRef(root, ref) {
  const parts = ref.replace(/^#\//, '').split('/').map((p) => decodeURIComponent(p.replace(/~1/g, '/').replace(/~0/g, '~')));
  return parts.reduce((o, k) => (o == null ? o : o[k]), root);
}

function validateNode(schema, data, path, root, errors) {
  if (schema === true || schema === undefined) return;
  if (schema === false) { errors.push({ instancePath: path, keyword: 'false', message: 'ningún valor permitido' }); return; }
  // `typeof null === 'object'`, así que un sub-schema null (p.ej. `"properties": {"x": null}` en un fichero
  // de schema mal escrito, o un `items: null`) se colaba por este guard y reventaba en `schema.$ref`.
  // Un validador que LANZA deja al usuario sin diagnóstico: aquí un schema nulo simplemente no restringe.
  if (schema === null || typeof schema !== 'object') return;

  if (schema.$ref) {
    const target = resolveRef(root, schema.$ref);
    if (!target) errors.push({ instancePath: path, keyword: '$ref', message: `$ref no resuelto: ${schema.$ref}` });
    else validateNode(target, data, path, root, errors);
    return;
  }

  // nullable (OpenAPI): permite null explícitamente
  if (data === null && schema.nullable === true) return;

  // type
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((t) => matchesType(data, t)))
      errors.push({ instancePath: path, keyword: 'type', message: `se esperaba ${types.join('|')}, se obtuvo ${typeOf(data)}` });
  }
  // const / enum
  if ('const' in schema && JSON.stringify(data) !== JSON.stringify(schema.const))
    errors.push({ instancePath: path, keyword: 'const', message: `debe ser ${JSON.stringify(schema.const)}` });
  if (Array.isArray(schema.enum) && !schema.enum.some((e) => JSON.stringify(e) === JSON.stringify(data)))
    errors.push({ instancePath: path, keyword: 'enum', message: `debe ser uno de ${JSON.stringify(schema.enum)}` });

  const t = typeOf(data);
  // números
  if (t === 'number' || t === 'integer') {
    if (schema.minimum !== undefined && data < schema.minimum) errors.push({ instancePath: path, keyword: 'minimum', message: `< minimum ${schema.minimum}` });
    if (schema.maximum !== undefined && data > schema.maximum) errors.push({ instancePath: path, keyword: 'maximum', message: `> maximum ${schema.maximum}` });
    if (schema.exclusiveMinimum !== undefined && data <= schema.exclusiveMinimum) errors.push({ instancePath: path, keyword: 'exclusiveMinimum', message: `<= exclusiveMinimum ${schema.exclusiveMinimum}` });
    if (schema.exclusiveMaximum !== undefined && data >= schema.exclusiveMaximum) errors.push({ instancePath: path, keyword: 'exclusiveMaximum', message: `>= exclusiveMaximum ${schema.exclusiveMaximum}` });
    if (schema.multipleOf !== undefined && data % schema.multipleOf !== 0) errors.push({ instancePath: path, keyword: 'multipleOf', message: `no múltiplo de ${schema.multipleOf}` });
  }
  // strings
  if (t === 'string') {
    if (schema.minLength !== undefined && data.length < schema.minLength) errors.push({ instancePath: path, keyword: 'minLength', message: `length < ${schema.minLength}` });
    if (schema.maxLength !== undefined && data.length > schema.maxLength) errors.push({ instancePath: path, keyword: 'maxLength', message: `length > ${schema.maxLength}` });
    if (schema.pattern && !new RegExp(schema.pattern).test(data)) errors.push({ instancePath: path, keyword: 'pattern', message: `no casa /${schema.pattern}/` });
    if (schema.format && FORMATS[schema.format] && !FORMATS[schema.format](data)) errors.push({ instancePath: path, keyword: 'format', message: `formato ${schema.format} inválido` });
  }
  // arrays
  if (t === 'array') {
    if (schema.minItems !== undefined && data.length < schema.minItems) errors.push({ instancePath: path, keyword: 'minItems', message: `items < ${schema.minItems}` });
    if (schema.maxItems !== undefined && data.length > schema.maxItems) errors.push({ instancePath: path, keyword: 'maxItems', message: `items > ${schema.maxItems}` });
    if (schema.uniqueItems) {
      const seen = new Set(); for (const it of data) { const k = JSON.stringify(it); if (seen.has(k)) { errors.push({ instancePath: path, keyword: 'uniqueItems', message: 'items duplicados' }); break; } seen.add(k); }
    }
    if (Array.isArray(schema.prefixItems)) schema.prefixItems.forEach((s, i) => i < data.length && validateNode(s, data[i], `${path}/${i}`, root, errors));
    if (schema.items && !Array.isArray(schema.items)) {
      const start = Array.isArray(schema.prefixItems) ? schema.prefixItems.length : 0;
      for (let i = start; i < data.length; i++) validateNode(schema.items, data[i], `${path}/${i}`, root, errors);
    }
  }
  // objetos
  if (t === 'object') {
    if (Array.isArray(schema.required)) for (const r of schema.required) if (!(r in data)) errors.push({ instancePath: path, keyword: 'required', message: `falta propiedad requerida "${r}"` });
    if (schema.minProperties !== undefined && Object.keys(data).length < schema.minProperties) errors.push({ instancePath: path, keyword: 'minProperties', message: `< ${schema.minProperties} props` });
    if (schema.maxProperties !== undefined && Object.keys(data).length > schema.maxProperties) errors.push({ instancePath: path, keyword: 'maxProperties', message: `> ${schema.maxProperties} props` });
    const props = schema.properties || {};
    for (const [k, v] of Object.entries(data)) {
      if (k in props) validateNode(props[k], v, `${path}/${k}`, root, errors);
      else if (schema.additionalProperties === false) errors.push({ instancePath: `${path}/${k}`, keyword: 'additionalProperties', message: `propiedad no permitida "${k}"` });
      else if (typeof schema.additionalProperties === 'object') validateNode(schema.additionalProperties, v, `${path}/${k}`, root, errors);
      // patternProperties
      if (schema.patternProperties) for (const [pat, ps] of Object.entries(schema.patternProperties)) if (new RegExp(pat).test(k)) validateNode(ps, v, `${path}/${k}`, root, errors);
    }
    for (const k of Object.keys(props)) if (props[k] && props[k].default !== undefined && !(k in data)) { /* defaults no aplican en validación */ }
  }
  // combinadores
  if (Array.isArray(schema.allOf)) schema.allOf.forEach((s) => validateNode(s, data, path, root, errors));
  if (Array.isArray(schema.anyOf)) {
    const ok = schema.anyOf.some((s) => { const e = []; validateNode(s, data, path, root, e); return e.length === 0; });
    if (!ok) errors.push({ instancePath: path, keyword: 'anyOf', message: 'no cumple ninguno de anyOf' });
  }
  if (Array.isArray(schema.oneOf)) {
    const n = schema.oneOf.filter((s) => { const e = []; validateNode(s, data, path, root, e); return e.length === 0; }).length;
    if (n !== 1) errors.push({ instancePath: path, keyword: 'oneOf', message: `debe cumplir exactamente 1 de oneOf (cumple ${n})` });
  }
  if (schema.not) { const e = []; validateNode(schema.not, data, path, root, e); if (e.length === 0) errors.push({ instancePath: path, keyword: 'not', message: 'no debe cumplir el schema "not"' }); }
}

export function validate(schema, data, opts = {}) {
  const errors = [];
  validateNode(schema, data, '', opts.root || schema, errors);
  return { valid: errors.length === 0, errors };
}
