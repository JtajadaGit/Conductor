import { renderDashboard } from '../lib/serving/dashboard.mjs';

await test('dashboard: renderiza el timeline del run (fase × modelo × duración)', () => {
  const html = renderDashboard({
    change: 'openspec/changes/x',
    gates: [],
    timeline: { verdict: 'GREEN', phases: [
      { phase: 'spec', role: 'planner', model: 'qwen36-msc1', files: [], attempts: 1, ms: 1200, ok: true },
      { phase: 'apply', role: 'coder', model: 'qwen36-msc2', files: ['src/a.ts', 'src/a.spec.ts'], attempts: 1, ms: 5400, ok: true },
    ] },
  });
  assert(/Timeline del run/.test(html), 'incluye la sección de timeline');
  assert(/qwen36-msc2/.test(html), 'muestra el modelo por fase');
  assert(/5\.4s/.test(html), 'muestra la duración de la fase');
});

await test('dashboard: sin timeline no rompe (compatibilidad)', () => {
  const html = renderDashboard({ change: 'x', gates: [] });
  assert(!/Timeline del run/.test(html), 'sin timeline → sin sección');
});

await test('dashboard (R-T3): suma los tokens cacheados y muestra la tarjeta "Caché de prefijo"', () => {
  const html = renderDashboard({
    change: 'x', gates: [],
    timeline: { verdict: 'GREEN', phases: [
      { phase: 'spec', role: 'planner', model: 'm', files: [], attempts: 1, ms: 1000, ok: true, tokens: { in: 100, out: 20, cached: 800 } },
      { phase: 'apply', role: 'coder', model: 'm', files: ['a.js'], attempts: 1, ms: 2000, ok: true, tokens: { in: 200, out: 40, cached: 1200 } },
    ] },
  });
  assert(/Caché de prefijo/.test(html), 'muestra la tarjeta de caché de prefijo cuando hay tokens cacheados');
  assert(/2k tok/.test(html), 'suma cached (800+1200=2000 → 2k)');
  assert(/↺/.test(html), 'el símbolo de caché aparece en la columna de tokens del timeline');
});

await test('dashboard (R-T3): sin tokens cacheados NO muestra la tarjeta de caché (cero ruido)', () => {
  const html = renderDashboard({
    change: 'x', gates: [],
    timeline: { verdict: 'GREEN', phases: [{ phase: 'spec', role: 'planner', model: 'm', files: [], attempts: 1, ms: 1000, ok: true, tokens: { in: 100, out: 20 } }] },
  });
  assert(!/Caché de prefijo/.test(html), 'sin cached → sin tarjeta');
});
