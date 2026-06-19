// conductor/lib/events.mjs — parser del stream de eventos del CLI de Copilot (events.jsonl) para el VISOR
// DE SESIÓN: "qué hizo la IA" tool a tool, hook a hook. Server-side, 0 tokens LLM (solo lee un fichero).
// Colapsa pares start/end en una fila con DURACIÓN, calcula profundidad por parentId, clasifica por
// CATEGORÍA para los filtros y PAGINA (un session.jsonl real son cientos de eventos / varios MB).
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// categoría de un type de evento (para los chips de filtro del visor)
export function eventCategory(type) {
  const t = String(type || '');
  if (t.startsWith('tool.')) return 'tool';
  if (t.startsWith('hook.')) return 'hook';
  if (t.startsWith('permission.')) return 'permission';
  if (t.startsWith('subagent.')) return 'subagent';
  if (t.startsWith('skill.')) return 'skill';
  if (t.startsWith('assistant.') || t.startsWith('user.') || t.startsWith('system.')) return 'message';
  if (t.startsWith('session.')) return 'session';
  return 'other';
}

const snippet = (s, n = 140) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const toolName = (d) => d?.tool_name || d?.toolName || d?.name || '?';
// M3: min/max por reducción — `Math.min(...arr)` revienta la pila (RangeError) con cientos de miles de spans.
const minOf = (arr) => { let m = Infinity; for (const x of arr) if (x < m) m = x; return Number.isFinite(m) ? m : 0; };
const maxOf = (arr) => { let m = -Infinity; for (const x of arr) if (x > m) m = x; return Number.isFinite(m) ? m : 0; };
// M4: timestamp ms → ISO seguro (un valor fuera del rango de Date hace que toISOString lance RangeError).
const isoOf = (ms) => (Number.isFinite(ms) && ms > 0 && ms < 8.64e15) ? new Date(ms).toISOString() : null;

function labelOf(e) {
  const d = e.data || {};
  switch (e.type) {
    case 'session.start': return 'Sesión iniciada' + (d.copilotVersion ? ` · Copilot ${d.copilotVersion}` : '');
    case 'session.model_change': return 'Modelo → ' + (d.newModel || '?');
    case 'subagent.selected': case 'subagent.started': return 'Subagente: ' + (d.agentDisplayName || d.agentName || '?');
    case 'subagent.completed': return 'Subagente completado' + (d.agentName ? ': ' + d.agentName : '');
    case 'user.message': return 'Usuario: ' + snippet(d.content, 90);
    case 'assistant.message': return 'Asistente: ' + snippet(d.content, 90);
    case 'system.message': return 'Mensaje de sistema';
    case 'assistant.turn_start': case 'assistant.turn_end': return 'Turno del asistente';
    case 'tool.execution_start': case 'tool.execution_complete': return 'Tool · ' + toolName(d);
    case 'hook.start': case 'hook.end': return 'Hook · ' + (d.hookEventName || d.name || 'PreToolUse');
    case 'permission.requested': case 'permission.completed': return 'Permiso · ' + (toolName(d) !== '?' ? toolName(d) : (d.permissionDecision || ''));
    case 'skill.invoked': return 'Skill · ' + (d.skillName || d.name || '?');
    default: return e.type || 'evento';
  }
}

function detailOf(e) {
  const d = e.data || {};
  if (e.type === 'session.start') return snippet([d.context?.cwd, d.context?.branch].filter(Boolean).join(' · '));
  if (e.type.startsWith('tool.')) return snippet(d.command || d.input?.command || d.input?.file_path || d.input?.path || JSON.stringify(d.input || d.arguments || {}));
  if (e.type === 'permission.completed') return snippet(d.permissionDecision || d.decision || '');
  if (e.type === 'subagent.selected') return snippet((d.tools || []).join(', '));
  if (e.type.endsWith('.message')) return snippet(d.content || d.transformedContent, 200);
  return '';
}

// PAIR start→end para colapsar (mismo parentId)
const PAIRS = { 'tool.execution_start': 'tool.execution_complete', 'hook.start': 'hook.end', 'assistant.turn_start': 'assistant.turn_end', 'permission.requested': 'permission.completed' };
const ENDS = new Set(Object.values(PAIRS));

