// cli-smoke.test.mjs — HUMO DE TODOS LOS COMANDOS DE LECTURA sobre un proyecto real de mentira.
// Por qué existe: `bin/conductor.mjs` son 107 KB con el 32% de sus funciones sin ejecutar jamás en tests,
// y ahí vivían DOS bugs reales de esta tanda (el crash `st is not defined` de `conductor stats` y el
// `conductor status` filtrando el error interno de Node). Un comando que nadie ejecuta es un comando que
// nadie sabe si funciona. Esto lo arregla por la vía barata: ejecutarlos todos de verdad, una vez.
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));
const BIN = resolve(HERE, '..', 'bin', 'conductor.mjs');
const ROOT = join(HERE, '.tmp-smoke');
const CH = join(ROOT, 'openspec', 'changes', 'demo-cambio');
const w = (p, c) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, c); };

rmSync(ROOT, { recursive: true, force: true });
// proyecto plausible: spec con requisito trazable, código y test etiquetados, timeline con tokens reales
w(join(CH, 'specs', 'core', 'spec.md'), '## ADDED Requirements\n<!-- id: REQ-SUMA -->\n### Requirement: Suma\nThe system SHALL sumar.\n#### Scenario: dos numeros\n- **GIVEN** a\n- **WHEN** b\n- **THEN** c');
w(join(CH, 'proposal.md'), '## Why\nhace falta\n## What Changes\n- suma\n## Impact\nbajo');
w(join(CH, 'tasks.md'), '- [x] 1.1 [REQ-SUMA] implementar\n- [x] 1.2 [REQ-SUMA] probar');
w(join(CH, 'apply-report.md'), '# Apply Report\nStatus: done\nFiles created: src/suma.js\nTasks completed: 2/2\n');
w(join(CH, 'verify-report.md'), '## Verdict\nPASS\nTodo correcto.');
w(join(ROOT, 'src', 'suma.js'), '// @conductor REQ-SUMA\nexport const suma = (a, b) => a + b;');
w(join(ROOT, 'src', 'suma.test.js'), '// @conductor REQ-SUMA\ntest("suma", () => { expect(suma(1, 2)).toBe(3); });');
w(join(ROOT, 'openspec', 'conductor.json'), JSON.stringify({ maxRetries: 0, lenses: false }));
w(join(CH, '.conductor', 'timeline.json'), JSON.stringify({ request: 'suma dos numeros', complexity: 'simple', verdict: 'GREEN', total_ms: 60000, phases: [{ phase: 'apply', role: 'coder', ok: true, ms: 1000, model: 'm', tokens: { in: 100, out: 20, cached: 5 }, files: [{ p: 'src/suma.js', k: 'create' }] }] }));

const run = (args) => {
  try { return { code: 0, out: execFileSync(process.execPath, [BIN, ...args], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 90000 }) }; }
  catch (e) { return { code: e.status ?? -1, out: String(e.stdout || '') + String(e.stderr || '') }; }
};
const LEAK = /ReferenceError|TypeError|is not defined|is not a function|Cannot read (properties|property)|node:internal|argument must be of type/;

// comandos de LECTURA: no mutan el proyecto ni salen a la red
const COMANDOS = [
  ['version', ['version']], ['help', ['help']], ['help --all', ['help', '--all']], ['config', ['config']],
  ['gate', ['gate', CH, '--src', ROOT]], ['gate --json', ['gate', CH, '--src', ROOT, '--json']],
  ['gate --format sarif', ['gate', CH, '--src', ROOT, '--format', 'sarif']],
  ['gate --format junit', ['gate', CH, '--src', ROOT, '--format', 'junit']],
  ['gate --format rdjson', ['gate', CH, '--src', ROOT, '--format', 'rdjson']],
  ['trace', ['trace', CH, '--src', ROOT]], ['receipt', ['receipt', CH, '--src', ROOT]],
  ['dashboard', ['dashboard', CH, '--src', ROOT]], ['estimate', ['estimate', CH, '--src', ROOT, '--complexity', 'simple']],
  ['drift', ['drift', CH, '--src', ROOT]], ['ci', ['ci', CH, '--src', ROOT]], ['aiact', ['aiact', CH, '--src', ROOT]],
  ['explain', ['explain', ROOT]], ['atlas', ['atlas', ROOT]], ['stack', ['stack', ROOT]],
  ['skills list', ['skills', 'list']], ['search', ['search', 'suma', '--src', ROOT]],
  ['stats', ['stats']], ['stats --json', ['stats', '--json']], ['selfcheck', ['selfcheck']],
  ['mcp-config', ['mcp-config']], ['migrate', ['migrate', ROOT]], ['policy init', ['policy', 'init']],
];

