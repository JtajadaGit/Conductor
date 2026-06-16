// ui-render.test.mjs — VALIDACIÓN DE RENDER REAL (doctrina post-regresión): no basta compilar el JS
// de las páginas; aquí se EJECUTA con un DOM simulado y un estado RICO (todas las situaciones de UI a
// la vez) y se asserta el HTML resultante. Caza errores de runtime (el "cargando…" mudo) y regresiones
// de contenido (que la pausa muestre los 4 controles, que las fases pinten, que el panel liste runs).
import { createRunServer, createAppServer } from '../lib/serve.mjs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rmSync, mkdirSync, writeFileSync } from 'node:fs';

process.env.CONDUCTOR_HOME = join(dirname(fileURLToPath(import.meta.url)), '.tmp-home');
const T = join(dirname(fileURLToPath(import.meta.url)), '.tmp-ui');

// ── DOM mínimo: registra innerHTML/textContent por id y deja consultar el resultado ──
function fakeDom() {
  const els = new Map();
  const el = (id) => {
    if (!els.has(id)) els.set(id, {
      id, innerHTML: '', textContent: '', value: '', style: {}, dataset: {}, content: '/api/x/',
      addEventListener: () => {}, querySelectorAll: () => [], querySelector: () => null,
      closest: () => null, getContext: () => null, classList: { add: () => {}, remove: () => {} },
    });
    return els.get(id);
  };
  const document = {
    body: { classList: { add: () => {}, remove: () => {}, toggle: () => {} }, appendChild: () => {} },
    createElement: () => ({ id: '', innerHTML: '', classList: { add: () => {}, remove: () => {} }, appendChild: () => {} }),
    getElementById: el,
    querySelector: (s) => (s.includes('meta') ? { content: '/api/' } : el('q:' + s)),
    querySelectorAll: () => [],
    addEventListener: () => {},
    head: { querySelector: () => ({ content: '/api/' }) },
  };
  return { document, els, el };
}

// estado RICO: todas las situaciones de UI simultáneas
const RICH_STATE = {
  project: 'mi-proyecto', branch: 'feature/x', request: 'añade un header con título', complexity: 'medium',
  verdict: null, done: false, resumed: true, total_ms: 754000, now: Date.now(),
  plan: ['propose', 'spec', 'apply', 'verify'],
  current: null,
  pending: { before: 'fix', role: 'coder', findings: ['REQ-H sin scenario', 'tasks 2/3 sin cerrar'] },
  approvals: [{ phase: 'apply', at: '2026-06-11T10:00:00Z', via: 'human-web' }],
  phases: [
    { phase: 'propose', role: 'planner', model: 'qwen36-msc1', provider: 'byok', attempts: 1, ms: 61000, tokens: { in: 433000, out: 1300 }, files: [{ p: 'proposal.md', k: 'create' }], ok: true },
    { phase: 'spec', role: 'planner', model: 'qwen36-msc1', provider: 'byok', attempts: 2, ms: 64000, tokens: { in: 510000, out: 1500 }, files: [{ p: 'specs/header/spec.md', k: 'create' }], lastError: 'timeout intento 1', ok: true },
    { phase: 'apply', role: 'coder', model: 'claude-haiku-4.5', provider: 'copilot', attempts: 1, ms: 180000, tokens: { in: 1083000, out: 16200 }, files: [{ p: 'src/header.js', k: 'create' }, { p: 'src/app.js', k: 'edit' }], hasRaw: true, ok: true },
    { phase: 'verify', role: 'reviewer', model: 'qwen36-msc1', provider: 'byok', attempts: 1, ms: 95000, tokens: { in: 200000, out: 900 }, files: [{ p: 'verify-report.md', k: 'create' }], lenses: ['correctness', 'security', 'tests'], ok: true },
  ],
  cost: { byModel: { 'qwen36-msc1 (byok)': { in: 1143000, out: 3700, phases: 3 }, 'claude-haiku-4.5 (copilot)': { in: 1083000, out: 16200, phases: 1 } } },
  live: [{ p: 'src/header.css', k: 'create' }],
  logTail: ['[10:00:01] ⏳ propose (planner)', '[10:01:02] ✅ propose', '[10:01:02] ⏸ pausado antes de "fix"'],
  modelOptions: ['byok:qwen36-msc1', 'copilot:claude-haiku-4.5'],
  usage: { spend: 7.18, budget: 40, runDelta: 0.0123 },
  ghUsage: { plan: 'business', used: 2219, entitlement: 6000, percentUsed: 37, reset: '07-01' },
  verifyExcerpt: '# Verify Report (multi-lens, 3/3)',
  stopRequested: false,
};

