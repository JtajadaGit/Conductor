// Tests del sdk-runner con el SDK MOCKEADO (offline). El e2e real vive en el sandbox sdk-spike.
import { createSdkRunner } from '../lib/pipeline/sdk-runner.mjs';

function mockSdk(record) {
 // ESPEJO del SDK real (v1.0, verificado en runtime el método de cierre es disconnect —
  // destroy() NO EXISTE — y al cerrar se emite "session.shutdown" con el usage. El mock anterior exponía
  // destroy(), así que la suite daba por bueno un `session.destroy?.()` que en producción era un no-op.
  class MockSession {
    constructor(cfg) { this.cfg = cfg; this.handlers = []; }
    on(h) { this.handlers.push(h); return () => { this.handlers = this.handlers.filter((x) => x !== h); }; }
    async sendAndWait({ prompt }, timeout) { record.prompts.push(prompt); record.timeouts = [...(record.timeouts || []), timeout]; if (record.hang) return new Promise(() => {}); return { data: { content: 'OK:' + (this.cfg.model || 'default') } }; }
    async disconnect() { record.disconnected++; const data = record.shutdown || { modelMetrics: {} }; for (const h of this.handlers) h({ type: 'session.shutdown', data }); }
  }
  class MockClient {
    constructor(opts) { record.clientOpts = opts; }
    async createSession(cfg) { record.sessions.push(cfg); return new MockSession(cfg); }
    async stop() { record.stopped = true; }
  }
  return { CopilotClient: MockClient, RuntimeConnection: { forStdio: (o) => ({ kind: 'stdio', ...o }) }, approveAll: () => ({ kind: 'approve' }) };
}

await test('sdk-runner: crea sesión POR FASE con modelo y provider BYOK (/v1) correctos', async () => {
  const rec = { sessions: [], prompts: [], disconnected: 0 };
  const env = { COPILOT_PROVIDER_BASE_URL: 'https://litellm.example.com/', COPILOT_PROVIDER_API_KEY: 'sk-test' };
  const run = await createSdkRunner({ projectRoot: 'C:/proj', sdk: mockSdk(rec), env });
  const r1 = await run({ prompt: 'p1', model: 'fast-m', timeoutMs: 5000 });
  const r2 = await run({ prompt: 'p2', model: 'strong-m', timeoutMs: 5000 });
  eq(r1.code, 0); eq(r1.out, 'OK:fast-m');
  eq(r2.out, 'OK:strong-m', 'modelo por fase respetado');
  eq(rec.sessions.length, 2, 'una sesión por fase');
  eq(rec.sessions[0].provider, { type: 'openai', baseUrl: 'https://litellm.example.com/v1', apiKey: 'sk-test' }, 'provider BYOK por sesión con /v1');
  assert(typeof rec.sessions[0].onPermissionRequest === 'function', 'auto-aprobación de tools (equivalente --allow-all-tools)');
  eq(rec.clientOpts.workingDirectory, 'C:/proj');
  eq(rec.prompts, ['p1', 'p2']);
  eq(rec.timeouts, [5000, 5000], 'el timeout de fase se pasa a sendAndWait (su default interno es 60s)');
  eq(rec.disconnected, 2, 'sesiones CERRADAS tras cada fase — con disconnect(), el único método que existe');
  await run.close();
  eq(rec.stopped, true, 'close() para el cliente');
});

await test('sdk-runner: el recibo de cierre (session.shutdown) vuelve como usage — sin él la fase iba a tokens null', async () => {
  const rec = { sessions: [], prompts: [], disconnected: 0 };
 // forma REAL medida en el sandbox contra el CLI
  rec.shutdown = { currentModel: 'claude-sonnet-5', modelMetrics: { 'claude-sonnet-5': { usage: { inputTokens: 19400, outputTokens: 4, cacheReadTokens: 0, cacheWriteTokens: 19398 }, requests: { count: 1, cost: 1 } } } };
  const run = await createSdkRunner({ sdk: mockSdk(rec), env: {} });
  const r = await run({ prompt: 'x', timeoutMs: 5000 });
  eq(r.usage, { in: 19400, out: 4, cached: 0, model: 'claude-sonnet-5' }, 'tokens y modelo REAL de la fase');
  await run.close();
});

