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
const costOf = (m, i, o) => { const p = PRICE[m] || { in: 0, out: 0 }; return (i * p.in + o * p.out) / 1e6; };
const etOf = (m, i, o, cr = 0) => (i + 4 * o + 0.1 * cr) * (ET_TIER[(PRICE[m] || {}).tier] ?? 1);

export function computeCost(jsonlPath) {
  const raw = readFileSync(jsonlPath, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const lines = []; let skipped = 0;
  for (const l of raw) { try { const o = JSON.parse(l); if (o && typeof o === 'object' && Number.isFinite(o.input_tokens)) lines.push(o); else skipped++; } catch { skipped++; } }
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
  const saved = naive - total;
  return {
    run: { calls: lines.length, input_tokens: tin, output_tokens: tout, skipped_lines: skipped },
    cost_usd: +total.toFixed(4), naive_all_opus_usd: +naive.toFixed(4), saved_usd: +saved.toFixed(4),
    saved_pct: naive > 0 ? +((saved / naive) * 100).toFixed(1) : 0,
    phases: Object.values(phases).map((p) => ({ phase: p.phase, calls: p.calls, models: [...p.models], in: p.in, out: p.out, cost_usd: +p.cost.toFixed(4), naive_usd: +p.naive.toFixed(4), effective_tokens: Math.round(p.et), ms: p.ms })),
    otelSpans: spans,
  };
}
