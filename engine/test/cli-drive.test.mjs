// cli-drive.test.mjs — el CAMINO REAL del usuario headless: `conductor drive` de punta a punta con el
// agente falso (0 tokens, 0 red). Es el cuerpo más grande de bin/conductor.mjs y estaba sin ejercitar desde
// el CLI: la suite probaba drive() como función, no el comando con su parseo de flags, sus capas de config
// y sus códigos de salida — que es exactamente lo que ejecuta un usuario o un CI.
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { plumbPath } from '../lib/core/plumb.mjs'; // el timeline vive en la fontanería del proyecto, no dentro del change

const HERE = dirname(fileURLToPath(import.meta.url));
const BIN = resolve(HERE, '..', 'bin', 'conductor.mjs');
const FAKE = join(HERE, 'fake-copilot.mjs');
const ROOT = join(HERE, '.tmp-clidrive');
const HOME = join(ROOT, 'home');
const w = (p, c) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, c); };

rmSync(ROOT, { recursive: true, force: true });
mkdirSync(HOME, { recursive: true });

const proyecto = (nombre, cfg) => {
  const p = join(ROOT, nombre);
  mkdirSync(join(p, 'openspec', 'changes'), { recursive: true });
  writeFileSync(join(p, 'openspec', 'conductor.json'), JSON.stringify(cfg ?? {}));
  return p;
};
const env = {
  ...process.env,
  CONDUCTOR_HOME: HOME,
  CONDUCTOR_AGENT_CMD: `node ${FAKE}`,
  CONDUCTOR_CAPTURE: 'fs', // sin depender de que el temporal sea un repo git
  CONDUCTOR_USAGE: '0',
  CONDUCTOR_SERVE_OPEN: '0',
};
const drive = (proy, slug, extra = []) => {
  const args = ['drive', join(proy, 'openspec', 'changes', slug), '--src', proy, '--request', 'añade un saludo con su test', ...extra];
  try { return { code: 0, out: execFileSync(process.execPath, [BIN, ...args], { cwd: proy, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 240000 }) }; }
  catch (e) { return { code: e.status ?? -1, out: String(e.stdout || '') + String(e.stderr || '') }; }
};
const timeline = (proy, slug) => JSON.parse(readFileSync(plumbPath(join(proy, 'openspec', 'changes', slug), 'timeline.json'), 'utf8'));

await test('cli-drive: un run SIMPLE desde el CLI llega a GREEN y deja artefactos, timeline y sello', () => {
  const p = proyecto('simple', { maxRetries: 0, lenses: false, autoApprove: true });
  const r = drive(p, 'saludo', ['--complexity', 'simple']);
  assert(/GREEN/.test(r.out), `debe cerrar GREEN — salió: ${r.out.slice(-300)}`);
  eq(r.code, 0, 'exit 0 en GREEN (lo que mira un CI)');
  const ch = join(p, 'openspec', 'changes', 'saludo');
  for (const f of ['proposal.md', 'apply-report.md', 'verify-report.md']) assert(existsSync(join(ch, f)), `falta ${f}`);
  assert(existsSync(join(ch, 'provenance.json')), 'sello de procedencia en GREEN');
  const tl = timeline(p, 'saludo');
  eq(tl.verdict, 'GREEN');
  eq(tl.phases.map((x) => x.phase), ['propose', 'spec', 'apply', 'verify'], 'la secuencia simple, en orden');
});

await test('cli-drive: complejidad MEDIUM ejecuta el plan largo y verify sigue siendo terminal', () => {
  const p = proyecto('medium', { maxRetries: 0, lenses: false, autoApprove: true });
  const r = drive(p, 'saludo-medio', ['--complexity', 'medium']);
  assert(/GREEN/.test(r.out), `GREEN esperado — salió: ${r.out.slice(-250)}`);
  const fases = timeline(p, 'saludo-medio').phases.map((x) => x.phase);
  eq(fases, ['explore', 'propose', 'spec', 'design', 'tasks', 'apply', 'verify'], 'plan medium completo');
  eq(fases[fases.length - 1], 'verify', 'verify SIEMPRE cierra');
});

await test('cli-drive: --pipeline por-run recorta fases pero el gobierno se reimpone', () => {
  const p = proyecto('pipe', { maxRetries: 0, lenses: false, autoApprove: true });
  const r = drive(p, 'saludo-corto', ['--complexity', 'medium', '--pipeline', 'propose,spec,apply']);
  const fases = timeline(p, 'saludo-corto').phases.map((x) => x.phase);
  assert(!fases.includes('design') && !fases.includes('tasks'), 'respeta lo que el experto desmarcó');
  assert(fases.includes('verify'), 'pero verify se reimpone aunque no se pidiera');
  assert(/GREEN|NOT-GREEN/.test(r.out), 'el run concluye con veredicto');
});

await test('cli-drive: el mismo change relanzado NO duplica trabajo (segundo run reconoce lo hecho)', () => {
  const p = proyecto('idem', { maxRetries: 0, lenses: false, autoApprove: true });
  drive(p, 'saludo-idem', ['--complexity', 'simple']);
  const antes = timeline(p, 'saludo-idem').phases.length;
  const r2 = drive(p, 'saludo-idem', ['--complexity', 'simple']);
  assert(/GREEN|DUPLICATE|ya hay un run/i.test(r2.out), `el relanzamiento se resuelve con criterio — dijo: ${r2.out.slice(-200)}`);
  const despues = timeline(p, 'saludo-idem').phases.length;
  assert(despues >= antes, 'el timeline no se corrompe al relanzar');
});

await test('cli-drive: preset ESTRICTO con el agente que sí traza → GREEN legítimo (el gobierno no estorba al que cumple)', () => {
  const p = proyecto('estricto', { maxRetries: 0, lenses: false, autoApprove: true, preset: 'feature' });
  const r = drive(p, 'saludo-estricto', ['--complexity', 'simple']);
  assert(/GREEN/.test(r.out), `el agente traza su código, así que feature debe pasar — salió: ${r.out.slice(-260)}`);
  eq(timeline(p, 'saludo-estricto').verdict, 'GREEN');
});

await test('cli-drive: un agente que NO produce artefactos ABORTA el run (la fase no se salta nunca)', () => {
  const p = proyecto('vago', { maxRetries: 0, lenses: false, autoApprove: true });
  const VAGO = join(ROOT, 'agente-vago.mjs');
  // lee el prompt y sale sin escribir nada: el driver no puede dar por buena una fase sin su artefacto
  w(VAGO, 'process.stdin.resume(); process.stdin.on("end", () => process.exit(0));\n');
  const args = ['drive', join(p, 'openspec', 'changes', 'nada'), '--src', p, '--request', 'x', '--complexity', 'simple'];
  let out = '', code = 0;
  try { out = execFileSync(process.execPath, [BIN, ...args], { cwd: p, env: { ...env, CONDUCTOR_AGENT_CMD: `node ${VAGO}` }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 240000 }); }
  catch (e) { code = e.status ?? -1; out = String(e.stdout || '') + String(e.stderr || ''); }
  assert(/ABORTED|no produjo el artefacto/i.test(out), `debe abortar, no seguir a la siguiente fase — dijo: ${out.slice(-260)}`);
  assert(code !== 0, 'y salir con código != 0 para que un CI se entere');
  assert(!/🏁 GREEN/.test(out), 'jamás GREEN sin artefactos');
});

rmSync(ROOT, { recursive: true, force: true });
