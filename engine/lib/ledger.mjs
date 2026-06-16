// conductor/lib/ledger.mjs — libro mayor de provenance HASH-ENCADENADO (tamper-evident).
// Cada cambio sellado (provenance) se anexa como una entrada cuyo hash incluye el hash de la
// entrada anterior → cualquier manipulación de una entrada rompe toda la cadena posterior.
// Es el "audit trail" de gobierno que piden SAP/Salesforce/Databricks, sin dependencias.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

const GENESIS = '0'.repeat(64);
const sha = (s) => createHash('sha256').update(s).digest('hex');
const entryHash = (e) => sha(`${e.seq}|${e.change}|${e.verdict}|${e.sealed_at}|${e.seal_sha256}|${e.prev}`);

export function readLedger(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
}

// anexa una entrada para un doc de provenance (seal) y devuelve la entrada
export function append(path, seal) {
  const entries = readLedger(path);
  const prev = entries.length ? entries[entries.length - 1].hash : GENESIS;
  const seal_sha256 = sha(JSON.stringify(seal));
  const e = { seq: entries.length, change: seal.change, verdict: seal.verdict, sealed_at: seal.sealed_at, seal_sha256, prev };
  e.hash = entryHash(e);
  writeFileSync(path, [...entries, e].map((x) => JSON.stringify(x)).join('\n') + '\n');
  return e;
}

// verifica la integridad de la cadena completa
export function verifyChain(path) {
  const entries = readLedger(path);
  let prev = GENESIS;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (e.seq !== i) return { ok: false, brokenAt: i, reason: `seq esperado ${i}, encontrado ${e.seq}` };
    if (e.prev !== prev) return { ok: false, brokenAt: i, reason: 'prev hash no coincide (entrada insertada/eliminada)' };
    const { hash, ...rest } = e;
    if (entryHash(rest) !== hash) return { ok: false, brokenAt: i, reason: 'entrada manipulada (hash no recomputa)' };
    prev = e.hash;
  }
  return { ok: true, entries: entries.length, head: prev };
}
