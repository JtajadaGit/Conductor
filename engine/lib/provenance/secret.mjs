// conductor/lib/secret.mjs — cifrado de secretos AT-REST, 0 dependencias, VÍA COMÚN a Windows/Linux/Mac.
//
// Antes: DPAPI vía PowerShell — SOLO Windows (en Linux/Mac la key quedaba en TEXTO PLANO) y frágil (los
// cmdlets ProtectedData vía Add-Type son delicados desde Node). Ahora: AES-256-GCM con node:crypto — la MISMA
// mecánica en los 3 SO, sin spawns. La clave maestra (32 bytes aleatorios) vive en ~/.conductor/.enckey con
// permisos 0600 (solo el usuario). Cada secreto se cifra con IV propio + tag GCM (autenticado: un blob alterado
// NO descifra en silencio, lanza).
//
// MODELO DE SEGURIDAD (honesto): protege la key de byok.json si ESE fichero se comparte/commitea/respalda SIN
// el .enckey (caso común de fuga). Un atacante con acceso a TODO ~/.conductor tiene ambos → puede descifrar
// (misma superficie efectiva que un 0600 en claro, pero unificado, sin texto plano y con integridad GCM). En
// Windows es algo menos fuerte que el DPAPI anterior (que ataba al usuario del SO), a cambio de ser común y
// robusto en los 3 SO. Retrocompat: descifra los blobs DPAPI legacy (prefijo distinto) ya guardados en Windows.
import { homedir } from 'node:os';
import { join } from 'node:path';
import { readFileSync, writeFileSync, mkdirSync, existsSync, chmodSync, rmSync } from 'node:fs';
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const V2 = 'c2:'; // marca del formato AES-GCM (los blobs sin este prefijo son DPAPI legacy, base64 plano)
const homeDir = () => process.env.CONDUCTOR_HOME || join(homedir(), '.conductor');
const keyPath = () => join(homeDir(), '.enckey');

// clave maestra: lee ~/.conductor/.enckey (32B base64) o la crea UNA vez con 0600. null si no se puede persistir.
// INVARIANTE CRÍTICO: la clave se escribe EXACTAMENTE una vez y JAMÁS se sobrescribe. Si el fichero existe pero
// no se puede leer/decodificar (lock de AV, corrupción, ≠32 bytes), se devuelve null (error duro) en vez de
// regenerar — regenerar destruiría para siempre la capacidad de descifrar el byok.json ya guardado (pérdida
// silenciosa: decrypt→null→"sin credenciales"/BLOCKED). El caller distingue "sin clave" de "clave ilegible".
// sleep SÍNCRONO sin busy-wait (Atomics.wait sobre un SharedArrayBuffer efímero) para reintentar la lectura.
const sleepSync = (ms) => { try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); } catch { const u = Date.now() + ms; while (Date.now() < u) { /* fallback */ } } };
// lee el keyfile con REINTENTOS. Bajo CONCURRENCIA (N procesos a la vez), uno puede ver el .enckey recién creado
// por otro (`open 'wx'`) pero AÚN a medio escribir (0/parcial bytes) entre el open y el write → sin reintento,
// masterKey devolvía null y el byok login fallaba (1 de N). Reintenta ~300ms hasta ver 32 bytes o desaparecer;
// preserva el never-overwrite (nunca regenera un keyfile presente; un corrupto genuino agota y devuelve null).
function readMaster(p) {
  for (let i = 0; i < 30; i++) {
    let b = null; try { b = Buffer.from(String(readFileSync(p, 'utf8')).trim(), 'base64'); } catch {}
    if (b && b.length === 32) return b;
    if (!existsSync(p)) return null;
    sleepSync(10);
  }
  return null; // tras ~300ms sigue sin 32 bytes → genuinamente corrupto/ilegible
}
function masterKey() {
  const p = keyPath();
  if (existsSync(p)) return readMaster(p);
  try {
    const k = randomBytes(32);
    mkdirSync(homeDir(), { recursive: true });
    writeFileSync(p, k.toString('base64'), { mode: 0o600, flag: 'wx' }); // 'wx' = crear EXCLUSIVO: si una carrera lo creó, NO lo pisa
    try { chmodSync(p, 0o600); } catch {} // en Windows es best-effort; el dir del perfil ya es del usuario
    return k;
  } catch {
    return readMaster(p); // EEXIST (otro proceso lo creó) → re-leer con reintentos por si aún escribe; nunca regenerar
  }
}

// AES-256-GCM disponible en todo Node → cifrar siempre es posible (a diferencia del DPAPI solo-Windows).
export function canEncrypt() { return true; }

