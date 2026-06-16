// conductor/lib/orchestrate.mjs — máquina de estados de orquestación, conducida por el SERVIDOR (no
// por el prompt). El agente es un bucle tonto: conductor_start → (escribe el artefacto) → conductor_next.
// El servidor impone la secuencia: no devuelve el siguiente paso hasta que el artefacto del actual existe,
// y valida con el gate en verify. Así un modelo flojo NO puede saltar fases ni freestylear. Sin sub-agentes.
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { checkCoherence, readSpec } from './coherence.mjs';
import { checkArtifacts } from './artifacts.mjs';
import { buildTrace } from './trace.mjs';

const PHASES = {
  micro: ['apply'], // "No SDD": 1 sola llamada LLM, sin spec POR DECISIÓN del usuario — máximo ahorro
  simple: ['propose', 'spec', 'apply', 'verify'],
  medium: ['explore', 'propose', 'spec', 'design', 'tasks', 'apply', 'verify'],
  complex: ['explore', 'propose', 'clarify', 'spec', 'design', 'tasks', 'apply', 'verify'],
};
const ROLE = { explore: 'planner', propose: 'planner', clarify: 'planner', spec: 'planner', design: 'planner', tasks: 'planner', apply: 'coder', fix: 'coder', verify: 'reviewer' };
const artifactOf = (phase, domain) => ({
  explore: 'exploration.md', propose: 'proposal.md', clarify: 'questions.md',
  spec: `specs/${domain}/spec.md`, design: 'design.md', tasks: 'tasks.md',
  apply: 'apply-report.md', fix: 'apply-report.md', verify: 'verify-report.md',
}[phase]);

// Instrucciones por fase: el ROL y el formato viajan como DATOS (no en un .md que el modelo ignora).
// Tech-agnósticas. El agente escribe SOLO el artefacto indicado con la herramienta `edit`.
// Límites de output explícitos en cada fase (el output es lo MÁS caro): cada instrucción fija un tope.
const INSTRUCTION = {
  explore: 'PLANNER. Write a short exploration of the existing code/context relevant to the request. Domain language only, no framework names. MAX 120 words.',
  propose: 'PLANNER. Write the proposal: sections `## Why`, `## What Changes` (bullets), `## Impact`. Domain language only, no framework names. MAX 150 words. Base it ONLY on the exploration artifact and the request — do NOT read project source files in this phase.',
  clarify: 'PLANNER. List the open questions/ambiguities to resolve before building. Domain language only. MAX 8 questions, one line each. Base them ONLY on the prior artifacts — do NOT read project source files in this phase.',
  spec: 'PLANNER. Write an OpenSpec delta spec: start with `## ADDED Requirements`; for each requirement emit `<!-- id: REQ-{SLUG} -->` then `### Requirement: {name}` then `The system SHALL …` then `#### Scenario:` blocks with `- **GIVEN/WHEN/THEN**`. SLUG = name uppercased, non-alphanumerics→`-`. Domain language ONLY, zero framework/code terms. MAX 6 requirements, 3 scenarios each, no prose outside the format.',
  design: 'PLANNER. Write the design: `## Context`, `## Goals / Non-Goals`, `## Decisions`, `## Risks / Trade-offs`. Logical responsibilities, not class/file names. MAX 200 words. Base it ONLY on the proposal/spec artifacts — do NOT read project source files in this phase.',
  tasks: 'PLANNER. Write tasks as `- [ ] N.M [REQ-SLUG] {description}` (every task tagged with the requirement id it fulfills). The coder flips these to `- [x]`. MAX 15 tasks, one line each. Base them ONLY on the spec/design artifacts — do NOT read project source files in this phase.',
  apply: 'CODER. Implement the spec to PRODUCTION quality, following the project conventions (read `.github/instructions/` if present). QUALITY BAR: cover every scenario in the spec; handle errors and edge cases; no TODOs, stubs or placeholder values; idiomatic, typed where the language supports it; meaningful names; a real test per requirement (not empty). In EVERY source AND test file you create, put one comment `@conductor REQ-SLUG` (the file language\'s comment syntax). Write the code with the `edit` tool; use shell ONLY to create directories. FORBIDDEN: running the project\'s tests, build, lint or dev server — verification belongs to the gate and CI. Then write apply-report.md: one-line summary, `Status: done`, `Files created:`/`Files modified:` lists, `Tasks completed: X/Y`. Flip done tasks to `- [x]` in tasks.md if it exists. Output ONLY files — zero narration.',
  fix: 'CODER. The gate FAILED. Fix the listed issues (edit the code/artifacts), then APPEND a `## Fix Cycle` section to apply-report.md. Do not create new report files. FORBIDDEN: running tests/build/lint/dev server (CI does that). Zero narration.',
  verify: 'REVIEWER. The deterministic gate runs automatically — you assess CODE QUALITY and SPEC COMPLIANCE that the gate cannot see. Write verify-report.md with: (1) `## Verdict` PASS/RISK/FAIL one line; (2) `## Per scenario` — for EACH `#### Scenario` in the spec: ✅/⚠️/❌ + the file:line that satisfies it (or the gap); (3) `## Findings` — concrete issues with severity (bug/risk/style), each pointing at file:line and the fix; (4) `## Tests` — do the tests actually exercise the requirement, or are they hollow? Be specific and critical — cite real lines, no generic praise. Do NOT run the project test suite (CI does).',
};

