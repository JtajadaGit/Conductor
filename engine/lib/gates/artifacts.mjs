// conductor/lib/artifacts.mjs — validación estructural de artefactos OpenSpec (findings).
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { runPhases } from '../core/plumb.mjs';

const RULES = {
  'proposal.md': [[/^##\s+(Why|Por qu[eé]|Motivaci[oó]n)/im, 'falta sección ## Why'], [/^##\s+(What Changes|Qu[eé] cambia|Cambios)/im, 'falta ## What Changes'], [/^##\s+(Impact|Impacto)/im, 'falta ## Impact']],
  'design.md': [[/^##\s+(Context|Contexto)/im, 'falta ## Context'], [/^##\s+(Decisions|Decisiones)/im, 'falta ## Decisions']],
  'tasks.md': [[/^\s*-\s*\[( |x|X)\]/im, 'sin checkboxes de tarea']],
};

// design.md/tasks.md solo se ECHAN EN FALTA si su fase estaba programada en este run (state.json, o
// opts.phases explícito): en complejidad simple no hay fase tasks/design y el aviso era ruido que se
// leía como error en un GREEN limpio. Sin plan conocido (gate suelto sobre un change sin run) el aviso
// se mantiene. Si el fichero EXISTE, su schema se valida siempre — esto solo silencia ausencias.
const PHASE_OF = { 'design.md': 'design', 'tasks.md': 'tasks' };
export function checkArtifacts(dir, opts = {}) {
  const F = [];
  const planned = Array.isArray(opts.phases) ? opts.phases : runPhases(dir);
  for (const [file, checks] of Object.entries(RULES)) {
    const p = join(dir, file);
    if (!existsSync(p)) {
      if (planned && PHASE_OF[file] && !planned.includes(PHASE_OF[file])) continue;
      F.push({ rule: 'artifact.missing', severity: 'warning', message: `${file} ausente (¿fase opcional?)`, file }); continue;
    }
    // L8: ignorar el contenido DENTRO de fences ```…``` (y `inline`): una sección "## Why" metida en un bloque
    // de código no es una sección real y NO debe satisfacer el check (false PASS detectado en la auditoría).
    const raw = readFileSync(p, 'utf8').replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
    for (const [re, msg] of checks) if (!re.test(raw)) F.push({ rule: 'artifact.schema', severity: 'error', message: `${file}: ${msg}`, file });
  }
  return F;
}
