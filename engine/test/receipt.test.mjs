// Tests del RECIBO DE PR (lib/serving/dashboard.mjs → renderReceipt): markdown determinista para pegar
// en la descripción del PR — requisitos, ficheros, verificación, coste. Pura (datos → markdown), sin FS.
import { renderReceipt } from '../lib/serving/dashboard.mjs';

await test('receipt: markdown completo desde timeline+artefactos (título, requisitos, ficheros, verificación, byok)', () => {
  const timeline = {
    verdict: 'GREEN', request: 'añade contador', total_ms: 65000,
    phases: [
      { phase: 'spec', model: 'qwen-x', provider: 'byok', tokens: { in: 1000, out: 200 }, ms: 5000 },
      { phase: 'apply', model: 'sonnet-y', provider: 'copilot', tokens: { in: 4000, out: 900 }, ms: 60000, files: [{ p: 'src/c.js', k: 'create' }, 'src/c.test.js'] },
    ],
  };
  const spec = '<!-- id: REQ-COUNTER -->\n### Requirement: Counter\nThe system SHALL count.';
  const proposal = '## Why\nx\n## What Changes\n- añade contador\n- añade test\n## Impact\ny';
  const verify = '## Verdict\nPASS — sin fallos';
  const md = renderReceipt({ name: 'contador', timeline, spec, proposal, verify });
  assert(md.includes('## ✔ contador'), 'título con el nombre del change');
  assert(md.includes('GREEN') && md.includes('2 fase(s)'), 'resultado con verdict y fases: ' + md.split('\n')[2]);
  assert(md.includes('`REQ-COUNTER`') && md.includes('Counter'), 'requisito con id y nombre');
  assert(md.includes('src/c.js') && md.includes('src/c.test.js'), 'ficheros en ambas formas (objeto y string)');
  assert(md.includes('- añade contador'), 'sección Qué cambia desde la proposal');
  assert(/verify\): PASS/.test(md), 'verdict del reviewer visible');
  assert(md.includes('1 fase(s) a 0 créditos'), 'las fases byok (0 AIC) se destacan');
  assert(md.includes('spec=qwen-x') && md.includes('apply=sonnet-y'), 'modelo por fase (procedencia)');
});

await test('receipt: sin timeline o sin fases → null (el endpoint responde 404, nunca un recibo vacío engañoso)', () => {
  eq(renderReceipt({ name: 'x', timeline: null }), null);
  eq(renderReceipt({ name: 'x', timeline: { phases: [] } }), null);
  eq(renderReceipt({}), null);
});

await test('receipt: robusto ante timeline mínimo (sin request/proposal/verify/ficheros) — secciones opcionales fuera', () => {
  const md = renderReceipt({ name: 'min', timeline: { verdict: 'GREEN', phases: [{ phase: 'apply', tokens: { in: 10, out: 5 } }] } });
  assert(md.includes('## ✔ min'), 'título presente');
  assert(!md.includes('### Qué cambia') && !md.includes('### Requisitos') && !md.includes('### Ficheros'), 'sin datos → sin secciones vacías');
  assert(md.includes('### Verificación'), 'la verificación siempre presente');
});
