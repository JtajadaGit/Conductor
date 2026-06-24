// atlas.test.mjs — P3: índice de conocimiento del proyecto (commit-eable, determinista, sin aprendizaje cross-run).
import { buildAtlas, renderAtlas } from '../lib/analysis/atlas.mjs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';

const TMP = join(dirname(fileURLToPath(import.meta.url)), '.tmp-atlas');
const w = (rel, c) => { const p = join(TMP, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, c); };

await test('atlas: compone stack + capacidades de la spec viva + historial de cambios', () => {
  rmSync(TMP, { recursive: true, force: true }); mkdirSync(TMP, { recursive: true });
  w('package.json', JSON.stringify({ name: 'demo', scripts: { test: 'node --test' }, dependencies: {} }));
  w('openspec/specs/auth/spec.md', '## ADDED Requirements\n<!-- id: REQ-LOGIN -->\n### Requirement: Login con OAuth\nThe system SHALL log in.\n#### Scenario: ok\n- **GIVEN** a\n- **WHEN** b\n- **THEN** c');
  w('openspec/changes/archive/2026-01-02-cupon-descuento/.conductor/timeline.json', JSON.stringify({ verdict: 'GREEN', request: 'aplicar cupón de descuento', phases: [{ phase: 'spec' }, { phase: 'verify' }] }));
  const a = buildAtlas(TMP);
  assert(a.capabilities.some((c) => c.name === 'Login con OAuth' && c.id === 'REQ-LOGIN' && c.domain === 'auth'), 'capacidad leída de la spec viva, con id y dominio');
  assert(a.changes.some((c) => c.name === 'cupon-descuento' && c.date === '2026-01-02'), 'cambio archivado en el historial, con fecha');
  assert(a.stack && (a.stack.languages.length || a.stack.frameworks.length || a.stack.summary), 'detecta algún stack');
  assert(/# Atlas del proyecto/.test(a.markdown) && /## Capacidades/.test(a.markdown) && /Login con OAuth/.test(a.markdown), 'markdown commit-eable con las secciones');
  rmSync(TMP, { recursive: true, force: true });
});

await test('atlas: proyecto vacío no rompe (secciones con placeholders honestos)', () => {
  rmSync(TMP, { recursive: true, force: true }); mkdirSync(TMP, { recursive: true });
  const a = buildAtlas(TMP);
  eq(a.capabilities.length, 0);
  eq(a.changes.length, 0);
  assert(/sin specs promovidas/.test(a.markdown) && /sin cambios archivados/.test(a.markdown), 'placeholders honestos, no inventa');
  rmSync(TMP, { recursive: true, force: true });
});

await test('atlas: renderAtlas es puro (mismos datos → mismo markdown, determinista)', () => {
  const data = { stack: { languages: ['js'], frameworks: [], testCmd: 'npm test', entrypoints: [], summary: 'Node.js' }, capabilities: [{ domain: 'core', name: 'X', id: 'REQ-X', scenarios: 2 }], changes: [] };
  eq(renderAtlas(data), renderAtlas(data), 'determinista');
  assert(/REQ-X/.test(renderAtlas(data)) && /npm test/.test(renderAtlas(data)));
});
