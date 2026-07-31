// Tests del GUARD DE RAÍZ y la detección de permisos denegados del CLI (caso real 2026-07-31: un agente
// de chat lanzó `conductor drive --src src` → projectRoot=subdirectorio sin openspec/ → el CLI denegó toda
// escritura del artefacto y la fase murió en "no-progress" mudo tras quemar 2 intentos de modelo).
import { drive, countDeniedPerms } from '../lib/pipeline/drive.mjs';
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
