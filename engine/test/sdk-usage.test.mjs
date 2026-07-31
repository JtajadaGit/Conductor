// sdk-usage.test.mjs — TOKENS DEL RUNNER SDK (recibo de cierre "session.shutdown").
// Con --runner sdk, el runtime de Copilot lo lanza el SDK, no el driver: nadie honra
// COPILOT_OTEL_FILE_EXPORTER_PATH y readTokens() no encuentra nada. Resultado medido en runtime real
// (2026-07-31): las 4 fases del run salían con tokens/model/provider en null, y con ellas se apagaban
// EN SILENCIO el presupuesto duro, stats, los AI credits y el MAPE del estimador — la app iba más rápida
// pero ciega al gasto. Este test fija las dos mitades del arreglo: la CONVERSIÓN del recibo y su CABLEADO
// hasta el timeline (incluida la rama de lentes, que agrega por su cuenta).
import { usageFromShutdown } from '../lib/pipeline/sdk-runner.mjs';
import { drive } from '../lib/pipeline/drive.mjs';
import { plumbPath } from '../lib/core/plumb.mjs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';

const TMP = join(dirname(fileURLToPath(import.meta.url)), '.tmp-sdkusage');
process.env.CONDUCTOR_CAPTURE = 'fs';
const fresh = () => { rmSync(TMP, { recursive: true, force: true }); mkdirSync(join(TMP, 'openspec'), { recursive: true }); };
const w = (p, c) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, c); };
const CH = (slug) => join(TMP, 'openspec', 'changes', slug);
const tlOf = (slug) => JSON.parse(readFileSync(plumbPath(CH(slug), 'timeline.json'), 'utf8'));

// agente falso del harness (escribe artefactos válidos) + el recibo que devolvería el runner sdk
const fakeAgent = (usageFor) => async ({ phase, writeTo, cwd }) => {
  const usage = usageFor(phase);
  if (phase === 'apply' || phase === 'fix') {
    w(join(cwd, 'src', 'c.js'), '// @conductor REQ-C\nexport const x=1;');
    w(join(cwd, 'src', 'c.test.js'), '// @conductor REQ-C\ntest("x",()=>{});');
    return { code: 0, ...(usage ? { usage } : {}) };
  }
  const content = {
    propose: '## Why\nx\n## What Changes\n- a\n## Impact\nx',
    spec: '## ADDED Requirements\n<!-- id: REQ-C -->\n### Requirement: C\nThe system SHALL c.\n#### Scenario: s\n- **GIVEN** a\n- **WHEN** b\n- **THEN** c',
  }[phase] || 'x';
  w(writeTo, content);
  return { code: 0, ...(usage ? { usage } : {}) };
};

await test('usageFromShutdown: recibo REAL medido en el sandbox → {in,out,cached,model}', () => {
  // capturado con @github/copilot-sdk contra el CLI real (prompt trivial): la forma es esta, no una inventada
  const real = {
    currentModel: 'claude-sonnet-5', totalApiDurationMs: 1395, totalNanoAiu: 4853900000,
    modelMetrics: { 'claude-sonnet-5': { usage: { inputTokens: 19400, outputTokens: 4, cacheReadTokens: 0, cacheWriteTokens: 19398, reasoningTokens: 0 }, requests: { count: 1, cost: 1 } } },
  };
  eq(usageFromShutdown(real), { in: 19400, out: 4, cached: 0, model: 'claude-sonnet-5' });
});

await test('usageFromShutdown: inputTokens INCLUYE la caché leída → in y cached quedan DISJUNTOS (no se cobra dos veces)', () => {
  // mismo convenio que el lector OTel de drive.mjs: in + cached = input total reportado
  const d = { currentModel: 'm', modelMetrics: { m: { usage: { inputTokens: 10000, outputTokens: 200, cacheReadTokens: 8000 } } } };
  eq(usageFromShutdown(d), { in: 2000, out: 200, cached: 8000, model: 'm' });
  // un proveedor que reportara cacheRead > input NO puede producir un `in` negativo (el coste se iría a menos)
  eq(usageFromShutdown({ modelMetrics: { a: { usage: { inputTokens: 100, cacheReadTokens: 500 } } } }), { in: 0, out: 0, cached: 500, model: 'a' });
});

