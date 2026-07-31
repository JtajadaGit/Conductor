// Parser del visor de sesión (lib/events.mjs): colapso start/end con duración, categorías, profundidad, filtro.
import { parseEvents, eventCategory, parseOtelSession } from '../lib/core/events.mjs';
import { plumbPath } from '../lib/core/plumb.mjs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';

const TMP = join(dirname(fileURLToPath(import.meta.url)), '.tmp-events');
const fresh = () => { rmSync(TMP, { recursive: true, force: true }); mkdirSync(TMP, { recursive: true }); };

const EV = [
  { type: 'session.start', data: { copilotVersion: '1.0.63', context: { cwd: '/x', branch: 'main' } }, id: 's1', timestamp: '2026-06-16T14:50:00.000Z' },
  { type: 'session.model_change', data: { newModel: 'qwen36-msc1' }, id: 'm1', parentId: 's1', timestamp: '2026-06-16T14:50:01.000Z' },
  { type: 'user.message', data: { content: 'haz algo' }, id: 'u1', parentId: 's1', timestamp: '2026-06-16T14:50:02.000Z' },
  { type: 'assistant.turn_start', data: { turnId: '0' }, id: 't1', parentId: 'u1', timestamp: '2026-06-16T14:50:03.000Z' },
  { type: 'tool.execution_start', data: { tool_name: 'bash' }, id: 'x1', parentId: 't1', timestamp: '2026-06-16T14:50:04.000Z' },
  { type: 'hook.start', data: { hookEventName: 'PreToolUse' }, id: 'h1', parentId: 'x1', timestamp: '2026-06-16T14:50:04.100Z' },
  { type: 'hook.end', data: {}, id: 'h2', parentId: 'x1', timestamp: '2026-06-16T14:50:04.300Z' },
  { type: 'tool.execution_complete', data: {}, id: 'x2', parentId: 't1', timestamp: '2026-06-16T14:50:06.000Z' },
  { type: 'assistant.turn_end', data: {}, id: 't2', parentId: 'u1', timestamp: '2026-06-16T14:50:07.000Z' },
];
const write = () => { const d = plumbPath(TMP); mkdirSync(d, { recursive: true }); const f = join(d, 'events.jsonl'); writeFileSync(f, EV.map((e) => JSON.stringify(e)).join('\n')); return f; };

await test('events: categoría por tipo', () => {
  eq(eventCategory('tool.execution_start'), 'tool');
  eq(eventCategory('hook.end'), 'hook');
  eq(eventCategory('assistant.message'), 'message');
  eq(eventCategory('session.model_change'), 'session');
  eq(eventCategory('permission.requested'), 'permission');
});

await test('events: colapsa pares start/end con duración y aplana por parentId', () => {
  fresh(); const f = write();
  const r = parseEvents(f);
  eq(r.summary.total, 9, 'parsea los 9 eventos');
  eq(r.total, 6, 'colapsa los 3 end (tool/hook/turn) → 6 filas');
  eq(r.summary.models, ['qwen36-msc1'], 'cambio de modelo capturado');
  eq(r.summary.byCategory.hook, 2, 'cuenta categorías sobre TODOS los eventos');
  const tool = r.events.find((e) => e.id === 'x1');
  eq(tool.durationMs, 2000, 'duración tool = complete - start');
  assert(tool.label.includes('bash'), 'label con el nombre del tool');
  eq(tool.depth, 3, 'profundidad por parentId: x1→t1→u1→s1');
  const hook = r.events.find((e) => e.id === 'h1');
  eq(hook.durationMs, 200, 'duración hook');
  assert(!r.events.some((e) => e.id === 'x2' || e.id === 'h2' || e.id === 't2'), 'los end NO aparecen como fila propia');
});

await test('events: filtro por categoría, búsqueda y paginado; null si no existe', () => {
  fresh(); const f = write();
  const onlyTool = parseEvents(f, { categories: ['tool'] });
  eq(onlyTool.total, 1, 'solo el tool colapsado'); eq(onlyTool.events[0].id, 'x1');
  const q = parseEvents(f, { q: 'bash' });
  assert(q.events.every((e) => (e.label + e.detail).toLowerCase().includes('bash')) && q.total >= 1, 'búsqueda filtra por texto');
  const page = parseEvents(f, { limit: 2, offset: 0 });
  eq(page.events.length, 2, 'paginado respeta limit'); eq(page.total, 6, 'total sin paginar');
  eq(parseEvents(join(TMP, 'nope.jsonl')), null, 'fichero ausente → null');
});

// VISOR para runs qwen: sin events.jsonl, se reconstruye la traza desde spans OTel (.conductor/otel/<fase>.jsonl)
const OTEL = [
  { type: 'span', name: 'chat qwen36-msc1', attributes: { 'gen_ai.operation.name': 'chat', 'gen_ai.response.model': 'qwen36-msc1', 'gen_ai.usage.input_tokens': 1200, 'gen_ai.usage.output_tokens': 80 }, startTime: [1781780221, 0], endTime: [1781780223, 0], status: { code: 0 }, events: [] },
  { type: 'span', name: 'execute_tool create', attributes: { 'gen_ai.operation.name': 'execute_tool', 'gen_ai.tool.name': 'create' }, startTime: [1781780224, 0], endTime: [1781780224, 500000000], status: { code: 0 }, events: [{ name: 'github.copilot.hook.end', time: [1781780224, 100000000], attributes: { 'github.copilot.hook.type': 'postToolUse', 'github.copilot.hook.decision': 'allow' } }] },
  { type: 'span', name: 'execute_tool view', attributes: { 'gen_ai.operation.name': 'execute_tool', 'gen_ai.tool.name': 'view' }, startTime: [1781780225, 0], endTime: [1781780225, 200000000], status: { code: 2, message: 'Path does not exist' }, events: [] },
];
await test('events: reconstruye la sesión qwen desde spans OTel (sin events.jsonl)', () => {
  fresh();
  const od = plumbPath(TMP, 'otel'); mkdirSync(od, { recursive: true });
  writeFileSync(join(od, 'apply.jsonl'), OTEL.map((s) => JSON.stringify(s)).join('\n'));
  const r = parseOtelSession(od);
  assert(r && r.summary.reconstructed, 'summary.reconstructed=true (distingue del events.jsonl nativo)');
  eq(r.summary.models, ['qwen36-msc1'], 'modelo tomado del span chat');
  assert(r.events.some((e) => e.category === 'message' && /qwen36-msc1/.test(e.label) && /1200/.test(e.detail)), 'evento de modelo con tokens de entrada');
  const tool = r.events.find((e) => e.category === 'tool' && /create/.test(e.label));
  assert(tool && tool.durationMs === 500, 'tool create con la duración del span (ms)');
  const failTool = r.events.find((e) => /view/.test(e.label));
  assert(failTool && /Path does not exist/.test(failTool.detail), 'tool fallido lleva el mensaje de estado del span');
  assert(r.events.some((e) => e.category === 'hook'), 'hook reconstruido desde los events del span');
  assert(r.events.some((e) => e.category === 'session' && /Fase · apply/.test(e.label)), 'boundary de fase por fichero');
  eq(parseOtelSession(join(TMP, 'nope')), null, 'sin otel → null');
});
