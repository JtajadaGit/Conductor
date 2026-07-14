// Límites del proveedor BYOK (proxies corporativos los EXIGEN): persisten con las creds y llegan a toda superficie.
import { mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { byokCreds } from '../lib/pipeline/drive.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const BIN = resolve(HERE, '..', 'bin', 'conductor.mjs');

await test('byok-limits: byokCreds devuelve maxOutput/maxPrompt del byok.json (el run del panel/IDE no sale sin límites)', () => {
  const home = join(HERE, '.tmp-byok-limits');
  rmSync(home, { recursive: true, force: true }); mkdirSync(home, { recursive: true });
  writeFileSync(join(home, 'byok.json'), JSON.stringify({ type: 'openai', baseUrl: 'http://127.0.0.1:9/v1', apiKey: 'sk-test', maxOutputTokens: 16384, maxPromptTokens: 250000 }));
  const c = byokCreds({ CONDUCTOR_HOME: home });
  eq(c.maxOutputTokens, 16384); eq(c.maxPromptTokens, 250000);
  writeFileSync(join(home, 'byok.json'), JSON.stringify({ type: 'openai', baseUrl: 'http://127.0.0.1:9/v1', apiKey: 'sk-test' }));
  const c2 = byokCreds({ CONDUCTOR_HOME: home });
  eq(c2.maxOutputTokens, null, 'sin límites en el fichero → null (no inventa)');
  rmSync(home, { recursive: true, force: true });
});

await test('byok-limits: `byok save` persiste los MAX_* del entorno junto a la key cifrada', () => {
  const home = join(HERE, '.tmp-byok-limits2');
  rmSync(home, { recursive: true, force: true }); mkdirSync(home, { recursive: true });
  execFileSync(process.execPath, [BIN, 'byok', 'save'], {
    env: { ...process.env, CONDUCTOR_HOME: home, COPILOT_PROVIDER_BASE_URL: 'http://127.0.0.1:9/v1', COPILOT_PROVIDER_API_KEY: 'sk-e2e', COPILOT_PROVIDER_MAX_OUTPUT_TOKENS: '16384', COPILOT_PROVIDER_MAX_PROMPT_TOKENS: '250000' },
    stdio: 'pipe', windowsHide: true, timeout: 30000,
  });
  const j = JSON.parse(readFileSync(join(home, 'byok.json'), 'utf8'));
  eq(j.maxOutputTokens, 16384); eq(j.maxPromptTokens, 250000);
  assert(j.apiKeyEnc && !j.apiKey, 'key cifrada, jamás en claro');
  rmSync(home, { recursive: true, force: true });
});
