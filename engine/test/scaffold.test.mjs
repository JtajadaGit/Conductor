import { initConfig, CONFIG_SCHEMA } from '../lib/analysis/scaffold.mjs';
import { plumbPath } from '../lib/core/plumb.mjs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rmSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';

const TMP = join(dirname(fileURLToPath(import.meta.url)), '.tmp-scaffold');
rmSync(TMP, { recursive: true, force: true });

await test('scaffold: crea conductor.json + project.md + .copilotignore + .gitignore; NUNCA pisa lo del usuario', () => {
  const OS = join(TMP, 'openspec'); // openspecDir realista → .copilotignore va al root (padre de openspec/)
  const r = initConfig(OS);
  assert(r.created && existsSync(r.cfgPath), 'config creada');
  // init v2 : el schema YA NO se escribe en el repo del usuario (era ruido git; la validación
  // real es del motor). En su lugar: árbol OpenSpec completo + project.md (contexto con consumidor real).
  assert(!existsSync(join(OS, 'conductor.schema.json')), 'SIN conductor.schema.json en el repo del usuario');
  assert(existsSync(r.projectMd), 'project.md creado (contexto editable del equipo)');
  assert(existsSync(join(OS, 'specs', 'README.md')), 'specs/ visible (fuente de verdad viva)');
  assert(existsSync(join(OS, 'changes', 'archive', '.gitkeep')), 'changes/archive/ visible');
  assert(/Propósito/.test(readFileSync(r.projectMd, 'utf8')), 'project.md trae las secciones guía');
  //  el espejo detectado deja de nacer: se reescribía en cada arranque y no lo parseaba NADIE.
  assert(!existsSync(join(OS, 'config.yaml')), 'SIN config.yaml (dato derivado: se detecta en runtime, no se versiona)');
  const pm = readFileSync(r.projectMd, 'utf8');
  assert(!/Stack \(detectado\)|## Estructura/.test(pm), 'project.md SIN stack/estructura (se escribían una vez y se pudrían, y van al prompt del planner)');
  assert(pm.includes('_Sustituye'), 'project.md nace con marcadores _Sustituye: drive NO lo inyecta hasta que el dev lo rellena (detector semantico)');
  assert(r.copilotignore && existsSync(join(TMP, '.copilotignore')), '.copilotignore creado en el root del proyecto');
  assert(/node_modules\//.test(readFileSync(join(TMP, '.copilotignore'), 'utf8')), '.copilotignore excluye node_modules (token-first)');
  // la fontanería del run fuera de git: se excluía del contexto del modelo pero acababa commiteada
  assert(r.gitignore && existsSync(join(TMP, '.gitignore')), '.gitignore creado');
  assert(/^\.conductor\/$/m.test(readFileSync(join(TMP, '.gitignore'), 'utf8')), '.gitignore excluye el punto ÚNICO de estado de la raíz (.conductor/)');
  const cfg = JSON.parse(readFileSync(r.cfgPath, 'utf8'));
  assert(!cfg.$schema, 'config SIN $schema colgante (no hay fichero al lado)');
  assert(typeof cfg._ayuda === 'string' && cfg._ayuda.includes('conductor config'), 'el config que NACE se explica solo: UNA linea _ayuda que apunta a `conductor config` (el fichero mudo obligaba a imaginar los mandos)');
  // el config nace con EJEMPLOS COPIABLES (el motor los ignora): mezcla de modelos, budget, rules, checks…
  assert(cfg._ejemplos && cfg._ejemplos.models && cfg._ejemplos.budget && Array.isArray(cfg._ejemplos.checks), 'nace con _ejemplos realistas de los mandos principales (copiar y ajustar, no imaginar)');
  assert(String(cfg._ejemplos.models.coder || '').includes(':'), 'los ejemplos de modelo llevan el prefijo de proveedor (litellm:/copilot:)');
  assert(cfg.rules && typeof cfg.rules === 'object', 'config nace con rules (gobierno por fase, descubrible y vacío)');
  // el usuario edita su config y su .copilotignore → re-init NO los pisa (el schema sí se refresca)
  writeFileSync(r.cfgPath, JSON.stringify({ serve: false }));
  writeFileSync(join(TMP, '.copilotignore'), 'custom\n');
  writeFileSync(r.projectMd, '# mi contexto\n');
  const r2 = initConfig(OS);
  eq(r2.created, false); eq(r2.copilotignore, false, 'no re-crea .copilotignore');
  eq(r2.gitignore, false, 'no re-añade la línea al .gitignore (idempotente)');
  eq(JSON.parse(readFileSync(r.cfgPath, 'utf8')).serve, false, 'config del usuario intacta');
  eq(readFileSync(r.projectMd, 'utf8'), '# mi contexto\n', 'project.md del usuario INTACTO en re-init');
  eq(readFileSync(join(TMP, '.copilotignore'), 'utf8'), 'custom\n', '.copilotignore del usuario intacto');
  eq((readFileSync(join(TMP, '.gitignore'), 'utf8').match(/\.conductor\//g) || []).length, 1, 'la línea NO se duplica en re-init');
  assert(CONFIG_SCHEMA.properties.models && CONFIG_SCHEMA.properties.mcp, 'schema cubre models/mcp');
  assert(CONFIG_SCHEMA.properties.rules, 'schema cubre rules (si no, additionalProperties:false lo rechazaría)');
});

rmSync(TMP, { recursive: true, force: true });

await test('scaffold: .gitignore preexistente del usuario se RESPETA (append, jamás reescritura)', () => {
  const OS = join(TMP, 'openspec');
  mkdirSync(TMP, { recursive: true });
  writeFileSync(join(TMP, '.gitignore'), '/dist\nnode_modules\n'); // sin newline final tampoco debe romper
  const r = initConfig(OS);
  const gi = readFileSync(join(TMP, '.gitignore'), 'utf8');
  assert(r.gitignore, 'informa de que añadió la línea');
  assert(gi.startsWith('/dist\nnode_modules\n'), 'el contenido previo del usuario queda INTACTO y primero');
  assert(gi.includes('.conductor/'), 'y el punto único de estado (.conductor/) queda excluido');
});

rmSync(TMP, { recursive: true, force: true });

await test('rules: gobierno por fase — "all" + fase, dedup, topes y cero ruido si no hay reglas', async () => {
  const { rulesFor, renderRulesBlock } = await import('../lib/pipeline/orchestrate.mjs');
  eq(renderRulesBlock(undefined, 'spec'), '', 'sin config → bloque VACÍO (cero tokens de peaje)');
  eq(renderRulesBlock({}, 'spec'), '', 'rules vacío → bloque vacío');
  eq(renderRulesBlock({ apply: ['x'] }, 'spec'), '', 'las reglas de otra fase NO se filtran');
  const rules = { all: ['sé conciso'], spec: ['sé conciso', 'un requisito por comportamiento'] };
  eq(rulesFor(rules, 'spec'), ['sé conciso', 'un requisito por comportamiento'], '"all" primero y sin duplicar');
  const blk = renderRulesBlock(rules, 'spec');
  assert(blk.includes('phase "spec"') && blk.includes('- un requisito por comportamiento'), 'bloque legible y atribuido a la fase');
  eq(rulesFor({ spec: Array.from({ length: 30 }, (_, i) => 'r' + i) }, 'spec').length, 10, 'tope de 10 reglas/fase');
  eq(rulesFor({ spec: ['a'.repeat(500)] }, 'spec')[0].length, 240, 'tope de 240 chars/regla');
  eq(rulesFor({ spec: [1, null, '  ', 'ok'] }, 'spec'), ['ok'], 'ignora lo que no es texto con contenido');
  eq(rulesFor(['no', 'soy', 'objeto'], 'spec'), [], 'un array en vez de objeto no revienta');
});

rmSync(TMP, { recursive: true, force: true });

await test('init profundo: detecta versiones/gestor/proyectos/comandos REALES y siembra checks en conductor.json', async () => {
  const { detectStackDeep, renderStackDeep } = await import('../lib/analysis/stack.mjs');
  const { initConfig } = await import('../lib/analysis/scaffold.mjs');
  const { mkdirSync, writeFileSync, rmSync, readFileSync } = await import('node:fs');
  const { join, dirname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const T = join(dirname(fileURLToPath(import.meta.url)), '.tmp-initdeep');
  rmSync(T, { recursive: true, force: true });
  mkdirSync(T, { recursive: true });
  writeFileSync(join(T, 'package.json'), JSON.stringify({
    name: 'mi-lib', scripts: { build: 'ng build', test: 'jest', lint: 'eslint .' },
    dependencies: { '@angular/core': '^20.0.5' }, devDependencies: { typescript: '~5.8.2', jest: '^29.0.0' },
  }));
  writeFileSync(join(T, 'package-lock.json'), '{}');
  writeFileSync(join(T, 'tsconfig.json'), JSON.stringify({ compilerOptions: { strict: true } }));
  writeFileSync(join(T, 'angular.json'), JSON.stringify({ projects: { 'mi-lib': { projectType: 'library', root: 'projects/mi-lib' }, demo: { projectType: 'application', root: 'projects/demo' } } }));
  const d = detectStackDeep(T);
  eq(d.versions.angular, '20.0.5', 'version EXACTA, no un booleano');
  eq(d.versions.typescript, '5.8.2');
  eq(d.packageManager, 'npm');
  eq(d.monorepo, true, 'dos proyectos de angular.json => monorepo');
  eq(d.projects.length, 2);
  assert(d.strictTs, 'tsconfig strict detectado');
  eq(d.testFramework, 'jest');
  eq(d.checks, ['npm test', 'npm run build', 'npm run lint', 'npx tsc --noEmit'], 'comandos que EXISTEN en el repo, en orden test→build→lint→tsc');
  const lines = renderStackDeep(d);
  assert(lines.some((l) => l.includes('angular 20.0.5')) && lines.some((l) => l.includes('mi-lib (library)')), 'resumen humano con versiones y proyectos');
  // el conductor.json recién nacido lleva esos checks YA escritos (config accionable, no muda)
  const r = initConfig(join(T, 'openspec'));
  const cfg = JSON.parse(readFileSync(r.cfgPath, 'utf8'));
  eq(cfg.checks, d.checks, 'checks sembrados en el config nuevo');
  assert(Array.isArray(r.deep?.checks), 'la detección viaja al caller (init la imprime)');
  // el project.md NUEVO lleva el bloque detectado (la riqueza aterriza en el FICHERO, no solo en el terminal)
  let pm = readFileSync(r.projectMd, 'utf8');
  assert(pm.includes('## Stack y comandos (detectado)') && pm.includes('angular 20.0.5'), 'bloque detectado con versiones en project.md');
  // y se REFRESCA en el siguiente init (el bloque no se pudre — la lección del espejo config.yaml)
  writeFileSync(join(T, 'package.json'), JSON.stringify({ name: 'mi-lib', scripts: { test: 'jest' }, dependencies: { '@angular/core': '^21.0.0' } }));
  initConfig(join(T, 'openspec'));
  pm = readFileSync(r.projectMd, 'utf8');
  assert(pm.includes('angular 21.0.0') && !pm.includes('angular 20.0.5'), 'el bloque se regenera con la detección actual');
  eq((pm.match(/## Stack y comandos \(detectado\)/g) || []).length, 1, 'refresco = sustitución, jamás duplicado');
  // un project.md HUMANO (sin _Sustituye ni marcadores) es intocable
  writeFileSync(r.projectMd, '# mi proyecto\n\n## Propósito\nlo que yo diga\n');
  initConfig(join(T, 'openspec'));
  eq(readFileSync(r.projectMd, 'utf8'), '# mi proyecto\n\n## Propósito\nlo que yo diga\n', 'lo humano jamás se toca');
  // y un repo SIN nada detectable no inventa: config sin checks, como siempre
  const T2 = join(dirname(fileURLToPath(import.meta.url)), '.tmp-initdeep-vacio');
  rmSync(T2, { recursive: true, force: true }); mkdirSync(T2, { recursive: true });
  const r2 = initConfig(join(T2, 'openspec'));
  eq(JSON.parse(readFileSync(r2.cfgPath, 'utf8')).checks, undefined, 'sin deteccion => sin checks inventados');
  rmSync(T, { recursive: true, force: true }); rmSync(T2, { recursive: true, force: true });
});

await test('aiact (P3): informe de transparencia — modelos, aprobaciones humanas, archivos IA, gate', async () => {
  const { renderAiact } = await import('../lib/serving/aiact.mjs');
  const { mkdirSync, writeFileSync, rmSync } = await import('node:fs');
  const { join, dirname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const T = join(dirname(fileURLToPath(import.meta.url)), '.tmp-aiact');
  rmSync(T, { recursive: true, force: true });
  mkdirSync(plumbPath(T), { recursive: true });
  mkdirSync(join(T, 'specs', 'counter'), { recursive: true });
  writeFileSync(join(T, 'specs', 'counter', 'spec.md'), '## ADDED Requirements');
  writeFileSync(plumbPath(T, 'timeline.json'), JSON.stringify({
    request: 'add counter', verdict: 'GREEN',
    approvals: [{ phase: 'apply', at: '2026-06-11T10:00:00Z', via: 'human-web' }],
    phases: [
      { phase: 'spec', model: 'qwen36-msc1', provider: 'byok', ok: true },
      { phase: 'apply', model: 'claude-haiku-4.5', provider: 'copilot', files: [{ p: 'src/c.js', k: 'create' }], tokens: { in: 1000, out: 100 }, ok: true },
      { phase: 'verify', model: 'qwen36-msc1', provider: 'byok', lenses: ['correctness', 'security', 'tests'], ok: true },
    ],
  }));
  writeFileSync(join(T, 'provenance.json'), JSON.stringify({ algo: 'ed25519', sealed_at: '2026-06-11T10:05:00Z' }));
  const html = renderAiact(T);
  for (const frag of ['qwen36-msc1', 'claude-haiku-4.5', 'aprobada por <b>una persona</b>', 'src/c.js', 'PASS (deterministic gate', 'ed25519', 'sha256', 'no constituye asesoramiento legal'])
    assert(html.includes(frag), 'el informe debe incluir: ' + frag);
  // SDD-first: la pastilla dice DE QUIÉN es el veredicto (del run, no del AI Act), la tabla enseña el
  // papel de cada agente, y el documento NO se autoexplica (la didáctica vive en /help del panel)
  assert(html.includes('veredicto del run (SDD)'), 'la pastilla GREEN queda atribuida al run SDD, no al AI Act');
  assert(html.includes('<th>papel</th>'), 'columna papel: el equipo de agentes es visible por fase');
  assert(!html.includes('En corto'), 'el entregable abre con datos — la guía está en /help, no dentro del documento');
  rmSync(T, { recursive: true, force: true });
});

await test('bundle: sin imports dinámicos relativos residuales (la clase de bug que rompió aiact)', async () => {
  const { readFileSync, existsSync } = await import('node:fs');
  const { join, dirname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'conductor.mjs');
  if (!existsSync(dist)) return; // build aún no ejecutado en este entorno
  const src = readFileSync(dist, 'utf8');
  const bad = src.match(/await import\((['"`])\.\.?\//);
  assert(!bad, 'el bundle contiene un import dinámico relativo (no lo reescribe el bundler): convertirlo a import estático');
});
