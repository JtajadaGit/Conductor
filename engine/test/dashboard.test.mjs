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