// fontanería interna → subcarpeta oculta .conductor/ (no invita a editar ni ensucia el change).
// Compat: si solo existe el fichero legacy en la raíz del change, se lee ese.
export const stateFile = (dir) => join(dir, '.conductor', 'state.json');
const statePath = (dir) => (existsSync(stateFile(dir)) ? stateFile(dir) : join(dir, '.conductor-run.json'));
const loadState = (dir) => JSON.parse(readFileSync(statePath(dir), 'utf8'));
const saveState = (dir, s) => { mkdirSync(join(dir, '.conductor'), { recursive: true }); writeFileSync(stateFile(dir), JSON.stringify(s, null, 2)); };

// instrucción del apply en modo micro: sin spec que leer, diff mínimo, cero ceremonia
const MICRO_APPLY = 'CODER. MICRO MODE — tiny task, no spec by user choice. Implement the request directly at production quality with the SMALLEST possible diff, following the project conventions. Use the `edit` tool; shell ONLY to create directories. FORBIDDEN: running the project\'s tests, build, lint or dev server. Zero narration.';

function stepFor(dir, s, extra = {}) {
  const phase = s.phases[s.idx];
  const writeTo = artifactOf(phase, s.domain);
  return {
    done: false, step: s.idx + 1, of: s.phases.length, phase, role: ROLE[phase],
    write_to: writeTo, write_to_abs: join(resolve(dir), writeTo),
    instruction: s.complexity === 'micro' && phase === 'apply' ? MICRO_APPLY : INSTRUCTION[phase], request: s.request,
    after: 'When the artifact is written, call conductor_next with the same changeDir.',
    ...extra,
  };
}

export function start({ changeDir, request, complexity = 'medium', domain = 'core' }) {
  if (!PHASES[complexity]) complexity = 'medium';
  mkdirSync(changeDir, { recursive: true });
  const s = { request, complexity, domain, phases: PHASES[complexity], idx: 0, status: 'running' };
  saveState(changeDir, s);
  return stepFor(changeDir, s);
}

// gate determinista usado en la fase verify
function runGate(dir, srcDir) {
  const F = [...checkCoherence(dir), ...checkArtifacts(dir)];
  if (srcDir && existsSync(srcDir)) F.push(...buildTrace(dir, srcDir).findings);
  const errors = F.filter((f) => f.severity === 'breaking' || f.severity === 'error');
  return { verdict: errors.length ? 'FAIL' : 'PASS', errors, findings: F };
}

export function next({ changeDir, srcDir }) {
  if (!existsSync(statePath(changeDir))) return { error: 'no hay run activo; llama a conductor_start primero.' };
  const s = loadState(changeDir);
  if (s.status === 'done') return { done: true, verdict: s.verdict || 'GREEN' };
  const phase = s.phases[s.idx];

  // 1) ¿se escribió el artefacto del paso actual? (gate de avance: no se puede saltar)
  const writeTo = artifactOf(phase, s.domain);
  const artifactExists = phase === 'spec' ? !!readSpec(changeDir) : existsSync(join(changeDir, writeTo));
  if (!artifactExists) return { advanced: false, error: `el paso "${phase}" no está hecho: falta ${writeTo}. Escríbelo con \`edit\` y vuelve a llamar conductor_next.`, ...stepFor(changeDir, s) };

  // 2) si es verify → corre el gate determinista
  if (phase === 'verify') {
    const g = runGate(changeDir, srcDir);
    if (g.verdict === 'FAIL') {
      s.idx = s.phases.indexOf('apply') >= 0 ? s.phases.indexOf('apply') : s.idx; // volver a fase de implementación
      s.phases = [...s.phases.slice(0, s.idx), 'fix', 'verify']; // insertar ciclo fix→verify
      s.fixCycles = (s.fixCycles || 0) + 1;
      if (s.fixCycles > 2) { s.status = 'done'; s.verdict = 'NOT-GREEN'; saveState(changeDir, s); return { done: true, verdict: 'NOT-GREEN', reason: 'gate sigue fallando tras 2 ciclos; escalar a humano', findings: g.errors }; }
      saveState(changeDir, s);
      return { ...stepFor(changeDir, s), gate: 'FAIL', findings: g.errors, instruction: `${INSTRUCTION.fix} Hallazgos: ${g.errors.map((f) => f.message).join(' | ')}` };
    }
    s.status = 'done'; s.verdict = 'GREEN'; saveState(changeDir, s);
    return { done: true, verdict: 'GREEN', gate: 'PASS' };
  }

  // 3) avanzar a la siguiente fase
  s.idx += 1;
  if (s.idx >= s.phases.length) { s.status = 'done'; s.verdict = 'GREEN'; saveState(changeDir, s); return { done: true, verdict: 'GREEN' }; }
  saveState(changeDir, s);
  return stepFor(changeDir, s);
}
