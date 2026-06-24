// policy-wire.test.mjs — verifica que policy.enforce() está CABLEADO al gate vivo (next() en verify),
// no solo definido en gates/policy.mjs. Cubre: (1) mandatoryGates extra bloquea, (2) override auditado
// deja pasar a GREEN, (3) sin policy.json el veredicto es idéntico al gate de hoy (behavior-preserving).
import { start, next } from '../lib/pipeline/orchestrate.mjs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';

const TMP = join(dirname(fileURLToPath(import.meta.url)), '.tmp-polwire');

// monta un change que llega a verify con gate estructural PASS; opcionalmente escribe openspec/policy.json
function setupGreenChange(policy) {
  rmSync(TMP, { recursive: true, force: true });
  const CH = join(TMP, 'openspec', 'changes', 'ch');
  const w = (rel, c) => { const p = join(CH, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, c); };
  if (policy) { const pp = join(TMP, 'openspec', 'policy.json'); mkdirSync(dirname(pp), { recursive: true }); writeFileSync(pp, JSON.stringify(policy)); }
  start({ changeDir: CH, request: 'x', complexity: 'simple', domain: 'd' });
  w('proposal.md', '## Why\nx\n## What Changes\n- y\n## Impact\nz');
  next({ changeDir: CH });
  w('specs/d/spec.md', '## ADDED Requirements\n<!-- id: REQ-X -->\n### Requirement: X\nThe system SHALL x.\n#### Scenario: s\n- **GIVEN** a\n- **WHEN** b\n- **THEN** c');
  next({ changeDir: CH });
  w('apply-report.md', 'done\nStatus: done\nFiles created: [a.ts]\nFiles modified: []\nTasks completed: 1/1');
  next({ changeDir: CH }); // → verify
  w('verify-report.md', 'Verdict: PASS');
  return CH;
}

await test('policy-wire: sin policy.json → GREEN (behavior-preserving)', () => {
  const CH = setupGreenChange(null);
  const r = next({ changeDir: CH });
  eq(r.verdict, 'GREEN'); eq(r.gate, 'PASS');
  eq(r.policy.source, 'default'); eq(r.policy.verdict, 'PASS');
});

await test('policy-wire: mandatoryGate que no corre → FAIL (pide fix)', () => {
  const CH = setupGreenChange({ version: 1, blockSeverity: 'error', mandatoryGates: ['coherence', 'artifacts', 'data'] });
  const r = next({ changeDir: CH });
  assert(r.gate === 'FAIL' && r.phase === 'fix', 'gate obligatorio ausente debe bloquear el GREEN');
  assert(r.findings.some((f) => f.rule === 'policy.mandatory-gate-missing'));
});

await test('policy-wire: override justificado → OVERRIDDEN deja pasar a GREEN con audit', () => {
  const CH = setupGreenChange({ version: 1, blockSeverity: 'error', mandatoryGates: ['coherence', 'artifacts', 'data'] });
  const r = next({ changeDir: CH, override: 'aprobado por tech-lead: el gate de datos no aplica a este change UI-only', overrideBy: 'jorge' });
  eq(r.verdict, 'GREEN');
  assert(r.policy.audit && r.policy.audit.by === 'jorge' && r.policy.audit.action === 'gate-override');
});

await test('policy-wire: blockSeverity=warning endurece (un warning estructural bloquearía)', () => {
  // policy.json inválida → fail-closed (no crash, bloquea como error)
  const CH = setupGreenChange(null);
  const pp = join(TMP, 'openspec', 'policy.json');
  writeFileSync(pp, '{ not valid json');
  const r = next({ changeDir: CH });
  assert(r.gate === 'FAIL' && r.findings.some((f) => f.rule === 'policy.invalid'), 'policy.json corrupta = fail-closed, no crash');
});

rmSync(TMP, { recursive: true, force: true });