// cifra un secreto → blob "c2:"+base64(iv|tag|ciphertext). null si vacío o si no se puede persistir la clave.
export function encryptSecret(plain) {
  if (!plain) return null;
  try {
    const key = masterKey(); if (!key) return null;
    const iv = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', key, iv);
    const ct = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
    const tag = c.getAuthTag();
    return V2 + Buffer.concat([iv, tag, ct]).toString('base64');
  } catch { return null; }
}

// descifra: formato nuevo (c2:) con la clave maestra; cualquier otro → DPAPI legacy (Windows). null si falla.
export function decryptSecret(enc) {
  if (!enc) return null;
  if (String(enc).startsWith(V2)) {
    try {
      const key = masterKey(); if (!key) return null;
      const raw = Buffer.from(String(enc).slice(V2.length), 'base64');
      const iv = raw.subarray(0, 12), tag = raw.subarray(12, 28), ct = raw.subarray(28);
      const d = createDecipheriv('aes-256-gcm', key, iv); d.setAuthTag(tag);
      return Buffer.concat([d.update(ct), d.final()]).toString('utf8');
    } catch { return null; }
  }
  return decryptDpapiLegacy(enc); // blob antiguo (base64 DPAPI) — retrocompat en Windows
}

// true si el blob es del formato nuevo (común, descifrable en cualquier SO). Los callers lo usan para avisar
// SOLO ante blobs DPAPI legacy en un SO no-Windows (ilegibles ahí → hay que re-guardar).
export function isPortableBlob(enc) { return !!enc && String(enc).startsWith(V2); }

// PLANTILLA de litellm.json (la escribe `conductor setup` si no existe — el usuario ABRE y RELLENA, nunca
// crea el fichero desde cero). Los placeholders enseñan el formato; isTemplateCreds los detecta para que la
// plantilla SIN rellenar jamás cuente como credenciales (ni se cifra, ni pinta modelos en el selector).
// GARANTÍA DE PLANTILLA (init v2): la crea CUALQUIER punto de entrada (setup, init, arranque de la app,
// litellm status) — antes solo setup, y quien iba directo a init encontraba un hint hacia un fichero
// inexistente (queja real 2026-07-29). Idempotente: jamás pisa credenciales existentes (ni legado byok.json).
export function ensureByokTemplate(home) {
  try {
    const dir = home || homeDir();
    if (existsSync(join(dir, 'litellm.json')) || existsSync(join(dir, 'byok.json'))) return false;
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'litellm.json'), JSON.stringify(LITELLM_TEMPLATE, null, 2) + '\n', { mode: 0o600 });
    return true;
  } catch { return false; }
}

export const LITELLM_TEMPLATE = {
  _ayuda: 'Rellena baseUrl y apiKey y guarda — la key se queda COMO LA ESCRIBAS (añade "seal": true si prefieres que conductor la cifre). En "models" declara tu catálogo: cada entrada sale en el selector con su "name" y sus límites viajan a cada fase.',
  baseUrl: 'https://TU-PROXY/v1',
  apiKey: 'sk-PEGA-AQUI-TU-KEY',
  models: {
    'mi-modelo': { name: 'Mi Modelo', limit: { context: 128000, output: 16384 } },
  },
};
export function isTemplateCreds(j) {
  if (!j || typeof j !== 'object') return false;
  return /PEGA-AQUI|TU-PROXY|TU-KEY|sk-XXX/i.test(String(j.apiKey || '') + String(j.baseUrl || ''));
}

// FICHERO DE CREDENCIALES, nombre user-facing: ~/.conductor/litellm.json (la palabra que usan los devs;
// "byok" era jerga). byok.json = LEGADO: se sigue leyendo, y el sellado lo MIGRA al nombre nuevo.
// Para LECTURAS devuelve el que exista (litellm.json gana); para escrituras nuevas, litellm.json.
export function byokFile(home = homeDir()) {
  const nu = join(home, 'litellm.json');
  if (existsSync(nu)) return nu;
  const legacy = join(home, 'byok.json');
  return existsSync(legacy) ? legacy : nu;
}

