// conductor/lib/policy.mjs — política central de gobierno (gates obligatorios, modelos permitidos,
// override auditado). Es el control plane mínimo del estudio enterprise (§7). Sin dependencias.
import { readFileSync, existsSync } from 'node:fs';
import { validate } from '../core/jsonschema.mjs';

const RANK = { breaking: 0, error: 1, warning: 2, info: 3 };

export const DEFAULT_POLICY = {
  version: 1,
  blockSeverity: 'error',
  mandatoryGates: ['coherence', 'artifacts'],
  allowedModels: ['qwen36-msc1', 'qwen36-msc2', 'deepseek-v4-flash', 'claude-sonnet-4-6', 'claude-opus-4-8'],
  override: { allowed: true, requireJustification: true, minLength: 20 },
};

export const POLICY_SCHEMA = {
  type: 'object', required: ['version', 'blockSeverity'],
  properties: {
    version: { type: 'integer', minimum: 1 },
    blockSeverity: { type: 'string', enum: ['breaking', 'error', 'warning'] },
    mandatoryGates: { type: 'array', items: { type: 'string' } },
    allowedModels: { type: 'array', items: { type: 'string' } },
    override: { type: 'object', properties: { allowed: { type: 'boolean' }, requireJustification: { type: 'boolean' }, minLength: { type: 'integer', minimum: 0 } } },
  }, additionalProperties: true,
};

export function loadPolicy(path) {
  if (!path || !existsSync(path)) return { policy: DEFAULT_POLICY, source: 'default' };
  let raw; try { raw = JSON.parse(readFileSync(path, 'utf8')); } catch (e) { throw new Error(`policy JSON inválido: ${e.message}`); }
  const v = validate(POLICY_SCHEMA, raw);
  if (!v.valid) throw new Error('policy inválida: ' + v.errors.map((e) => `${e.instancePath} ${e.message}`).join('; '));
  return { policy: { ...DEFAULT_POLICY, ...raw, override: { ...DEFAULT_POLICY.override, ...(raw.override || {}) } }, source: path };
}

export function validatePolicy(raw) { return validate(POLICY_SCHEMA, raw); }

export function modelAllowed(model, policy) {
  return !policy.allowedModels || policy.allowedModels.length === 0 || policy.allowedModels.includes(model);
}

// findings: del gate. opts: { override, overrideBy, at, ranGates:[names] }
export function enforce(findings, policy, opts = {}) {
  const threshold = RANK[policy.blockSeverity];
  // M10: severidad no reconocida / con mayúsculas / con espacios → fail-CLOSED (cuenta como BLOQUEANTE).
  // Antes `RANK[f.severity]` daba undefined y `undefined <= threshold` era false → un 'CRITICAL'/'Error' se
  // colaba como no-bloqueante (false GREEN). Normalizamos y, ante severidad desconocida, bloqueamos.
  const sevRank = (s) => RANK[String(s || '').toLowerCase().trim()];
  const blocking = (findings || []).filter((f) => { const r = sevRank(f && f.severity); return r === undefined || r <= threshold; });

  // M11: gates obligatorios no ejecutados. Sin opts.ranGates, el `&&` cortocircuitaba y se SALTABA el chequeo
  // entero (PASS con gates obligatorios sin correr). Por defecto, ranGates = [] → todos cuentan como ausentes.
  const ran = Array.isArray(opts.ranGates) ? opts.ranGates : [];
  const missingMandatory = (policy.mandatoryGates || []).filter((g) => !ran.includes(g));
  for (const g of missingMandatory) blocking.push({ rule: 'policy.mandatory-gate-missing', severity: 'error', message: `gate obligatorio no ejecutado: ${g}` });

  if (blocking.length === 0) return { verdict: 'PASS', blocking: [] };

  const ov = policy.override || {};
  // M12: solo un override de tipo STRING cuenta. Un número/booleano (vía librería/MCP) saltaba la
  // justificación (undefined.length < n = false) y se escribía el valor basura en el audit trail.
  const justification = typeof opts.override === 'string' ? opts.override : '';
  if (justification) {
    if (!ov.allowed) return { verdict: 'FAIL', blocking, reason: 'la política prohíbe override' };
    if (ov.requireJustification && justification.trim().length < (ov.minLength || 0))
      return { verdict: 'FAIL', blocking, reason: `override requiere justificación de ≥${ov.minLength} caracteres` };
    return {
      verdict: 'OVERRIDDEN', blocking,
      audit: { action: 'gate-override', by: opts.overrideBy || 'unknown', justification, blocked_count: blocking.length, at: opts.at || null },
    };
  }
  return { verdict: 'FAIL', blocking };
}
