import { enforce, loadPolicy, validatePolicy, modelAllowed, DEFAULT_POLICY } from '../lib/gates/policy.mjs';

const errFinding = { rule: 'x', severity: 'error', message: 'boom' };
const warnFinding = { rule: 'y', severity: 'warning', message: 'meh' };

await test('policy: sin bloqueantes → PASS', () => {
  eq(enforce([warnFinding], DEFAULT_POLICY, { ranGates: ['coherence', 'artifacts'] }).verdict, 'PASS');
});
await test('policy: error con blockSeverity=error → FAIL', () => {
  eq(enforce([errFinding], DEFAULT_POLICY, { ranGates: ['coherence', 'artifacts'] }).verdict, 'FAIL');
});
await test('policy: override con justificación válida → OVERRIDDEN + audit', () => {
  const r = enforce([errFinding], DEFAULT_POLICY, { override: 'urgente: hotfix de seguridad aprobado por CISO', overrideBy: 'jorge', ranGates: ['coherence', 'artifacts'] });
  eq(r.verdict, 'OVERRIDDEN');
  assert(r.audit && r.audit.by === 'jorge' && r.audit.blocked_count === 1);
});
await test('policy: override corto → rechazado (FAIL)', () => {
  eq(enforce([errFinding], DEFAULT_POLICY, { override: 'meh', ranGates: ['coherence', 'artifacts'] }).verdict, 'FAIL');
});
await test('policy: override prohibido por política → FAIL', () => {
  const p = { ...DEFAULT_POLICY, override: { allowed: false } };
  eq(enforce([errFinding], p, { override: 'razón larga y suficiente para pasar el minimo' }).verdict, 'FAIL');
});
await test('policy: gate obligatorio no ejecutado → bloquea', () => {
  const r = enforce([], DEFAULT_POLICY, { ranGates: ['coherence'] }); // falta 'artifacts'
  eq(r.verdict, 'FAIL');
  assert(r.blocking.some((f) => f.rule === 'policy.mandatory-gate-missing'));
});
await test('policy: modelos permitidos', () => {
  assert(modelAllowed('deepseek-v4-flash', DEFAULT_POLICY));
  assert(!modelAllowed('gpt-5.5', DEFAULT_POLICY));
});
await test('policy: validación de schema (válida/ inválida)', () => {
  assert(validatePolicy(DEFAULT_POLICY).valid);
  assert(!validatePolicy({ version: 1, blockSeverity: 'catastrophic' }).valid);
});
