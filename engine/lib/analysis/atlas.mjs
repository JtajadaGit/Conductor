// conductor/lib/analysis/atlas.mjs — ÍNDICE DE CONOCIMIENTO del proyecto, commit-eable (determinista, 0 LLM, 0 red).
// Para onboarding del equipo: arma un "atlas" de lo que YA hay en el repo = stack detectado + capacidades de la
// SPEC VIVA (openspec/specs, la librería que crece al archivar cambios GREEN) + historial de cambios archivados.
// NO hay aprendizaje cross-run ni memoria entrenada (lo prohíbe la confidencialidad): es un SNAPSHOT versionable
// derivado del propio repo. Componible sobre piezas existentes (detectStack + parseSpec + listArchive).
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
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

// ÍNDICE VERIFICADO COMPACTO (cierre del bucle SDD): realimenta a las fases de PLANIFICACIÓN (explore/propose/
// clarify/spec/design/tasks) las capacidades YA verificadas (specs vivas) + cambios recientes, en formato DENSO
// (token-first: id + nombre, una línea). El planner construye SOBRE lo verificado, reusa requisitos existentes y
// detecta conflictos/duplicación — SIN re-escanear las fuentes (sustituye ese escaneo). Prioriza el dominio del
// cambio. CONFIDENCIALIDAD: solo del propio repo, snapshot determinista, sin memoria cross-run. '' si no hay nada.
export function buildVerifiedIndex(projectRoot, { domain = '', maxReqs = 40, maxChanges = 8 } = {}) {
  const caps = liveCapabilities(projectRoot);
  caps.sort((a, b) => (a.domain === domain ? -1 : b.domain === domain ? 1 : 0)); // el dominio del cambio primero
  const reqLines = caps.slice(0, maxReqs).map((c) => `- ${c.id || 'REQ-?'} (${c.domain}): ${String(c.name).slice(0, 80)}`);
  let changes = []; try { changes = listArchive(projectRoot) || []; } catch { changes = []; }
  const chLines = changes.slice(0, maxChanges).map((c) => `- ${c.name} [${c.verdict || '?'}]${c.request ? `: ${String(c.request).slice(0, 70)}` : ''}`);
  if (!reqLines.length && !chLines.length) return '';
  const L = ['PROJECT VERIFIED HISTORY (deterministic index — build ON these, REUSE existing requirements where they apply, and FLAG any conflict/duplication. This REPLACES scanning source files; do not re-derive it):'];
  if (reqLines.length) { L.push('Verified capabilities (live specs):'); L.push(...reqLines); }
  if (chLines.length) { L.push('Recent changes:'); L.push(...chLines); }
  return L.join('\n');
}

// MAPA DE ORIENTACIÓN BROWNFIELD (token-first, clave en migraciones): pre-computa en CÓDIGO un mapa compacto del
// repo EXISTENTE (stack + dirs top-level + ficheros de config/CI + entrypoints + comando de test) para alimentar la
// fase `explore` → el modelo usa este mapa en vez de escanear el repo entero (ahorro líder). Determinista, sin LLM,
// solo del propio repo. Degrada a casi-vacío en greenfield (inofensivo). '' si no hay nada que mapear.
const BF_IGNORE = new Set(['node_modules', 'dist', 'build', 'out', 'target', 'coverage', '.angular', '.git', 'vendor', '__pycache__']);
const BF_CONFIG = ['package.json', 'tsconfig.json', 'pom.xml', 'build.gradle', 'composer.json', 'pyproject.toml', 'go.mod', 'Cargo.toml', 'Dockerfile', 'docker-compose.yml', '.gitlab-ci.yml', '.github/workflows', 'angular.json', 'vite.config.ts', 'webpack.config.js', 'Makefile'];
export function buildBrownfieldMap(projectRoot, { maxDirs = 14 } = {}) {
  const stack = detectStack(projectRoot) || { summary: '', testCmd: '', entrypoints: [] };
  const dirs = [];
  try {
    for (const name of readdirSync(projectRoot)) {
      if (BF_IGNORE.has(name) || name.startsWith('.')) continue;
      try { if (statSync(join(projectRoot, name)).isDirectory()) dirs.push(name); } catch { /* dir ilegible */ }
    }
  } catch { /* root ilegible */ }
  const config = BF_CONFIG.filter((f) => { try { return existsSync(join(projectRoot, f)); } catch { return false; } });
  const L = [];
  if (stack.summary && stack.summary !== 'desconocido') L.push(`Stack: ${stack.summary}`); // 'desconocido' = sin stack útil
  if (dirs.length) L.push(`Top-level dirs: ${dirs.slice(0, maxDirs).join(', ')}`);
  if (config.length) L.push(`Config/CI present: ${config.join(', ')}`);
  if (stack.entrypoints?.length) L.push(`Entrypoints: ${stack.entrypoints.join(', ')}`);
  if (stack.testCmd) L.push(`Tests: ${stack.testCmd}`);
  if (!L.length) return '';
  return 'PROJECT ORIENTATION MAP (deterministic, pre-computed — use this to locate the relevant areas instead of scanning the whole repo; flag anything ambiguous as an open question):\n' + L.join('\n');
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
