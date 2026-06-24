// conductor/lib/provenance.mjs — sello "green-gate" firmado + verificación.
// Soporta firma ASIMÉTRICA Ed25519 (recomendado: clave privada firma, pública verifica → no-repudio)
// y HMAC-SHA256 (legacy, secreto compartido). SHA-256 siempre como hash de integridad.
// node:crypto puro, sin dependencias.
import { createHash, createHmac, sign as edSign, verify as edVerify, generateKeyPairSync, createPrivateKey, createPublicKey } from 'node:crypto';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const sha256hex = (s) => createHash('sha256').update(s).digest('hex');

// firma/verificación de un FICHERO (p.ej. el bundle del motor) — cadena de suministro (T6).
export function signFile(path, privateKeyPem) {
  return edSign(null, readFileSync(path), createPrivateKey(privateKeyPem)).toString('base64');
}
export function verifyFile(path, sigB64, publicKeyPem) {
  try { return edVerify(null, readFileSync(path), createPublicKey(publicKeyPem), Buffer.from(sigB64, 'base64')); }
  catch { return false; }
}

// genera un par de claves Ed25519 en PEM (para `conductor keygen`)
export function generateKeypair() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return {
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }),
  };
}

// firma el payload. opts: { privateKeyPem } (Ed25519) | { key } (HMAC) | ninguno (solo SHA-256)
export function sign(payload, opts = {}) {
  const body = JSON.stringify(payload);
  const sha256 = sha256hex(body);
  if (opts.privateKeyPem) {
    const key = createPrivateKey(opts.privateKeyPem);
    const sig = edSign(null, Buffer.from(body), key).toString('base64');
    return { algo: 'Ed25519', sha256, signature: sig };
  }
  if (opts.key) return { algo: 'HMAC-SHA256', sha256, hmac: createHmac('sha256', opts.key).update(body).digest('hex') };
  return { algo: 'SHA-256', sha256 };
}

export function verifySignature(payload, signature, opts = {}) {
  const sig = signature || {};
  const body = JSON.stringify(payload);
  const shaOk = sha256hex(body) === sig.sha256;
  if (sig.algo === 'Ed25519') {
    if (!opts.publicKeyPem) return { shaOk, sigOk: false, reason: 'falta publicKeyPem para verificar Ed25519' };
    let sigOk = false;
    try { sigOk = edVerify(null, Buffer.from(body), createPublicKey(opts.publicKeyPem), Buffer.from(sig.signature || '', 'base64')); } catch { sigOk = false; }
    return { shaOk, sigOk };
  }
  if (sig.algo === 'HMAC-SHA256') {
    if (!opts.key) return { shaOk, sigOk: false, reason: 'falta key para verificar HMAC' };
    return { shaOk, sigOk: createHmac('sha256', opts.key).update(body).digest('hex') === sig.hmac };
  }
  // SHA-256 o algoritmo DESCONOCIDO = SOLO integridad, JAMÁS autenticidad (H7): antes devolvía sigOk:shaOk,
  // así un sello forjado {algo:'SHA-256', sha256:<recomputado>} verificaba como auténtico (downgrade trivial,
  // sin clave). Integridad ≠ firma → sigOk:false siempre; el verdict GREEN solo es "auténtico" con Ed25519/HMAC.
  return { shaOk, sigOk: false, reason: sig.algo ? `algoritmo "${sig.algo}" no aporta autenticidad (integridad ≠ firma)` : 'sello sin firma (solo SHA-256 de integridad)' };
}

// spec-freeze: hash determinista de TODOS los delta specs del change (specs/<domain>/spec.md, ordenados).
// El sello GREEN lo embebe (spec_sha256) → fija CONTRA QUÉ spec se obtuvo el verde; mutarla después se detecta.
export function hashSpecs(changeDir) {
  const specsDir = join(changeDir, 'specs');
  let domains = [];
  try { domains = readdirSync(specsDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort(); } catch { return null; }
  const parts = [];
  for (const dom of domains) { const p = join(specsDir, dom, 'spec.md'); if (existsSync(p)) { try { parts.push(`# ${dom}\n` + readFileSync(p, 'utf8')); } catch {} } }
  return parts.length ? sha256hex(parts.join('\n')) : null;
}

// gates: [{name, findings}]
export function seal({ change, gates, trace, cost, at, key, privateKeyPem, engineVersion, traceAffectsVerdict = true, specHash = null }) {
  // traceAffectsVerdict=true (def): huecos de traza → NOT-GREEN (estándar estricto de `conductor seal`).
  // false: la traza es informativa y el verdict = solo gates (lo usa el driver, cuyo gate trata los
  // huecos como warning → así el sello coincide con el verdict del pipeline).
  const gateSummary = gates.map((g) => ({ name: g.name, verdict: g.findings.some((f) => f.severity === 'breaking' || f.severity === 'error') ? 'FAIL' : 'PASS', errors: g.findings.filter((f) => f.severity === 'breaking' || f.severity === 'error').length }));
  const allGreen = gateSummary.every((g) => g.verdict === 'PASS') && (!traceAffectsVerdict || !trace || (trace.gaps || []).length === 0);
  const payload = {
    spec_version: 'conductor-provenance/2', engine: engineVersion || null, change, sealed_at: at,
    verdict: allGreen ? 'GREEN' : 'NOT-GREEN', gates: gateSummary,
    spec_sha256: specHash || null, // spec-freeze: fija CONTRA QUÉ spec se logró el verde (mutarla después se detecta)
    traceability: trace ? { requirements: trace.matrix?.length ?? 0, gaps: trace.gaps || [] } : null,
    cost: cost ? { real_usd: cost.cost_usd, naive_usd: cost.naive_all_opus_usd, saved_pct: cost.saved_pct } : null,
  };
  return { ...payload, signature: sign(payload, { key, privateKeyPem }) };
}

export function verifySeal(doc, opts = {}) {
  const { signature, ...payload } = doc || {};
  // L20: un sello sin firma (signature ausente/null) NO debe lanzar TypeError — devuelve un veredicto
  // explícito de "sin firma" en vez de un crash que los llamadores tradujeran a un exit 2 críptico.
  if (!signature || typeof signature !== 'object') {
    return { algo: null, shaOk: false, sigOk: false, reason: 'sello sin firma (no verificable)', verdict: payload.verdict ?? null };
  }
  const r = verifySignature(payload, signature, opts);
  return { algo: signature.algo, shaOk: r.shaOk, sigOk: r.sigOk, reason: r.reason, verdict: payload.verdict };
}