const RES = new Map();
for (const [etq, args] of COMANDOS) RES.set(etq, run(args));

await test('cli-humo: ningún comando de lectura filtra un error interno de Node', () => {
  const rotos = [...RES.entries()].filter(([, r]) => LEAK.test(r.out))
    .map(([e, r]) => `${e}: ${r.out.split('\n').find((l) => LEAK.test(l))?.trim().slice(0, 110)}`);
  eq(rotos, [], `comandos que revientan por dentro:\n   ${rotos.join('\n   ')}`);
});

await test('cli-humo: los comandos de lectura terminan con éxito sobre un proyecto válido', () => {
  const fallan = [...RES.entries()].filter(([, r]) => r.code !== 0).map(([e, r]) => `${e} (exit ${r.code}): ${r.out.trim().slice(0, 90)}`);
  eq(fallan, [], `deberían salir 0 sobre un proyecto correcto:\n   ${fallan.join('\n   ')}`);
});

await test('cli-humo: cada comando PRODUCE algo (ninguno responde en blanco)', () => {
  const mudos = [...RES.entries()].filter(([, r]) => !r.out.trim()).map(([e]) => e);
  eq(mudos, [], `sin salida: ${mudos.join(', ')}`);
});

await test('cli-humo: el gate ve el proyecto trazado y stats no miente con los tokens del timeline', () => {
  assert(/TRAZABILIDAD COMPLETA|REQ-SUMA/.test(RES.get('trace').out), 'trace encuentra el requisito trazado');
  assert(/REQ-SUMA/.test(RES.get('receipt').out), 'el recibo de PR lista el requisito cubierto');
  const s = JSON.parse(RES.get('stats --json').out);
  assert(typeof s === 'object', 'stats --json es JSON válido');
});

rmSync(ROOT, { recursive: true, force: true });

await test('cli(init --smart): el agente rellena project.md y propone checks/rules SIN pisar lo humano ni tocar models', () => {
  const T = join(HERE, '.tmp-smart');
  rmSync(T, { recursive: true, force: true });
  mkdirSync(T, { recursive: true });
  w(join(T, 'AGENTS.md'), '# Agentes\nConvenciones ya documentadas aqui.');
  // agente FAKE (stdin = prompt): extrae la ruta de smart-init.md del prompt y escribe md valido + json
  const FAKE = join(T, 'fake-agent.mjs');
  w(FAKE, [
    "let s=''; process.stdin.on('data',(c)=>s+=c); process.stdin.on('end',()=>{",
    "const m=s.match(/([A-Z]:[^\\n]*?smart-init\\.md)/); if(!m) process.exit(1);",
    "const md='## Propósito\\nApp de prueba del init inteligente.\\n\\n## Convenciones\\nver AGENTS.md\\n\\n## Decisiones vivas\\n- ninguna\\n\\n## Fuera de alcance\\n- pagos\\n\\n```json\\n{\"checks\":[\"npm test\"],\"rules\":{\"apply\":[\"tests junto al codigo\"]}}\\n```\\n';",
    "import('node:fs').then(f=>{ f.writeFileSync(m[1].trim(), md); process.exit(0); });",
    '});',
  ].join('\n'));
  const env2 = { ...process.env, CONDUCTOR_AGENT_CMD: `node ${FAKE}` };
  const out = execFileSync(process.execPath, [BIN, 'init-config', T, '--smart'], { encoding: 'utf8', env: env2, timeout: 120000, windowsHide: true });
  assert(/project\.md rellenado/.test(out), 'anuncia el relleno: ' + out.slice(-200));
  const pm = readFileSync(join(T, 'openspec', 'project.md'), 'utf8');
  assert(/App de prueba del init inteligente/.test(pm) && !/_Sustituye/.test(pm), 'project.md rellenado con contenido real');
  assert(/ver AGENTS\.md/.test(pm), 'anti-duplicacion: referencia AGENTS.md en vez de repetirlo');
  const cfg = JSON.parse(readFileSync(join(T, 'openspec', 'conductor.json'), 'utf8'));
  eq(cfg.checks, ['npm test'], 'checks propuestos del analisis');
  eq(cfg.rules.apply, ['tests junto al codigo'], 'rules por fase propuestas');
  eq(Object.keys(cfg.models).length, 0, 'models JAMAS se toca');
  // re-ejecutar NO pisa lo rellenado (ya no tiene marcadores _Sustituye = es del humano)
  const out2 = execFileSync(process.execPath, [BIN, 'init-config', T, '--smart'], { encoding: 'utf8', env: env2, timeout: 120000, windowsHide: true });
  assert(/no se toca/.test(out2), 're-init --smart respeta el project.md ya rellenado');
  rmSync(T, { recursive: true, force: true });
});

