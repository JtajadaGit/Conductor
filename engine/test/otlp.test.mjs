import { toOtlp } from '../lib/sysops/otlp.mjs';

const spans = [
  { name: 'chat qwen36-msc1', attributes: { 'gen_ai.request.model': 'qwen36-msc1', 'gen_ai.usage.input_tokens': 3200, 'gen_ai.usage.output_tokens': 420, 'conductor.cost_usd': 0, 'conductor.phase': null }, duration_ms: 1800 },
  { name: 'chat claude-opus-4-8', attributes: { 'gen_ai.request.model': 'claude-opus-4-8', 'gen_ai.usage.input_tokens': 6100, 'gen_ai.usage.output_tokens': 1800, 'conductor.cost_usd': 0.0755 }, duration_ms: 4100 },
];

await test('otlp: estructura resourceSpans/scopeSpans/spans', () => {
  const o = toOtlp(spans);
  assert(o.resourceSpans?.[0]?.scopeSpans?.[0]?.spans?.length === 2);
  assert(o.resourceSpans[0].resource.attributes.some((a) => a.key === 'service.name'));
});
await test('otlp: tipado de atributos (int/double/string) y null omitido', () => {
  const s = toOtlp(spans).resourceSpans[0].scopeSpans[0].spans;
  const a0 = Object.fromEntries(s[0].attributes.map((a) => [a.key, a.value]));
  eq(a0['gen_ai.usage.input_tokens'].intValue, '3200');
  eq(a0['gen_ai.request.model'].stringValue, 'qwen36-msc1');
  assert(!('conductor.phase' in a0), 'null se omite');
  const a1 = Object.fromEntries(s[1].attributes.map((a) => [a.key, a.value]));
  assert('doubleValue' in a1['conductor.cost_usd'], 'float → doubleValue');
});
await test('otlp: ids hex y tiempos derivados de duración', () => {
  const s = toOtlp(spans).resourceSpans[0].scopeSpans[0].spans;
  assert(/^[0-9a-f]{32}$/.test(s[0].traceId) && /^[0-9a-f]{16}$/.test(s[0].spanId));
  assert(s[0].spanId !== s[1].spanId, 'spanId únicos');
  eq(s[1].endTimeUnixNano, String(4100 * 1e6));
});