// SELLADO AL PRIMER USO (hábito-de-fichero sin plaintext en reposo): el dev escribe a mano
// ~/.conductor/litellm.json con {"baseUrl","apiKey"} — su gesto de siempre (mismo shape que su config de
// OpenCode) — y al primer toque conductor CIFRA la key y reescribe el fichero (apiKeyEnc, 0600) con una
// pista de rotación dentro; la key en claro desaparece del disco. Si el cifrado no verifica round-trip,
// NO se toca nada (mejor plaintext utilizable que credenciales rotas). Un byok.json legado en claro se
// sella Y MIGRA a litellm.json en el mismo gesto. Devuelve true solo si selló.
// COMPAT DE FORMA (2026-07-29): el dev puede PEGAR su bloque de proveedor de OpenCode tal cual
// ({options:{baseURL, apiKey, timeout…}, models:{…}}) — o el nuestro plano ({baseUrl, apiKey, models}).
// Normaliza a plano: baseUrl (acepta baseURL y options.*), apiKey/apiKeyEnc (top u options), timeout total.
export function normalizeByokShape(j) {
  if (!j || typeof j !== 'object') return j;
  const o = (j.options && typeof j.options === 'object') ? j.options : {};
  const out = { ...j };
  out.baseUrl = j.baseUrl || j.baseURL || o.baseURL || o.baseUrl || undefined;
  if (!out.apiKey && typeof o.apiKey === 'string' && o.apiKey) out.apiKey = o.apiKey;
  if (!out.apiKeyEnc && typeof o.apiKeyEnc === 'string') out.apiKeyEnc = o.apiKeyEnc;
  const t = Number(j.timeout ?? o.timeout);
  out.timeout = Number.isFinite(t) && t > 0 ? t : undefined;
  return out;
}


export function sealByokFile(home = homeDir()) {
  try {
    const p = byokFile(home);
    const j = JSON.parse(readFileSync(p, 'utf8'));
    // PARIDAD OpenCode (decisión 2026-07-31, feedback real: "cifrar la key es una cagada" — su opencode.json
    // guarda la key tal cual): el fichero es DEL DEV y la key se queda COMO ÉL la escriba. Sellar es
    // OPT-IN: "seal": true aquí, o `conductor litellm login` (cifra porque el fichero lo escribe conductor).
    // Los ficheros YA sellados (apiKeyEnc) siguen descifrando igual — nada se rompe.
    if (!j || typeof j !== 'object' || j.seal !== true) return false;
    const plain = (j && typeof j === 'object') ? (j.apiKey || (j.options && typeof j.options === 'object' ? j.options.apiKey : null)) : null;
    if (!j || typeof j !== 'object' || !plain || j.apiKeyEnc) return false; // nada en claro que sellar
    if (isTemplateCreds(j)) return false; // la PLANTILLA sin rellenar jamás se cifra (no es una key)
    const enc = encryptSecret(plain);
    if (!enc || decryptSecret(enc) !== plain) return false;
    const { apiKey, ...rest } = j;
    if (rest.options && typeof rest.options === 'object' && rest.options.apiKey) {
      // bloque estilo OpenCode pegado tal cual: la key sale de options (cifrada al top); el resto de options
      // (timeouts…) se conserva — sellar jamás destruye la config del dev
      rest.options = { ...rest.options }; delete rest.options.apiKey;
    }
    const target = join(home, 'litellm.json');
    const sealed = { ...rest, apiKeyEnc: enc, _rotar: 'para cambiar la key: sustituye apiKeyEnc por "apiKey": "sk-…" y conductor la re-cifra al primer uso' };
    writeFileSync(target, JSON.stringify(sealed, null, 2), { mode: 0o600 });
    try { chmodSync(target, 0o600); } catch {}
    if (p !== target) { try { rmSync(p); } catch {} } // migración: el legado en claro no se queda atrás
    return true;
  } catch { return false; }
}

// --- retrocompat: descifrado DPAPI de blobs guardados con la versión anterior (Windows). Ya no se CIFRA así. ---
function decryptDpapiLegacy(enc) {
  if (process.platform !== 'win32' || !enc) return null;
  const script = "try { Add-Type -AssemblyName System.Security; $e=[Text.Encoding]::UTF8.GetBytes($env:CONDUCTOR_BYOK_ENT); $b=[Convert]::FromBase64String($env:CONDUCTOR_BYOK_ENC); [Console]::Out.Write([Text.Encoding]::UTF8.GetString([Security.Cryptography.ProtectedData]::Unprotect($b,$e,'CurrentUser'))) } catch { }";
  for (const sh of ['powershell', 'pwsh']) {
    try {
      const out = execFileSync(sh, ['-NoProfile', '-NonInteractive', '-Command', script], {
        env: { ...process.env, CONDUCTOR_BYOK_ENT: 'conductor-v1-byok', CONDUCTOR_BYOK_ENC: enc },
        windowsHide: true, timeout: 20000, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
      });
      if (out) return out;
    } catch {}
  }
  return null;
}
