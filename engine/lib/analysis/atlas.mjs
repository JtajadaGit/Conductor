// conductor/lib/analysis/atlas.mjs — ÍNDICE DE CONOCIMIENTO del proyecto, commit-eable (determinista, 0 LLM, 0 red).
// Para onboarding del equipo: arma un "atlas" de lo que YA hay en el repo = stack detectado + capacidades de la
// SPEC VIVA (openspec/specs, la librería que crece al archivar cambios GREEN) + historial de cambios archivados.
// NO hay aprendizaje cross-run ni memoria entrenada (lo prohíbe la confidencialidad): es un SNAPSHOT versionable
// derivado del propio repo. Componible sobre piezas existentes (detectStack + parseSpec + listArchive).
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { detectStack } from './stack.mjs';
import { parseSpec } from '../gates/coherence.mjs';
import { listArchive } from './archive.mjs';

// capacidades de la spec VIVA: openspec/specs/<dominio>/spec.md → requisitos (nombre + id + nº escenarios).
function liveCapabilities(projectRoot) {
  const specsDir = join(projectRoot, 'openspec', 'specs');
  const out = [];
  let domains = []; try { domains = readdirSync(specsDir); } catch { return out; }
  for (const d of domains) {
    const p = join(specsDir, d, 'spec.md');
    try {
      if (!existsSync(p)) continue;
      for (const r of parseSpec(readFileSync(p, 'utf8')).requirements) out.push({ domain: d, name: r.name, id: r.id || null, scenarios: r.scenarios.length });
    } catch { /* un dominio ilegible no tumba el atlas */ }
  }
  return out;
}

export function buildAtlas(projectRoot) {
  const stack = detectStack(projectRoot) || { languages: [], frameworks: [], testCmd: '', entrypoints: [], summary: '' };
  const capabilities = liveCapabilities(projectRoot);
  let changes = []; try { changes = listArchive(projectRoot); } catch { changes = []; }
  return { stack, capabilities, changes, markdown: renderAtlas({ stack, capabilities, changes }) };
}

export function renderAtlas({ stack, capabilities, changes }) {
  const NL = '\n';
  const L = [];
  L.push('# Atlas del proyecto');
  L.push('');
  L.push('> Índice de conocimiento generado por conductor (determinista, sin LLM). Commit-éalo: refleja lo que YA hay en el repo (stack + capacidades de la spec viva + historial). No es memoria entrenada ni aprendizaje entre runs.');
  L.push('');
  L.push('## Stack');
  if (stack && (stack.languages?.length || stack.frameworks?.length)) {
    if (stack.summary) L.push(`${stack.summary}`);
    if (stack.languages?.length) L.push(`- Lenguajes: ${stack.languages.join(', ')}`);
    if (stack.frameworks?.length) L.push(`- Frameworks: ${stack.frameworks.join(', ')}`);
    if (stack.testCmd) L.push(`- Tests: \`${stack.testCmd}\``);
    if (stack.entrypoints?.length) L.push(`- Entradas: ${stack.entrypoints.join(', ')}`);
  } else L.push('- (no detectado)');
  L.push('');
  L.push('## Capacidades (spec viva)');
  if (capabilities.length) for (const c of capabilities) L.push(`- **${c.name}**${c.id ? ` \`${c.id}\`` : ''} · ${c.domain} · ${c.scenarios} escenario(s)`);
  else L.push('- (sin specs promovidas todavía — archiva un cambio GREEN para empezar la librería)');
  L.push('');
  L.push('## Historial de cambios');
  if (changes.length) for (const c of changes.slice(0, 100)) L.push(`- ${c.date || '—'} · **${c.name}** · ${c.verdict}${c.request ? ` — ${c.request.slice(0, 80)}` : ''}`);
  else L.push('- (sin cambios archivados)');
  L.push('');
  return L.join(NL);
}