await test('usageFromShutdown: suma varios modelos, elige el que gastó y NUNCA lanza con datos raros', () => {
  const d = { modelMetrics: { a: { usage: { inputTokens: 100, outputTokens: 10 } }, b: { usage: { inputTokens: 50, outputTokens: 5, cacheReadTokens: 20 } } } };
  eq(usageFromShutdown(d), { in: 130, out: 15, cached: 20, model: 'a' });
  for (const bad of [null, undefined, {}, 'texto', 42, { modelMetrics: null }, { modelMetrics: { a: {} } }, { modelMetrics: { a: { usage: { inputTokens: 'x' } } } }]) eq(usageFromShutdown(bad), null, `entrada rara → null (${JSON.stringify(bad)})`);
});

await test('drive: el recibo del runner llega al timeline SIN fichero OTel (el caso del runner sdk)', async () => {
  fresh();
  writeFileSync(join(TMP, 'openspec', 'conductor.json'), JSON.stringify({ maxRetries: 0, lenses: false }));
  const usage = { in: 1000, out: 200, cached: 50, model: 'modelo-del-recibo' };
  await drive({ changeDir: CH('recibo'), request: 'x', complexity: 'simple', domain: 'c', srcDir: TMP, runAgent: fakeAgent(() => usage) });
  const tl = tlOf('recibo');
  const apply = tl.phases.find((p) => p.phase === 'apply');
  eq(apply.tokens, { in: 1000, out: 200, cached: 50 }, 'tokens de la fase = los del recibo (antes: null)');
  eq(apply.modelReported, 'modelo-del-recibo', 'el modelo que REALMENTE ejecutó sale del recibo');
  assert(tl.phases.every((p) => p.tokens && p.tokens.in === 1000), 'todas las fases quedan contabilizadas, no solo la primera');
});

await test('drive: sin recibo se sigue leyendo el OTel — el runner spawn no cambia (cero regresión)', async () => {
  fresh();
  writeFileSync(join(TMP, 'openspec', 'conductor.json'), JSON.stringify({ maxRetries: 0, lenses: false }));
  await drive({ changeDir: CH('sinrecibo'), request: 'x', complexity: 'simple', domain: 'c', srcDir: TMP, runAgent: fakeAgent(() => null) });
  const apply = tlOf('sinrecibo').phases.find((p) => p.phase === 'apply');
  eq(apply.tokens, null, 'sin recibo y sin OTel → null, como siempre (no se inventan tokens)');
});

await test('drive: con lentes, verify SUMA el recibo de cada lente', async () => {
  fresh();
  writeFileSync(join(TMP, 'openspec', 'conductor.json'), JSON.stringify({ maxRetries: 0 })); // lentes por defecto
  let lenses = 0;
  const agent = fakeAgent((phase) => {
    if (String(phase).startsWith('verify:')) { lenses++; return { in: 100, out: 10, cached: 5, model: 'lente' }; }
    return { in: 1, out: 1, cached: 0, model: 'otro' };
  });
  await drive({ changeDir: CH('lentes'), request: 'x', complexity: 'simple', domain: 'c', srcDir: TMP, runAgent: agent });
  assert(lenses >= 2, `verify lanzó varias lentes en paralelo (fueron ${lenses})`);
  const verify = tlOf('lentes').phases.find((p) => p.phase === 'verify');
  eq(verify.tokens, { in: 100 * lenses, out: 10 * lenses, cached: 5 * lenses }, 'la suma de las lentes, no la de una sola');
});
