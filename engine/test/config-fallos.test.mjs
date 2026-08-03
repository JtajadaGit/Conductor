// config-fallos.test.mjs — EL GOBIERNO DEL EQUIPO NO SE PIERDE EN SILENCIO.
// Origen casuística de perfiles junior/senior): `readDriveConfig` metía en el MISMO `catch {}`
// vacío dos casos opuestos — "no hay config" (legítimo: todo es opcional) y "la config existe pero está
// rota". Una coma de más en openspec/conductor.json borraba preset, gates, budget, models y rules, y el run
// seguía con los defaults hasta cerrar GREEN: un "verificado" que el equipo leería como verificado CON SUS
// REGLAS. Y una errata de clave (`presset`) o un tipo mal puesto (`strictTests: "false"`) se ignoraban mudos.
import { drive, readDriveConfig } from '../lib/pipeline/drive.mjs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';

const TMP = join(dirname(fileURLToPath(import.meta.url)), '.tmp-cfgfallos');
process.env.CONDUCTOR_CAPTURE = 'fs';
const w = (p, c) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, c); };
const proj = (slug, cfgText) => {
  const d = join(TMP, slug);
  rmSync(d, { recursive: true, force: true });
  mkdirSync(join(d, 'openspec'), { recursive: true });
  if (cfgText !== null) writeFileSync(join(d, 'openspec', 'conductor.json'), cfgText);
  return d;
};
const agent = async ({ phase, writeTo, cwd }) => {
  if (phase === 'apply' || phase === 'fix') { w(join(cwd, 'src', 'a.js'), '// @conductor REQ-A\nexport const a=1;'); w(join(cwd, 'src', 'a.test.js'), '// @conductor REQ-A\ntest("a",()=>{});'); return { code: 0 }; }
  w(writeTo, { propose: '## Why\nx\n## What Changes\n- a\n## Impact\nx', spec: '## ADDED Requirements\n<!-- id: REQ-A -->\n### Requirement: A\nThe system SHALL a.\n#### Scenario: s\n- **GIVEN** a\n- **WHEN** b\n- **THEN** c' }[phase] || 'x');
  return { code: 0 };
};
const run = async (root, logs) => drive({ changeDir: join(root, 'openspec', 'changes', 'c'), request: 'x', complexity: 'simple', domain: 'core', srcDir: root, runAgent: agent, log: (m) => logs.push(String(m)) });

await test('config: SIN conductor.json el run va con defaults (opcional de verdad, cero fricción)', async () => {
  const logs = [];
  const r = await run(proj('sin', null), logs);
  eq(r.verdict, 'GREEN');
  assert(!logs.some((l) => /ilegible/.test(l)), 'no se avisa de nada: no había config que perder');
});

await test('config: conductor.json ROTO → BLOCKED antes de gastar un token (no se degrada a los defaults)', async () => {
  const logs = [];
  const r = await run(proj('roto', '{ "maxRetries": 0, "lenses": false, }'), logs);
  eq(r.verdict, 'BLOCKED', 'un JSON roto no puede acabar en GREEN');
  assert(/ilegible/.test(r.reason || ''), `el motivo dice que la config es ilegible: ${r.reason}`);
  assert(/conductor\.json/.test(r.reason || ''), 'y nombra el fichero a arreglar');
  eq(r.trail?.length ?? 0, 0, 'se corta ANTES de ejecutar ninguna fase');
});

await test('config: readDriveConfig distingue "no existe" (silencio) de "existe y está rota" (marca)', () => {
  eq(readDriveConfig(proj('r1', null)).__configError, undefined, 'sin fichero → sin marca');
  assert(readDriveConfig(proj('r2', '{roto')).__configError, 'con fichero ilegible → marca');
});

await test('config: erratas de clave y tipos mal puestos se AVISAN nombrando el ajuste que no se aplica', async () => {
  const logs = [];
  const r = await run(proj('erratas', JSON.stringify({ maxRetries: 0, lenses: false, presset: 'feature', strictTests: 'false' })), logs);
  eq(r.verdict, 'GREEN', 'un JSON válido con erratas NO bloquea (podría ser una config más nueva que el motor)');
  const avisos = logs.filter((l) => /conductor\.json:/.test(l)).join(' | ');
  assert(/presset/.test(avisos), `avisa de la clave inventada — dijo: ${avisos}`);
  assert(/strictTests/.test(avisos), `avisa del tipo mal puesto — dijo: ${avisos}`);
  assert(/NO se está aplicando/.test(avisos), 'y deja claro que ese ajuste no está en vigor');
});

rmSync(TMP, { recursive: true, force: true });
