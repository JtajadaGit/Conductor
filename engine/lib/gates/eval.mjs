// conductor/lib/eval.mjs — scorer determinista de candidatos del pipeline SDD.
// Mide si una salida (un "change" producido por el planner/coder) cumple criterios objetivos.
// Reutiliza el motor (gate/trace/contract/spec). Es la base del arnés de evals: hoy puntúa
// candidatos pre-generados (replay); mañana, los que produzca un LLM real, sin cambiar el scorer.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkCoherence } from './coherence.mjs';
import { checkArtifacts } from './artifacts.mjs';
import { buildTrace } from './trace.mjs';
import { checkContract } from '../contract/contract.mjs';
import { parseSpec } from './coherence.mjs';

// rubric: { pass?:number(%), gate?:weight, trace?:{src,maxGaps,weight}, contract?:{base,head,weight},
//           requirements?:{ids:[...],weight} }
export function scoreCandidate(dir, rubric) {
  const criteria = [];
  const add = (name, ok, points, detail) => criteria.push({ name, pass: !!ok, points: ok ? points : 0, max: points, detail });

  if (rubric.gate) {
    const f = [...checkCoherence(dir), ...checkArtifacts(dir)];
    const errs = f.filter((x) => x.severity === 'breaking' || x.severity === 'error');
    add('gate', errs.length === 0, rubric.gate, `${errs.length} error(es)`);
  }
  if (rubric.trace) {
    const t = buildTrace(dir, resolveRel(dir, rubric.trace.src));
    const ok = t.gaps.length <= (rubric.trace.maxGaps ?? 0);
    add('traceability', ok, rubric.trace.weight ?? 20, `${t.gaps.length} hueco(s): ${t.gaps.join(',') || '—'}`);
  }
  if (rubric.contract) {
    const base = resolveRel(dir, rubric.contract.base), head = resolveRel(dir, rubric.contract.head);
    const f = checkContract(base, head);
    const breaking = f.filter((x) => x.severity === 'breaking');
    add('contract', breaking.length === 0, rubric.contract.weight ?? 20, `${breaking.length} breaking`);
  }
  if (rubric.requirements) {
    const specRaw = readMaybe(join(dir, 'spec.md')) || '';
    const names = parseSpec(specRaw).requirements.map((r) => r.name.toLowerCase());
    const missing = (rubric.requirements.ids || []).filter((id) => !names.some((n) => n.includes(id.toLowerCase())));
    add('requirements', missing.length === 0, rubric.requirements.weight ?? 20, missing.length ? `faltan: ${missing.join(',')}` : 'todos');
  }

  // L9: una rúbrica vacía o con claves mal escritas no evalúa NADA → antes devolvía un FAIL 0% engañoso
  // (parecía que el candidato falló, cuando en realidad no se midió nada). Veredicto explícito NO-CRITERIA.
  if (!criteria.length) return { score: 0, max: 0, pct: 0, verdict: 'NO-CRITERIA', threshold: rubric.pass ?? 100, criteria, note: 'rúbrica vacía o sin claves reconocidas (gate/trace/contract/requirements)' };
  const max = criteria.reduce((s, c) => s + c.max, 0) || 1;
  const score = criteria.reduce((s, c) => s + c.points, 0);
  const pct = Math.round((score / max) * 100);
  const threshold = rubric.pass ?? 100;
  return { score, max, pct, verdict: pct >= threshold ? 'PASS' : 'FAIL', threshold, criteria };
}

function readMaybe(p) { return existsSync(p) ? readFileSync(p, 'utf8') : null; }
function resolveRel(dir, p) { return p && !p.startsWith('/') && !/^[A-Za-z]:/.test(p) ? join(dir, p) : p; }
