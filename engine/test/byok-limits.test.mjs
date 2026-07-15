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
    const j = JSON.parse(readFileSync(join(home, 'byok.json'), 'utf8'));
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
  const j = JSON.parse(readFileSync(join(home, 'byok.json'), 'utf8'));
  assert(j.apiKeyEnc && !j.apiKey, 'el fichero quedó cifrado en disco');
  rmSync(home, { recursive: true, force: true });
});

await test('byok-import: reusa las credenciales de una config de host existente (forma provider.*.options) — cifradas, original intacto', () => {
  const home = join(HERE, '.tmp-byok-import');
  rmSync(home, { recursive: true, force: true }); mkdirSync(home, { recursive: true });
  // forma real (sanitizada) de la config de un host de agentes de la empresa: provider con options.baseURL/apiKey
  const hostCfg = join(home, 'host-config.json');
  writeFileSync(hostCfg, JSON.stringify({ $schema: 'https://host.example/config.json', provider: { litellm: { npm: '@ai-sdk/openai-compatible', options: { baseURL: 'http://127.0.0.1:9', apiKey: 'sk-importada', timeout: 300000 } } }, logLevel: 'DEBUG' }));
  const out = execFileSync(process.execPath, [BIN, 'byok', 'import', hostCfg], { encoding: 'utf8', env: { ...process.env, CONDUCTOR_HOME: home }, stdio: 'pipe', windowsHide: true, timeout: 30000 });
  assert(out.includes('guardadas') || out.includes('✓'), 'importó: ' + out.trim().split('\n')[0]);
  assert(!out.includes('sk-importada'), 'la key JAMÁS se ecoa en el output');
  const j = JSON.parse(readFileSync(join(home, 'byok.json'), 'utf8'));
  eq(j.baseUrl, 'http://127.0.0.1:9', 'baseURL importada');
  assert(j.apiKeyEnc && !j.apiKey, 'key cifrada, jamás en claro en NUESTRO fichero');
  // descifrar exige el .enckey del MISMO home donde cifró el hijo (swap de env, como en el test del sellado)
  const prevH = process.env.CONDUCTOR_HOME;
  process.env.CONDUCTOR_HOME = home;
  try { eq(decryptSecret(j.apiKeyEnc), 'sk-importada', 'y descifra a la original'); }
  finally { if (prevH === undefined) delete process.env.CONDUCTOR_HOME; else process.env.CONDUCTOR_HOME = prevH; }
  assert(readFileSync(hostCfg, 'utf8').includes('sk-importada'), 'el fichero del host queda INTACTO (es suyo)');
  rmSync(home, { recursive: true, force: true });
});

await test('byok-import: placeholders (sk-XXXX) y configs sin credenciales se RECHAZAN con explicación', () => {
  const home = join(HERE, '.tmp-byok-import2');
  rmSync(home, { recursive: true, force: true }); mkdirSync(home, { recursive: true });
  const cfg = join(home, 'placeholder.json');
  writeFileSync(cfg, JSON.stringify({ provider: { p: { options: { baseURL: 'http://127.0.0.1:9', apiKey: 'sk-XXXX' } } } }));
  let failed = false;
  try { execFileSync(process.execPath, [BIN, 'byok', 'import', cfg], { encoding: 'utf8', env: { ...process.env, CONDUCTOR_HOME: home }, stdio: 'pipe', windowsHide: true, timeout: 30000 }); }
  catch (e) { failed = true; assert(String(e.stderr).includes('placeholder') || String(e.stderr).includes('no encontré'), 'explica el rechazo: ' + e.stderr); }
  assert(failed, 'exit != 0 con placeholder');
  assert(!existsSync(join(home, 'byok.json')), 'no se guardó nada a medias');
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
