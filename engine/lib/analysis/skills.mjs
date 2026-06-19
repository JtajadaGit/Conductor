// conductor/lib/skills.mjs — CATÁLOGO LOCAL DE PATRONES DE EQUIPO (versión conductor de las "skills"
// de las referencias). Ficheros markdown versionados en el repo del usuario: .conductor/skills/<name>.md
// con frontmatter opcional (--- match: <dominio,fase,tag> · title: ... ---). A diferencia del enfoque
// "ofrecer .github/instructions y confiar en el auto-apply de Copilot", aquí el contenido se INYECTA de
// verdad en el prompt de la fase (clave para el camino BYOK/qwen, que no tiene auto-apply por glob).
// Tratados como DATO de CONFIANZA del equipo (versionado), no como input arbitrario. 0 dependencias.
import { readdirSync, readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const skillsDir = (projectRoot) => join(projectRoot, '.conductor', 'skills');

function parseSkill(raw) {
  let match = [], title = '', body = raw;
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (m) {
    body = m[2];
    for (const line of m[1].split(/\r?\n/)) {
      const kv = line.match(/^(\w+)\s*:\s*(.+)$/);
      if (!kv) continue;
      if (kv[1] === 'match') match = kv[2].split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
      else if (kv[1] === 'title') title = kv[2].trim();
    }
  }
  return { match, title, body: body.trim() };
}

export function loadSkills(projectRoot) {
  const dir = skillsDir(projectRoot);
  let files = [];
  try { files = readdirSync(dir).filter((f) => f.endsWith('.md') && f.toLowerCase() !== 'index.md'); } catch { return []; }
  const out = [];
  for (const f of files) {
    try { const { match, title, body } = parseSkill(readFileSync(join(dir, f), 'utf8')); out.push({ name: f.replace(/\.md$/, ''), match, title, body }); } catch {}
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
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