await test('sdk-runner: una fase que TIMEOUT también devuelve su usage (los tokens gastados se cobran igual)', async () => {
  const rec = { sessions: [], prompts: [], disconnected: 0, hang: true };
  rec.shutdown = { currentModel: 'm', modelMetrics: { m: { usage: { inputTokens: 500, outputTokens: 0 } } } };
  const run = await createSdkRunner({ sdk: mockSdk(rec), env: {} });
  const r = await run({ prompt: 'x', timeoutMs: 50 });
  eq(r.code, -1, 'la fase falla');
  eq(r.usage, { in: 500, out: 0, cached: 0, model: 'm' }, 'pero su gasto NO se pierde (presupuesto duro y coste del run cuadran)');
  eq(rec.disconnected, 1, 'la sesión se cierra aunque la fase se caiga (antes quedaba viva hasta el final del run)');
  await run.close();
});

await test('sdk-runner: mezcla por fase — "copilot:<m>" va SIN provider (catálogo Business), "byok:<m>" con provider', async () => {
  const rec = { sessions: [], prompts: [], disconnected: 0 };
  const env = { COPILOT_PROVIDER_BASE_URL: 'https://litellm.example.com/', COPILOT_PROVIDER_API_KEY: 'sk-test' };
  const run = await createSdkRunner({ sdk: mockSdk(rec), env });
  await run({ prompt: 'a', model: 'copilot:claude-sonnet-4.6', timeoutMs: 5000 });
  await run({ prompt: 'b', model: 'byok:qwen36-msc1', timeoutMs: 5000 });
  eq(rec.sessions[0].model, 'claude-sonnet-4.6'); eq(rec.sessions[0].provider, undefined, 'copilot: → sesión sin provider (Business)');
  eq(rec.sessions[1].model, 'qwen36-msc1'); eq(rec.sessions[1].provider?.type, 'openai', 'byok: → provider LiteLLM');
  await run.close();
});

await test('sdk-runner: COPILOT_CLI_PATH → opción cliPath (runtime del usuario, sin los 557MB)', async () => {
  const rec = { sessions: [], prompts: [], disconnected: 0 };
  const run = await createSdkRunner({ sdk: mockSdk(rec), env: { COPILOT_CLI_PATH: 'C:/npm-global/node_modules/@github/copilot/index.js' } });
  await run({ prompt: 'x', timeoutMs: 5000 });
  eq(rec.clientOpts.connection, { kind: 'stdio', path: 'C:/npm-global/node_modules/@github/copilot/index.js' }, 'connection forStdio al runtime del usuario');
  await run.close();
});

