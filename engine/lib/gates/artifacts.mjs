// conductor/lib/artifacts.mjs — validación estructural de artefactos OpenSpec (findings).
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const RULES = {
  'proposal.md': [[/^##\s+Why/im, 'falta sección ## Why'], [/^##\s+What Changes/im, 'falta ## What Changes'], [/^##\s+Impact/im, 'falta ## Impact']],
  'design.md': [[/^##\s+Context/im, 'falta ## Context'], [/^##\s+Decisions/im, 'falta ## Decisions']],
  'tasks.md': [[/^\s*-\s*\[( |x|X)\]/im, 'sin checkboxes de tarea']],
};

export function checkArtifacts(dir) {
  const F = [];
  for (const [file, checks] of Object.entries(RULES)) {
    const p = join(dir, file);
    if (!existsSync(p)) { F.push({ rule: 'artifact.missing', severity: 'warning', message: `${file} ausente (¿fase opcional?)`, file }); continue; }
    // L8: ignorar el contenido DENTRO de fences ```…``` (y `inline`): una sección "## Why" metida en un bloque
    // de código no es una sección real y NO debe satisfacer el check (false PASS detectado en la auditoría).
    const raw = readFileSync(p, 'utf8').replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
    for (const [re, msg] of checks) if (!re.test(raw)) F.push({ rule: 'artifact.schema', severity: 'error', message: `${file}: ${msg}`, file });
  }
  return F;
}