// parsea un events.jsonl y devuelve {total, summary, events:[...page], offset, limit} o null si no existe.
// opts: { categories: string[] (filtro), limit, offset, q (búsqueda en label/detail) }
export function parseEvents(file, { categories = null, limit = 250, offset = 0, q = '' } = {}) {
  if (!file || !existsSync(file)) return null;
  let raw;
  try { raw = readFileSync(file, 'utf8'); } catch { return null; }
  const all = [];
  for (const line of raw.split(/\r?\n/)) {
    const s = line.trim(); if (!s) continue;
    // M26: normaliza `type` a string en el ingest — una línea sin `type` rompía labelOf/detailOf
    // (`undefined.startsWith`) con un 500 que IMPEDÍA el fallback a OTel. Ahora ninguna línea tumba el visor.
    try { const o = JSON.parse(s); if (o && typeof o === 'object') { o.type = String(o.type || ''); all.push(o); } } catch {}
  }
  const byId = new Map();
  for (const e of all) if (e.id) byId.set(e.id, e);
  const depthOf = (e) => { let d = 0, cur = e; const seen = new Set(); while (cur?.parentId && byId.has(cur.parentId) && !seen.has(cur.parentId)) { seen.add(cur.parentId); cur = byId.get(cur.parentId); if (++d > 60) break; } return d; };

  const summary = { total: all.length, byCategory: {}, models: [], agents: [], tools: {}, durationMs: 0, start: null };
  const agentsSet = new Set();
  const openByKey = new Map();
  const collapsed = [];
  let t0 = null, t1 = null;
  for (const e of all) {
    const ts = Date.parse(e.timestamp || '');
    if (Number.isFinite(ts)) { if (t0 === null || ts < t0) t0 = ts; if (t1 === null || ts > t1) t1 = ts; }
    const cat = eventCategory(e.type);
    summary.byCategory[cat] = (summary.byCategory[cat] || 0) + 1;
    if (e.agentId) agentsSet.add(e.agentId);
    if (e.type === 'session.model_change' && e.data?.newModel) summary.models.push(e.data.newModel);
    if (e.type === 'session.start') summary.start = { cwd: e.data?.context?.cwd || null, branch: e.data?.context?.branch || null, copilotVersion: e.data?.copilotVersion || null };
    if (cat === 'tool' && e.type === 'tool.execution_start') { const n = toolName(e.data); summary.tools[n] = (summary.tools[n] || 0) + 1; }
    // colapsar end sobre su start (mismo parentId)
    if (ENDS.has(e.type)) {
      const startType = Object.keys(PAIRS).find((k) => PAIRS[k] === e.type);
      const key = startType + '|' + (e.parentId || '');
      const st = openByKey.get(key);
      if (st) { st.__dur = (Date.parse(e.timestamp || '') || 0) - (Date.parse(st.timestamp || '') || 0); st.__end = e.data || {}; openByKey.delete(key); continue; }
    }
    if (PAIRS[e.type]) openByKey.set(e.type + '|' + (e.parentId || ''), e);
    collapsed.push(e);
  }
  summary.durationMs = t0 !== null && t1 !== null ? t1 - t0 : 0;
  summary.agents = [...agentsSet];

  let view = collapsed;
  if (categories && categories.length) view = view.filter((e) => categories.includes(eventCategory(e.type)));
  if (q) { const needle = q.toLowerCase(); view = view.filter((e) => (labelOf(e) + ' ' + detailOf(e)).toLowerCase().includes(needle)); }
  const total = view.length;
  const events = view.slice(offset, offset + limit).map((e) => ({
    id: e.id || null, type: e.type, category: eventCategory(e.type), ts: e.timestamp || null,
    depth: depthOf(e), agentId: e.agentId || null, durationMs: Number.isFinite(e.__dur) ? e.__dur : null,
    label: labelOf(e), detail: detailOf(e),
  }));
  return { total, offset, limit, summary, events };
}

