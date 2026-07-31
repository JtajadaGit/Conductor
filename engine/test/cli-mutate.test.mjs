// cli-mutate.test.mjs — comandos que ESCRIBEN, ejercitados en directorios temporales con HOME propio.
// Complementa a cli-smoke (solo lectura). Entre los dos cubren la superficie del CLI que un usuario toca
// de verdad: inicializar, firmar, sellar, verificar, archivar, conectar hosts. `bin/conductor.mjs` son
// 107 KB y era el fichero peor cubierto del repo; los dos bugs de esta tanda vivían justo ahí.
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));
const BIN = resolve(HERE, '..', 'bin', 'conductor.mjs');
const ROOT = join(HERE, '.tmp-mutate');
const HOME = join(ROOT, 'home');
const PROY = join(ROOT, 'proy');
const CH = join(PROY, 'openspec', 'changes', 'cambio-verde');
const w = (p, c) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, c); };

rmSync(ROOT, { recursive: true, force: true });
mkdirSync(HOME, { recursive: true });
// change GREEN completo: sellar y archivar lo exigen
w(join(CH, 'specs', 'core', 'spec.md'), '## ADDED Requirements\n<!-- id: REQ-X -->\n### Requirement: X\nThe system SHALL x.\n#### Scenario: s\n- **GIVEN** a\n- **WHEN** b\n- **THEN** c');
w(join(CH, 'proposal.md'), '## Why\nx\n## What Changes\n- x\n## Impact\nbajo');
w(join(CH, 'tasks.md'), '- [x] 1.1 [REQ-X] hacer');
w(join(CH, 'apply-report.md'), '# Apply Report\nStatus: done\nFiles created: src/x.js\n');
w(join(CH, 'verify-report.md'), '## Verdict\nPASS');
w(join(PROY, 'src', 'x.js'), '// @conductor REQ-X\nexport const x = 1;');
w(join(PROY, 'src', 'x.test.js'), '// @conductor REQ-X\ntest("x", () => { expect(x).toBe(1); });');
w(join(CH, '.conductor', 'timeline.json'), JSON.stringify({ request: 'x', verdict: 'GREEN', total_ms: 1000, phases: [{ phase: 'apply', ok: true, ms: 10, model: 'm', tokens: { in: 5, out: 1 } }] }));

const env = { ...process.env, CONDUCTOR_HOME: HOME };
const run = (args, cwd = PROY) => {
  try { return { code: 0, out: execFileSync(process.execPath, [BIN, ...args], { cwd, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 90000 }) }; }
  catch (e) { return { code: e.status ?? -1, out: String(e.stdout || '') + String(e.stderr || '') }; }
};
const LEAK = /ReferenceError|TypeError|is not defined|is not a function|Cannot read (properties|property)|node:internal|argument must be of type/;

const PRIV = join(ROOT, 'k.key'), PUB = join(ROOT, 'k.pub'), FIRMADO = join(ROOT, 'firmado.txt');
w(FIRMADO, 'contenido a firmar');

const PASOS = [
  ['init-config', ['init-config', PROY]], // ojo: recibe la RAÍZ del proyecto y él añade openspec/ (bin:481)
  ['keygen', ['keygen', '--priv', PRIV, '--pub', PUB]],
  ['seal', ['seal', CH, '--src', PROY, '--priv', PRIV]],
  ['verify', ['verify', join(CH, 'provenance.json'), '--pub', PUB]],
  ['sign', ['sign', FIRMADO, '--priv', PRIV]],
  ['verify-file', ['verify-file', FIRMADO, '--pub', PUB]],
  ['ledger verify', ['ledger', 'verify', join(PROY, 'openspec', 'provenance.ledger.jsonl')]],
  ['policy init', ['policy', 'init']],
  ['policy validate', ['policy', 'validate', join(PROY, 'openspec', 'policy.json')]],
  ['mcp-config', ['mcp-config']],
  ['litellm status', ['litellm', 'status']],
  ['archive', ['archive', CH, '--src', PROY]],
];
const RES = new Map();
for (const [etq, args] of PASOS) RES.set(etq, run(args));

await test('cli-mutar: ningún comando de escritura filtra un error interno de Node', () => {
  const rotos = [...RES.entries()].filter(([, r]) => LEAK.test(r.out))
    .map(([e, r]) => `${e}: ${r.out.split('\n').find((l) => LEAK.test(l))?.trim().slice(0, 110)}`);
  eq(rotos, [], `revientan por dentro:\n   ${rotos.join('\n   ')}`);
});

await test('cli-mutar: keygen crea el par y seal produce un provenance.json verificable', () => {
  assert(existsSync(PRIV) && existsSync(PUB), 'keygen escribe clave privada y pública');
  assert(existsSync(join(CH, 'provenance.json')), 'seal escribe el sello junto al change');
  const sello = JSON.parse(readFileSync(join(CH, 'provenance.json'), 'utf8'));
  assert(sello.spec_version, 'el sello declara su formato');
  eq(RES.get('verify').code, 0, `verify acepta el sello recién firmado: ${RES.get('verify').out.trim().slice(0, 120)}`);
  assert(/OK|válid/i.test(RES.get('verify').out), 'y lo dice en claro');
});

await test('cli-mutar: sign/verify-file cierran el ciclo de firma sobre un fichero suelto', () => {
  eq(RES.get('sign').code, 0, RES.get('sign').out.slice(0, 120));
  eq(RES.get('verify-file').code, 0, RES.get('verify-file').out.slice(0, 120));
});

await test('cli-mutar: init-config deja el árbol OpenSpec y una config que parsea; policy init se valida a sí misma', () => {
  assert(existsSync(join(PROY, 'openspec', 'conductor.json')), 'conductor.json creado');
  JSON.parse(readFileSync(join(PROY, 'openspec', 'conductor.json'), 'utf8')); // debe parsear
  assert(existsSync(join(PROY, 'openspec', 'specs')), 'specs/ — fuente de verdad viva del estándar OpenSpec');
  assert(existsSync(join(PROY, 'openspec', 'changes', 'archive')), 'changes/archive/ para el histórico');
  // NO se escribe conductor.schema.json y es deliberado (scaffold.mjs:132): apuntarlo desde el repo del
  // usuario sería un enlace roto. Se fija aquí para que nadie lo "arregle" reintroduciéndolo.
  assert(!existsSync(join(PROY, 'openspec', 'conductor.schema.json')), 'sin fichero de schema en el repo del usuario');
  eq(RES.get('policy validate').code, 0, 'la policy recién creada se valida a sí misma');
});

await test('cli-mutar: archive mueve un change GREEN al histórico', () => {
  eq(RES.get('archive').code, 0, RES.get('archive').out.slice(0, 140));
  assert(!existsSync(join(CH, 'proposal.md')) || /archivad/i.test(RES.get('archive').out), 'el change sale de changes/ (o lo dice)');
});

rmSync(ROOT, { recursive: true, force: true });
