// Tests del sdk-runner con el SDK MOCKEADO (offline). El e2e real vive en el sandbox sdk-spike.
import { createSdkRunner } from '../lib/sdk-runner.mjs';

function mockSdk(record) {
  class MockSession {
    constructor(cfg) { this.cfg = cfg; }
    async sendAndWait({ prompt }, timeout) { record.prompts.push(prompt); record.timeouts = [...(record.timeouts || []), timeout]; if (record.hang) return new Promise(() => {}); return { data: { content: 'OK:' + (this.cfg.model || 'default') } }; }
    async destroy() { record.destroyed++; }
  }
  class MockClient {
    constructor(opts) { record.clientOpts = opts; }
    async createSession(cfg) { record.sessions.push(cfg); return new MockSession(cfg); }
    async stop() { record.stopped = true; }
  }
  return { CopilotClient: MockClient, RuntimeConnection: { forStdio: (o) => ({ kind: 'stdio', ...o }) }, approveAll: () => ({ kind: 'approve' }) };
}

await test('sdk-runner: crea sesión POR FASE con modelo y provider BYOK (/v1) correctos', async () => {
  const rec = { sessions: [], prompts: [], destroyed: 0 };
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
  eq(rec.destroyed, 2, 'sesiones destruidas tras cada fase');
  await run.close();
  eq(rec.stopped, true, 'close() para el cliente');
});

await test('sdk-runner: mezcla por fase — "copilot:<m>" va SIN provider (catálogo Business), "byok:<m>" con provider', async () => {
  const rec = { sessions: [], prompts: [], destroyed: 0 };
  const env = { COPILOT_PROVIDER_BASE_URL: 'https://litellm.example.com/', COPILOT_PROVIDER_API_KEY: 'sk-test' };
  const run = await createSdkRunner({ sdk: mockSdk(rec), env });
  await run({ prompt: 'a', model: 'copilot:claude-sonnet-4.6', timeoutMs: 5000 });
  await run({ prompt: 'b', model: 'byok:qwen36-msc1', timeoutMs: 5000 });
  eq(rec.sessions[0].model, 'claude-sonnet-4.6'); eq(rec.sessions[0].provider, undefined, 'copilot: → sesión sin provider (Business)');
  eq(rec.sessions[1].model, 'qwen36-msc1'); eq(rec.sessions[1].provider?.type, 'openai', 'byok: → provider LiteLLM');
  await run.close();
});

await test('sdk-runner: COPILOT_CLI_PATH → opción cliPath (runtime del usuario, sin los 557MB)', async () => {
  const rec = { sessions: [], prompts: [], destroyed: 0 };
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
    export class CopilotClient { constructor(o){ globalThis.__bundleOpts = o; } async createSession(c){ return { sendAndWait: async()=>({data:{content:'BUNDLED'}}), destroy: async()=>{} }; } async stop(){} }
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
  const rec = { sessions: [], prompts: [], destroyed: 0, hang: true };
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
