// Estimador estático de tokens por fase (Ola 1: preflight sin API).
import { estimateRun, tokensOf, budgetContextFiles, summarizeArtifact } from '../lib/core/estimate.mjs';

await test('estimate: tokensOf ≈ chars/4', () => {
  eq(tokensOf('abcd'.repeat(4)), 4); // 16 chars / 4
  eq(tokensOf(''), 0);
  eq(tokensOf(null), 0);
});

await test('estimate: nº de fases por complejidad + totales coherentes', () => {
  const micro = estimateRun({ complexity: 'micro', request: 'x' });
  eq(micro.phases.length, 1, 'micro = 1 fase (apply)');
  const cx = estimateRun({ complexity: 'complex', request: 'añade un componente con test' });
  eq(cx.phases.length, 8, 'complex = 8 fases');
  assert(cx.total === cx.totalIn + cx.totalOut, 'total = in + out');
  assert(cx.total > micro.total, 'complex estima más tokens que micro');
  assert(cx.phases.every((p) => p.estIn > 0 && p.estOut > 0), 'cada fase estima in/out > 0');
});

await test('estimate: el contexto se acumula (la entrada de fases tardías ≥ la de las primeras)', () => {
  const r = estimateRun({ complexity: 'medium', request: 'algo' });
  const first = r.phases[0].estIn, last = r.phases[r.phases.length - 1].estIn;
  assert(last >= first, 'el contexto acumulado hace crecer la entrada estimada');
});

await test('estimate: noRescanSaved estima el ahorro de entrada del no-rescan (fases derivadas)', () => {
  const micro = estimateRun({ complexity: 'micro', request: 'x' });
  eq(micro.noRescanSaved, 0, 'micro (solo apply) no tiene fases derivadas → 0');
  const cx = estimateRun({ complexity: 'complex', request: 'x' });
  assert(cx.noRescanSaved > 0, 'complex tiene fases de planner → ahorro estimado > 0');
  const simple = estimateRun({ complexity: 'simple', request: 'x' });
  assert(cx.noRescanSaved > simple.noRescanSaved, 'más fases derivadas → más ahorro estimado');
});

await test('budgetContextFiles: artefactos dentro del presupuesto se incluyen; los que exceden se resumen', () => {
  const small = 'x'.repeat(100); // ~25 tokens
  const big = 'x'.repeat(60000); // ~15000 tokens — excede presupuesto de 12000
  const artifacts = { 'spec.md': small, 'tasks.md': big, 'design.md': small };
  const b = budgetContextFiles(artifacts, 12000);
  assert(b.included.includes('spec.md'), 'spec (pequeño) incluido');
  assert(b.summarized.includes('tasks.md'), 'tasks (grande) resumido');
  assert(b.included.includes('design.md'), 'design (pequeño) incluido');
  assert(b.exceeds === true, 'flag exceeds = true cuando hay resumidos');
  assert(b.tokensUsed <= 12000, 'tokens respetan el presupuesto');
});

await test('budgetContextFiles: artefactos faltantes se ignoran; todos caben → exceeds false', () => {
  const b = budgetContextFiles({ 'spec.md': 'tiny', 'tasks.md': 'also tiny' });
  assert(b.included.length >= 1, 'al menos spec.md incluido');
  assert(b.exceeds === false, 'sin resumidos → exceeds false');
  assert(b.summarized.length === 0, 'sin resumidos');
});

await test('budgetContextFiles: artefactos desconocidos (fuera de la lista de prioridad) se ignoran', () => {
  const b = budgetContextFiles({ 'unknown.md': 'content', 'spec.md': 'spec' });
  assert(b.included.includes('spec.md'), 'spec conocido incluido');
  assert(!b.included.includes('unknown.md'), 'desconocido ignorado');
});

await test('summarizeArtifact: extrae solo H2/H3 y comentarios HTML, ignora prosa', () => {
  const content = `# Title\n## Section 1\nProsa que NO debe salir.\n### Sub-sección\nMás prosa.\n<!-- id: REQ-X -->\nNo prosa.\n## Section 2\nTexto ignorado.`;
  const summary = summarizeArtifact(content);
  assert(summary.includes('## Section 1'), 'H2 incluido');
  assert(summary.includes('### Sub-sección'), 'H3 incluido');
  assert(summary.includes('<!-- id: REQ-X -->'), 'comentario HTML incluido');
  assert(!summary.includes('Prosa que NO debe salir'), 'prosa excluida');
  assert(!summary.includes('Texto ignorado'), 'prosa excluida');
  assert(summary.length < content.length, 'resumen más corto que original');
});

await test('summarizeArtifact: contenido vacío o null → cadena vacía o solo vacíos', () => {
  assert(typeof summarizeArtifact(null) === 'string', 'null → string');
  assert(typeof summarizeArtifact('') === 'string', 'vacío → string');
});
