// conductor/lib/orchestrate.mjs — máquina de estados de orquestación, conducida por el SERVIDOR (no
// por el prompt). El agente es un bucle tonto: conductor_start → (escribe el artefacto) → conductor_next.
// El servidor impone la secuencia: no devuelve el siguiente paso hasta que el artefacto del actual existe,
// y valida con el gate en verify. Así un modelo flojo NO puede saltar fases ni freestylear. Sin sub-agentes.
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve, relative, isAbsolute, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkCoherence, readSpec } from '../gates/coherence.mjs';
import { checkArtifacts } from '../gates/artifacts.mjs';
import { buildTrace } from '../gates/trace.mjs';
import { loadPolicy, enforce, DEFAULT_POLICY } from '../gates/policy.mjs';
import { plumbPath } from '../core/plumb.mjs';

const PHASES = {
  micro: ['apply'], // "No SDD": 1 sola llamada LLM, sin spec POR DECISIÓN del usuario — máximo ahorro
  simple: ['propose', 'spec', 'apply', 'verify'],
  medium: ['explore', 'propose', 'spec', 'design', 'tasks', 'apply', 'verify'],
  complex: ['explore', 'propose', 'clarify', 'spec', 'design', 'tasks', 'apply', 'verify'],
};
// lista CANÓNICA de fases conocidas — ÚNICA fuente (la consumen serve para sanear el pipeline por HTTP y
// drive para pauseAt; antes vivía triplicada con valores distintos y el filtro de serve perdía 'test').
// 'fix' la inserta el gate en caliente; 'test' la reubica resolvePhases justo antes de verify.
export const KNOWN_PHASES = ['explore', 'propose', 'clarify', 'spec', 'design', 'tasks', 'apply', 'test', 'fix', 'verify'];
const ROLE = { explore: 'planner', propose: 'planner', clarify: 'planner', spec: 'planner', design: 'planner', tasks: 'planner', apply: 'coder', fix: 'coder', test: 'tester', verify: 'reviewer' };
const artifactOf = (phase, domain) => ({
  explore: 'exploration.md', propose: 'proposal.md', clarify: 'questions.md',
  spec: `specs/${domain}/spec.md`, design: 'design.md', tasks: 'tasks.md',
  apply: 'apply-report.md', fix: 'apply-report.md', test: 'test-report.md', verify: 'verify-report.md',
}[phase]);

