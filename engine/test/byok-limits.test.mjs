// Límites del proveedor BYOK (proxies corporativos los EXIGEN): persisten con las creds y llegan a toda superficie.
import { mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { byokCreds } from '../lib/pipeline/drive.mjs';
import { sealByokFile, decryptSecret } from '../lib/provenance/secret.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const BIN = resolve(HERE, '..', 'bin', 'conductor.mjs');

await test('byok-limits: byokCreds devuelve maxOutput/maxPrompt del byok.json (el run del panel/IDE no sale sin límites)', () => {
  const home = join(HERE, '.tmp-byok-limits');
  rmSync(home, { recursive: true, force: true }); mkdirSync(home, { recursive: true });
  writeFileSync(join(home, 'byok.json'), JSON.stringify({ type: 'openai', baseUrl: 'http://127.0.0.1:9/v1', apiKey: 'sk-test', maxOutputTokens: 16384, maxPromptTokens: 250000 }));
  const c = byokCreds({ CONDUCTOR_HOME: home });
  eq(c.maxOutputTokens, 16384); eq(c.maxPromptTokens, 250000);
  // la 1a lectura sello y MIGRO el legado a litellm.json (gana sobre byok.json) -> limpiar antes de la 2a fase
  rmSync(join(home, 'litellm.json'), { force: true });
  writeFileSync(join(home, 'byok.json'), JSON.stringify({ type: 'openai', baseUrl: 'http://127.0.0.1:9/v1', apiKey: 'sk-test' }));
  const c2 = byokCreds({ CONDUCTOR_HOME: home });
  eq(c2.maxOutputTokens, null, 'sin límites en el fichero → null (no inventa)');
  rmSync(home, { recursive: true, force: true });
});

await test('byok-seal: la key EN CLARO se queda (paridad OpenCode, default 2026-07-31); "seal": true la SELLA', () => {
  const home = join(HERE, '.tmp-byok-seal');
  rmSync(home, { recursive: true, force: true }); mkdirSync(home, { recursive: true });
  const prev = process.env.CONDUCTOR_HOME;
  process.env.CONDUCTOR_HOME = home;
  try {
    writeFileSync(join(home, 'byok.json'), JSON.stringify({ baseUrl: 'http://127.0.0.1:9/v1', apiKey: 'sk-a-mano', maxOutputTokens: 16384 }));
    eq(sealByokFile(home), false, 'DEFAULT: la key del dev NO se toca (como OpenCode)');
    eq(JSON.parse(readFileSync(join(home, 'byok.json'), 'utf8')).apiKey, 'sk-a-mano', 'sigue en claro, tal cual la escribio');
    writeFileSync(join(home, 'byok.json'), JSON.stringify({ baseUrl: 'http://127.0.0.1:9/v1', apiKey: 'sk-a-mano', maxOutputTokens: 16384, seal: true }));
    eq(sealByokFile(home), true, 'con "seal": true SI sella');
    // el sellado MIGRA el legado byok.json -> litellm.json (nombre user-facing) y no deja el claro atras
    assert(!existsSync(join(home, 'byok.json')), 'byok.json legado migrado (no queda atras con la key)');
    const j = JSON.parse(readFileSync(join(home, 'litellm.json'), 'utf8'));
    assert(j.apiKeyEnc && !j.apiKey, 'la key en claro DESAPARECIÓ del disco; queda cifrada');
    eq(decryptSecret(j.apiKeyEnc), 'sk-a-mano', 'y descifra a la original');
    eq(j.maxOutputTokens, 16384, 'el resto del fichero intacto');
    eq(sealByokFile(home), false, 'idempotente: nada que sellar la segunda vez');
    eq(byokCreds({ CONDUCTOR_HOME: home }).apiKey, 'sk-a-mano', 'las credenciales siguen funcionando tras el sellado');
  } finally {
    if (prev === undefined) delete process.env.CONDUCTOR_HOME; else process.env.CONDUCTOR_HOME = prev;
    rmSync(home, { recursive: true, force: true });
  }
});

await test('byok-seal: `byok status` respeta la key en claro (default), enseña la HUELLA, y con "seal": true sella y lo anuncia', () => {
  const home = join(HERE, '.tmp-byok-seal2');
  rmSync(home, { recursive: true, force: true }); mkdirSync(home, { recursive: true });
  writeFileSync(join(home, 'byok.json'), JSON.stringify({ baseUrl: 'http://127.0.0.1:9/v1', apiKey: 'sk-status' }));
  const run = () => execFileSync(process.execPath, [BIN, 'byok', 'status'], { encoding: 'utf8', env: { ...process.env, CONDUCTOR_HOME: home }, stdio: 'pipe', windowsHide: true, timeout: 30000 });
  const out = run();
  assert(out.includes('en claro') && !out.includes('sellada AHORA'), 'default: en claro sin alarma ni sellado: ' + out.trim());
  assert(out.includes('key …atus') && out.includes('huella '), 'la huella verificable sale siempre: ' + out.trim());
  eq(JSON.parse(readFileSync(join(home, 'byok.json'), 'utf8')).apiKey, 'sk-status', 'el fichero NO se toco');
  writeFileSync(join(home, 'byok.json'), JSON.stringify({ baseUrl: 'http://127.0.0.1:9/v1', apiKey: 'sk-status', seal: true }));
  const out2 = run();
  assert(out2.includes('sellada AHORA'), 'con "seal": true, status sella y lo anuncia: ' + out2.trim());
  assert(JSON.parse(readFileSync(join(home, 'litellm.json'), 'utf8')).apiKeyEnc, 'y el fichero quedo cifrado');
  rmSync(home, { recursive: true, force: true });
});

await test('byok-limits: `byok save` persiste los MAX_* del entorno junto a la key cifrada', () => {
  const home = join(HERE, '.tmp-byok-limits2');
  rmSync(home, { recursive: true, force: true }); mkdirSync(home, { recursive: true });
  execFileSync(process.execPath, [BIN, 'byok', 'save'], {
    env: { ...process.env, CONDUCTOR_HOME: home, COPILOT_PROVIDER_BASE_URL: 'http://127.0.0.1:9/v1', COPILOT_PROVIDER_API_KEY: 'sk-e2e', COPILOT_PROVIDER_MAX_OUTPUT_TOKENS: '16384', COPILOT_PROVIDER_MAX_PROMPT_TOKENS: '250000' },
    stdio: 'pipe', windowsHide: true, timeout: 30000,
  });
  const j = JSON.parse(readFileSync(join(home, 'litellm.json'), 'utf8'));
  eq(j.maxOutputTokens, 16384); eq(j.maxPromptTokens, 250000);
  assert(j.apiKeyEnc && !j.apiKey, 'key cifrada, jamás en claro');
  rmSync(home, { recursive: true, force: true });
});
