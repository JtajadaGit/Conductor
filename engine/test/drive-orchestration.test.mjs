// GARANTÍA ANTI-V1: el CÓDIGO conduce las fases, no el modelo. En v1 el orquestador era un LLM que, según
// el prompt o el modelo, "no delegaba", ejecutaba directo, o se saltaba la pipeline. Aquí se prueba que el
// driver determinista NO tiene ese fallo: un agente flojo/que no coopera hace que la fase ABORTE en orden,
// nunca que se salte la pipeline ni que "lo haga el modelo por su cuenta". (Cubre también el hueco QA:
// "el stub del agente siempre devuelve éxito" → aquí el agente NO produce artefacto.)
import { drive, retryHint } from '../lib/pipeline/drive.mjs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';

const TMP = join(dirname(fileURLToPath(import.meta.url)), '.tmp-orch');
process.env.CONDUCTOR_CAPTURE = 'fs'; // aislar del git del repo
const fresh = () => {
  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(join(TMP, 'openspec'), { recursive: true });
  writeFileSync(join(TMP, 'openspec', 'conductor.json'), JSON.stringify({ maxRetries: 0, lenses: false, serve: false }));
};

await test('anti-V1: agente flojo (no escribe artefacto) → el driver intenta la 1ª fase y ABORTA, NO salta la pipeline', async () => {
  fresh();
  const attempted = [];
  // agente "malo": dice code:0 pero NO produce NINGÚN artefacto (simula modelo flojo / que no coopera)
  const lazy = ({ phase }) => { attempted.push(phase); return Promise.resolve({ code: 0 }); };
  const r = await drive({ changeDir: join(TMP, 'openspec', 'changes', 'feat'), request: 'algo', complexity: 'simple', domain: 'core', srcDir: TMP, runAgent: lazy });
  eq(r.verdict, 'ABORTED', 'sin artefacto → ABORTED (ni GREEN, ni se salta la fase)');
  assert(attempted.length >= 1, 'el driver SÍ pidió la primera fase — la pipeline se lanza siempre, no la decide el modelo');
  eq(r.trail.length, 0, 'ninguna fase se cerró OK: no hubo "delegación fingida" ni ejecución directa que cuele');
  assert(r.timeline.length >= 1 && r.timeline[r.timeline.length - 1].ok === false, 'la fase fallida queda registrada (falla en alto, no en silencio)');
  assert(typeof r.phase === 'string' && r.phase.length > 0, 'aborta en una fase concreta del plan (orden conducido por código)');
});

await test('anti-V1: el ORDEN de fases lo fija el código por complejidad, no el agente', async () => {
  fresh();
  const order = [];
  const lazy = ({ phase }) => { order.push(phase); return Promise.resolve({ code: 0 }); };
  await drive({ changeDir: join(TMP, 'openspec', 'changes', 'f2'), request: 'x', complexity: 'simple', domain: 'core', srcDir: TMP, runAgent: lazy });
  // con maxRetries:0 y agente flojo, solo se intenta la PRIMERA fase del plan antes de abortar — pero esa
  // primera fase la elige el DRIVER (resolvePhases), no el modelo. La 1ª de 'simple' es una fase de plan, no 'apply' suelto.
  assert(order.length >= 1, 'el driver pidió la primera fase del plan');
  assert(order[0] !== 'verify', 'nunca arranca por el final: el código impone el orden');
});

await test('retry-delta: con progreso parcial el reintento dice "completa lo que falta" (jamas el mensaje falso de "no escribiste nada")', () => {
 // caso real timeout tras escribir la fuente pero NO el test → re-pagaba la implementación entera
  const conProgreso = retryHint([{ p: 'src/invertir.pipe.ts', k: 'create' }], ['- [x] 1.1 [REQ-X] pipe base']);
  assert(conProgreso.includes('src/invertir.pipe.ts'), 'lista los ficheros ya escritos');
  assert(/NO los re-crees/.test(conProgreso), 'prohibe re-crear lo existente (ahorro de tokens)');
  assert(/TEST/.test(conProgreso), 'apunta a completar el test que falta');
  assert(conProgreso.includes('- [x] 1.1'), 'las tareas hechas viajan');
  assert(!/NO ESCRIBIÓ NINGÚN FICHERO/.test(conProgreso), 'el mensaje falso desaparece cuando HUBO progreso');
  const sinProgreso = retryHint([], []);
  assert(/NO ESCRIBIÓ NINGÚN FICHERO/.test(sinProgreso), 'sin progreso, el empujón contundente de siempre');
});

await test('approvalSha: receipt de aprobación — hash estable de los artefactos presentes al aprobar', async () => {
  const { approvalSha } = await import('../lib/pipeline/drive.mjs');
  const { mkdirSync, writeFileSync, rmSync } = await import('node:fs');
  const { join, dirname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const D = join(dirname(fileURLToPath(import.meta.url)), '.tmp-apprsha');
  rmSync(D, { recursive: true, force: true });
  mkdirSync(join(D, 'specs', 'pipe'), { recursive: true });
  writeFileSync(join(D, 'proposal.md'), '# p');
  writeFileSync(join(D, 'specs', 'pipe', 'spec.md'), '## REQ-1');
  const a = approvalSha(D);
  eq(Object.keys(a).sort(), ['proposal.md', 'specs/pipe/spec.md'], 'solo lo PRESENTE, con ruta relativa');
  eq(a['proposal.md'].length, 12, 'sha corto de 12');
  eq(approvalSha(D), a, 'determinista: mismo contenido, mismo hash');
  writeFileSync(join(D, 'proposal.md'), '# p CAMBIADO');
  assert(approvalSha(D)['proposal.md'] !== a['proposal.md'], 'contenido distinto => hash distinto (eso ES el receipt)');
  eq(approvalSha(join(D, 'no-existe')), undefined, 'change vacio => undefined (no ensucia el timeline)');
  rmSync(D, { recursive: true, force: true });
});