// Instrucciones por fase — SUPERFICIE DE CONTRIBUCIÓN: la copia canónica y editable vive en
// plugin/prompts/<fase>.md (markdown legible; mejorar un prompt = PR a un .md, cero JS). El código
// sigue mandando la SECUENCIA — editar contenido no permite saltarse fases ni el gate. Lo de abajo
// es el fallback EMBEBIDO (motor desplegado sin plugin/) y el contrato de paridad lo guarda
// prompts.test.mjs (texto del .md === texto embebido; si divergen, la suite grita).
// Límites de output explícitos en cada fase (el output es lo MÁS caro): cada instrucción fija un tope.
const DEFAULT_INSTRUCTION = {
  explore: 'PLANNER. Write a short exploration of the existing code/context relevant to the request. Domain language only, no framework names. MAX 120 words.',
  propose: 'PLANNER. Write the proposal: sections `## Why`, `## What Changes` (bullets), `## Impact`. Domain language only, no framework names. MAX 150 words. Base it ONLY on the exploration artifact and the request — do NOT read project source files in this phase.',
  clarify: 'PLANNER. Surface ONLY the ambiguities that change WHAT gets built — ask the minimum, never a quiz. Consider these generic categories when relevant: inputs/sources, behavior/semantics, outputs/consumers, edge-cases, compatibility/migration. Output TWO sections.\n## Open Questions\nTruly-blocking questions, each as `- [ ] question?` (the run BLOCKS until they are answered, flipped to `- [x]`). Put here ONLY what genuinely blocks building.\n## Assumptions\nWhere a sensible default exists, DECIDE it instead of asking: `- assumption taken (why it is the safe default)`. Informative, NON-blocking. If the request says "just decide", prefer Assumptions over Questions. Domain language only, MAX 6 open questions. Do NOT read project source files in this phase.',
  spec: 'PLANNER. Write an OpenSpec delta spec: start with `## ADDED Requirements`; for each requirement emit `<!-- id: REQ-{SLUG} -->` then `### Requirement: {name}` then `The system SHALL …` then `#### Scenario:` blocks with `- **GIVEN/WHEN/THEN**`. SLUG = name uppercased, non-alphanumerics→`-`. Domain language ONLY, zero framework/code terms. MAX 6 requirements, 3 scenarios each, no prose outside the format.',
  design: 'PLANNER. Write the design: `## Context`, `## Goals / Non-Goals`, `## Decisions`, `## Risks / Trade-offs`. Logical responsibilities, not class/file names. MAX 200 words. Base it ONLY on the proposal/spec artifacts — do NOT read project source files in this phase.',
  tasks: 'PLANNER. Write tasks as `- [ ] N.M [REQ-SLUG] {description}` (every task tagged with the requirement id it fulfills). The coder flips these to `- [x]`. MAX 15 tasks, one line each. Base them ONLY on the spec/design artifacts — do NOT read project source files in this phase.',
  apply: 'CODER. Implement the spec to PRODUCTION quality, following the project conventions (read `.github/instructions/` if present). QUALITY BAR: cover every scenario in the spec; handle errors and edge cases; no TODOs, stubs or placeholder values; idiomatic, typed where the language supports it; meaningful names; a real test per requirement (not empty). In EVERY source AND test file you create, put one comment `@conductor REQ-SLUG` (the file language\'s comment syntax). TOOLS: create each NEW file with the `create` tool and modify EXISTING files with the `edit` tool — a new feature means you CREATE files, so do NOT `view`/`edit` paths that do not exist yet (that wastes the turn). Start writing immediately; do not stop until the source AND its test exist. Use shell ONLY to create directories. FORBIDDEN: running the project\'s tests, build, lint or dev server — verification belongs to the gate and CI. Then write apply-report.md: one-line summary, `Status: done`, `Files created:`/`Files modified:` lists, `Tasks completed: X/Y`. Flip done tasks to `- [x]` in tasks.md if it exists. Output ONLY files — zero narration.',
  fix: 'CODER. The gate FAILED. Fix the listed issues (edit the code/artifacts), then APPEND a `## Fix Cycle` section to apply-report.md. Do not create new report files. FORBIDDEN: running tests/build/lint/dev server (CI does that). Zero narration.',
  verify: 'REVIEWER. The deterministic gate runs automatically — you assess CODE QUALITY and SPEC COMPLIANCE that the gate cannot see. Write verify-report.md with: (1) `## Verdict` PASS/RISK/FAIL one line; (2) `## Per scenario` — for EACH `#### Scenario` in the spec: ✅/⚠️/❌ + the file:line that satisfies it (or the gap). A scenario with NO cited file:line is NOT a pass — mark it ❌; (3) `## Findings` — concrete issues with severity (bug/risk/style), each pointing at file:line and the fix; (4) `## Tests` — do the tests actually exercise the requirement, or are they hollow?; (5) `## Archive readiness` — `Ready: yes/no` plus any blocker that must be resolved before this change is promoted to the live spec. Be specific and critical — cite real lines, no generic praise. Do NOT run the project test suite (CI does). MAX 250 words total. Output ONLY the report content — no preamble, no summary of what you did, no disclaimers.',
};

// fontanería interna → subcarpeta oculta .conductor/ (no invita a editar ni ensucia el change).
// Compat: si solo existe el fichero legacy en la raíz del change, se lee ese.
export const stateFile = (dir) => plumbPath(dir, 'state.json');
const statePath = (dir) => (existsSync(stateFile(dir)) ? stateFile(dir) : join(dir, '.conductor-run.json'));
const loadState = (dir) => JSON.parse(readFileSync(statePath(dir), 'utf8'));
const saveState = (dir, s) => { mkdirSync(plumbPath(dir), { recursive: true }); writeFileSync(stateFile(dir), JSON.stringify(s, null, 2)); };

// instrucción del apply en modo micro: sin spec que leer, diff mínimo, cero ceremonia
DEFAULT_INSTRUCTION['micro-apply'] = 'CODER. MICRO MODE — tiny task, no spec by user choice. Implement the request directly at production quality with the SMALLEST possible diff, following the project conventions. TOOLS: create NEW files with the `create` tool and modify EXISTING files with the `edit` tool — do NOT `view`/`edit` paths that do not exist yet; write immediately. Shell ONLY to create directories. FORBIDDEN: running the project\'s tests, build, lint or dev server. Zero narration.';

// ── PROMPTS COMO FICHEROS ── la copia canónica de cada instrucción vive en prompts/<clave>.md (raíz del
// producto, junto a assets/; `plugin/prompts` se acepta como ruta LEGADA de instalaciones previas).
// Resolución: CONDUCTOR_PROMPTS_DIR (override de equipo) > prompts/ junto al motor (misma forma en
// fábrica engine/lib/pipeline y en bundle assets/) > defaults embebidos. Cache POR DIR resuelto (jamás
// cache global sin clave — trampa multi-run). Un .md ilegible NO tumba el run: cae al default.
export const PROMPT_KEYS = Object.keys(DEFAULT_INSTRUCTION);

