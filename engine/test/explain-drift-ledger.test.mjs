import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync, readFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { explain, renderSpec, renderTasks } from '../lib/analysis/explain.mjs';
import { detectDrift } from '../lib/contract/drift.mjs';
import * as L from '../lib/provenance/ledger.mjs';
import { seal } from '../lib/provenance/provenance.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const XS = join(HERE, 'fixtures', 'xstack');
const TMP = join(HERE, '.tmp');
mkdirSync(TMP, { recursive: true });

await test('explain: extrae capacidades multi-stack del xstack', () => {
  const r = explain(XS);
  assert(r.capabilities.length >= 1, 'al menos una capacidad');
  const units = r.capabilities.flatMap((c) => c.units);
  assert(units.some((u) => /Order/i.test(u)), 'detecta unidades Order (clases multi-lenguaje)');
  const spec = renderSpec(r.capabilities);
  assert(/## ADDED Requirements/.test(spec) && /### Requirement:/.test(spec), 'genera spec delta');
  assert(/<!-- id: REQ-/.test(spec), 'genera ids de requisito');
  assert(/- \[ \] /.test(renderTasks(r.capabilities)), 'genera tasks');
});

await test('explain: deriva OpenAPI si hay endpoints', () => {
  const dir = join(TMP, 'api'); mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'routes.js'), "app.get('/orders', h); router.post('/orders', h); app.delete('/orders/:id', h);");
  const r = explain(dir);
  assert(r.openapi && r.openapi.paths['/orders'], 'openapi con /orders');
  assert(r.openapi.paths['/orders'].get && r.openapi.paths['/orders'].post, 'métodos get+post');
});

await test('drift: requisito sin código → error', () => {
  const change = join(TMP, 'change'); mkdirSync(change, { recursive: true });
  writeFileSync(join(change, 'spec.md'), '## ADDED Requirements\n<!-- id: REQ-X -->\n### Requirement: X\n#### Scenario: s\n- **GIVEN** a\n');
  writeFileSync(join(change, 'tasks.md'), '- [x] 1.1 [REQ-X] do x\n');
  const empty = join(TMP, 'emptysrc'); mkdirSync(empty, { recursive: true });
  const r = detectDrift(change, empty);
  assert(r.findings.some((f) => f.rule === 'drift.requirement-unimplemented' && f.severity === 'error'));
});

await test('drift: superficie sin trazar → warning', () => {
  const change = join(TMP, 'change2'); mkdirSync(change, { recursive: true });
  writeFileSync(join(change, 'spec.md'), '## ADDED Requirements\n<!-- id: REQ-Y -->\n### Requirement: Y\n#### Scenario: s\n- **GIVEN** a\n');
  const src = join(TMP, 'src2'); mkdirSync(src, { recursive: true });
  writeFileSync(join(src, 'a.js'), 'export const a=1;');
  writeFileSync(join(src, 'b.js'), 'export const b=2;');
  const r = detectDrift(change, src);
  assert(r.findings.some((f) => f.rule === 'drift.untracked-surface'));
});

await test('ledger: cadena hash, append y verify', () => {
  const path = join(TMP, 'led.jsonl'); if (existsSync(path)) rmSync(path);
  const s1 = seal({ change: 'c1', gates: [{ name: 'g', findings: [] }], at: 'T1', key: 'k' });
  const s2 = seal({ change: 'c2', gates: [{ name: 'g', findings: [] }], at: 'T2', key: 'k' });
  const e1 = L.append(path, s1); const e2 = L.append(path, s2);
  eq(e1.seq, 0); eq(e2.seq, 1); eq(e2.prev, e1.hash);
  assert(L.verifyChain(path).ok, 'cadena íntegra');
});

await test('ledger: manipulación rompe la cadena', () => {
  const path = join(TMP, 'led2.jsonl'); if (existsSync(path)) rmSync(path);
  L.append(path, seal({ change: 'c1', gates: [{ name: 'g', findings: [] }], at: 'T1', key: 'k' }));
  L.append(path, seal({ change: 'c2', gates: [{ name: 'g', findings: [] }], at: 'T2', key: 'k' }));
  // manipula la primera entrada
  const lines = readFileSync(path, 'utf8').split(/\r?\n/).filter(Boolean);
  const e0 = JSON.parse(lines[0]); e0.verdict = 'HACK';
  writeFileSync(path, [JSON.stringify(e0), lines[1]].join('\n') + '\n');
  const r = L.verifyChain(path);
  assert(!r.ok && r.brokenAt === 0, 'detecta rotura en entrada 0');
});
