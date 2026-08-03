// T7 — COMPACTION del pauseBundle: por encima del cap viaja un RESUMEN ESTRUCTURADO (cabeceras + ids),
// jamás una tijera ciega que amputa requisitos. Token-first sin perder lo que el revisor necesita.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pauseBundle } from '../lib/sysops/mcp.mjs';
import { capFindings, retryHint } from '../lib/pipeline/drive.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

await test('pauseBundle: spec GIGANTE => compactada con TODAS las cabeceras/ids visibles y bajo el cap', () => {
  const T = join(HERE, '.tmp-pausebundle');
  rmSync(T, { recursive: true, force: true });
  mkdirSync(join(T, 'specs', 'core'), { recursive: true });
  const secciones = [];
  for (let i = 1; i <= 30; i++) {
    secciones.push(`### Requirement: R${i}`, `<!-- id: REQ-R${i} -->`, ('relleno '.repeat(120)));
  }
  writeFileSync(join(T, 'specs', 'core', 'spec.md'), ['## ADDED Requirements', ...secciones].join('\n'));
  writeFileSync(join(T, 'proposal.md'), '## Why\ncorto\n## What Changes\n- x\n## Impact\n- y');
  const arts = pauseBundle(T, { before: 'apply' });
  const spec = arts['specs/core/spec.md'];
  assert(spec, 'la spec SIEMPRE viaja en la pausa');
  // la spec tiene presupuesto PROPIO (4000, mayor que el genérico) y recorte por requisito (specClip)
  assert(spec.length <= 4000 + 140, 'respeta el cap propio de la spec (+ nota de compactado)');
  for (let i = 1; i <= 30; i++) assert(spec.includes(`REQ-R${i}`), `el id REQ-R${i} sobrevive a la compactación`);
  assert(/spec compactada/.test(spec) && /SHALL y escenarios conservados/.test(spec), 'declara el resumen Y qué conserva (los SHALL jamás caen)');
  eq(arts['proposal.md'].includes('compactado'), false, 'lo que cabe entero viaja entero');
  rmSync(T, { recursive: true, force: true });
});

await test('capFindings: topa cantidad y longitud, y declara cuántos quedan fuera', () => {
  const many = Array.from({ length: 30 }, (_, i) => ({ message: `hallazgo ${i} ` + 'x'.repeat(500) }));
  const capped = capFindings(many);
  eq(capped.length, 13, '12 + la línea de "…y N más"');
  assert(capped[12].includes('18 hallazgo(s) más'), 'declara los que no viajan');
  assert(capped[0].length <= 300, 'mensajes topados a 300');
  eq(capFindings([{ message: 'uno' }]), ['uno'], 'pocos => tal cual');
  eq(capFindings([]), [], 'vacío => vacío');
});

await test('retryHint: 100 tareas hechas NO inflan el prompt — lista topada a 40 + resumen', () => {
  const tasks = Array.from({ length: 100 }, (_, i) => `- [x] ${i} tarea`);
  const hint = retryHint([{ p: 'src/a.js' }], tasks);
  eq((hint.match(/- \[x\]/g) || []).length, 40, 'máximo 40 tareas listadas');
  assert(hint.includes('…y 60 más'), 'el resto se declara, no se pierde en silencio');
});

await test('conductor_drive async (T5): el schema declara el modo job y la description enseña ambos', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(join(HERE, '..', 'lib', 'sysops', 'mcp.mjs'), 'utf8');
  assert(src.includes("async: { type: 'boolean'"), 'input async declarado en conductor_drive');
  assert(/async:true = background JOB/.test(src), 'description documenta el modo job');
  assert(/CI\/scripts only/.test(src), 'el modo bloqueante queda etiquetado solo-CI');
  assert(/asJob === true/.test(src), 'la rama async existe y retorna sin bloquear');
});