// ── REGLAS DE EQUIPO (openspec/conductor.json → rules) ────────────────────────────────────────────────
// Gobierno DECLARATIVO por fase: el punto de extensión que evita forkear el motor para cambiar cómo
// trabaja una fase ("en apply usa componentes standalone", "en spec no escribas escenarios para la
// AUSENCIA de una regla"). Se concatenan al prompt de la fase, DESPUÉS de la instrucción del motor.
// SEGURIDAD: una regla es SOLO TEXTO y jamás se ejecuta. conductor.json es committeable, así que un PR
// puede cambiarla; por eso el camino de ejecutar comandos sigue siendo "checks", que exige consentimiento
// explícito por-run (toggle del panel o CONDUCTOR_ALLOW_CHECKS=1). No mezclar nunca ambos caminos.
const RULE_MAXLEN = 240; // por regla
const RULES_MAX = 10;    // por fase — una lista infinita ahoga la instrucción del motor (token-first)
export function rulesFor(rules, phase) {
  if (!rules || typeof rules !== 'object' || Array.isArray(rules) || !phase) return [];
  const pick = (k) => (Array.isArray(rules[k]) ? rules[k] : []);
  const out = [];
  for (const r of [...pick('all'), ...pick(phase)]) {
    if (typeof r !== 'string') continue;
    const clean = r.replace(/\s+/g, ' ').trim().slice(0, RULE_MAXLEN);
    if (clean && !out.includes(clean)) out.push(clean); // "all" + fase pueden repetir la misma regla
    if (out.length >= RULES_MAX) break;
  }
  return out;
}
export function renderRulesBlock(rules, phase) {
  const rs = rulesFor(rules, phase);
  if (!rs.length) return '';
  return `\n\nTEAM RULES for phase "${phase}" (openspec/conductor.json — the team set these; honor them):\n${rs.map((r) => `- ${r}`).join('\n')}`;
}
const _promptCache = new Map();
const promptBody = (txt) => {
  const m = /^---\r?\n[\s\S]*?\r?\n---\r?\n/.exec(txt);
  return (m ? txt.slice(m[0].length) : txt).trim();
};
function promptsDir() {
  if (process.env.CONDUCTOR_PROMPTS_DIR) return process.env.CONDUCTOR_PROMPTS_DIR;
  const here = dirname(fileURLToPath(import.meta.url));
  for (const up of ['..', '../..', '../../..']) {
    const d = resolve(here, up, 'prompts');
    if (existsSync(d)) return d;
    const legacy = resolve(here, up, 'plugin', 'prompts'); // instalaciones previas a la retirada de la vía plugin
    if (existsSync(legacy)) return legacy;
  }
  return null;
}
export function instructionFor(key) {
  const dir = promptsDir();
  const ck = dir || '(embebido)';
  let map = _promptCache.get(ck);
  if (!map) {
    map = { ...DEFAULT_INSTRUCTION };
    if (dir) {
      for (const k of PROMPT_KEYS) {
        try {
          const f = join(dir, `${k}.md`);
          if (existsSync(f)) { const b = promptBody(readFileSync(f, 'utf8')); if (b) map[k] = b; }
        } catch { /* ilegible → default embebido */ }
      }
    }
    _promptCache.set(ck, map);
  }
  return map[key];
}

function stepFor(dir, s, extra = {}) {
  const phase = s.phases[s.idx];
  const writeTo = artifactOf(phase, s.domain);
  return {
    done: false, step: s.idx + 1, of: s.phases.length, phase, role: ROLE[phase],
    write_to: writeTo, write_to_abs: join(resolve(dir), writeTo),
    instruction: instructionFor(s.complexity === 'micro' && phase === 'apply' ? 'micro-apply' : phase), request: s.request,
    after: 'When the artifact is written, call conductor_next with the same changeDir.',
    ...extra,
  };
}

// PIPELINE DECLARATIVO (configurable-pipeline-phases): el proyecto puede reordenar/omitir fases vía
// openspec/conductor.json "pipeline": ["spec","apply","verify"]. El CÓDIGO sigue conduciendo y el gate
// se mantiene: se EXIGE que "verify" esté presente (si falta, se añade al final). micro NO es overridable
// (es "no SDD" por decisión del usuario). Entradas desconocidas se ignoran (no rompen el run).
const KNOWN = ['explore', 'propose', 'clarify', 'spec', 'design', 'tasks', 'apply', 'test', 'verify'];

