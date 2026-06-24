// legacy.test.mjs — P2: base de migración legacy conducida por código. Evidence-gate determinista: "declarada ≠ lista".
import { extractAnchors, traceFeature, assessReadiness, CAPABILITIES } from '../lib/contract/legacy.mjs';

const SRC_CLIENTES = {
  path: 'legacy/clientes.txt',
  text: 'CREATE TABLE clientes (id int, nombre varchar(50));\nfunction clientes_listar() { return 1; }\nSELECT id FROM clientes WHERE activo = 1;',
};
const SRC_PEDIDOS = { path: 'legacy/pedidos.txt', text: 'CREATE TABLE pedidos (id int, total decimal);' };

await test('legacy: extractAnchors detecta capacidades genéricas (data_model, data_access, function)', () => {
  const a = extractAnchors(SRC_CLIENTES.path, SRC_CLIENTES.text);
  const caps = new Set(a.map((x) => x.capability));
  assert(caps.has('data_model'), 'CREATE TABLE → data_model');
  assert(caps.has('data_access'), 'SELECT ... FROM → data_access');
  assert(caps.has('function'), 'function ... ( → function');
  assert(a.every((x) => CAPABILITIES.includes(x.capability)), 'toda ancla usa el vocabulario');
  assert(a.some((x) => x.symbol === 'clientes'), 'captura el símbolo "clientes"');
});

await test('legacy: traceFeature con evidencia fuerte → resolved/high; sin evidencia → unresolved + CODE_TRACE_REQUIRED', () => {
  const anchors = extractAnchors(SRC_CLIENTES.path, SRC_CLIENTES.text);
  const ok = traceFeature({ name: 'listado de clientes', keywords: ['clientes'] }, anchors);
  eq(ok.status, 'resolved', 'varias anclas específicas casan → resolved');
  eq(ok.confidence, 'high');
  assert(ok.evidence.length >= 2 && ok.gaps.length === 0, 'evidencia con provenance y sin huecos');
  const none = traceFeature({ name: 'reporting fiscal avanzado SAP' }, anchors);
  eq(none.status, 'unresolved');
  assert(none.gaps.includes('CODE_TRACE_REQUIRED'), 'feature sin evidencia → bloqueador explícito');
});

await test('legacy(gate): SIN features → BLOCKED (no se puede especificar ni implementar)', () => {
  const r = assessReadiness([], [SRC_CLIENTES]);
  eq(r.state, 'BLOCKED'); eq(r.allowed.implement, false); eq(r.allowed.generateSpec, false);
});

await test('legacy(gate): una feature SIN evidencia → BLOCKED ("declarada ≠ lista")', () => {
  const r = assessReadiness([{ name: 'reporting fiscal avanzado SAP' }], [SRC_CLIENTES]);
  eq(r.state, 'BLOCKED', 'declarar una feature no otorga readiness: sin evidencia, BLOCKED');
  eq(r.allowed.implement, false);
  assert(r.blockers.includes('CODE_TRACE_REQUIRED'));
});

await test('legacy(gate): feature con evidencia PARCIAL → NEEDS_DEEPENING (especificar sí, implementar NO)', () => {
  const r = assessReadiness([{ name: 'pedidos', keywords: ['pedidos'] }], [SRC_PEDIDOS]);
  eq(r.state, 'NEEDS_DEEPENING');
  eq(r.allowed.generateSpec, true);
  eq(r.allowed.implement, false, 'implementación BLOQUEADA hasta evidencia sólida');
});

await test('legacy(gate): feature totalmente fundamentada → READY_FOR_SPEC (implementación permitida)', () => {
  const r = assessReadiness([{ name: 'listado de clientes', keywords: ['clientes'] }], [SRC_CLIENTES]);
  eq(r.state, 'READY_FOR_SPEC');
  eq(r.allowed.implement, true);
  eq(r.blockers.length, 0);
});

await test('legacy(gate, fix QA): feature "resolved" PERO con bloqueador duro (sin modelo de datos) → NEEDS_DEEPENING, NO implementable', () => {
  // evidencia fuerte (función + UI) pero el nombre pide "modelo" y NO hay data_model/data_access → DATA_MODEL_REQUIRED.
  // Antes del fix esto caía a READY_FOR_SPEC/implement:true ignorando el blocker; ahora la implementación queda BLOQUEADA.
  const src = { path: 'legacy/cuentas.txt', text: 'function cuentas_modelo() { return 1; }\n<form name="cuentas_form"></form>' };
  const r = assessReadiness([{ name: 'modelo de cuentas', keywords: ['cuentas'] }], [src]);
  assert(r.blockers.includes('DATA_MODEL_REQUIRED'), 'detecta el bloqueador duro de modelo de datos');
  eq(r.state, 'NEEDS_DEEPENING', 'un bloqueador duro impide READY aunque la feature esté "resolved"');
  eq(r.allowed.implement, false, 'la implementación queda BLOQUEADA hasta resolver el bloqueador');
});
