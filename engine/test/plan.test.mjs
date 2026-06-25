// plan.test.mjs — resolvedor de PLAN determinista (sustituye los buckets de talla por un plan de ACCIONES
// nombrado por lo que hace + comprobaciones que se encienden por contenido, cada una con su porqué).
import { resolvePlan, PHASE_ACTION } from '../lib/pipeline/plan.mjs';

const BUCKET_RE = /r[aá]pido|retoque|gran migraci|funcionalidad nueva|talla/i;

await test('plan: petición simple → fases lean, verify SIEMPRE terminal, acciones (no buckets de talla)', () => {
  const p = resolvePlan({ request: 'añade un botón de logout en la cabecera' });
  eq(p.phases[p.phases.length - 1], 'verify', 'verify siempre al final (gobierno innegociable)');
  assert(p.phases.includes('apply') && p.phases.includes('spec'), 'incluye especificar e implementar');
  assert(!p.phases.includes('design'), 'una petición simple no añade diseño');
  assert(p.actions.every((a) => typeof a === 'string' && !BUCKET_RE.test(a)), 'se nombra por ACCIÓN, nunca por talla');
  assert(/→/.test(p.summary), 'summary legible del plan');
});

await test('plan: petición sustancial (varias áreas/arquitectura) → añade explorar/diseñar/tareas', () => {
  const p = resolvePlan({ request: 'refactorizar la arquitectura de checkout: cupones, impuestos e integración con el ERP, además del flujo completo de devoluciones' });
  assert(p.substantial, 'detecta que es sustancial');
  assert(p.phases.includes('explore') && p.phases.includes('design') && p.phases.includes('tasks'), 'plan más profundo');
});

await test('plan(fix): "migrar … legacy … nuevo servicio" → sustancial → plan PROFUNDO (no 4 fases)', () => {
  const p = resolvePlan({ request: 'Migrar el modulo de facturacion legacy a un nuevo servicio con su API y su esquema' });
  assert(p.substantial, 'detecta migración/legacy/nuevo servicio como trabajo sustancial (señales ES)');
  eq(p.complexity, 'medium', 'una migración clara → plan medio, no simple');
  assert(p.phases.includes('explore') && p.phases.includes('design') && p.phases.includes('tasks'), 'incluye explorar/diseñar/desglosar');
  assert(p.phases[p.phases.length - 1] === 'verify', 'verify siempre terminal');
});

await test('plan: spec pegada → omite proponer/especificar (arranca en implementar)', () => {
  const p = resolvePlan({ request: '## ADDED Requirements\n<!-- id: REQ-X -->\n### Requirement: X\nThe system SHALL hacer algo.\n#### Scenario: s' });
  assert(p.specPasted, 'detecta una spec ya pegada');
  assert(!p.phases.includes('spec') && !p.phases.includes('propose'), 'no re-especifica lo ya especificado');
  assert(p.phases.includes('apply') && p.phases[p.phases.length - 1] === 'verify');
});

await test('plan: comprobaciones se encienden por CONTENIDO, cada una con su porqué', () => {
  const base = resolvePlan({ request: 'mejora el rendimiento del listado' });
  eq(base.checks.filter((c) => !c.always).length, 0, 'sin señales → solo las comprobaciones base');
  assert(base.checks.length === 3 && base.checks.every((c) => c.always), 'coherencia/trazabilidad/secretos siempre');
  const api = resolvePlan({ request: 'añade un endpoint REST para aplicar cupones' });
  assert(api.checks.some((c) => c.id === 'contrato' && c.why), 'API → contrato (con porqué)');
  const db = resolvePlan({ request: 'migrar la tabla de clientes al nuevo esquema' });
  assert(db.checks.some((c) => c.id === 'datos' && c.why), 'esquema/migrar → datos (con porqué)');
});

await test('plan: petición de 1-3 palabras → añade aclarar dudas (demasiado vaga para construir)', () => {
  const p = resolvePlan({ request: 'arréglalo' });
  assert(p.phases.includes('clarify'), 'una petición vaga pide aclarar antes de construir');
});

await test('plan: PHASE_ACTION mapea cada fase a lenguaje de negocio (sin jerga ni talla)', () => {
  for (const [, label] of Object.entries(PHASE_ACTION)) assert(typeof label === 'string' && !BUCKET_RE.test(label));
});