// FASES CONDICIONALES gate-verificadas (workflows flexibles, versión conductor): una entrada del pipeline
// puede ser {"phase":"explore","when":"missing:proposal.md"} y solo se incluye si la condición se cumple.
// La condición es DETERMINISTA (sin LLM): exists/missing:<rel> (vs el dir del cambio) · complexity>=/==/<=
// <nivel> · request~<substr>. FAIL-OPEN: condición desconocida/ilegible → se INCLUYE la fase (nunca se cae
// una fase por un typo). El gate (verify) NUNCA es condicionable: se reimpone tras evaluar.
const CXORDER = ['micro', 'simple', 'medium', 'complex'];
export function phaseCondMet(when, ctx = {}) {
  if (!when || typeof when !== 'string') return true;
  const w = when.trim();
  // CONFINAMIENTO (como evalPrecondition): `when` sale de openspec/conductor.json (no confiable). Sin confinar,
  // exists:/missing: es un ORÁCULO de existencia de rutas ARBITRARIAS del disco. Una ruta absoluta o con `..`
  // fuera del changeDir se trata como "no existe" (jamás filtra si el fichero real existe).
  const withinExists = (rel) => {
    if (!rel || isAbsolute(rel)) return false;
    const base = resolve(ctx.changeDir || '.');
    const r = relative(base, resolve(base, rel));
    return (r === '' || (!r.startsWith('..') && !isAbsolute(r))) && existsSync(join(base, rel));
  };
  try {
    if (w.startsWith('exists:')) return withinExists(w.slice(7).trim());
    if (w.startsWith('missing:')) return !withinExists(w.slice(8).trim());
    if (w.startsWith('request~')) return String(ctx.request || '').toLowerCase().includes(w.slice(8).trim().toLowerCase());
    const m = w.match(/^complexity\s*(>=|==|<=)\s*(micro|simple|medium|complex)$/);
    if (m) {
      const a = CXORDER.indexOf(ctx.complexity), b = CXORDER.indexOf(m[2]);
      if (a < 0 || b < 0) return true;
      return m[1] === '>=' ? a >= b : m[1] === '<=' ? a <= b : a === b;
    }
  } catch { return true; }
  return true; // desconocida → no condiciona (fail-open: jamás se omite una fase por error de config)
}

export function resolvePhases(complexity, pipeline, ctx = {}) {
  if (complexity === 'micro' || !Array.isArray(pipeline)) return PHASES[complexity] || PHASES.medium;
  const cx = { ...ctx, complexity };
  const filtered = [];
  for (const entry of pipeline) {
    const name = typeof entry === 'string' ? entry : (entry && entry.phase);
    if (!KNOWN.includes(name)) continue; // desconocida se ignora (no rompe el run)
    const when = (entry && typeof entry === 'object') ? entry.when : null;
    if (when && !phaseCondMet(when, cx)) continue; // condición no cumplida → omitir (determinista, sin LLM)
    if (!filtered.includes(name)) filtered.push(name); // dedup defensivo
  }
  if (!filtered.length) return PHASES[complexity] || PHASES.medium;
  // verify es el gate innegociable Y debe ser la fase TERMINAL: si la config lo coloca antes (p.ej.
  // ["spec","apply","verify","design"]), lo reubicamos al final. Si no, las fases declaradas DESPUÉS de
  // verify quedarían "fantasma" (nunca corren) y el run cerraría GREEN antes de tiempo (hallazgo adversarial).
  // `test` (ejecutar las pruebas reales, opcional) se REUBICA justo ANTES de verify: el modelo es apply → test →
  // (fix-loop si fallan) → verify. Así las pruebas GATEAN el cierre, sin convertirse en gobierno (verify sigue terminal).
  const noVT = filtered.filter((p) => p !== 'verify' && p !== 'test');
  const hasTest = filtered.includes('test');
  return [...noVT, ...(hasTest ? ['test'] : []), 'verify'];
}

export function start({ changeDir, request, complexity = 'medium', domain = 'core', pipeline = null }) {
  if (!PHASES[complexity]) complexity = 'medium';
  mkdirSync(changeDir, { recursive: true });
  const s = { request, complexity, domain, phases: resolvePhases(complexity, pipeline, { changeDir, request }).filter(Boolean), idx: 0, status: 'running' };
  saveState(changeDir, s);
  return stepFor(changeDir, s);
}

