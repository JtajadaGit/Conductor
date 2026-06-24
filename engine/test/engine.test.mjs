import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkCoherence } from '../lib/gates/coherence.mjs';
import { checkArtifacts } from '../lib/gates/artifacts.mjs';
import { buildTrace } from '../lib/gates/trace.mjs';
import { computeCost } from '../lib/core/cost.mjs';
import { seal, verifySeal, generateKeypair, hashSpecs } from '../lib/provenance/provenance.mjs';
import { rdjson, sarif, junit, json, isBlocking } from '../lib/core/report.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const FX = resolve(HERE, 'fixtures');
const F1 = join(FX, 'changes');   // change-pass → changes/pass, change-fail → changes/fail (ver helper cp más abajo)
const F2 = join(FX, 'trace');     // trace/change, trace/project
const F4 = join(FX, 'usage');

await test('coherence: change-pass sin errores', () => {
  eq(checkCoherence(join(F1, 'change-pass')).filter((f) => f.severity === 'error').length, 0);
});
await test('coherence: change-fail detecta 4 errores', () => {
  eq(checkCoherence(join(F1, 'change-fail')).filter((f) => f.severity === 'error').length, 4);
});
await test('trace: detecta hueco REQ-SESSION (sin test)', () => {
  const t = buildTrace(join(F2, 'change'), join(F2, 'project'));
  assert(t.gaps.includes('REQ-SESSION'));
  assert(t.orphanTasks.length === 1);
});
await test('trace: cross-stack (xstack) Java/PHP/Apex/Spartacus/Magento', () => {
  const t = buildTrace(join(HERE, 'fixtures', 'xstack-change'), join(HERE, 'fixtures', 'xstack'));
  const order = t.matrix.find((m) => m.id === 'REQ-ORDER');
  const cart = t.matrix.find((m) => m.id === 'REQ-CART');
  assert(order && order.cov.code && order.cov.test, 'REQ-ORDER trazado a código (java/php/apex/magento) y test');
  assert(order.code.length >= 4, 'REQ-ORDER en >=4 ficheros de código multi-stack');
  assert(cart && cart.cov.code && !cart.cov.test, 'REQ-CART (Spartacus) con código sin test');
});
await test('cost: ahorro mixto ~51% y BYOK $0', () => {
  const mixed = computeCost(join(F4, 'token-usage-mixed.jsonl'));
  assert(mixed.saved_pct > 40 && mixed.saved_pct < 60, 'ahorro mixto en rango');
  const byok = computeCost(join(F4, 'token-usage.jsonl'));
  eq(byok.cost_usd, 0, 'BYOK puro = $0');
  assert(byok.otelSpans.length === 8, 'un span por llamada');
  assert(byok.otelSpans[0].attributes['gen_ai.request.model'], 'span con atributo OTel');
});
await test('provenance HMAC: seal GREEN y verify OK', () => {
  const gates = [{ name: 'coherence', findings: checkCoherence(join(F1, 'change-pass')) }, { name: 'artifacts', findings: checkArtifacts(join(F1, 'change-pass')) }];
  const doc = seal({ change: 'x', gates, at: 'T', key: 'k' });
  eq(doc.verdict, 'GREEN'); eq(doc.signature.algo, 'HMAC-SHA256');
  const v = verifySeal(doc, { key: 'k' }); assert(v.shaOk && v.sigOk);
});
await test('provenance HMAC: tamper detectado y clave incorrecta', () => {
  const doc = seal({ change: 'x', gates: [{ name: 'g', findings: [] }], at: 'T', key: 'k' });
  doc.verdict = 'HACK';
  assert(!verifySeal(doc, { key: 'k' }).shaOk, 'sha debe romperse');
  const clean = seal({ change: 'x', gates: [{ name: 'g', findings: [] }], at: 'T', key: 'k' });
  assert(!verifySeal(clean, { key: 'wrong' }).sigOk, 'clave incorrecta');
});
await test('provenance Ed25519: firma asimétrica (no-repudio)', () => {
  const { privateKeyPem, publicKeyPem } = generateKeypair();
  const doc = seal({ change: 'x', gates: [{ name: 'g', findings: [] }], at: 'T', privateKeyPem, engineVersion: '0.5.0' });
  eq(doc.signature.algo, 'Ed25519');
  const v = verifySeal(doc, { publicKeyPem }); assert(v.shaOk && v.sigOk, 'verifica con pública');
  // sin clave privada del atacante NO se puede re-firmar tras manipular
  doc.verdict = 'HACK';
  const bad = verifySeal(doc, { publicKeyPem }); assert(!bad.sigOk, 'firma inválida tras manipular');
  // otra clave pública no valida
  const other = generateKeypair();
  assert(!verifySeal(seal({ change: 'x', gates: [{ name: 'g', findings: [] }], at: 'T', privateKeyPem }), { publicKeyPem: other.publicKeyPem }).sigOk, 'otra pública no valida');
});
await test('provenance (#84): spec-freeze — hashSpecs determinista, cambia con la spec; el sello embebe spec_sha256', async () => {
  const { mkdirSync, writeFileSync, rmSync } = await import('node:fs');
  const TMP = join(HERE, '.tmp-specfreeze');
  rmSync(TMP, { recursive: true, force: true });
  const ch = join(TMP, 'changes', 'feat');
  mkdirSync(join(ch, 'specs', 'auth'), { recursive: true });
  writeFileSync(join(ch, 'specs', 'auth', 'spec.md'), '## ADDED Requirements\n### Requirement: A\nThe system SHALL a.');
  const h1 = hashSpecs(ch);
  assert(typeof h1 === 'string' && h1.length === 64, 'hashSpecs devuelve sha256 hex');
  eq(hashSpecs(ch), h1, 'mismo contenido → mismo hash (determinista)');
  writeFileSync(join(ch, 'specs', 'auth', 'spec.md'), '## ADDED Requirements\n### Requirement: A\nThe system SHALL a (modificado).');
  assert(hashSpecs(ch) !== h1, 'mutar la spec cambia el hash (spec-freeze lo detecta)');
  eq(hashSpecs(join(TMP, 'changes', 'vacio')), null, 'change sin specs → null');
  const doc = seal({ change: 'x', gates: [{ name: 'g', findings: [] }], at: 'T', key: 'k', specHash: h1 });
  eq(doc.spec_sha256, h1, 'el sello fija spec_sha256');
  const v = verifySeal(doc, { key: 'k' }); assert(v.shaOk && v.sigOk, 'el sello con spec_sha256 verifica (retro-compatible)');
  rmSync(TMP, { recursive: true, force: true });
});
await test('report: rdjson/sarif/junit válidos', () => {
  const F = checkCoherence(join(F1, 'change-fail'));
  const rd = JSON.parse(rdjson(F)); assert(rd.diagnostics.length === F.length && rd.source.name);
  const sa = JSON.parse(sarif(F)); eq(sa.version, '2.1.0'); assert(sa.runs[0].results.length === F.length);
  const ju = junit(F); assert(ju.includes('<testsuite') && ju.includes('failure'));
  assert(isBlocking(F));
});
