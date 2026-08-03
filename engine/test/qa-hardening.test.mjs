// REGRESIÓN de la auditoría adversarial cada test ancla un hallazgo CONFIRMADO y verificado.
// No vuelven a colarse: false-GREEN forjado (en determinism.test), recursión de contratos, fail-open de
// políticas, downgrade de firma, race/forgery del ledger, prototype-pollution y DoS de parseo.
import { diffOpenApi } from '../lib/contract/openapi-diff.mjs';
import { plumbPath } from '../lib/core/plumb.mjs';
import { lintMigrations } from '../lib/contract/migration.mjs';
import { seal, verifySeal, generateKeypair } from '../lib/provenance/provenance.mjs';
import { append, verifyChain } from '../lib/provenance/ledger.mjs';
import { enforce, DEFAULT_POLICY } from '../lib/gates/policy.mjs';
import { estimateRun } from '../lib/core/estimate.mjs';
import { parseEvents, parseOtelSession } from '../lib/core/events.mjs';
import { computeCost, priceOf } from '../lib/core/cost.mjs';
import { parseReport } from '../lib/gates/coherence.mjs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';

const TMP = join(dirname(fileURLToPath(import.meta.url)), '.tmp-qa');
const fresh = () => { rmSync(TMP, { recursive: true, force: true }); mkdirSync(TMP, { recursive: true }); };

await test('C2: schema OpenAPI con $ref recursivo NO tumba el diff y conserva el breaking real', () => {
  const base = { openapi: '3.0.0',
    paths: { '/legacy': { get: { responses: { '200': {} } } }, '/x': { get: { responses: { '200': { content: { 'application/json': { schema: { $ref: '#/components/schemas/Tree' } } } } } } } },
    components: { schemas: { Tree: { type: 'object', properties: { children: { type: 'array', items: { $ref: '#/components/schemas/Tree' } } } } } } };
  const head = JSON.parse(JSON.stringify(base)); delete head.paths['/legacy'];
  let out, threw = false;
  try { out = diffOpenApi(base, head); } catch { threw = true; }
  assert(!threw, 'diffOpenApi no lanza RangeError con schema recursivo');
  assert(out.some((f) => f.rule === 'path.removed' && /\/legacy/.test(f.message)), 'el breaking /legacy se reporta pese al ciclo');
});

await test('H8: eliminar una propiedad con nombre de prototipo ("valueOf") se reporta como breaking', () => {
  const base = { openapi: '3.0.0', components: { schemas: { Account: { type: 'object', properties: { balance: { type: 'number' }, valueOf: { type: 'string' }, owner: { type: 'string' } } } } } };
  const head = { openapi: '3.0.0', components: { schemas: { Account: { type: 'object', properties: { balance: { type: 'number' } } } } } };
  const out = diffOpenApi(base, head);
  assert(out.some((f) => f.rule === 'schema.property-removed' && /valueOf/.test(f.message)), '"valueOf" eliminada se reporta (no se confunde con Object.prototype)');
});

await test('H4: DELETE sin WHERE se marca aunque una sentencia POSTERIOR tenga WHERE', () => {
  fresh();
  const f = join(TMP, 'm.sql'); writeFileSync(f, 'DELETE FROM audit_log;\nUPDATE users SET active=1 WHERE id=5;\n');
  assert(lintMigrations(f).some((x) => x.rule === 'migration.unscoped-dml'), 'el DELETE sin filtro se detecta por sentencia');
});

await test('H7/L20: SHA-256 es integridad, no autenticidad (no autentica); sello sin firma no lanza', () => {
  const doc = seal({ change: 'x', gates: [{ name: 'g', findings: [] }], trace: null, at: 'T', engineVersion: 't' });
  eq(doc.signature.algo, 'SHA-256', 'sin clave → sello SHA-256');
  eq(verifySeal(doc).sigOk, false, 'SHA-256 nunca da sigOk (cierra el downgrade de firma)');
  eq(verifySeal({ verdict: 'GREEN' }).sigOk, false, 'L20: sello sin firma → sigOk false, sin TypeError');
});

