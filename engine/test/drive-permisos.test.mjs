// Tests del GUARD DE RAÍZ y la detección de permisos denegados del CLI (caso real un agente
// de chat lanzó `conductor drive --src src` → projectRoot=subdirectorio sin openspec/ → el CLI denegó toda
// escritura del artefacto y la fase murió en "no-progress" mudo tras quemar 2 intentos de modelo).
import { drive, countDeniedPerms, preserveTimeline } from '../lib/pipeline/drive.mjs';
import { mkdirSync, writeFileSync, appendFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

await test('drive: projectRoot SIN openspec/ aborta AL ENTRAR con pista del ancestro correcto — cero intentos de modelo', async () => {
  const T = join(HERE, '.tmp-drive-noroot');
  rmSync(T, { recursive: true, force: true });
  mkdirSync(join(T, 'openspec', 'changes', 'guard'), { recursive: true });
  mkdirSync(join(T, 'src'), { recursive: true }); // el "subdirectorio equivocado" del caso real
  let err = null, calls = 0;
  const agent = async () => { calls++; return { code: 0, out: '' }; };
  try {
    await drive({ changeDir: join(T, 'openspec', 'changes', 'guard'), request: 'x', complexity: 'simple', domain: 'core', srcDir: join(T, 'src'), runAgent: agent });
  } catch (e) { err = e; }
  assert(err && /openspec/.test(err.message), 'error claro de raiz: ' + (err ? err.message : 'NO lanzo error'));
  assert(/SÍ existe en/.test(err.message), 'incluye la pista del ancestro que SI tiene openspec/: ' + err.message);
  eq(calls, 0, 'CERO llamadas al modelo contra el muro de permisos');
  rmSync(T, { recursive: true, force: true });
});

await test('drive: countDeniedPerms cuenta SOLO las denegaciones appendeadas desde el offset del intento', () => {
  const T = join(HERE, '.tmp-denials');
  rmSync(T, { recursive: true, force: true }); mkdirSync(T, { recursive: true });
  const f = join(T, 'events.jsonl');
  const D = '{"type":"permission.completed","data":{"result":{"kind":"denied-no-approval-rule-and-could-not-request-from-user"}}}\n';
  writeFileSync(f, D + D); // dos denegaciones de un intento ANTERIOR (no deben contarse)
  const before = Buffer.byteLength(D + D);
  appendFileSync(f, '{"type":"tool.execution"}\n' + D); // este intento: una denegacion real
  eq(countDeniedPerms(f, before), 1, 'solo las del intento actual (offset)');
  eq(countDeniedPerms(f, 0), 3, 'desde 0 se ven todas');
  eq(countDeniedPerms(join(T, 'no-existe.jsonl'), 0), 0, 'sin traza => 0 (best-effort, jamas rompe la fase)');
  rmSync(T, { recursive: true, force: true });
});

await test('dominio: domainFromName salta muletillas — specs/quiero jamas volvera a existir', async () => {
  const { domainFromName } = await import('../lib/core/plumb.mjs');
  eq(domainFromName('quiero-un-componente-formulario-con-campo'), 'formulario', 'primer token con SIGNIFICADO');
  eq(domainFromName('crea-un-endpoint-salud'), 'endpoint');
  eq(domainFromName('quiero-un'), 'core', 'sin token util => core');
  eq(domainFromName(''), 'core');
});

await test('tests-fuertes: checkUnrunnable distingue "no pudo EJECUTARSE" (config) de "pruebas rojas" (codigo)', async () => {
  const { checkUnrunnable } = await import('../lib/pipeline/drive.mjs');
  assert(checkUnrunnable({ code: 'EINVAL' }, ''), 'EINVAL del shim .cmd => no ejecutable');
  assert(checkUnrunnable({ code: 'ENOENT' }, ''), 'binario inexistente => no ejecutable');
  assert(checkUnrunnable({ code: 'E1' }, 'npm error Missing script: "test"'), 'script test inexistente => no ejecutable');
  assert(checkUnrunnable({}, '"vitest" no se reconoce como un comando interno o externo'), 'not-recognized (es) => no ejecutable');
  assert(!checkUnrunnable({ code: '1' }, 'Expected 2 to be 3 -- 1 test failed'), 'assertion roja => SI son pruebas (fix aplica)');
});

await test('plumb(fase 2): la fontaneria de un run REAL vive en <raiz>/.conductor/runs/<change> — la carpeta del change queda para el DEV', async () => {
  const { plumbPath, plumbDir } = await import('../lib/core/plumb.mjs');
  const T = join(HERE, '.tmp-plumb-raiz');
  rmSync(T, { recursive: true, force: true });
  const changeDir = join(T, 'openspec', 'changes', 'mi-feature');
  mkdirSync(changeDir, { recursive: true }); // los flujos reales SIEMPRE crean el change antes de conducir
  eq(plumbDir(changeDir), join(T, '.conductor', 'runs', 'mi-feature'), 'punto UNICO de estado en la raiz (patron .git/.angular)');
  mkdirSync(join(T, 'openspec', 'changes', 'archive', '2026-07-31-mi-feature'), { recursive: true });
  eq(plumbPath(join(T, 'openspec', 'changes', 'archive', '2026-07-31-mi-feature'), 'timeline.json').includes(join('.conductor', 'runs', 'archive')), true, 'los archivados van a runs/archive');
  // LEGADO: un run viejo con .conductor DENTRO del change se sigue leyendo y escribiendo ahi (coherencia)
  mkdirSync(join(changeDir, '.conductor'), { recursive: true });
  eq(plumbDir(changeDir), join(changeDir, '.conductor'), 'legacy existente gana (cada run vive donde nacio)');
  // fixture "de la nada" (change sin crear): quien escribe primero define -> legacy (semantica de siempre)
  eq(plumbDir(join(T, 'openspec', 'changes', 'no-creado')), join(T, 'openspec', 'changes', 'no-creado', '.conductor'), 'change inexistente => legacy');
  rmSync(T, { recursive: true, force: true });
});

await test('plumb(fase 3): dashboard/provenance son GENERADOS del run — evidencePath los busca en la evidencia y cae al change legado', async () => {
  const { evidencePath, plumbPath } = await import('../lib/core/plumb.mjs');
  const { writeFileSync } = await import('node:fs');
  const T = join(HERE, '.tmp-plumb-f3');
  rmSync(T, { recursive: true, force: true });
  const changeDir = join(T, 'openspec', 'changes', 'mi-feature');
  mkdirSync(changeDir, { recursive: true });
  // sin ninguno de los dos: devuelve el MODERNO (destino de escritura del driver)
  eq(evidencePath(changeDir, 'dashboard.html'), plumbPath(changeDir, 'dashboard.html'), 'sin ficheros => destino moderno');
  // change VIEJO con el informe en su raiz (pre-fase-3): el lector lo encuentra ahi
  writeFileSync(join(changeDir, 'dashboard.html'), '<html>viejo</html>');
  eq(evidencePath(changeDir, 'dashboard.html'), join(changeDir, 'dashboard.html'), 'legado en la raiz del change => se sigue leyendo');
  // en cuanto existe el moderno, GANA (un run nuevo sobre un change viejo no lee el informe rancio)
  mkdirSync(plumbPath(changeDir), { recursive: true });
  writeFileSync(plumbPath(changeDir, 'dashboard.html'), '<html>nuevo</html>');
  eq(evidencePath(changeDir, 'dashboard.html'), plumbPath(changeDir, 'dashboard.html'), 'moderno presente => gana al legado');
  rmSync(T, { recursive: true, force: true });
});

await test('plumb(caso real): drive SIN change pre-creado (flujo de produccion) => fontaneria MODERNA en la raiz, cero .conductor dentro del change', async () => {
  const T = join(HERE, '.tmp-plumb-prod');
  rmSync(T, { recursive: true, force: true });
  mkdirSync(join(T, 'openspec'), { recursive: true }); // proyecto inicializado; el change NO existe aun (como en serve/mcp/bin)
  const changeDir = join(T, 'openspec', 'changes', 'caso-prod');
  const agent = async ({ writeTo }) => { const { writeFileSync: wf, mkdirSync: mk } = await import('node:fs'); const { dirname: dn } = await import('node:path'); if (writeTo) { mk(dn(writeTo), { recursive: true }); wf(writeTo, '# artefacto\ncontenido'); } return { code: 0, out: 'ok' }; };
  try { await drive({ changeDir, request: 'caso produccion', complexity: 'simple', domain: 'core', srcDir: T, runAgent: agent, timeoutMs: 5000 }); } catch { /* verdict da igual: probamos el LAYOUT */ }
  const { existsSync: ex } = await import('node:fs');
  assert(!ex(join(changeDir, '.conductor')), 'JAMAS nace .conductor dentro del change (el bug reportado)');
  assert(ex(join(T, '.conductor', 'runs', 'caso-prod')), 'la fontaneria vive en <raiz>/.conductor/runs/<change>');
  rmSync(T, { recursive: true, force: true });
});

await test('lock(suspension): latido continuo de 15s + ventana de huerfano 75s — un run muerto jamas queda "EN CURSO" fantasma 15 min', async () => {
  const { readFileSync: rf } = await import('node:fs');
  const src = rf(new URL('../lib/pipeline/drive.mjs', import.meta.url), 'utf8');
  assert(/setInterval\(takeLock, 15_000\)/.test(src), 'latido del lock cada 15s durante TODO el run (no solo pausas)');
  assert(/lockHb\.unref\?\.\(\)/.test(src), 'unref: el latido jamas retiene el proceso vivo');
  assert(/st\.mtimeMs < 75_000/.test(src), 'ventana de huerfano 75s (5 latidos de margen)');
  assert(!/setInterval\(takeLock, 5 \* 60_000\)/.test(src), 'el latido viejo de 5 min en pausa se retiro');
});

await test('preserveTimeline: un run TERMINADO se copia a timeline-prev.json al relanzar; uno vivo o ausente, no', async () => {
  const { plumbPath } = await import('../lib/core/plumb.mjs');
  const { writeFileSync, readFileSync, existsSync } = await import('node:fs');
  const T = join(HERE, '.tmp-tlprev');
  rmSync(T, { recursive: true, force: true });
  const CH = join(T, 'openspec', 'changes', 'mi-feature');
  mkdirSync(CH, { recursive: true });
  eq(preserveTimeline(CH), false, 'sin timeline previo: nada que preservar');
  mkdirSync(plumbPath(CH), { recursive: true });
  writeFileSync(plumbPath(CH, 'timeline.json'), JSON.stringify({ verdict: 'running', phases: [] }));
  eq(preserveTimeline(CH), false, 'un run VIVO jamas se rota (es el mismo run)');
  writeFileSync(plumbPath(CH, 'timeline.json'), JSON.stringify({ verdict: 'NOT-GREEN', reason: 'gate SECRETS-FAIL', phases: [{ phase: 'verify' }] }));
  eq(preserveTimeline(CH), true, 'run terminado: se preserva');
  const prev = JSON.parse(readFileSync(plumbPath(CH, 'timeline-prev.json'), 'utf8'));
  eq(prev.reason, 'gate SECRETS-FAIL', 'el PORQUE del run anterior sobrevive al relanzamiento');
  assert(existsSync(plumbPath(CH, 'timeline.json')), 'COPIA, no movimiento: el original queda para el resume');
  rmSync(T, { recursive: true, force: true });
});