async function renderPage(html, state, { pathname = '/', changes = null } = {}) {
  const js = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  if (!js) throw new Error('página sin script');
  const { document, els } = fakeDom();
  const calls = [];
  const fetchMock = async (url, opts) => {
    calls.push(String(url));
    const u = String(url);
    const body = /changes/.test(u) ? (changes || state) : (/state/.test(u) ? state : { ok: true });
    return { json: async () => body, text: async () => JSON.stringify(body) };
  };
  // instrumentación: los catch silenciosos de la página deben DELATAR el error en el harness
  const inst = js.replace(/catch\((e\d?)\)\{/g, 'catch($1){globalThis.__uiErr=$1;');
  const localStorage = { _:{}, getItem(k){return k in this._?this._[k]:null;}, setItem(k,v){this._[k]=String(v);} };
  const fn = new Function('document', 'fetch', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'location', 'confirm', 'alert', 'localStorage', 'innerWidth', 'requestAnimationFrame', 'addEventListener', 'performance', inst);
  delete globalThis.__uiErr;
  fn(document, fetchMock, () => 0, () => 0, () => {}, () => {}, { href: '', pathname }, () => true, () => {}, localStorage, 1400, () => 0, () => {}, { now: () => 0, getEntriesByType: () => [] });
  // poll() es async: drenar la microtask queue para que el render ocurra
  for (let i = 0; i < 20; i++) await Promise.resolve();
  await new Promise((r) => setTimeout(r, 10));
  if (globalThis.__uiErr) throw new Error('error de RENDER tragado por un catch: ' + (globalThis.__uiErr.stack || globalThis.__uiErr.message || globalThis.__uiErr));
  return { els, calls, get: (id) => (els.get(id) || {}).innerHTML || (els.get(id) || {}).textContent || '' };
}

await test('UI-render: la página del RUN pinta el estado RICO completo (fases, pausa con 4 controles, consumo, log)', async () => {
  rmSync(T, { recursive: true, force: true }); mkdirSync(T, { recursive: true });
  const srv = await createRunServer({ changeDir: T });
  const html = await (await fetch(srv.url)).text();
  await srv.close();
  const r = await renderPage(html, RICH_STATE, { pathname: '/run/header-x', changes: { project: 'p', changes: [] } });
  const list = r.get('list');
  for (const frag of ['propose', 'spec', 'apply', 'verify', 'qwen36-msc1', 'claude-haiku-4.5', 'src/header.js'])
    assert(list.includes(frag), `la lista de fases debe incluir: ${frag} — got: ${list.slice(0, 200)}`);
  const pend = r.get('pending');
  for (const frag of ['fix', 'fsel', 'pnote', 'phmodel', 'REQ-H sin scenario'])
    assert(pend.includes(frag), `la pausa debe traer el control: ${frag}`);
  assert(r.get('models').includes('byok'), 'línea de consumo por modelo');
  const under = r.get('underc');
  assert(under.includes('data-rawph="apply"'), 'el panel debe ofrecer la salida CRUDA del modelo en apply (hasRaw)');
  assert(under.includes('a ciegas'), 'el panel debe traer el copy de valor sin jerga');
  assert(r.get('logp').includes('propose'), 'registro del run');
  assert(r.get('cards').includes('AIC') || r.get('cards').includes('2219'), 'tarjeta AIC');
});

await test('UI-render: el PANEL pinta la lista de runs con acciones (en vivo, stop, AI Act, informe)', async () => {
  const srv = await createAppServer({ root: T, engine: 'x', spawnRun: () => ({ on: () => {}, send: () => {}, kill: () => {} }) });
  const html = await (await fetch(srv.url)).text();
  await srv.close();
  const panelState = {
    project: 'mi-proyecto',
    projects: [{ id: 'demo~abc123', name: 'mi-proyecto', root: 'x', changes: [
      { name: 'header-x', request: 'añade un header', verdict: 'EN CURSO', phases: 2, complexity: 'simple', tokens: { in: 9000, out: 300 }, url: null, hasDashboard: false, resumable: false, mtime: 2 },
      { name: 'footer-y', request: 'añade un footer', verdict: 'GREEN', phases: 4, complexity: 'simple', tokens: { in: 1000, out: 100 }, url: null, hasDashboard: true, resumable: false, mtime: 1 },
      { name: 'nav-z', request: 'side nav', verdict: 'STOPPED', phases: 2, complexity: 'medium', tokens: { in: 500, out: 50 }, url: null, hasDashboard: false, resumable: true, mtime: 0 },
    ] }],
    changes: [
      { name: 'header-x', request: 'añade un header', verdict: 'EN CURSO', phases: 2, complexity: 'simple', tokens: { in: 9000, out: 300 }, url: null, hasDashboard: false, resumable: false, mtime: 2 },
      { name: 'footer-y', request: 'añade un footer', verdict: 'GREEN', phases: 4, complexity: 'simple', tokens: { in: 1000, out: 100 }, url: null, hasDashboard: true, resumable: false, mtime: 1 },
      { name: 'nav-z', request: 'side nav', verdict: 'STOPPED', phases: 2, complexity: 'medium', tokens: { in: 500, out: 50 }, url: null, hasDashboard: false, resumable: true, mtime: 0 },
    ],
  };
  const r = await renderPage(html, RICH_STATE, { pathname: '/', changes: panelState });
  const list = r.get('plist');
  for (const frag of ['header-x', 'EN CURSO', 'data-st="demo~abc123/header-x"', 'GREEN', '/run/demo~abc123/footer-y', 'AI Act', 'dashboard.html', 'data-rs="demo~abc123/nav-z"'])
    assert(list.includes(frag), `el panel debe incluir: ${frag} — got: ${list.slice(0, 300)}`);
  assert(r.get('proj').includes('mi-proyecto') || (r.els.get('proj') || {}).textContent === 'mi-proyecto', 'nombre del proyecto');
  rmSync(T, { recursive: true, force: true });
});
