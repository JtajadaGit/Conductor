import { start, next } from '../lib/orchestrate.mjs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';

const TMP = join(dirname(fileURLToPath(import.meta.url)), '.tmp-orch');
rmSync(TMP, { recursive: true, force: true });
const CH = join(TMP, 'change');
const w = (rel, c) => { const p = join(CH, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, c); };

await test('orchestrate: start devuelve el primer paso (propose) en complejidad simple', () => {
  const s = start({ changeDir: CH, request: 'add a counter', complexity: 'simple', domain: 'counter' });
  eq(s.phase, 'propose'); eq(s.role, 'planner'); eq(s.write_to, 'proposal.md'); eq(s.of, 4);
  assert(s.instruction.includes('PLANNER'));
});

await test('orchestrate: NO avanza si no se escribió el artefacto del paso', () => {
  const r = next({ changeDir: CH }); // aún no hay proposal.md
  assert(r.advanced === false && /falta proposal.md/.test(r.error), 'fuerza a escribir el artefacto');
});

await test('orchestrate: avanza propose→spec→apply→verify al escribir cada artefacto', () => {
  w('proposal.md', '## Why\nx\n## What Changes\n- y\n## Impact\nz');
  let r = next({ changeDir: CH }); eq(r.phase, 'spec'); eq(r.write_to, 'specs/counter/spec.md');
  w('specs/counter/spec.md', '## ADDED Requirements\n<!-- id: REQ-COUNTER -->\n### Requirement: Counter\nThe system SHALL count.\n#### Scenario: inc\n- **GIVEN** a counter\n- **WHEN** inc\n- **THEN** +1');
  r = next({ changeDir: CH }); eq(r.phase, 'apply');
  w('apply-report.md', 'done\nStatus: done\nFiles created: [a.ts]\nFiles modified: []\nTasks completed: 1/1');
  r = next({ changeDir: CH }); eq(r.phase, 'verify');
});

await test('orchestrate: verify corre el gate y cierra GREEN si pasa', () => {
  w('verify-report.md', 'Verdict: PASS');
  const r = next({ changeDir: CH });
  eq(r.done, true); eq(r.verdict, 'GREEN'); eq(r.gate, 'PASS');
});

await test('orchestrate: el gate en verify bloquea (FAIL) y pide fix, no cierra', () => {
  rmSync(TMP, { recursive: true, force: true });
  start({ changeDir: CH, request: 'x', complexity: 'simple', domain: 'd' });
  w('proposal.md', '## Why\na\n## What Changes\n- b\n## Impact\nc');
  next({ changeDir: CH });
  // spec con un requisito SIN scenario → el gate dará error
  w('specs/d/spec.md', '## ADDED Requirements\n<!-- id: REQ-X -->\n### Requirement: X\nThe system SHALL x.');
  next({ changeDir: CH });
  w('apply-report.md', 'done\nStatus: done\nFiles created: none\nFiles modified: none\nTasks completed: 0/0'); // status done sin ficheros → error
  next({ changeDir: CH }); // → verify
  w('verify-report.md', 'Verdict: PASS');
  const r = next({ changeDir: CH });
  assert(r.gate === 'FAIL' && r.phase === 'fix', 'el gate falla y pide fix');
  assert(Array.isArray(r.findings) && r.findings.length > 0);
});

rmSync(TMP, { recursive: true, force: true });
