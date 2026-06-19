// conductor/lib/ledger.mjs — libro mayor de provenance HASH-ENCADENADO (tamper-evident).
// Cada cambio sellado (provenance) se anexa como una entrada cuyo hash incluye el hash de la
// entrada anterior → cualquier EDICIÓN de una entrada rompe toda la cadena posterior.
// HONESTIDAD (auditoría adversarial): el hash-encadenado solo, SIN firma, detecta ediciones casuales
// pero NO a un atacante con acceso de escritura que recompute toda la cadena desde genesis. Para
// tamper-evidence real frente a ese modelo de amenaza hay que FIRMAR (CONDUCTOR_PRIV_KEY → cada entrada
// lleva una firma Ed25519 de su hash; una reconstrucción sin la clave privada falla en verifyChain).
import { readFileSync, writeFileSync, existsSync, appendFileSync, openSync, closeSync, unlinkSync, statSync } from 'node:fs';
import { createHash, sign as edSign, verify as edVerify, createPrivateKey, createPublicKey } from 'node:crypto';

const GENESIS = '0'.repeat(64);
const sha = (s) => createHash('sha256').update(s).digest('hex');
const entryHash = (e) => sha(`${e.seq}|${e.change}|${e.verdict}|${e.sealed_at}|${e.seal_sha256}|${e.prev}`);

// L21: una línea corrupta/ilegible NO debe inutilizar TODO el ledger (ni los appends futuros). Se marca
// la línea como corrupta (la reporta verifyChain) en vez de lanzar y abortar lecturas/escrituras.
export function readLedger(path) {
  if (!existsSync(path)) return [];
  const out = [];
  for (const l of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const s = l.trim(); if (!s) continue;
    try { out.push(JSON.parse(s)); } catch { out.push({ __corrupt: s.slice(0, 80) }); }
  }
  return out;
}

// H5: serialización entre procesos vía lockfile O_EXCL ('wx'). El append era read-modify-write SIN lock y
// REESCRIBÍA el fichero entero → dos procesos (p.ej. dos changes del mismo proyecto sellando a la vez)
// se pisaban y PERDÍAN entradas, dejando verifyChain ok:true sobre una cadena truncada. Reclama locks
// huérfanos (>30s sin liberar) para no quedarse atascado si un proceso murió con el lock tomado.
function withLock(path, fn) {
  const lock = path + '.lock';
  const deadline = Date.now() + 5000;
  let fd = null;
  for (;;) {
    try { fd = openSync(lock, 'wx'); break; } // O_CREAT|O_EXCL: falla si el lock ya existe
    catch (e) {
      if (e.code !== 'EEXIST') throw e;
      try { if (Date.now() - statSync(lock).mtimeMs > 30000) { unlinkSync(lock); continue; } } catch {}
      if (Date.now() > deadline) throw new Error('ledger ocupado (lock no liberado a tiempo)');
      const until = Date.now() + 15; while (Date.now() < until) { /* espera breve: el append es rápido */ }
    }
  }
  try { return fn(); } finally { try { closeSync(fd); } catch {} try { unlinkSync(lock); } catch {} }
}

// anexa una entrada para un doc de provenance (seal) y la devuelve. Si hay privateKeyPem, FIRMA el hash de
// la entrada (Ed25519): una reconstrucción desde genesis sin la clave privada NO podrá falsificar las firmas.
export function append(path, seal, { privateKeyPem } = {}) {
  return withLock(path, () => {
    const entries = readLedger(path).filter((e) => !e.__corrupt);
    const prev = entries.length ? entries[entries.length - 1].hash : GENESIS;
    const seal_sha256 = sha(JSON.stringify(seal));
    const e = { seq: entries.length, change: seal.change, verdict: seal.verdict, sealed_at: seal.sealed_at, seal_sha256, prev };
    e.hash = entryHash(e);
    if (privateKeyPem) { try { e.sig = edSign(null, Buffer.from(e.hash), createPrivateKey(privateKeyPem)).toString('base64'); } catch {} }
    appendFileSync(path, JSON.stringify(e) + '\n'); // APPEND atómico de UNA línea: nunca reescribe el fichero entero
    return e;
  });
}

// verifica la integridad de la cadena completa. Con publicKeyPem, verifica además las FIRMAS por entrada
// (si las hay): una cadena reconstruida desde genesis sin la clave privada falla aquí. `signed` informa si
// la cadena lleva firmas (sin firmas = solo hash-encadenada → el audit no debe sobre-afirmar inviolabilidad).
export function verifyChain(path, { publicKeyPem } = {}) {
  const entries = readLedger(path);
  let prev = GENESIS;
  let signedCount = 0;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (e.__corrupt) return { ok: false, brokenAt: i, reason: 'línea corrupta/ilegible en el ledger' };
    if (e.seq !== i) return { ok: false, brokenAt: i, reason: `seq esperado ${i}, encontrado ${e.seq}` };
    if (e.prev !== prev) return { ok: false, brokenAt: i, reason: 'prev hash no coincide (entrada insertada/eliminada)' };
    const { hash, sig, ...rest } = e;
    if (entryHash(rest) !== hash) return { ok: false, brokenAt: i, reason: 'entrada manipulada (hash no recomputa)' };
    if (sig) {
      signedCount++;
      if (publicKeyPem) {
        let okSig = false;
        try { okSig = edVerify(null, Buffer.from(hash), createPublicKey(publicKeyPem), Buffer.from(sig, 'base64')); } catch { okSig = false; }
        if (!okSig) return { ok: false, brokenAt: i, reason: 'firma Ed25519 de la entrada inválida (posible reconstrucción sin la clave privada)' };
      }
    }
    prev = e.hash;
  }
  const signed = entries.length > 0 && signedCount === entries.length;
  const note = !signedCount
    ? 'cadena solo hash-encadenada (sin firmas): detecta ediciones casuales, NO a un atacante con acceso de escritura — firma con CONDUCTOR_PRIV_KEY'
    : (!publicKeyPem ? 'cadena firmada; aporta publicKeyPem para verificar autenticidad' : undefined);
  return { ok: true, entries: entries.length, head: prev, signed, ...(note ? { note } : {}) };
}
