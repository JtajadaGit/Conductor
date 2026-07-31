// jsonschema-casuistica.test.mjs — el validador que decide si la config de un EQUIPO es válida.
// Un validador que acepta de más deja pasar gobierno mal escrito (y el equipo cree tener gates que no
// tiene); uno que rechaza de más bloquea a gente que hizo las cosas bien. Las dos fallan caro, así que
// aquí se prueban los dos sentidos: lo válido pasa Y lo inválido se caza, con el motivo correcto.
// (2026-07-31: `core/jsonschema.mjs` estaba al 60% de funciones — el subconjunto draft 2020-12 que
// declara soportar no se ejercitaba casi nada.)
import { validate } from '../lib/core/jsonschema.mjs';
import { CONFIG_SCHEMA } from '../lib/analysis/scaffold.mjs';

const ok = (s, d, m) => { const r = validate(s, d); assert(r.valid, `${m || 'debería ser válido'}: ${JSON.stringify(r.errors)}`); };
const ko = (s, d, kw, m) => {
  const r = validate(s, d);
  assert(!r.valid, `${m || 'debería ser inválido'}: ${JSON.stringify(d)}`);
  if (kw) assert(r.errors.some((e) => e.keyword === kw), `esperaba keyword "${kw}", vinieron ${r.errors.map((e) => e.keyword).join(',')}`);
};

await test('jsonschema: tipos, incluido el matiz integer/number que rompe validadores caseros', () => {
  ok({ type: 'integer' }, 42);
  ko({ type: 'integer' }, 42.5, 'type');
  ok({ type: 'number' }, 42, 'un entero TAMBIÉN es number');
  ok({ type: ['string', 'null'] }, null, 'array de tipos');
  ko({ type: 'array' }, {}, 'type', 'un objeto no es un array');
  ok({ type: 'array' }, [], 'un array vacío sí');
  ko({ type: 'string' }, null, 'type', 'null no es string sin nullable');
  ok({ type: 'string', nullable: true }, null, 'nullable (extensión OpenAPI) sí lo permite');
});

await test('jsonschema: required, properties y additionalProperties (la puerta de las erratas de config)', () => {
  const s = { type: 'object', required: ['a'], properties: { a: { type: 'string' } }, additionalProperties: false };
  ok(s, { a: 'x' });
  ko(s, {}, 'required', 'falta la obligatoria');
  ko(s, { a: 'x', sobra: 1 }, 'additionalProperties', 'una clave de más se caza — así se detectó el `presset`');
  ok({ type: 'object', properties: { a: {} }, additionalProperties: true }, { a: 1, otra: 2 });
});

await test('jsonschema: enum y const distinguen valores compuestos, no solo primitivos', () => {
  ok({ enum: ['a', 'b'] }, 'a');
  ko({ enum: ['a', 'b'] }, 'c', 'enum');
  ok({ enum: [{ x: 1 }] }, { x: 1 }, 'compara por valor, no por referencia');
  ok({ const: 5 }, 5);
  ko({ const: 5 }, '5', 'const', 'no hace coerción de tipos: "5" no es 5');
});

await test('jsonschema: límites numéricos y de longitud, con sus variantes exclusivas', () => {
  ok({ minimum: 0, maximum: 10 }, 5);
  ko({ minimum: 0 }, -1, 'minimum');
  ko({ maximum: 10 }, 11, 'maximum');
  ko({ exclusiveMinimum: 0 }, 0, 'exclusiveMinimum', 'el propio 0 queda fuera');
  ko({ exclusiveMaximum: 10 }, 10, 'exclusiveMaximum');
  ok({ multipleOf: 5 }, 10);
  ko({ multipleOf: 5 }, 7, 'multipleOf');
  ok({ minLength: 2, maxLength: 4 }, 'abc');
  ko({ minLength: 2 }, 'a', 'minLength');
  ko({ maxLength: 2 }, 'abc', 'maxLength');
  ok({ pattern: '^conductor-' }, 'conductor-x');
  ko({ pattern: '^conductor-' }, 'otro', 'pattern');
});

