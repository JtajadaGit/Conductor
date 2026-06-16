import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { diffOpenApi, summarize } from '../lib/openapi-diff.mjs';

const FX = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'contract');
const J = (p) => JSON.parse(readFileSync(join(FX, p), 'utf8'));
const v1 = J('v1.json');

await test('breaking: detecta las 7 categorías', () => {
  const f = diffOpenApi(v1, J('v2-breaking.json'));
  const rules = new Set(f.filter((x) => x.severity === 'breaking').map((x) => x.rule));
  assert(rules.has('path.removed'), 'path.removed');
  assert(rules.has('operation.removed'), 'operation.removed');
  assert(rules.has('schema.type-changed'), 'type-changed');
  assert(rules.has('parameter.added'), 'required param added');
  assert(rules.has('schema.property-removed'), 'property-removed');
  assert(rules.has('schema.enum-narrowed'), 'enum-narrowed');
  assert(rules.has('parameter.required-added'), 'param optional→required');
});

await test('compatible: 0 breaking', () => {
  const f = diffOpenApi(v1, J('v2-compatible.json'));
  eq(summarize(f).breaking, 0, 'breaking debe ser 0');
});

await test('identidad: spec vs sí misma → 0 findings', () => {
  eq(diffOpenApi(v1, v1).length, 0);
});

await test('enum widening en response → warning, no breaking', () => {
  const base = { components: { schemas: { S: { type: 'object', properties: { x: { enum: ['a', 'b'] } } } } } };
  const head = { components: { schemas: { S: { type: 'object', properties: { x: { enum: ['a', 'b', 'c'] } } } } } };
  const f = diffOpenApi(base, head);
  assert(f.some((x) => x.rule === 'schema.enum-widened-response' && x.severity === 'warning'));
  eq(summarize(f).breaking, 0);
});

await test('$ref se resuelve en el diff', () => {
  const base = { components: { schemas: { A: { $ref: '#/components/schemas/B' }, B: { type: 'object', properties: { n: { type: 'number' } } } } } };
  const head = { components: { schemas: { A: { $ref: '#/components/schemas/B' }, B: { type: 'object', properties: { n: { type: 'string' } } } } } };
  const f = diffOpenApi(base, head);
  assert(f.some((x) => x.rule === 'schema.type-changed'), 'debe ver el cambio tras el $ref');
});

await test('security: exigir auth nueva → breaking', () => {
  const base = { paths: {}, security: [] };
  const head = { paths: {}, security: [{ apiKey: [] }] };
  assert(diffOpenApi(base, head).some((x) => x.rule === 'security.added' && x.severity === 'breaking'));
});

await test('security: scheme eliminado → breaking', () => {
  const base = { components: { securitySchemes: { oauth: { type: 'oauth2' } } } };
  const head = { components: { securitySchemes: {} } };
  assert(diffOpenApi(base, head).some((x) => x.rule === 'security.scheme-removed' && x.severity === 'breaking'));
});

await test('discriminator cambiado → breaking', () => {
  const base = { components: { schemas: { Pet: { discriminator: { propertyName: 'type' } } } } };
  const head = { components: { schemas: { Pet: { discriminator: { propertyName: 'kind' } } } } };
  assert(diffOpenApi(base, head).some((x) => x.rule === 'schema.discriminator-changed' && x.severity === 'breaking'));
});

await test('oneOf con menos miembros → breaking', () => {
  const base = { components: { schemas: { S: { oneOf: [{ type: 'string' }, { type: 'number' }] } } } };
  const head = { components: { schemas: { S: { oneOf: [{ type: 'string' }] } } } };
  assert(diffOpenApi(base, head).some((x) => x.rule === 'schema.oneOf-narrowed' && x.severity === 'breaking'));
});

await test('nullable retirado en response → breaking', () => {
  const base = { components: { schemas: { S: { type: 'object', properties: { x: { type: 'string', nullable: true } } } } } };
  const head = { components: { schemas: { S: { type: 'object', properties: { x: { type: 'string' } } } } } };
  assert(diffOpenApi(base, head).some((x) => x.rule === 'schema.nullable-removed' && x.severity === 'breaking'));
});