// VISOR DE SESIÓN para runs que NO emiten events.jsonl (p.ej. qwen vía LiteLLM): reconstruye la traza desde
// los spans OTel (.conductor/otel/<fase>.jsonl). Mapea spans gen_ai (chat → llamada al modelo + tokens;
// execute_tool → tool + estado) y sus hooks a eventos de sesión, con el MISMO shape que parseEvents (el
// visor no nota la diferencia). Devuelve null si no hay otel. summary.reconstructed=true para distinguirlo.
export function parseOtelSession(otelDir, { categories = null, limit = 250, offset = 0, q = '' } = {}) {
  if (!otelDir || !existsSync(otelDir)) return null;
  let files; try { files = readdirSync(otelDir).filter((f) => f.endsWith('.jsonl')).sort(); } catch { return null; }
  if (!files.length) return null;
  const ms = (t) => Array.isArray(t) ? t[0] * 1000 + (t[1] || 0) / 1e6 : null;
  const evs = [];
  for (const f of files) {
    const phase = f.replace(/\.jsonl$/, '');
    let raw; try { raw = readFileSync(join(otelDir, f), 'utf8'); } catch { continue; }
    const spans = [];
    for (const line of raw.split(/\r?\n/)) { const s = line.trim(); if (!s) continue; try { const o = JSON.parse(s); if (o && o.type === 'span') spans.push(o); } catch {} }
    if (!spans.length) continue;
    const starts = spans.map((s) => ms(s.startTime)).filter(Number.isFinite);
    evs.push({ _t: starts.length ? minOf(starts) : 0, type: 'session.phase', category: 'session', label: 'Fase · ' + phase, detail: '', durationMs: null, depth: 0 });
    for (const sp of spans) {
      const a = sp.attributes || {};
      const op = a['gen_ai.operation.name'];
      const st = ms(sp.startTime), en = ms(sp.endTime);
      const dur = (Number.isFinite(st) && Number.isFinite(en)) ? Math.round(en - st) : null;
      if (op === 'chat') {
        const model = a['gen_ai.response.model'] || a['gen_ai.request.model'] || '?';
        const inT = a['gen_ai.usage.input_tokens'], outT = a['gen_ai.usage.output_tokens'];
        const tok = [inT != null ? '↓' + inT : '', outT != null ? '↑' + outT : ''].filter(Boolean).join(' ');
        evs.push({ _t: st, type: 'assistant.message', category: 'message', label: 'Modelo · ' + model, detail: tok ? tok + ' tokens' : '', durationMs: dur, depth: 1 });
      } else if (op === 'execute_tool') {
        const ok = (sp.status?.code ?? 0) === 0;
        evs.push({ _t: st, type: 'tool.execution_complete', category: 'tool', label: 'Tool · ' + (a['gen_ai.tool.name'] || '?'), detail: ok ? '' : (sp.status?.message || 'error'), durationMs: dur, depth: 1 });
      }
      for (const ev of sp.events || []) {
        if (ev.name === 'github.copilot.hook.end') evs.push({ _t: ms(ev.time), type: 'hook.end', category: 'hook', label: 'Hook · ' + (ev.attributes?.['github.copilot.hook.type'] || '?'), detail: ev.attributes?.['github.copilot.hook.decision'] || '', durationMs: null, depth: 2 });
      }
    }
  }
  if (!evs.length) return null;
  evs.sort((x, y) => (x._t ?? 0) - (y._t ?? 0));
  const ts = evs.map((e) => e._t).filter(Number.isFinite);
  const summary = { total: evs.length, byCategory: {}, models: [], agents: [], tools: {}, durationMs: ts.length ? Math.round(maxOf(ts) - minOf(ts)) : 0, start: null, reconstructed: true };
  for (const e of evs) {
    summary.byCategory[e.category] = (summary.byCategory[e.category] || 0) + 1;
    if (e.category === 'message' && e.label.startsWith('Modelo · ')) { const m = e.label.slice(9); if (!summary.models.includes(m)) summary.models.push(m); }
    if (e.category === 'tool') { const t = e.label.replace('Tool · ', ''); summary.tools[t] = (summary.tools[t] || 0) + 1; }
  }
  let view = evs;
  if (categories && categories.length) view = view.filter((e) => categories.includes(e.category));
  if (q) { const n = q.toLowerCase(); view = view.filter((e) => (e.label + ' ' + e.detail).toLowerCase().includes(n)); }
  const total = view.length;
  const events = view.slice(offset, offset + limit).map((e, i) => ({ id: 'otel-' + (offset + i), type: e.type, category: e.category, ts: isoOf(e._t), depth: e.depth, agentId: null, durationMs: e.durationMs, label: e.label, detail: e.detail }));
  return { total, offset, limit, summary, events };
}
