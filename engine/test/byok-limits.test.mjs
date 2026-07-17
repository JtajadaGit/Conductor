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

await test('byok-seal: un byok.json escrito A MANO (key en claro, hábito-de-fichero) se SELLA al primer toque', () => {
  const home = join(HERE, '.tmp-byok-seal');
  rmSync(home, { recursive: true, force: true }); mkdirSync(home, { recursive: true });
  const prev = process.env.CONDUCTOR_HOME;
  process.env.CONDUCTOR_HOME = home;
  try {
    writeFileSync(join(home, 'byok.json'), JSON.stringify({ baseUrl: 'http://127.0.0.1:9/v1', apiKey: 'sk-a-mano', maxOutputTokens: 16384 }));
    eq(sealByokFile(home), true, 'sella la primera vez');
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

await test('byok-seal: `byok status` sella él mismo y lo ANUNCIA (el dev ve que su fichero quedó cifrado)', () => {
  const home = join(HERE, '.tmp-byok-seal2');
  rmSync(home, { recursive: true, force: true }); mkdirSync(home, { recursive: true });
  writeFileSync(join(home, 'byok.json'), JSON.stringify({ baseUrl: 'http://127.0.0.1:9/v1', apiKey: 'sk-status' }));
  const out = execFileSync(process.execPath, [BIN, 'byok', 'status'], { encoding: 'utf8', env: { ...process.env, CONDUCTOR_HOME: home }, stdio: 'pipe', windowsHide: true, timeout: 30000 });
  assert(out.includes('sellada AHORA'), 'status anuncia el sellado: ' + out.trim());
  const j = JSON.parse(readFileSync(join(home, 'litellm.json'), 'utf8'));
  assert(j.apiKeyEnc && !j.apiKey, 'el fichero quedó cifrado en disco');
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