await test('H5/H6/L21: ledger firma por entrada, verifyChain reporta signed; línea corrupta → ok:false', () => {
  fresh();
  const { privateKeyPem, publicKeyPem } = generateKeypair();
  const led = join(TMP, 'ledger.jsonl');
  const e1 = append(led, { change: 'a', verdict: 'GREEN', sealed_at: 'T1' }, { privateKeyPem });
  append(led, { change: 'b', verdict: 'GREEN', sealed_at: 'T2' }, { privateKeyPem });
  assert(e1.sig, 'la entrada va firmada cuando hay clave privada (H6)');
  const v = verifyChain(led, { publicKeyPem });
  assert(v.ok && v.signed, 'la cadena firmada verifica como signed');
  writeFileSync(led, readFileSync(led, 'utf8') + 'ESTO NO ES JSON\n');
  eq(verifyChain(led).ok, false, 'L21: una línea corrupta → ok:false (no lanza, no inutiliza el ledger)');
});

await test('policy: M10 severidad desconocida bloquea · M11 gate obligatorio ausente bloquea · M12 override no-string falla', () => {
  eq(enforce([{ severity: 'CRITICAL', message: 'x' }], DEFAULT_POLICY, { ranGates: ['coherence', 'artifacts'] }).verdict, 'FAIL', 'M10: severidad desconocida → fail-closed');
  eq(enforce([], DEFAULT_POLICY, {}).verdict, 'FAIL', 'M11: sin ranGates, los gates obligatorios cuentan como ausentes');
  eq(enforce([{ severity: 'error', message: 'x' }], DEFAULT_POLICY, { ranGates: ['coherence', 'artifacts'], override: 1234567890123 }).verdict, 'FAIL', 'M12: override numérico NO concede OVERRIDDEN');
});

await test('L2/L3: estimateRun con complexity de prototipo no rompe (cae a medium)', () => {
  const r = estimateRun({ complexity: '__proto__', request: 'haz algo' });
  eq(r.complexity, 'medium', 'clave de prototipo → medium');
  assert(Array.isArray(r.phases) && r.phases.length > 0, 'devuelve fases iterables (no "is not iterable")');
});

await test('M26: una línea de events.jsonl SIN type no tumba el visor', () => {
  fresh();
  const d = plumbPath(TMP); mkdirSync(d, { recursive: true });
  writeFileSync(join(d, 'events.jsonl'), JSON.stringify({ id: '1' }) + '\n' + JSON.stringify({ type: 'tool.execution_start', id: '2', data: { tool_name: 'bash' } }) + '\n');
  const r = parseEvents(join(d, 'events.jsonl'));
  assert(r && r.summary.total === 2, 'parsea las 2 líneas sin lanzar pese a la que no tiene type');
});

await test('M3/M4: parseOtelSession con startTime fuera de rango no provoca RangeError', () => {
  fresh();
  const od = join(TMP, 'otel'); mkdirSync(od, { recursive: true });
  writeFileSync(join(od, 'apply.jsonl'), JSON.stringify({ type: 'span', name: 'chat m', attributes: { 'gen_ai.operation.name': 'chat', 'gen_ai.response.model': 'm', 'gen_ai.usage.input_tokens': 10 }, startTime: [1000000000000000, 0], endTime: [1000000000000000, 0], status: { code: 0 }, events: [] }) + '\n');
  let threw = false, r = null;
  try { r = parseOtelSession(od); } catch { threw = true; }
  assert(!threw && r, 'startTime gigante: ni RangeError ni toISOString roto');
});

await test('M6/M9: output_tokens ausente no envenena el coste; modelo con nombre de prototipo → precio 0', () => {
  fresh();
  const f = join(TMP, 'usage.jsonl');
  writeFileSync(f, JSON.stringify({ phase: 'apply', model: 'claude-opus-4-8', input_tokens: 1000 }) + '\n' + JSON.stringify({ phase: 'verify', model: 'claude-opus-4-8', input_tokens: 500, output_tokens: 50 }) + '\n');
  const c = computeCost(f);
  assert(Number.isFinite(c.cost_usd) && c.cost_usd > 0, 'una línea sin output_tokens NO anula el coste total');
  const p = priceOf('toString');
  eq(p.in, 0, 'modelo "toString" → precio in 0 (no la función heredada)');
  eq(p.out, 0, 'modelo "toString" → precio out 0');
});

await test('H9: "Status: done (prosa)" se reconoce como done (los checks de coherencia siguen corriendo)', () => {
  eq(parseReport('Status: done (entrega completa)\nFiles created: x\nTasks completed: 1/1\n').status, 'done', 'la prosa tras "done" no anula el estado');
});
