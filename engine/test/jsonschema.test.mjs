import { validate } from '../lib/jsonschema.mjs';

await test('type: integer vs number', () => {
  assert(validate({ type: 'integer' }, 3).valid);
  assert(!validate({ type: 'integer' }, 3.5).valid);
  assert(validate({ type: 'number' }, 3.5).valid);
});
await test('required detecta falta', () => {
  const r = validate({ type: 'object', required: ['a'] }, {});
  assert(!r.valid && r.errors[0].keyword === 'required');
});
await test('enum / const', () => {
  assert(validate({ enum: [1, 2, 3] }, 2).valid);
  assert(!validate({ enum: [1, 2, 3] }, 5).valid);
  assert(!validate({ const: 'x' }, 'y').valid);
});
await test('nested properties con instancePath', () => {
  const r = validate({ type: 'object', properties: { a: { type: 'object', properties: { b: { type: 'number' } } } } }, { a: { b: 'no' } });
  assert(!r.valid); eq(r.errors[0].instancePath, '/a/b');
});
await test('additionalProperties:false rechaza extra', () => {
  assert(!validate({ type: 'object', properties: { a: {} }, additionalProperties: false }, { a: 1, b: 2 }).valid);
});
await test('string: minLength/maxLength/pattern/format', () => {
  assert(!validate({ type: 'string', minLength: 3 }, 'ab').valid);
  assert(!validate({ type: 'string', pattern: '^x' }, 'yz').valid);
  assert(validate({ type: 'string', format: 'email' }, 'a@b.com').valid);
  assert(!validate({ type: 'string', format: 'email' }, 'nope').valid);
});
await test('numéricos: minimum/maximum/multipleOf', () => {
  assert(!validate({ type: 'number', minimum: 10 }, 5).valid);
  assert(!validate({ type: 'integer', multipleOf: 5 }, 7).valid);
});
await test('array: items + minItems + uniqueItems', () => {
  assert(!validate({ type: 'array', items: { type: 'number' } }, [1, 'x']).valid);
  assert(!validate({ type: 'array', minItems: 2 }, [1]).valid);
  assert(!validate({ type: 'array', uniqueItems: true }, [1, 1]).valid);
});
await test('combinadores: oneOf exactamente uno', () => {
  const s = { oneOf: [{ type: 'string' }, { type: 'number' }] };
  assert(validate(s, 'x').valid);
  assert(validate(s, 5).valid);
  assert(!validate({ oneOf: [{ type: 'number' }, { type: 'integer' }] }, 5).valid); // cumple ambos → falla
});
await test('$ref local', () => {
  const s = { $defs: { N: { type: 'number' } }, properties: { x: { $ref: '#/$defs/N' } } };
  assert(validate(s, { x: 1 }, { root: s }).valid);
  assert(!validate(s, { x: 'no' }, { root: s }).valid);
});
await test('nullable (OpenAPI) permite null', () => {
  assert(validate({ type: 'string', nullable: true }, null).valid);
  assert(!validate({ type: 'string' }, null).valid);
});