// CHAT-EN-PAUSA (redo dirigido, #45 v1): rehace una fase de PLANIFICACIÓN ya completada — retrocede el estado
// a esa fase y BORRA su artefacto y los de las fases de PLANIFICACIÓN posteriores (coherencia: si la spec cambia,
// design/tasks se regeneran sobre la nueva). El driver re-ejecuta desde ahí (con la instrucción del revisor como
// nota) y VOLVERÁ a pausar donde estaba. GOBIERNO intacto: jamás rehace apply/fix/test/verify por esta vía, jamás
// salta fases (next() sigue exigiendo cada artefacto), y el driver registra la decisión (timeline + decisions).
const REDOABLE = new Set(['explore', 'propose', 'clarify', 'spec', 'design', 'tasks']);
export function redoPlanning({ changeDir, phase }) {
  if (!existsSync(statePath(changeDir))) return { ok: false, error: 'no hay run activo' };
  let s; try { s = loadState(changeDir); } catch (e) { return { ok: false, error: `estado ilegible: ${e.message}` }; }
  if (s.status !== 'running') return { ok: false, error: `estado "${s.status}": solo se rehace un run en curso` };
  const target = String(phase || '').trim();
  const ti = Array.isArray(s.phases) ? s.phases.indexOf(target) : -1;
  if (!REDOABLE.has(target) || ti < 0 || ti >= s.idx) return { ok: false, error: `"${target}" no es una fase de planificación YA completada de este run` };
  for (let i = ti; i < s.idx; i++) {
    const p = s.phases[i];
    if (!REDOABLE.has(p)) continue; // solo artefactos de planificación — el código (apply/fix) jamás se borra
    try { rmSync(join(changeDir, artifactOf(p, s.domain)), { force: true }); } catch {}
  }
  s.idx = ti;
  saveState(changeDir, s);
  return { ok: true, ...stepFor(changeDir, s) };
}

// gate determinista usado en la fase verify. `strict` (del preset) endurece SIN relajar nunca: strict.id →
// exige id estable en cada requisito; strict.trace → un hueco de cobertura (sin código/test) BLOQUEA.
function runGate(dir, srcDir, strict = {}) {
  const cohOpts = { strictId: !!strict.id };
  const trace = (srcDir && existsSync(srcDir)) ? buildTrace(dir, srcDir) : null;
  // R-S6 (preset migration): MODIFIED debe existir en la spec VIVA; REMOVED no debe dejar código trazado.
  // Seguro por defecto: sin specs vivas (liveSpecIds=[]) la comprobación de MODIFIED NO dispara.
  if (strict.semanticDelta) {
    cohOpts.semanticDelta = true;
    cohOpts.liveSpecIds = liveSpecIds(srcDir);
    cohOpts.tracedReqIds = trace ? trace.matrix.filter((m) => m.cov && m.cov.code).map((m) => m.id) : [];
  }
  const F = [...checkCoherence(dir, cohOpts), ...checkArtifacts(dir)];
  if (trace) {
    for (const f of trace.findings) {
      // strict.trace (contractual) eleva AMBOS huecos; strict.tests (OPT-IN: presets feature/migración o
      // cfg.strictTests) eleva SOLO el "código sin test". Por defecto el hueco es WARNING VISIBLE, no muro:
      // un gate que suspende todos los runs reales deja de medir calidad — GREEN tiene que ser alcanzable.
      // El incidente "GREEN con el test sin escribir" queda cubierto por el aviso + presets estrictos + fase test.
      if (strict.trace && (f.rule === 'trace.coverage-gap' || f.rule === 'trace.test-gap')) f.severity = 'error';
      else if (strict.tests === true && f.rule === 'trace.test-gap') f.severity = 'error';
      F.push(f);
    }
  }
  // severidad canónica (minúsculas/trim): un 'Error'/'BREAKING' de un gate externo no debe escaparse del filtro
  const sev = (f) => String(f && f.severity || '').toLowerCase().trim();
  const errors = F.filter((f) => sev(f) === 'breaking' || sev(f) === 'error');
  return { verdict: errors.length ? 'FAIL' : 'PASS', errors, findings: F };
}

// IDs de la spec VIVA del proyecto (openspec/specs/*/spec.md, FUERA del change) para R-S6. srcDir = raíz
// del proyecto. Vacío → la validación de MODIFIED no dispara (fail-safe: no bloquea por falta de datos).
export function liveSpecIds(srcDir) {
  if (!srcDir) return [];
  let domains = []; try { domains = readdirSync(join(srcDir, 'openspec', 'specs')); } catch { return []; }
  const ids = [];
  for (const d of domains) {
    const p = join(srcDir, 'openspec', 'specs', d, 'spec.md');
    try { if (existsSync(p)) for (const m of readFileSync(p, 'utf8').matchAll(/<!--\s*id:\s*(REQ-[A-Z0-9-]+)\s*-->/gi)) ids.push(m[1].toUpperCase()); } catch {}
  }
  return ids;
}

// Resuelve la política de gobierno del change: policy.json del change primero, luego openspec/policy.json del
// proyecto (changeDir = openspec/changes/<name> → raíz = ../..). Sin fichero → DEFAULT_POLICY (mismo veredicto
// que el gate de hoy). Una policy.json presente pero INVÁLIDA es fail-CLOSED: se reporta como finding error.
function resolvePolicyFor(changeDir) {
  for (const p of [join(changeDir, 'policy.json'), join(changeDir, '..', '..', 'policy.json')]) {
    if (existsSync(p)) {
      try { const r = loadPolicy(p); return { policy: r.policy, source: r.source, error: null }; }
      catch (e) { return { policy: DEFAULT_POLICY, source: p, error: e.message }; }
    }
  }
  return { policy: DEFAULT_POLICY, source: 'default', error: null };
}

