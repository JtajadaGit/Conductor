// conductor/lib/secret.mjs — cifrado de secretos AT-REST, 0 dependencias.
//
// Windows: DPAPI vía .NET [System.Security.Cryptography.ProtectedData] (Add-Type System.Security).
// IMPORTANTE: NO se usan los cmdlets ConvertTo/From-SecureString — VERIFICADO que FALLAN al lanzarse
// desde Node con `powershell` (WinPS 5.1) porque el módulo Microsoft.PowerShell.Security no autocarga
// (conflicto de TypeData). ProtectedData vía Add-Type funciona en powershell 5.1 Y pwsh 7.
//
// El cifrado es por-USUARIO+MÁQUINA: el blob es inútil copiado a otra cuenta/equipo. Una entropía fija
// ('CONDUCTOR_BYOK_ENT') actúa como 2º factor (otro proceso del mismo usuario sin el salt no descifra).
// El secreto NUNCA viaja por argv (visible en la lista de procesos): al cifrar entra por STDIN; al
// descifrar el blob entra por env var y el plano sale por STDOUT y se asigna directo al env del hijo.
//
// Fuera de Windows (Linux/Mac/CI) NO existe DPAPI → canEncrypt()=false; el llamante mantiene texto
// plano (fichero 0600) o exige env. Por eso encrypt/decrypt devuelven null en no-win32.
import { execFileSync } from 'node:child_process';

const ENT = 'conductor-v1-byok'; // salt de la app (2º factor); cambiarlo invalida los blobs existentes
const isWin = process.platform === 'win32';

// ejecuta un script PowerShell de forma no interactiva; powershell (5.1, siempre presente) con fallback a pwsh.
// stderr se captura (no se hereda) para no ensuciar la consola; el script ya tragará sus propios errores.
function ps(script, { input, env } = {}) {
  let lastErr;
  for (const sh of ['powershell', 'pwsh']) {
    try {
      return execFileSync(sh, ['-NoProfile', '-NonInteractive', '-Command', script], {
        input, env: { ...process.env, ...env }, windowsHide: true, timeout: 10000, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('powershell/pwsh no disponible');
}

export function canEncrypt() { return isWin; }

// cifra un secreto → base64 del blob DPAPI (o null si no se puede: no-win32 / vacío). try/catch DENTRO de
// PowerShell → ante cualquier fallo no escribe nada a stderr y stdout queda vacío (encryptSecret → null).
export function encryptSecret(plain) {
  if (!isWin || !plain) return null;
  const script = "try { Add-Type -AssemblyName System.Security; $s=[Console]::In.ReadToEnd(); $e=[Text.Encoding]::UTF8.GetBytes($env:CONDUCTOR_BYOK_ENT); $b=[Text.Encoding]::UTF8.GetBytes($s); [Console]::Out.Write([Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect($b,$e,'CurrentUser'))) } catch { }";
  try { return ps(script, { input: plain, env: { CONDUCTOR_BYOK_ENT: ENT } }).trim() || null; }
  catch { return null; }
}

// descifra el base64 producido por encryptSecret → plano (o null si falla / no-win32). El blob corrupto o de
// otro usuario lanza CryptographicException dentro del try de PowerShell → stdout vacío → null, sin ruido.
export function decryptSecret(enc) {
  if (!isWin || !enc) return null;
  const script = "try { Add-Type -AssemblyName System.Security; $e=[Text.Encoding]::UTF8.GetBytes($env:CONDUCTOR_BYOK_ENT); $b=[Convert]::FromBase64String($env:CONDUCTOR_BYOK_ENC); [Console]::Out.Write([Text.Encoding]::UTF8.GetString([Security.Cryptography.ProtectedData]::Unprotect($b,$e,'CurrentUser'))) } catch { }";
  try { return ps(script, { env: { CONDUCTOR_BYOK_ENT: ENT, CONDUCTOR_BYOK_ENC: enc } }) || null; }
  catch { return null; }
}
