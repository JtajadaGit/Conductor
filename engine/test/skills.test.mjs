// Catálogo de patrones de equipo (Ola 3): carga, matching e inyección.
import { loadSkills, matchSkills, renderSkillsBlock, buildSkillsIndex, buildRegistry } from '../lib/analysis/skills.mjs';
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

await test('skills (#72): carpeta SKILL.md (estándar abierto) + compat con planos + de-dup (carpeta gana)', () => {
  rmSync(ROOT, { recursive: true, force: true });
  const dir = join(ROOT, '.conductor', 'skills');
  w(join(dir, 'global-quality.md'), '# Calidad\nSiempre tests reales.');                                   // legacy plano (sin match = global)
  w(join(dir, 'angular', 'SKILL.md'), '---\nname: angular\ndescription: Convenciones Angular\nmatch: angular, apply\n---\nUsa signals.'); // estándar
  w(join(dir, 'security', 'SKILL.md'), '---\nname: security\ndescription: Reglas de seguridad\n---\nValida entradas.'); // estándar sin match = global; title cae a description
  w(join(dir, 'dup.md'), 'cuerpo PLANO');
  w(join(dir, 'dup', 'SKILL.md'), '---\nname: dup\n---\ncuerpo CARPETA');                                   // mismo nombre → gana la carpeta
  const sk = loadSkills(ROOT);
  const byName = Object.fromEntries(sk.map((s) => [s.name, s]));
  eq(sk.length, 4, 'global-quality + angular + security + dup (de-dup, no 5)');
  eq(byName.angular.title, 'Convenciones Angular', 'title cae a description del estándar');
  eq(byName.angular.match, ['angular', 'apply'], 'match del estándar se respeta');
  eq(byName.security.match.length, 0, 'estándar sin match = global');
  eq(byName.dup.body, 'cuerpo CARPETA', 'la carpeta-estándar gana sobre el fichero plano homónimo');
  // dup y security no declaran match → globales (aplican siempre), junto a global-quality
  eq(matchSkills(sk, { domain: 'counter', phase: 'spec' }).map((s) => s.name).sort(), ['dup', 'global-quality', 'security']);
  eq(matchSkills(sk, { domain: 'angular', phase: 'apply' }).map((s) => s.name).sort(), ['angular', 'dup', 'global-quality', 'security']);
  buildSkillsIndex(ROOT);
  const idx = readFileSync(join(ROOT, '.conductor', 'skills', 'INDEX.md'), 'utf8');
  assert(/angular/.test(idx) && /security/.test(idx) && /global-quality/.test(idx), 'INDEX cubre planos + carpetas');
  rmSync(ROOT, { recursive: true, force: true });
});

await test('skills (#72): buildRegistry escribe REGISTRY.md (Skill|Trigger|Scope|Path) + global dedup project>user', () => {
  rmSync(ROOT, { recursive: true, force: true });
  const savedHome = process.env.CONDUCTOR_HOME;
  const home = join(ROOT, 'home'); process.env.CONDUCTOR_HOME = home;
  try {
    // global del usuario (CONDUCTOR_HOME/skills): un patrón "shared" y un "dup" que el proyecto sobreescribe
    w(join(home, 'skills', 'shared.md'), '# Compartido\nregla global');
    w(join(home, 'skills', 'dup.md'), 'cuerpo USER');
    // proyecto
    w(join(ROOT, '.conductor', 'skills', 'local.md'), '---\nmatch: apply\n---\nregla local');
    w(join(ROOT, '.conductor', 'skills', 'dup.md'), 'cuerpo PROYECTO');
    const sk = loadSkills(ROOT, { includeGlobal: true });
    const byName = Object.fromEntries(sk.map((s) => [s.name, s]));
    eq(sk.length, 3, 'shared(user) + local(project) + dup(dedup project>user) = 3');
    eq(byName.shared.scope, 'user', 'shared viene del catálogo global');
    eq(byName.local.scope, 'project', 'local viene del proyecto');
    eq(byName.dup.body, 'cuerpo PROYECTO', 'el proyecto gana el dedup sobre el global');
    // sin includeGlobal: solo proyecto (cero regresión)
    eq(loadSkills(ROOT).length, 2, 'por defecto solo patrones del proyecto');
    const skills = buildRegistry(ROOT);
    eq(skills.length, 3, 'el registro incluye proyecto + global');
    const reg = readFileSync(join(ROOT, '.conductor', 'skills', 'REGISTRY.md'), 'utf8');
    assert(/\| Skill \| Trigger \| Scope \| Path \|/.test(reg), 'tabla con columnas Skill/Trigger/Scope/Path');
    assert(/shared/.test(reg) && /local/.test(reg) && /\buser\b/.test(reg) && /\bproject\b/.test(reg), 'lista patrones con su scope');
  } finally { if (savedHome === undefined) delete process.env.CONDUCTOR_HOME; else process.env.CONDUCTOR_HOME = savedHome; rmSync(ROOT, { recursive: true, force: true }); }
});
