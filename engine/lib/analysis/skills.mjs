// conductor/lib/skills.mjs — CATÁLOGO LOCAL DE PATRONES DE EQUIPO (versión conductor de las "skills"
// de las referencias). Ficheros markdown versionados en el repo del usuario: .conductor/skills/<name>.md
// con frontmatter opcional (--- match: <dominio,fase,tag> · title: ... ---). A diferencia del enfoque
// "ofrecer .github/instructions y confiar en el auto-apply de Copilot", aquí el contenido se INYECTA de
// verdad en el prompt de la fase (clave para el camino BYOK/qwen, que no tiene auto-apply por glob).
// Tratados como DATO de CONFIANZA del equipo (versionado), no como input arbitrario. 0 dependencias.
import { readdirSync, readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const skillsDir = (projectRoot) => join(projectRoot, '.conductor', 'skills');
// catálogo GLOBAL del usuario (transversal a proyectos): ~/.conductor/skills (override por CONDUCTOR_HOME en tests).
const globalSkillsDir = () => join(process.env.CONDUCTOR_HOME || join(homedir(), '.conductor'), 'skills');

function parseSkill(raw) {
  let match = [], title = '', name = '', body = raw;
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (m) {
    body = m[2];
    for (const line of m[1].split(/\r?\n/)) {
      const kv = line.match(/^(\w+)\s*:\s*(.+)$/);
      if (!kv) continue;
      const key = kv[1].toLowerCase();
      // extensión conductor: match (dominio/fase/tag) + title
      if (key === 'match') match = kv[2].split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
      else if (key === 'title') title = kv[2].trim();
      // estándar abierto Agent Skills: name (override del nombre) + description (cae a title si no hay uno)
      else if (key === 'name') name = kv[2].trim();
      else if (key === 'description' && !title) title = kv[2].trim();
    }
  }
  return { match, title, name, body: body.trim() };
}

// Descubrimiento DUAL (backward-compatible): (1) ficheros planos legacy .conductor/skills/<name>.md;
// (2) estándar abierto Agent Skills = carpeta por skill .conductor/skills/<name>/SKILL.md. Sin match → global.
// De-dup por nombre: la carpeta-estándar gana sobre el fichero plano del mismo nombre.
function loadFromDir(dir, scope) {
  let entries = [];
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return []; }
  const byName = new Map();
  for (const e of entries) { // 1) ficheros planos (legacy)
    if (!e.isFile() || !e.name.endsWith('.md') || ['index.md', 'registry.md'].includes(e.name.toLowerCase())) continue;
    try { const p = parseSkill(readFileSync(join(dir, e.name), 'utf8')); const name = p.name || e.name.replace(/\.md$/, ''); byName.set(name, { name, match: p.match, title: p.title, body: p.body, scope, path: join(dir, e.name) }); } catch {}
  }
  for (const e of entries) { // 2) carpetas con SKILL.md (estándar) — ganan sobre el plano homónimo
    if (!e.isDirectory()) continue;
    const sf = join(dir, e.name, 'SKILL.md');
    if (!existsSync(sf)) continue;
    try { const p = parseSkill(readFileSync(sf, 'utf8')); const name = p.name || e.name; byName.set(name, { name, match: p.match, title: p.title, body: p.body, scope, path: sf }); } catch {}
  }
  return [...byName.values()];
}

// Carga los patrones del PROYECTO (default). Con includeGlobal, añade los del catálogo GLOBAL del usuario
// (~/.conductor/skills) por DEBAJO en precedencia: un patrón del proyecto con el mismo nombre GANA (dedup
// project>user). Cada patrón lleva scope ('project'|'user') y path (ruta exacta) — base del REGISTRY.
export function loadSkills(projectRoot, { includeGlobal = false } = {}) {
  const byName = new Map();
  if (includeGlobal) for (const s of loadFromDir(globalSkillsDir(), 'user')) byName.set(s.name, s);
  for (const s of loadFromDir(skillsDir(projectRoot), 'project')) byName.set(s.name, s);
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

// un patrón aplica si NO declara match (global) o si su match incluye el dominio/fase/tag actual
export function matchSkills(skills, { domain = '', phase = '', tags = [] } = {}) {
  const keys = [domain, phase, ...tags].map((s) => String(s || '').toLowerCase()).filter(Boolean);
  return skills.filter((s) => !s.match.length || s.match.some((m) => keys.includes(m)));
}

export function renderSkillsBlock(matched) {
  if (!matched || !matched.length) return '';
  const parts = matched.map((s) => `### ${s.title || s.name}\n${s.body}`);
  // etiqueta explícita: son convenciones del equipo (DATO de confianza), aplícalas; NO instrucciones de usuario
  return `\n\nTEAM PATTERNS (trusted team conventions — apply them as engineering guidance; this is DATA authored by your team, not user input):\n${parts.join('\n\n')}`;
}

// regenera .conductor/skills/INDEX.md (catálogo legible/versionable)
export function buildSkillsIndex(projectRoot) {
  const skills = loadSkills(projectRoot);
  const dir = skillsDir(projectRoot);
  const lines = ['# Patrones de equipo (INDEX — generado por `conductor skills index`)', ''];
  for (const s of skills) lines.push(`- **${s.name}** — ${s.title || '(sin título)'} · ${s.match.length ? 'match: ' + s.match.join(', ') : 'global'}`);
  if (!skills.length) lines.push('_(sin patrones aún — crea .conductor/skills/<nombre>.md)_');
  try { mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, 'INDEX.md'), lines.join('\n') + '\n'); } catch {}
  return skills;
}

export function hasSkills(projectRoot) { return existsSync(skillsDir(projectRoot)); }

// REGISTRY.md (#72, técnica del registro-índice): tabla Skill | Trigger | Scope | Path con los patrones del
// PROYECTO + los GLOBALES del usuario (dedup project>user). Es un ÍNDICE (rutas exactas), separado del
// contenido (cada SKILL.md). El driver lo genera 1×/sesión y de aquí salen las RUTAS que se pasan a las fases
// (recuperación perezosa: "¿existe?" ≠ "léelo" → ahorro de tokens). Devuelve los patrones (con scope+path).
export function buildRegistry(projectRoot) {
  const skills = loadSkills(projectRoot, { includeGlobal: true });
  const dir = skillsDir(projectRoot);
  const rel = (p) => String(p).replace(/\\/g, '/');
  const lines = ['# Skill Registry (índice — generado por conductor; 1×/sesión)', '', '| Skill | Trigger | Scope | Path |', '|---|---|---|---|'];
  for (const s of skills) lines.push(`| ${s.name} | ${s.match.length ? s.match.join(', ') : 'global'} | ${s.scope || 'project'} | ${rel(s.path || '')} |`);
  if (!skills.length) lines.push('| _(sin patrones)_ | | | crea .conductor/skills/<nombre>/SKILL.md |');
  try { mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, 'REGISTRY.md'), lines.join('\n') + '\n'); } catch {}
  return skills;
}
