// Catálogo de patrones de equipo (Ola 3): carga, matching e inyección.
import { loadSkills, matchSkills, renderSkillsBlock, buildSkillsIndex } from '../lib/analysis/skills.mjs';
import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '.tmp-skills');
const w = (p, c) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, c); };

await test('skills: carga + frontmatter (match/title) + matching por dominio/fase', () => {
  rmSync(ROOT, { recursive: true, force: true });
  const dir = join(ROOT, '.conductor', 'skills');
  w(join(dir, 'global-quality.md'), '# Calidad\nSiempre tests reales.');
  w(join(dir, 'angular.md'), '---\nmatch: angular, apply\ntitle: Convenciones Angular\n---\nUsa signals.');
  const sk = loadSkills(ROOT);
  eq(sk.length, 2, 'carga 2 patrones');
  eq(sk.find((s) => s.name === 'global-quality').match.length, 0, 'sin match = global');
  eq(sk.find((s) => s.name === 'angular').title, 'Convenciones Angular');
  eq(matchSkills(sk, { domain: 'counter', phase: 'spec' }).map((s) => s.name), ['global-quality']);
  eq(matchSkills(sk, { domain: 'angular', phase: 'apply' }).map((s) => s.name).sort(), ['angular', 'global-quality']);
});

await test('skills: renderSkillsBlock etiqueta como DATO de confianza del equipo; vacío = sin bloque', () => {
  eq(renderSkillsBlock([]), '');
  const blk = renderSkillsBlock([{ name: 'x', title: '', body: 'haz Y' }]);
  assert(/TEAM PATTERNS/.test(blk) && /haz Y/.test(blk) && /not user input/i.test(blk), 'bloque etiquetado y con el cuerpo');
});

await test('skills: buildSkillsIndex escribe INDEX.md con todos los patrones', () => {
  buildSkillsIndex(ROOT);
  const idx = readFileSync(join(ROOT, '.conductor', 'skills', 'INDEX.md'), 'utf8');
  assert(/global-quality/.test(idx) && /angular/.test(idx), 'el INDEX lista los patrones');
  rmSync(ROOT, { recursive: true, force: true });
});