// verdict EXPLÍCITO del reviewer en verify-report.md ("## Verdict … PASS/RISK/FAIL" o "Verdict: FAIL").
// Conservador: solo 'FAIL' si hay FAIL explícito sin PASS (RISK no bloquea). Informe multi-lente sin
// verdict único → null (consultivo, no gatea). Le da DIENTES al review sin sobre-bloquear.
function reviewerVerdict(dir) {
  try {
    const t = readFileSync(join(dir, 'verify-report.md'), 'utf8');
    // Encabezado "## Verdict …" acotado a SU PROPIA LÍNEA (no cruza a "## Per scenario", donde un ❌/"fail" o la
    // leyenda "PASS/RISK/FAIL" daban un FAIL FALSO → BLOCKED espurio en cada verify). Si la línea del encabezado NO
    // trae token, se mira la SIGUIENTE (verdict en la línea de abajo). Decisión por POSICIÓN del 1er token (no
    // prioridad-FAIL global): "FAIL — no cumple PASS" sigue = FAIL (FAIL aparece primero); "PASS — sin fallos" = PASS.
    const hdr = t.match(/##\s*Verdict\b[^\n]*/i) || t.match(/\bVerdict:[^\n]*/i);
    let seg = hdr ? hdr[0] : '';
    if (seg && !/\b(FAIL|PASS|RISK)\b/i.test(seg)) {
      const after = t.slice(hdr.index + seg.length).match(/^\s*\n[^\n]*/);
      if (after) seg = after[0];
    }
    const iFail = seg.search(/\bFAIL\b/i), iPass = seg.search(/\bPASS\b/i);
    if (iFail >= 0 && (iPass < 0 || iFail <= iPass)) return 'FAIL';
    if (iPass >= 0) return 'PASS';
    return null;
  } catch { return null; }
}

export function next({ changeDir, srcDir, override = null, overrideBy = null, strict = null }) {
  if (!existsSync(statePath(changeDir))) return { error: 'no hay run activo; llama a conductor_start primero.' };
  const s = loadState(changeDir);
  if (s.status === 'done') {
    const v = s.verdict || 'GREEN';
    // DEFENSA anti-forja (T1/C1, consistente con la del branch verify): el coder corre con --allow-all-tools y
    // PUEDE plantar un state.json con {status:'done',verdict:'GREEN'} para SALTARSE el gate. No se confía en un
    // GREEN persistido: para NO-micro se RE-CONFIRMA con el gate determinista + que hubo implementación (apply/fix).
    // Si no lo confirma → NOT-GREEN. Un veredicto terminal NO-GREEN no puede forjarse "a mejor", así que se honra.
    if (v === 'GREEN' && s.complexity !== 'micro') {
      const hadApply = Array.isArray(s.phases) && s.phases.some((p) => p === 'apply' || p === 'fix');
      let gatePass = false; try { gatePass = runGate(changeDir, srcDir, strict || {}).verdict === 'PASS'; } catch {}
      if (!hadApply || !gatePass) return { done: true, verdict: 'NOT-GREEN', reason: 'GREEN persistido no confirmado por el gate determinista (estado posiblemente forjado)' };
    }
    return { done: true, verdict: v };
  }
  const phase = s.phases[s.idx];

  // 1) ¿se escribió el artefacto del paso actual? (gate de avance: no se puede saltar)
  const writeTo = artifactOf(phase, s.domain);
  const artifactExists = phase === 'spec' ? !!readSpec(changeDir) : existsSync(join(changeDir, writeTo));
  if (!artifactExists) return { advanced: false, error: `el paso "${phase}" no está hecho: falta ${writeTo}. Escríbelo con \`edit\` y vuelve a llamar conductor_next.`, ...stepFor(changeDir, s) };

  // CLARIFY-GATE (R-S5, opt-in strict.clarify): no avanzar de clarify mientras queden preguntas SIN responder
  // (convención determinista en questions.md: "- [ ]" pendiente / "- [x]" resuelta). El run termina BLOCKED
  // (resume tras responderlas); NUNCA re-lanza el agente en bucle. Solo presets medio/alto lo activan → cero
  // fricción en el flujo trivial (que ni tiene fase clarify). El estado queda 'running' para que el resume retome.
  if (phase === 'clarify' && strict?.clarify) {
    let q = ''; try { q = readFileSync(join(changeDir, 'questions.md'), 'utf8'); } catch {}
    const pending = (q.match(/^\s*-\s*\[ \]/gim) || []).length;
    if (pending > 0) return { done: true, verdict: 'BLOCKED', phase, reason: `clarify: ${pending} pregunta(s) sin responder en questions.md — márcalas "- [x]" tras resolverlas y reanuda` };
  }

  // TEST = fase determinista de EJECUCIÓN de pruebas, ANTES de verify (modelo: apply → test → fix-loop → verify). El
  // driver ya corrió el comando y escribió test-report.md; aquí solo se LEE el resultado (orchestrate sigue siendo
  // análisis estático, sin ejecutar nada). PASS → avanza a verify. FAIL → inserta un ciclo `fix` ANTES de test y
  // reintenta (mismo mecanismo que el fix de verify); tope de ciclos → BLOCKED. Las pruebas GATEAN el cierre.
  if (phase === 'test') {
    let tr = ''; try { tr = readFileSync(join(changeDir, 'test-report.md'), 'utf8'); } catch {}
    // NO EJECUTABLE ≠ pruebas rojas: script/binario inexistente no lo arregla ningún ciclo fix → BLOCKED
    // inmediato con la causa y el remedio (antes: 2 ciclos de fix a ciegas contra un comando que ni arrancaba).
    if (/##\s*Verdict[^\n]*\n+\s*UNRUNNABLE/i.test(tr)) {
      s.status = 'done'; s.verdict = 'BLOCKED'; saveState(changeDir, s);
      const uline = (tr.match(/^UNRUNNABLE:.*/im) || ['comando de pruebas'])[0];
      return { done: true, verdict: 'BLOCKED', phase: 'test', reason: `el comando de pruebas NO se pudo ejecutar (${uline.replace(/^UNRUNNABLE:\s*/i, '')}) — revisa el script "test" del package.json o declara "checks" en openspec/conductor.json. Un ciclo fix no puede arreglar esto.` };
    }
    const failed = /##\s*Verdict[^\n]*\n+\s*FAIL/i.test(tr) || /^FAILED:/im.test(tr);
    if (failed) {
      const ti = s.idx;
      s.phases = [...s.phases.slice(0, ti), 'fix', ...s.phases.slice(ti)]; // fix ANTES de test → re-codifica y re-testea
      s.idx = ti;
      // presupuesto de reparación PROPIO del loop de pruebas (separado del de verify): un fallo de pruebas no
      // debe robarle ciclos de fix al gate de gobierno, ni al revés. Cada loop escala a BLOCKED por su cuenta.
      s.testFixCycles = (s.testFixCycles || 0) + 1;
      if (s.testFixCycles > 2) { s.status = 'done'; s.verdict = 'BLOCKED'; saveState(changeDir, s); return { done: true, verdict: 'BLOCKED', phase: 'test', reason: 'las pruebas del proyecto siguen fallando tras 2 ciclos de fix — escalar a humano (corrige y reanuda)' }; }
      saveState(changeDir, s);
      // el fix recibe el OUTPUT REAL de las pruebas (tope 900 chars), no solo el nombre del comando: reparar
      // a ciegas era re-pagar el ciclo entero para adivinar qué assertion falló.
      const detail = tr.replace(/^##\s*Verdict[^\n]*\n+\s*\w+\s*/i, '').trim().slice(0, 900);
      return { ...stepFor(changeDir, s), gate: 'TESTS-FAIL', instruction: `${instructionFor('fix')} Las PRUEBAS del proyecto FALLAN — corrige el código para que pasen. Salida real:\n${detail}` };
    }
    s.idx += 1; saveState(changeDir, s); // PASS → avanza a verify (gobierno terminal)
    return stepFor(changeDir, s);
  }

  // 2) si es verify → corre el gate determinista + EL VERDICT DEL REVIEWER GATEA (auditoría senior: antes el
  // review era decorativo; ahora un "Verdict: FAIL" explícito del reviewer impide GREEN aunque el gate
  // estructural pase). RISK/PASS no bloquean; los informes multi-lente (sin verdict único) son consultivos.
  if (phase === 'verify') {
    // C1 (auditoría adversarial): verify NO puede cerrar un run si NINGUNA fase de implementación (apply/fix)
    // la precede en el plan. Un state.json forjado con phases:["verify"] (la fase coder corre con
    // --allow-all-tools en el repo y puede plantarlo) no tiene de dónde haber salido código verificable →
    // NOT-GREEN. Igual para un pipeline configurado sin 'apply' (no hay implementación que verificar).
    if (s.complexity !== 'micro' && !s.phases.slice(0, s.idx).some((p) => p === 'apply' || p === 'fix')) {
      s.status = 'done'; s.verdict = 'NOT-GREEN'; saveState(changeDir, s);
      return { done: true, verdict: 'NOT-GREEN', reason: 'verify sin fase de implementación previa en el plan (estado inválido o pipeline sin apply)' };
    }
    const g = runGate(changeDir, srcDir, strict || {});
    const rev = reviewerVerdict(changeDir);
    // findings COMPLETOS para la política: gate + (el Verdict:FAIL del reviewer como finding error).
    const revFinding = rev === 'FAIL' ? { rule: 'review.verdict-fail', severity: 'error', message: 'el reviewer declaró Verdict: FAIL (revisa verify-report.md)', file: 'verify-report.md' } : null;
    const allFindings = revFinding ? [...g.findings, revFinding] : g.findings;
    // policy.enforce() = control plane de gobierno cableado al run vivo. Con DEFAULT_POLICY
    // (blockSeverity=error · mandatoryGates=coherence+artifacts, que SIEMPRE corren aquí) el veredicto es
    // IDÉNTICO al gate de hoy → wiring behavior-preserving. Un openspec/policy.json real solo ENDURECE
    // (blockSeverity:warning, mandatoryGates extra) o audita un override justificado. verify NUNCA se relaja.
    const ranGates = ['coherence', 'artifacts', ...(srcDir && existsSync(srcDir) ? ['trace'] : [])];
    const pol = resolvePolicyFor(changeDir);
    const polFindings = pol.error ? [...allFindings, { rule: 'policy.invalid', severity: 'error', message: `policy.json inválida (${pol.error}) — fail-closed`, file: 'policy.json' }] : allFindings;
    const pe = enforce(polFindings, pol.policy, { ranGates, override, overrideBy, at: new Date().toISOString() });
    const blocking = (pe.blocking && pe.blocking.length) ? pe.blocking : (revFinding ? [revFinding, ...g.errors] : g.errors);
    if (pe.verdict === 'FAIL') {
      // insertar el ciclo fix JUSTO ANTES de la verify terminal, CONSERVANDO el resto del plan. (Antes se
      // truncaba todo lo posterior a apply: un pipeline ["spec","apply","design","verify"] perdía "design".)
      const vi = s.idx;
      // si el plan EJECUTA pruebas (test en el pipeline), el código reparado por verify DEBE volver a pasarlas
      // ANTES de cerrar GREEN: se re-inserta [fix, test] (no solo fix). Si no hay test, comportamiento de antes.
      const reinsert = s.phases.includes('test') ? ['fix', 'test'] : ['fix'];
      s.phases = [...s.phases.slice(0, vi), ...reinsert, ...s.phases.slice(vi)];
      s.idx = vi; // apunta al "fix" recién insertado
      s.verifyFixCycles = (s.verifyFixCycles || 0) + 1;
      if (s.verifyFixCycles > 2) { s.status = 'done'; s.verdict = 'BLOCKED'; saveState(changeDir, s); return { done: true, verdict: 'BLOCKED', phase: 'verify', reason: 'gate sigue fallando tras 2 ciclos de fix — escalar a humano (revisa los hallazgos, corrige manualmente y reanuda)', findings: blocking, policy: { source: pol.source, verdict: pe.verdict } }; }
      saveState(changeDir, s);
      return { ...stepFor(changeDir, s), gate: 'FAIL', findings: blocking, instruction: `${instructionFor('fix')} Hallazgos: ${blocking.map((f) => f.message).join(' | ')}`, policy: { source: pol.source, verdict: pe.verdict } };
    }
    // PASS u OVERRIDDEN (override justificado y permitido) → GREEN; el audit del override queda en el estado.
    s.status = 'done'; s.verdict = 'GREEN'; if (pe.audit) s.override = pe.audit; saveState(changeDir, s);
    return { done: true, verdict: 'GREEN', gate: 'PASS', policy: { source: pol.source, verdict: pe.verdict, ...(pe.audit ? { audit: pe.audit } : {}) } };
  }

  // 3) avanzar a la siguiente fase
  s.idx += 1;
  if (s.idx >= s.phases.length) {
    // Llegar aquí = la ÚLTIMA fase no fue verify (la rama verify de arriba retorna antes). NUNCA declarar
    // GREEN por mero agotamiento del array: solo micro (no-SDD por elección del usuario) cierra sin gate;
    // cualquier otro pipeline que termine sin pasar por verify (p.ej. un state.json manipulado en resume)
    // es NOT-GREEN. Defensa en profundidad sobre la validación del resume en drive.mjs.
    const green = s.complexity === 'micro';
    s.status = 'done'; s.verdict = green ? 'GREEN' : 'NOT-GREEN'; saveState(changeDir, s);
    return green ? { done: true, verdict: 'GREEN' } : { done: true, verdict: 'NOT-GREEN', reason: 'el pipeline terminó sin pasar por el gate verify (estado inválido)' };
  }
  saveState(changeDir, s);
  return stepFor(changeDir, s);
}