await test('jsonschema: arrays — items, prefixItems, unicidad y cardinalidad', () => {
  ok({ type: 'array', items: { type: 'string' } }, ['a', 'b']);
  ko({ type: 'array', items: { type: 'string' } }, ['a', 1], 'type');
  ok({ type: 'array', minItems: 1, maxItems: 2 }, [1]);
  ko({ type: 'array', minItems: 2 }, [1], 'minItems');
  ko({ type: 'array', maxItems: 1 }, [1, 2], 'maxItems');
  ok({ type: 'array', uniqueItems: true }, [1, 2]);
  ko({ type: 'array', uniqueItems: true }, [1, 1], 'uniqueItems');
  ok({ type: 'array', prefixItems: [{ type: 'string' }, { type: 'number' }] }, ['a', 1]);
  ko({ type: 'array', prefixItems: [{ type: 'string' }] }, [1], 'type');
});

await test('jsonschema: combinadores allOf/anyOf/oneOf/not — oneOf exige EXACTAMENTE uno', () => {
  ok({ allOf: [{ type: 'string' }, { minLength: 2 }] }, 'ab');
  ko({ allOf: [{ type: 'string' }, { minLength: 3 }] }, 'ab', 'minLength');
  ok({ anyOf: [{ type: 'string' }, { type: 'number' }] }, 7);
  ko({ anyOf: [{ type: 'string' }, { type: 'number' }] }, true, 'anyOf');
  ok({ oneOf: [{ type: 'string' }, { type: 'number' }] }, 'x');
  ko({ oneOf: [{ type: 'number' }, { type: 'integer' }] }, 5, 'oneOf', 'cumple DOS → oneOf debe fallar');
  ok({ not: { type: 'string' } }, 5);
  ko({ not: { type: 'string' } }, 'x', 'not');
});

await test('jsonschema: $ref local resuelve, y un $ref roto se DENUNCIA en vez de pasar de largo', () => {
  const root = { $defs: { nombre: { type: 'string', minLength: 2 } }, type: 'object', properties: { n: { $ref: '#/$defs/nombre' } } };
  ok(root, { n: 'ab' });
  ko(root, { n: 'a' }, 'minLength', 'el $ref se aplica de verdad');
  ko({ $ref: '#/$defs/noExiste' }, 'x', '$ref', 'un $ref que no resuelve es un error, no un permiso');
});

await test('jsonschema: formatos básicos (los que declara soportar)', () => {
  ok({ format: 'date' }, '2026-07-31');
  ko({ format: 'date' }, '31/07/2026', 'format');
  ok({ format: 'email' }, 'a@b.co');
  ko({ format: 'email' }, 'sin-arroba', 'format');
  ok({ format: 'uuid' }, '123e4567-e89b-12d3-a456-426614174000');
  ko({ format: 'uuid' }, 'no-uuid', 'format');
  ok({ format: 'inventado' }, 'lo-que-sea', 'un formato desconocido no inventa errores');
});

await test('jsonschema: entradas absurdas no lanzan — un validador que revienta bloquea al usuario', () => {
  for (const [s, d] of [[true, 1], [false, 1], [undefined, 1], [{}, undefined], [{ type: 'object' }, null], [null, null], ['no-schema', 1]]) {
    let r; try { r = validate(s, d); } catch (e) { assert(false, `validate(${JSON.stringify(s)}, ${JSON.stringify(d)}) lanzó: ${e.message}`); }
    assert(typeof r.valid === 'boolean' && Array.isArray(r.errors), 'siempre devuelve {valid, errors}');
  }
});

await test('jsonschema: el CONFIG_SCHEMA real acepta una config de equipo y caza las erratas típicas', () => {
  ok(CONFIG_SCHEMA, { preset: 'feature', models: { coder: 'copilot:x' }, maxRetries: 1, budget: { maxTokens: 1000, onExceed: 'block' } }, 'config de senior');
  ok(CONFIG_SCHEMA, {}, 'todo es opcional: una config vacía es válida');
  ko(CONFIG_SCHEMA, { preset: 'inventado' }, 'enum', 'un preset que no existe se caza');
  ko(CONFIG_SCHEMA, { strictTests: 'false' }, 'type', 'el string "false" NO es un booleano (errata clásica)');
  ko(CONFIG_SCHEMA, { presset: 'feature' }, 'additionalProperties', 'la errata de clave se caza');
  ko(CONFIG_SCHEMA, { budget: '1000' }, 'type', 'budget debe ser objeto, no string');
});
