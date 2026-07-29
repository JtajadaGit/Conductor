import { initConfig, CONFIG_SCHEMA } from '../lib/analysis/scaffold.mjs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rmSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';

const TMP = join(dirname(fileURLToPath(import.meta.url)), '.tmp-scaffold');
rmSync(TMP, { recursive: true, force: true });

await test('scaffold: crea conductor.json + schema + .copilotignore; NUNCA pisa lo del usuario', () => {
  const OS = join(TMP, 'openspec'); // openspecDir realista → .copilotignore va al root (padre de openspec/)
  const r = initConfig(OS);
  assert(r.created && existsSync(r.cfgPath), 'config creada');
  // init v2 (2026-07-29): el schema YA NO se escribe en el repo del usuario (era ruido git; la validación
  // real es del motor). En su lugar: árbol OpenSpec completo + project.md (contexto con consumidor real).
  assert(!existsSync(join(OS, 'conductor.schema.json')), 'SIN conductor.schema.json en el repo del usuario');
  assert(existsSync(r.projectMd), 'project.md creado (contexto editable del equipo)');
  assert(existsSync(join(OS, 'specs', 'README.md')), 'specs/ visible (fuente de verdad viva)');
  assert(existsSync(join(OS, 'changes', 'archive', '.gitkeep')), 'changes/archive/ visible');
  assert(/Propósito/.test(readFileSync(r.projectMd, 'utf8')), 'project.md trae las secciones guía');
  assert(/stack:/.test(readFileSync(r.ymlPath, 'utf8')), 'config.yaml con metadata detectada');
  assert(r.copilotignore && existsSync(join(TMP, '.copilotignore')), '.copilotignore creado en el root del proyecto');
  assert(/node_modules\//.test(readFileSync(join(TMP, '.copilotignore'), 'utf8')), '.copilotignore excluye node_modules (token-first)');
  const cfg = JSON.parse(readFileSync(r.cfgPath, 'utf8'));
  assert(!cfg.$schema, 'config SIN $schema colgante (no hay fichero al lado)');
  // el usuario edita su config y su .copilotignore → re-init NO los pisa (el schema sí se refresca)
  writeFileSync(r.cfgPath, JSON.stringify({ serve: false }));
  writeFileSync(join(TMP, '.copilotignore'), 'custom\n');
  writeFileSync(r.projectMd, '# mi contexto\n');
  const r2 = initConfig(OS);
  eq(r2.created, false); eq(r2.copilotignore, false, 'no re-crea .copilotignore');
  eq(JSON.parse(readFileSync(r.cfgPath, 'utf8')).serve, false, 'config del usuario intacta');
  eq(readFileSync(r.projectMd, 'utf8'), '# mi contexto\n', 'project.md del usuario INTACTO en re-init');
  eq(readFileSync(join(TMP, '.copilotignore'), 'utf8'), 'custom\n', '.copilotignore del usuario intacto');
  assert(CONFIG_SCHEMA.properties.models && CONFIG_SCHEMA.properties.mcp, 'schema cubre models/mcp');
});

rmSync(TMP, { recursive: true, force: true });

await test('aiact (P3): informe de transparencia — modelos, aprobaciones humanas, archivos IA, gate', async () => {
  const { renderAiact } = await import('../lib/serving/aiact.mjs');
  const { mkdirSync, writeFileSync, rmSync } = await import('node:fs');
  const { join, dirname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const T = join(dirname(fileURLToPath(import.meta.url)), '.tmp-aiact');
  rmSync(T, { recursive: true, force: true });
  mkdirSync(join(T, '.conductor'), { recursive: true });
  mkdirSync(join(T, 'specs', 'counter'), { recursive: true });
  writeFileSync(join(T, 'specs', 'counter', 'spec.md'), '## ADDED Requirements');
  writeFileSync(join(T, '.conductor', 'timeline.json'), JSON.stringify({
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
