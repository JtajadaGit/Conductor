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
import { readFileSync, writeFileSync, mkdirSync, existsSync, chmodSync } from 'node:fs';
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
