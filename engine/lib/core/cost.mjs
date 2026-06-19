// conductor/lib/cost.mjs — telemetría de coste por fase desde token-usage.jsonl (esquema gh-aw).
import { readFileSync } from 'node:fs';

export const PRICE = {
  'claude-opus-4-8': { in: 5, out: 25, tier: 'opus' }, 'claude-opus-4-7': { in: 5, out: 25, tier: 'opus' },
  'claude-sonnet-4-6': { in: 3, out: 15, tier: 'sonnet' }, 'claude-haiku-4-5': { in: 1, out: 5, tier: 'haiku' },
  'gpt-5.5': { in: 5, out: 30, tier: 'opus' },
  'qwen36-msc1': { in: 0, out: 0, tier: 'byok' }, 'qwen36-msc2': { in: 0, out: 0, tier: 'byok' }, 'deepseek-v4-flash': { in: 0, out: 0, tier: 'byok' },
};
const ET_TIER = { haiku: 0.25, sonnet: 1, opus: 5, byok: 0 };
const NAIVE = 'claude-opus-4-8';
// lookup de precio TOLERANTE al formato de versión del id: el catálogo real reporta "claude-sonnet-4.6"
// (con punto) mientras esta tabla usa guion ("…-4-6"). Sin esto, el coste de modelos premium salía $0 por
// un mismatch silencioso (lo destapó `conductor stats`). Se indexa una vez por id normalizado (sin . - _).
const _normId = (m) => String(m || '').toLowerCase().replace(/[.\-_]/g, '');
const _priceIndex = Object.fromEntries(Object.keys(PRICE).map((k) => [_normId(k), PRICE[k]]));
const _own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
// lookup por PROPIEDAD PROPIA (M9): un id de modelo "toString"/"valueOf"/"constructor" (vienen de la
// telemetría OTel, no de un enum controlado) hacía que PRICE[model] devolviera la función heredada de
// Object.prototype → coste NaN run-wide. Se exige propiedad propia y forma {in,out} numérica.
export function priceOf(model) {
  const p = _own(PRICE, model) ? PRICE[model] : (_own(_priceIndex, _normId(model)) ? _priceIndex[_normId(model)] : null);
  return (p && typeof p.in === 'number' && typeof p.out === 'number') ? p : { in: 0, out: 0 };
}
const num = (x) => { const n = Number(x); return Number.isFinite(n) ? Math.max(0, n) : 0; }; // coerción + clamp ≥0 (L23)
const costOf = (m, i, o) => { const p = priceOf(m); return (num(i) * p.in + num(o) * p.out) / 1e6; };
const etOf = (m, i, o, cr = 0) => (num(i) + 4 * num(o) + 0.1 * num(cr)) * (ET_TIER[priceOf(m).tier] ?? 1);

export function computeCost(jsonlPath) {
  const raw = readFileSync(jsonlPath, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const lines = []; let skipped = 0;
  // M6: NO basta validar input_tokens — una línea con input pero SIN output_tokens dejaba ot=undefined →
  // coste NaN que envenena el total del run. Se coercen AMBOS a número finito ≥0; se descarta la línea solo
  // si NINGUNO de los dos es un número válido (objeto sin tokens reales). Negativos → 0 (L23).
  for (const l of raw) {
    try {
      const o = JSON.parse(l);
      if (!o || typeof o !== 'object') { skipped++; continue; }
      const it = Number(o.input_tokens), ot = Number(o.output_tokens);
      if (!Number.isFinite(it) && !Number.isFinite(ot)) { skipped++; continue; }
      o.input_tokens = Number.isFinite(it) ? Math.max(0, it) : 0;
      o.output_tokens = Number.isFinite(ot) ? Math.max(0, ot) : 0;
      lines.push(o);
    } catch { skipped++; }
  }
  const phases = {}; let total = 0, naive = 0, tin = 0, tout = 0; const spans = [];
  for (const r of lines) {
    const phase = r.phase || `(model:${r.model})`;
    const c = costOf(r.model, r.input_tokens, r.output_tokens), nc = costOf(NAIVE, r.input_tokens, r.output_tokens);
    total += c; naive += nc; tin += r.input_tokens; tout += r.output_tokens;
    const p = (phases[phase] ||= { phase, calls: 0, in: 0, out: 0, cost: 0, naive: 0, models: new Set(), et: 0, ms: 0 });
    p.calls++; p.in += r.input_tokens; p.out += r.output_tokens; p.cost += c; p.naive += nc; p.models.add(r.model);
    p.et += etOf(r.model, r.input_tokens, r.output_tokens, r.cache_read_tokens || 0); p.ms += r.duration_ms || 0;
    spans.push({ name: `chat ${r.model}`, attributes: {
      'gen_ai.operation.name': 'chat', 'gen_ai.provider.name': r.provider, 'gen_ai.request.model': r.model,
      'gen_ai.usage.input_tokens': r.input_tokens, 'gen_ai.usage.output_tokens': r.output_tokens,
      'conductor.phase': r.phase || null, 'conductor.cost_usd': +c.toFixed(6) }, duration_ms: r.duration_ms || 0 });
  }
  const saved = Math.max(0, naive - total); // L24: nunca "ahorro" negativo (un modelo > baseline daba saved<0)
  return {
    run: { calls: lines.length, input_tokens: tin, output_tokens: tout, skipped_lines: skipped },
    cost_usd: +total.toFixed(4), naive_all_opus_usd: +naive.toFixed(4), saved_usd: +saved.toFixed(4),
    saved_pct: naive > 0 ? +((saved / naive) * 100).toFixed(1) : 0,
    phases: Object.values(phases).map((p) => ({ phase: p.phase, calls: p.calls, models: [...p.models], in: p.in, out: p.out, cost_usd: +p.cost.toFixed(4), naive_usd: +p.naive.toFixed(4), effective_tokens: Math.round(p.et), ms: p.ms })),
    otelSpans: spans,
  };
}
