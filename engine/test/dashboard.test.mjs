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

await test('dashboard: run simple (sin fase tasks) => columna task "—" y la fila NO se pinta como hueco', () => {
  const trace = { matrix: [{ id: 'REQ-A', name: 'a', scenarios: [], cov: { task: false, code: true, test: true } }], gaps: [] };
  const tlSimple = { verdict: 'GREEN', phases: [{ phase: 'apply', role: 'coder', model: 'm', files: [], attempts: 1, ms: 1000, ok: true }] };
  const html = renderDashboard({ change: 'x', gates: [], trace, timeline: tlSimple });
  assert(/no aplica/.test(html), 'la celda task declara que no aplica (title) en vez de un ✗ acusador');
  assert(!/<tr class="gap"><td><code>REQ-A/.test(html), 'code+test cubiertos => fila SIN clase gap (la task es informativa, como en trace.mjs)');
  assert(/task no aplica: run sin fase de tasks/.test(html), 'el subtítulo del linaje explica por qué la columna va vacía');
  // el MISMO trace con la fase tasks corrida => el ✗ de task vuelve (ahí sí es información), pero sigue sin ser hueco
  const tlConTasks = { verdict: 'GREEN', phases: [{ phase: 'tasks', ok: true }, ...tlSimple.phases] };
  const html2 = renderDashboard({ change: 'x', gates: [], trace, timeline: tlConTasks });
  assert(/tick n/.test(html2), 'con fase tasks, la celda task pinta el ✗ real');
  assert(!/<tr class="gap"><td><code>REQ-A/.test(html2), 'aun así, sin hueco: gap = code+test, jamás la task');
});

await test('dashboard: iconos SVG del sistema, cero emojis (toggle sol/luna, tarjetas sin pictogramas)', () => {
  const html = renderDashboard({
    change: 'x', gates: [],
    timeline: { verdict: 'GREEN', approvals: [{ phase: 'spec' }], phases: [{ phase: 'spec', ok: true, ms: 1000, attempts: 1, files: [], lenses: ['a', 'b'] }] },
  });
  assert(/tg-sun/.test(html) && /tg-moon/.test(html), 'el toggle de tema es el sol/luna SVG de la SPA');
  assert(!/[\u{1F300}-\u{1FAFF}]|◐/u.test(html), 'ni emojis ni el glifo ◐ en el informe (el sistema es de iconos de trazo)');
});

await test('dashboard (R-T3): sin tokens cacheados NO muestra la tarjeta de caché (cero ruido)', () => {
  const html = renderDashboard({
    change: 'x', gates: [],
    timeline: { verdict: 'GREEN', phases: [{ phase: 'spec', role: 'planner', model: 'm', files: [], attempts: 1, ms: 1000, ok: true, tokens: { in: 100, out: 20 } }] },
  });
  assert(!/Caché de prefijo/.test(html), 'sin cached → sin tarjeta');
});
