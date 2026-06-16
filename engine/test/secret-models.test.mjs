// Tests: cifrado DPAPI de secretos (Windows) + cache de NOMBRES de modelo (siempre, sin filtrar la key).
import { rmSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encryptSecret, decryptSecret, canEncrypt } from '../lib/secret.mjs';
import { writeModelsCache, readModelsCache } from '../lib/serve.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const HOME = join(HERE, '.tmp-secret-home');

await test('secret: DPAPI roundtrip preserva la key (incl. caracteres especiales) — solo win32', async () => {
  if (!canEncrypt()) { console.log('     (skip: no es Windows, DPAPI no disponible)'); return; }
  const secret = "sk-aB3$x&y'q\"z`end-\\123";
  const enc = encryptSecret(secret);
  assert(enc && typeof enc === 'string' && enc.length > 20, 'encryptSecret debe devolver base64');
  assert(enc !== secret && !enc.includes(secret), 'el cifrado NO debe contener la key en claro');
  assert(decryptSecret(enc) === secret, 'el roundtrip debe recuperar la key idéntica');
  assert(decryptSecret('bm90LWEtdmFsaWQtYmxvYg==') === null, 'un blob ajeno/corrupto descifra a null (sin lanzar)');
});

await test('models-cache: guarda solo NOMBRES (nunca la key) y se relee siempre', async () => {
  rmSync(HOME, { recursive: true, force: true }); mkdirSync(HOME, { recursive: true });
  const prev = process.env.CONDUCTOR_HOME; process.env.CONDUCTOR_HOME = HOME;
  try {
    writeModelsCache(['qwen36-msc1', 'qwen36-msc2', 'deepseek-v4-flash', 'qwen36-msc1'], 'https://litellm.apps.hiberus.tech/');
    const c = readModelsCache();
    assert(c && c.version === 1 && c.byok, 'la cache debe existir con version y bloque byok');
    eq(c.byok.models, ['deepseek-v4-flash', 'qwen36-msc1', 'qwen36-msc2'], 'nombres deduplicados y ordenados');
    assert(typeof c.byok.baseUrlHash === 'string' && c.byok.baseUrlHash.length === 6, 'hash6 del baseUrl');
    assert(typeof c.byok.at === 'number' && c.byok.at > 0, 'timestamp');
    const raw = readFileSync(join(HOME, 'models-cache.json'), 'utf8');
    assert(!/sk-/.test(raw) && !/litellm\.apps\.hiberus\.tech/.test(raw), 'la cache NO debe contener key ni baseUrl en claro (solo hash + ids)');
  } finally {
    if (prev === undefined) delete process.env.CONDUCTOR_HOME; else process.env.CONDUCTOR_HOME = prev;
    rmSync(HOME, { recursive: true, force: true });
  }
});
