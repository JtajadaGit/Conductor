// Tests del PRECIO REAL BYOK (cost.mjs precios en vivo + serve.fetchByokPrices + stats.unpriced):
// la verdad económica sale del proxy del usuario, no de una tabla; lo desconocido se DECLARA, no se inventa 0.
import { createServer } from 'node:http';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { priceOf, setLivePrices, loadLivePrices } from '../lib/core/cost.mjs';
import { aggregateStats } from '../lib/core/stats.mjs';
import { fetchByokPrices } from '../lib/serving/serve.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

await test('pricing: setLivePrices manda sobre la tabla; known marca lo conocido; gratis≠desconocido; basura fuera', () => {
  setLivePrices({ 'glm-5.2': { in: 0.6, out: 2.2 }, 'qwen-free': { in: 0, out: 0 }, 'roto': { in: 'x', out: 1 } });
  eq(priceOf('glm-5.2'), { in: 0.6, out: 2.2, tier: 'byok', known: true }, 'precio en vivo con tier byok');
  eq(priceOf('GLM_5.2').known, true, 'normalización mayúsculas/punto/guion/underscore');
  eq(priceOf('qwen-free'), { in: 0, out: 0, tier: 'byok', known: true }, 'un modelo GRATIS de verdad es conocido, no "desconocido"');
  eq(priceOf('roto').known, false, 'precio no numérico se descarta (queda desconocido)');
  eq(priceOf('claude-sonnet-4-6').in, 3, 'la tabla estática sigue cubriendo el catálogo Copilot');
  eq(priceOf('claude-sonnet-4-6').known, true);
  eq(priceOf('modelo-fantasma'), { in: 0, out: 0, known: false }, 'desconocido = 0 MARCADO, jamás 0 mudo');
  setLivePrices({}); // limpiar para no contaminar otros tests de la suite
});

await test('pricing: loadLivePrices lee la cache de ~/.conductor (sembrada por byok login/panel) — el driver hijo hereda el precio real', () => {
  const home = join(HERE, '.tmp-pricing-home');
  rmSync(home, { recursive: true, force: true }); mkdirSync(home, { recursive: true });
  writeFileSync(join(home, 'models-cache.json'), JSON.stringify({ version: 1, byok: { models: ['deepseek-v4-pro'], prices: { 'deepseek-v4-pro': { in: 1.1, out: 3.3 } } } }));
  const prev = process.env.CONDUCTOR_HOME;
  process.env.CONDUCTOR_HOME = home;
  try {
    loadLivePrices(true);
    eq(priceOf('deepseek-v4-pro'), { in: 1.1, out: 3.3, tier: 'byok', known: true }, 'precio real desde la cache');
  } finally {
    if (prev === undefined) delete process.env.CONDUCTOR_HOME; else process.env.CONDUCTOR_HOME = prev;
    loadLivePrices(true); // re-hermetiza el estado del módulo con el HOME de la suite
    rmSync(home, { recursive: true, force: true });
  }
});

await test('pricing: fetchByokPrices lee el endpoint de info del proxy ($/token → $/1M) y devuelve null si no lo expone', async () => {
  let authSeen = null;
  const srv = createServer((req, res) => {
    if (req.url === '/model/info') {
      authSeen = req.headers.authorization;
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ data: [
        { model_name: 'glm-5.2', model_info: { input_cost_per_token: 0.0000006, output_cost_per_token: 0.0000022 } },
        { model_name: 'sin-precio', model_info: {} },
      ] }));
    }
    res.writeHead(404); res.end('{}');
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}/v1`;
  try {
    const p = await fetchByokPrices(base, 'k-test');
    eq(p, { 'glm-5.2': { in: 0.6, out: 2.2 } }, 'conversión $/token → $/1M; el modelo sin datos queda fuera');
    eq(authSeen, 'Bearer k-test', 'la key viaja como Bearer (mismo esquema que /v1/models)');
  } finally { await new Promise((r) => srv.close(r)); }
  const none = await fetchByokPrices('http://127.0.0.1:1/v1', 'k'); // puerto muerto → null limpio
  eq(none, null, 'proxy sin endpoint de precios → null (los modelos quedan "desconocido", no 0)');
});

await test('pricing: stats declara las fases con modelo sin precio (unpriced) — el total nunca finge completitud', () => {
  const root = join(HERE, '.tmp-pricing-proj');
  rmSync(root, { recursive: true, force: true });
  const mkTl = (name, model) => {
    const d = join(root, 'openspec', 'changes', name, '.conductor');
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, 'timeline.json'), JSON.stringify({ verdict: 'GREEN', phases: [{ phase: 'apply', model, provider: 'byok', tokens: { in: 10, out: 10 } }] }));
  };
  mkTl('con-precio', 'claude-sonnet-4-6'); // tabla → conocido
  mkTl('sin-precio', 'modelo-fantasma');   // ni tabla ni vivo → unpriced
  const r = aggregateStats([{ root }]);
  eq(r.unpriced, 1, 'exactamente la fase del modelo fantasma');
  rmSync(root, { recursive: true, force: true });
});