await test('sdk-runner: carga el SDK EMPAQUETADO (assets/copilot-sdk.mjs) desde una ruta de fichero', async () => {
  const { writeFileSync, mkdirSync, rmSync } = await import('node:fs');
  const { join, dirname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const TMP = join(dirname(fileURLToPath(import.meta.url)), '.tmp-sdkbundle');
  rmSync(TMP, { recursive: true, force: true }); mkdirSync(TMP, { recursive: true });
  const bundle = join(TMP, 'copilot-sdk.mjs');
  writeFileSync(bundle, `
    export class CopilotClient { constructor(o){ globalThis.__bundleOpts = o; } async createSession(c){ return { sendAndWait: async()=>({data:{content:'BUNDLED'}}), disconnect: async()=>{} }; } async stop(){} }
    export const RuntimeConnection = { forStdio: (o) => ({ kind: 'stdio', ...o }) }; export const approveAll = () => ({kind:'approve'});
  `);
  const run = await createSdkRunner({ sdkBundle: bundle, env: { COPILOT_CLI_PATH: 'C:/cli.js' } });
  const r = await run({ prompt: 'x', timeoutMs: 5000 });
  eq(r.out, 'BUNDLED', 'el runner usa el SDK del bundle');
  eq(globalThis.__bundleOpts.connection, { kind: 'stdio', path: 'C:/cli.js' }, 'runtime del usuario inyectado al cliente del bundle');
  await run.close();
  rmSync(TMP, { recursive: true, force: true });
});

await test('sdk-runner: timeout duro → code -1 con mensaje claro (nunca cuelga)', async () => {
  const rec = { sessions: [], prompts: [], disconnected: 0, hang: true };
  const run = await createSdkRunner({ sdk: mockSdk(rec), env: {} });
  const r = await run({ prompt: 'x', timeoutMs: 50 });
  eq(r.code, -1); assert(/timeout/.test(r.err), 'mensaje de timeout');
  await run.close();
});

await test('sdk-runner: sin @github/copilot-sdk instalado → error claro (el driver cae a spawn)', async () => {
  let msg = '';
  try { await createSdkRunner({}); } catch (e) { msg = e.message; }
  assert(/copilot-sdk no está instalado/.test(msg), `mensaje accionable: ${msg}`);
});

await test('catalogo: pickHighestVersionDir compara semver numerico (1.0.100 > 1.0.70 > 1.0.9) y filtra basura', async () => {
  const { pickHighestVersionDir } = await import('../lib/pipeline/sdk-runner.mjs');
  eq(pickHighestVersionDir(['1.0.64', '1.0.70', '1.0.9']), '1.0.70', 'numerico, no lexicografico');
  eq(pickHighestVersionDir(['1.0.70', '1.0.100']), '1.0.100', 'tramo de 3 digitos gana');
  eq(pickHighestVersionDir(['temp', '.DS_Store']), null, 'sin versiones => null');
  eq(pickHighestVersionDir([]), null);
});

await test('catalogo: el SDK del CLI AUTO-ACTUALIZADO tiene prioridad (bug 7-vs-21: el sdk viejo del npm filtraba modelos nuevos)', async () => {
  const { readFileSync } = await import('node:fs');
  const { join, dirname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'lib', 'pipeline', 'sdk-runner.mjs'), 'utf8');
  assert(/autoUpdatedSdkEntry/.test(src) && /cand\.unshift\(auto\)/.test(src), 'el candidato auto-actualizado va PRIMERO en la resolucion del catalogo');
});

await test('catalogo: metadata VIVA — getAvailableModels (la ficha del SEAT) manda; las constantes son solo red', async () => {
  const { readFileSync } = await import('node:fs');
  const { join, dirname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'lib', 'pipeline', 'sdk-runner.mjs'), 'utf8');
  const iFn = src.indexOf("if(typeof m.getAvailableModels==='function'){");
  const iConst = src.indexOf('if(!v.length&&Array.isArray(m.HELP_VISIBLE_MODELS)');
  assert(iFn > 0 && iConst > iFn, 'la via autoritativa va ANTES que las constantes en el script del subproceso');
  assert(/model_picker_price_category/.test(src), 'captura la categoria de precio del picker (la moneda AI credits)');
  const mod = await import('../lib/pipeline/sdk-runner.mjs');
  assert(typeof mod.listCopilotCatalog === 'function' && typeof mod.listCopilotModels === 'function', 'catalogo rico + wrapper compat de ids');
});

await test('tiers: tierFromPriceCategory mapea la categoria VIVA del picker y rechaza basura (la heuristica queda de red)', async () => {
  const { tierFromPriceCategory } = await import('../lib/core/tiers.mjs');
  eq(tierFromPriceCategory('low'), 'economy');
  eq(tierFromPriceCategory('Medium'), 'balanced', 'case-insensitive');
  eq(tierFromPriceCategory('high'), 'premium');
  eq(tierFromPriceCategory('gratis'), null, 'categoria desconocida => null (decide la heuristica)');
  eq(tierFromPriceCategory(undefined), null);
});
