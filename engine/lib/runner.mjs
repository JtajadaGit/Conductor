// conductor/lib/runner.mjs — runs con estado, resume-from-gate (lib).
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { checkCoherence } from './coherence.mjs';
import { isBlocking } from './report.mjs';

const PHASES = {
  simple: ['spec', 'apply', 'verify'],
  medium: ['explore', 'spec', 'design', 'tasks', 'apply', 'verify'],
  complex: ['explore', 'propose', 'clarify', 'spec', 'design', 'tasks', 'apply', 'verify'],
};
const AGENT = { explore: 'planner', propose: 'planner', clarify: 'planner', spec: 'planner', design: 'planner', tasks: 'planner', apply: 'coder', verify: 'reviewer' };

export function runIdFor(changeDir) { return 'run-' + basename(resolve(changeDir)).replace(/[^a-z0-9]+/gi, '-'); }

export function loadOrNew(runsDir, changeDir, complexity = 'medium') {
  if (!existsSync(runsDir)) mkdirSync(runsDir, { recursive: true });
  const runId = runIdFor(changeDir);
  const p = join(runsDir, `${runId}.json`);
  if (existsSync(p)) return JSON.parse(readFileSync(p, 'utf8'));
  return { runId, change: resolve(changeDir), complexity, status: 'running', currentPhase: null, log: [],
    phases: PHASES[complexity].map((name) => ({ name, agent: AGENT[name], status: 'pending', gate: name === 'verify' ? 'pending' : null })) };
}
export const save = (runsDir, s) => writeFileSync(join(runsDir, `${s.runId}.json`), JSON.stringify(s, null, 2));

export function advance(s) {
  for (const ph of s.phases) {
    if (ph.status === 'done') continue;
    s.currentPhase = ph.name;
    if (ph.gate) {
      const findings = checkCoherence(s.change);
      if (isBlocking(findings)) { ph.status = 'paused'; ph.gate = 'failed'; s.status = 'paused'; s.lastFindings = findings; s.log.push(`[${ph.name}] GATE FAIL → pausado`); return s; }
      ph.gate = 'passed';
    }
    ph.status = 'done'; s.log.push(`[${ph.name}] ${ph.agent} → done`);
  }
  s.status = 'done'; s.currentPhase = null; s.log.push('run completado'); return s;
}
export function resume(s) { for (const ph of s.phases) if (ph.status === 'paused') { ph.status = 'pending'; ph.gate = 'pending'; } s.status = 'running'; return advance(s); }
