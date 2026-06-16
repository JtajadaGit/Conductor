// conductor/lib/otlp.mjs — exportador de spans a OTLP/JSON (OpenTelemetry) SIN dependencias.
// Convierte los spans GenAI de cost.mjs a formato OTLP para ingerir en Langfuse/Phoenix/cualquier
// colector OTel. File sink (escribe JSON listo para `POST /v1/traces` o importar).
import { createHash } from 'node:crypto';

const idHex = (s, n) => createHash('sha256').update(s).digest('hex').slice(0, n);

function typedValue(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'boolean') return { boolValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { intValue: String(v) } : { doubleValue: v };
  return { stringValue: String(v) };
}
function attrs(obj) {
  const out = [];
  for (const [k, v] of Object.entries(obj || {})) { const val = typedValue(v); if (val) out.push({ key: k, value: val }); }
  return out;
}

// spans: array de { name, attributes, duration_ms } (los de computeCost().otelSpans)
export function toOtlp(spans, { service = 'conductor', version = '0.5.0', traceSeed = 'conductor-run' } = {}) {
  const traceId = idHex(traceSeed, 32);
  return {
    resourceSpans: [{
      resource: { attributes: attrs({ 'service.name': service, 'service.version': version }) },
      scopeSpans: [{
        scope: { name: 'conductor.genai', version },
        spans: spans.map((s, i) => ({
          traceId,
          spanId: idHex(traceSeed + ':' + i, 16),
          name: s.name,
          kind: 3, // SPAN_KIND_CLIENT
          startTimeUnixNano: '0',
          endTimeUnixNano: String((s.duration_ms || 0) * 1e6),
          attributes: attrs(s.attributes),
          status: { code: 1 }, // STATUS_CODE_OK
        })),
      }],
    }],
  };
}
