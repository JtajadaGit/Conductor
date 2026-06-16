// conductor/lib/serve.mjs — mini-web LOCAL del run (la respuesta por CÓDIGO al "no se ve nada").
// Un http server de Node puro (0 deps, solo 127.0.0.1) que sirve una página auto-refrescante con el
// timeline del run EN VIVO: lee run-timeline.json (+ .conductor-run.json) en cada poll. Estilo Notion,
// con la fase en curso viva (progress bar vs timeout, intento N/M, último error) y totales de tokens.
// Cero coste de tokens: aquí no hay LLM, solo ficheros locales.
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { execSync, execFileSync, spawn } from 'node:child_process';
import { PRICE } from './cost.mjs';
import { activeRun, rollbackTo, readDriveConfig } from './drive.mjs';
import { renderAiact } from './aiact.mjs';
import { RUN_PAGE, PANEL_PAGE } from './ui-assets.mjs';
import { renderDashboard } from './dashboard.mjs';
import { decryptSecret } from './secret.mjs';

// lectura SEGURA dentro de una raíz (sin .., sin absolutos, sin .conductor para artefactos)
function safeRead(root, rel, maxLen = 20000) {
  if (!root || !rel) return null;
  const p = resolve(root, rel);
  const r = relative(resolve(root), p);
  if (r.startsWith('..') || isAbsolute(r)) return null;
  try { return readFileSync(p, 'utf8').slice(0, maxLen); } catch { return null; }
}
// diff de UN fichero del proyecto (git diff; si es nuevo/untracked → contenido)
function fileDiff(srcDir, rel) {
  if (!srcDir || !rel) return null;
  const r = relative(resolve(srcDir), resolve(srcDir, rel));
  if (r.startsWith('..') || isAbsolute(r)) return null;
  try {
    const d = execFileSync('git', ['diff', 'HEAD', '--', rel], { cwd: srcDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000, windowsHide: true });
    if (d.trim()) return d.slice(0, 30000);
  } catch {}
  const c = safeRead(srcDir, rel, 30000);
  return c != null ? `+++ ${rel} (nuevo)\n` + c.split('\n').map((l) => '+ ' + l).join('\n') : null;
}

const readJson = (p) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };
const readHead = (p, n = 600) => { try { return readFileSync(p, 'utf8').slice(0, n); } catch { return null; } };

// ficheros que el agente está tocando AHORA: diff de `git status` contra un BASELINE tomado al inicio
// de la fase (suciedad previa del repo excluida — solo lo que ESTA fase cambia). Cache 3s = coste ~0.
function gitMap(srcDir) {
  try {
    const out = execSync('git status --porcelain -uall', { cwd: srcDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 4000, windowsHide: true });
    const m = new Map();
    for (const l of out.split('\n')) { if (!l.trim()) continue; const p = l.slice(3).trim().replace(/^"|"$/g, ''); if (p) m.set(p, l.slice(0, 2)); }
    return m;
  } catch { return null; }
}
const _liveByDir = new Map(); // POR RUN (global cruzaba archivos entre runs simultáneos)
function liveFiles(srcDir, cur) {
  if (!srcDir || !cur) return [];
  const key = String(srcDir);
  const now = Date.now();
  let L = _liveByDir.get(key);
  if (L && L.phaseKey === cur.startedAt && now - L.at < 3000) return L.files;
  const m = gitMap(srcDir);
  if (!m) return [];
  if (!L || L.phaseKey !== cur.startedAt) { _liveByDir.set(key, { phaseKey: cur.startedAt, base: m, at: now, files: [] }); return []; } // baseline de la fase
  const files = [];
  for (const [p, code] of m) {
    if (L.base.get(p) === code || p.startsWith('openspec/')) continue;
    files.push({ p, k: !L.base.has(p) ? 'create' : /D/.test(code) ? 'delete' : 'edit' });
    if (files.length >= 60) break;
  }
  L.at = now; L.files = files;
  return files;
}

// /usage del proveedor BYOK (LiteLLM): gasto y presupuesto de TU key vía GET /key/info (la misma key,
// solo lectura, cada 60s, best-effort — sin datos la tarjeta no aparece). Opt-out: CONDUCTOR_USAGE=0.
let _usage = { at: 0, data: null, startSpend: null };
async function litellmUsage(env = process.env) {
  if (env.CONDUCTOR_USAGE === '0') return null;
  const base = (env.COPILOT_PROVIDER_BASE_URL || '').replace(/\/+$/, ''), key = env.COPILOT_PROVIDER_API_KEY;
  if (!base || !key) return null;
  if (Date.now() - _usage.at < 60000) return _usage.data;
  _usage.at = Date.now();
  try {
    const res = await fetch(base + '/key/info', { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(4000) });
    if (res.ok) {
      const j = await res.json(); const i = j.info || j;
      const spend = +(+i.spend || 0).toFixed(4);
      if (_usage.startSpend === null) _usage.startSpend = spend; // foto al empezar el run
      _usage.data = { spend, budget: i.max_budget ?? null, runDelta: +(spend - _usage.startSpend).toFixed(4) };
    }
  } catch { /* sin red / endpoint distinto → sin tarjeta */ }
  return _usage.data;
}

// uso de Copilot (premium requests / AI Credits) vía la API oficial de billing, usando el `gh` CLI ya
// autenticado del usuario (GET /users/{u}/settings/billing/premium_request/usage — verificada en docs
// GitHub 2026). Best-effort: sin gh / sin permisos → sin tarjeta. Cache 5 min. Opt-out: CONDUCTOR_USAGE=0.
let _ghUsage = { at: 0, data: null };
function ghPremiumUsage(env = process.env) {
  if (env.CONDUCTOR_USAGE === '0') return null;
  if (Date.now() - _ghUsage.at < 300000) return _ghUsage.data;
  _ghUsage.at = Date.now();
  try {
    // fuente REAL de la cuota del seat (lo que Copilot muestra en /usage): copilot_internal/user
    // → quota_snapshots.premium_interactions {percent_remaining, remaining, entitlement} + quota_reset_date.
    // Verificado en un seat Business real (2026-06). gh es OPCIONAL: sin gh/permiso → sin tarjeta.
    const raw = execSync('gh api /copilot_internal/user', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 8000, windowsHide: true });
    const j = JSON.parse(raw);
    const q = j?.quota_snapshots?.premium_interactions;
    if (!q || q.unlimited) { _ghUsage.data = null; return null; }
    _ghUsage.data = {
      plan: j.copilot_plan || null,
      used: Math.max(0, Math.round((q.entitlement || 0) - (q.remaining ?? q.quota_remaining ?? 0))),
      entitlement: q.entitlement || 0,
      percentUsed: Math.max(0, Math.round(100 - (q.percent_remaining ?? 100))),
      reset: (j.quota_reset_date || '').slice(5),
      overage: q.overage_permitted === true,
    };
  } catch { /* fallo puntual de gh: conservar el último dato bueno y reintentar en 60s */ _ghUsage.at = Date.now() - 240000; }
  return _ghUsage.data;
}

// contexto del proyecto (una vez): nombre de carpeta + rama git
const _ctxByDir = new Map(); // POR PROYECTO (un cache global mostraba el mismo nombre en todos los runs)
function projectCtx(srcDir) {
  const key = String(srcDir || '');
  if (_ctxByDir.has(key)) return _ctxByDir.get(key);
  let branch = null;
  try { branch = execSync('git branch --show-current', { cwd: srcDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000, windowsHide: true }).trim() || null; } catch {}
  const ctx = { project: srcDir ? srcDir.replace(/[\\/]+$/, '').split(/[\\/]/).pop() : null, branch };
  _ctxByDir.set(key, ctx);
  return ctx;
}

// opciones para el selector de modelo en caliente: config del usuario + modelos vistos en el run
function modelOptions(srcDir, tl) {
  const out = new Set();
  try { const m = readDriveConfig(srcDir).models || {}; for (const v of Object.values(m)) if (v) out.add(v); } catch {}
  for (const p of tl?.phases ?? []) if (p.model) out.add((p.provider === 'byok' ? 'byok:' : p.provider === 'copilot' ? 'copilot:' : '') + p.model);
  // sugerencias estables (catálogo Business conocido + BYOK LiteLLM corporativo) — el input sigue siendo libre
  for (const m of ['copilot:claude-sonnet-4.6', 'copilot:claude-haiku-4.5', 'copilot:claude-opus-4.8', 'byok:qwen36-msc1', 'byok:qwen36-msc2', 'byok:deepseek-v4-flash']) out.add(m);
  return [...out].slice(0, 16);
}

export function runState(changeDir, srcDir, { alive = null } = {}) {
  const tl = readJson(join(changeDir, '.conductor', 'timeline.json')) ?? readJson(join(changeDir, 'run-timeline.json'));
  const st = readJson(join(changeDir, '.conductor', 'state.json')) ?? readJson(join(changeDir, '.conductor-run.json'));
  const cur = tl?.current ?? null;
  const isCode = cur && (cur.phase === 'apply' || cur.phase === 'fix');
  // CONSUMO por modelo/proveedor (lo que importa): tokens y coste de cada modelo usado en el run,
  // + nº de fases que fueron contra el catálogo Copilot Business (≈ premium requests gastadas).
  // consumo POR MODELO (tokens; el dinero real lo dan LiteLLM /key/info y el billing de Copilot — los
  // $ "de catálogo" y las "premium reqs" eran conceptos legacy: Copilot Business funciona con AI Credits)
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const priceFor = (m) => { const n = norm(m); for (const [k, v] of Object.entries(PRICE)) if (norm(k) === n) return v; return null; };
  const byModel = {};
  for (const p of tl?.phases ?? []) {
    if (!p.tokens) continue;
    const pr = priceFor(p.model);
    const key = (p.model || 'desconocido') + (p.provider ? ` (${p.provider})` : pr && pr.tier !== 'byok' ? ' (copilot)' : '');
    const b = (byModel[key] ??= { in: 0, out: 0, phases: 0 });
    b.in += p.tokens.in; b.out += p.tokens.out; b.phases++;
  }
  return {
    ...projectCtx(srcDir),
    cost: { byModel },
    live: isCode ? liveFiles(srcDir, cur) : [],
    logTail: (readHead(join(changeDir, '.conductor', 'log.txt'), 1e6) || '').split('\n').filter(Boolean).slice(-30),
    modelOptions: modelOptions(srcDir, tl),
    verifyExcerpt: readHead(join(changeDir, 'verify-report.md')),
    verdict: tl?.verdict && tl.verdict !== 'running' ? tl.verdict : (st?.status === 'done' ? st.verdict : (alive === false && tl ? 'INTERRUMPIDO' : null)),
    request: tl?.request ?? st?.request ?? '',
    complexity: tl?.complexity ?? st?.complexity ?? '',
    resumed: tl?.resumed ?? false,
    total_ms: tl?.total_ms ?? null,
    phases: tl?.phases ?? [],
    plan: st?.phases ?? [],
    current: cur,
    now: Date.now(), // referencia de reloj del server (la página calcula elapsed sin depender de su reloj)
    done: !!(tl?.verdict && tl.verdict !== 'running') || st?.status === 'done',
    hasDashboard: existsSync(join(changeDir, 'dashboard.html')),
  };
}


export function createRunServer({ changeDir, srcDir, port = 0, host = '127.0.0.1' }) {
  // aprobación human-in-the-loop (POST /api/continue) + STOP limpio (POST /api/stop): la señal de stop
  // la observa el driver y el runner (mata la fase en vuelo, limpia sesiones, marca STOPPED, resume queda).
  let pending = null, resolver = null;
  const stopSignal = { requested: false };
  const server = createServer((req, res) => {
    if (req.method === 'POST' && req.url?.startsWith('/api/continue')) {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        let payload = {}; try { payload = JSON.parse(body || '{}'); } catch {}
        if (resolver) { const r = resolver; pending = null; resolver = null; r(payload); res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"ok":true}'); }
        else { res.writeHead(409, { 'content-type': 'application/json' }); res.end('{"ok":false}'); }
      });
    } else if (req.method === 'POST' && req.url?.startsWith('/api/stop')) {
      stopSignal.requested = true;
      if (resolver) { const r = resolver; pending = null; resolver = null; r({ stop: true }); } // si estaba en pausa, desbloquea hacia el abort
      res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"ok":true}');
    } else if (req.method === 'POST' && req.url?.startsWith('/api/artifact')) {
      // P1: editar un artefacto del change desde la web (solo .md, confinado, nunca .conductor)
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        try {
          const { p: rel, content } = JSON.parse(body || '{}');
          const okPath = rel && rel.endsWith('.md') && !rel.includes('.conductor') && safeRead(changeDir, rel) !== null;
          if (!okPath || typeof content !== 'string' || content.length > 200000) { res.writeHead(400, { 'content-type': 'application/json' }); return res.end('{"ok":false}'); }
          writeFileSync(join(changeDir, rel), content);
          res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"ok":true}');
        } catch { res.writeHead(500, { 'content-type': 'application/json' }); res.end('{"ok":false}'); }
      });
    } else if (req.method === 'POST' && req.url?.startsWith('/api/rollback')) {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        try {
          const { phase } = JSON.parse(body || '{}');
          const r2 = rollbackTo(srcDir, changeDir, String(phase || ''));
          res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, restored: r2.restored.length, removed: r2.removed.length }));
        } catch (e) { res.writeHead(500, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: e.message })); }
      });
    } else if (req.url?.startsWith('/api/artifact')) {
      // ver un artefacto del change (proposal/spec/...) — confinado al changeDir y nunca .conductor
      const u = new URL(req.url, 'http://x');
      const rel = u.searchParams.get('p') || '';
      const body = rel.includes('.conductor') ? null : safeRead(changeDir, rel);
      res.writeHead(body != null ? 200 : 404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end(body ?? 'no encontrado');
    } else if (req.url?.startsWith('/api/diff')) {
      // diff real de un fichero del proyecto (git; nuevo → contenido) — confinado al srcDir
      const u = new URL(req.url, 'http://x');
      const body = fileDiff(srcDir, u.searchParams.get('p') || '');
      res.writeHead(body != null ? 200 : 404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end(body ?? 'no encontrado');
    } else if (req.url?.startsWith('/api/raw')) {
      // CRUDO del modelo por fase ("lo que verías sin conductor") — fichero whitelisteado en .conductor/raw/
      const u = new URL(req.url, 'http://x');
      const ph = (u.searchParams.get('phase') || '').replace(/[^a-z]/g, '');
      let body = null; try { if (ph) body = readFileSync(join(changeDir, '.conductor', 'raw', ph + '.txt'), 'utf8'); } catch {}
      res.writeHead(body != null ? 200 : 404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end(body ?? 'no encontrado');
    } else if (req.url?.startsWith('/api/state')) {
      litellmUsage().then((usage) => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ...runState(changeDir, srcDir), pending, stopRequested: stopSignal.requested, usage, ghUsage: ghPremiumUsage() }));
      }).catch(() => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ...runState(changeDir, srcDir), pending, stopRequested: stopSignal.requested, usage: null, ghUsage: null })); });
    } else {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(RUN_PAGE.replace('__API__', '/api/'));
    }
  });
  return new Promise((resolveP, rejectP) => {
    server.on('error', rejectP);
    server.listen(port, host, () => {
      const addr = server.address();
      resolveP({
        url: `http://${host}:${addr.port}/`,
        close: () => new Promise((r) => server.close(r)),
        waitApproval: (info) => new Promise((r) => { pending = info; resolver = r; }),
        stopSignal,
      });
    });
  });
}

// ───────────────────────────────────────────────────────────────────────────────────────────────
// PANEL DE PROYECTO (mini-web v2): lista todos los changes/runs y permite LANZAR y REANUDAR runs
// desde el navegador — SIN modelo de sesión por medio (cero AIC de orquestación, cero fabricaciones).
// El run lanzado corre con su propia mini-web (--serve) y el panel enlaza a ella vía el lock.
export function listChanges(root) {
  const dir = join(root, 'openspec', 'changes');
  let names = [];
  try { names = readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory() && e.name !== 'archive').map((e) => e.name); } catch {}
  return names.map((name) => {
    const ch = join(dir, name);
    const tl = readJson(join(ch, '.conductor', 'timeline.json')) ?? readJson(join(ch, 'run-timeline.json'));
    const lock = activeRun(ch);
    let mtime = 0; try { mtime = statSync(ch).mtimeMs; } catch {}
    let tin = 0, tout = 0;
    for (const p of tl?.phases ?? []) { tin += p.tokens?.in || 0; tout += p.tokens?.out || 0; }
    return {
      name,
      request: tl?.request || '',
      verdict: lock ? 'EN CURSO' : (tl?.verdict && tl.verdict !== 'running' ? tl.verdict : (tl ? 'INTERRUMPIDO' : '—')),
      phases: tl?.phases?.length ?? 0,
      complexity: tl?.complexity || '',
      tokens: { in: tin, out: tout },
      url: lock?.url || null,
      hasDashboard: existsSync(join(ch, 'dashboard.html')),
      resumable: !lock && !!tl?.request && tl?.verdict !== 'GREEN',
      mtime,
    };
  }).sort((a, b) => b.mtime - a.mtime);
}

// spawner real (inyectable en tests): lanza el driver DETACHED con su propia web (sin abrir navegador)
function defaultSpawnRun({ engine, root, name, request, complexity, domain }) {
  const changeDir = join(root, 'openspec', 'changes', name);
  const args = [engine, 'drive', changeDir, '--request', request, '--src', root, '--complexity', complexity || 'medium', '--domain', domain || name.split('-')[0], '--serve'];
  const child = spawn(process.execPath, args, { detached: true, stdio: 'ignore', windowsHide: true, env: { ...process.env, CONDUCTOR_SERVE_OPEN: '0' } });
  child.unref();
  return { pid: child.pid };
}


export function createProjectServer({ root, engine, spawnRun = defaultSpawnRun, port = 0, host = '127.0.0.1' }) {
  const readBody = (req) => new Promise((r) => { let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => { try { r(JSON.parse(b || '{}')); } catch { r({}); } }); });
  const server = createServer(async (req, res) => {
    const json = (code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
    if (req.url?.startsWith('/api/changes')) {
      json(200, { project: resolve(root).split(/[\\/]/).pop(), changes: listChanges(root), ghUsage: ghPremiumUsage() });
    } else if (req.method === 'POST' && req.url?.startsWith('/api/launch')) {
      const b = await readBody(req);
      if (!b.request || !/^[a-z0-9-]+$/.test(b.name || '')) return json(400, { ok: false, error: 'request y name (kebab) requeridos' });
      const r = spawnRun({ engine, root, name: b.name, request: b.request, complexity: b.complexity, domain: b.domain });
      json(200, { ok: true, ...r });
    } else if (req.method === 'POST' && req.url?.startsWith('/api/resume')) {
      const b = await readBody(req);
      if (!/^[a-z0-9-]+$/.test(String(b.name || ''))) return json(400, { ok: false });
      const ch = join(root, 'openspec', 'changes', b.name);
      const tl = readJson(join(ch, '.conductor', 'timeline.json'));
      if (!tl?.request) return json(404, { ok: false, error: 'sin timeline/request que reanudar' });
      if (activeRun(ch)) return json(409, { ok: false, error: 'ya hay un run en curso' });
      const r = spawnRun({ engine, root, name: b.name, request: tl.request, complexity: tl.complexity, domain: tl.domain });
      json(200, { ok: true, ...r });
    } else if (req.url?.startsWith('/artifact/')) {
      // sirve el dashboard.html de un change (solo ese fichero, confinado por nombre kebab)
      const m = req.url.match(/^\/artifact\/([a-z0-9-]+)\/dashboard\.html$/);
      const body = m ? safeRead(join(root, 'openspec', 'changes', m[1]), 'dashboard.html', 1e6) : null;
      res.writeHead(body != null ? 200 : 404, { 'content-type': 'text/html; charset=utf-8' });
      res.end(body ?? 'no encontrado');
    } else {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(PANEL_PAGE);
    }
  });
  return new Promise((resolveP, rejectP) => {
    server.on('error', rejectP);
    server.listen(port, host, () => {
      resolveP({ url: `http://${host}:${server.address().port}/`, close: () => new Promise((r) => server.close(r)) });
    });
  });
}


// ───────────────────────────────────────────────────────────────────────────────────────────────
// APP ÚNICA (v3-P0): UN proceso = conductor. '/' panel · '/run/<change>' vista del run · drivers
// como HIJOS por IPC (pausas/stop/aprobación/nota/modelo viajan por el canal — no más servers
// efímeros ni pestañas nuevas). PWA instalable. El estado vive en archivos (.conductor/) y el
// control en el registro de hijos de este proceso.
const MANIFEST = JSON.stringify({
  name: 'conductor', short_name: 'conductor', start_url: '/', display: 'standalone',
  background_color: '#ffffff', theme_color: '#6e56cf', description: 'SDD pipeline verificado',
  icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
});
const ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#6e56cf"/><text x="32" y="45" font-size="38" font-weight="800" font-family="sans-serif" fill="#fff" text-anchor="middle">C</text></svg>';

// ── APP GLOBAL (v4-P2): registro de proyectos — un solo conductor para toda la máquina ──
// id estable: <basename>~<hash6 del path>. Persistido en ~/.conductor/projects.json.
// La API jamás lista/lee fuera de los roots registrados (los registra solo el launcher local).
const CONDUCTOR_HOME = () => process.env.CONDUCTOR_HOME || join(homedir(), '.conductor');
const REG_FILE = () => join(CONDUCTOR_HOME(), 'projects.json');
const projId = (root) => {
  const base = String(root).replace(/[\\/]+$/, '').split(/[\\/]/).pop().toLowerCase().replace(/[^a-z0-9-]+/g, '-').slice(0, 24) || 'proyecto';
  const h = createHash('sha256').update(resolve(root).toLowerCase()).digest('hex').slice(0, 6);
  return base + '~' + h;
};
function loadRegistry() {
  try { return JSON.parse(readFileSync(REG_FILE(), 'utf8')).filter((p) => p && p.root && existsSync(p.root)); } catch { return []; }
}
function saveRegistry(list) {
  try { mkdirSync(CONDUCTOR_HOME(), { recursive: true }); writeFileSync(REG_FILE(), JSON.stringify(list, null, 2)); } catch {}
}

// ── MODELOS REALES (cero listas inventadas): byok = GET /v1/models de LiteLLM (estándar OpenAI,
// con creds de env o ~/.conductor/byok.json); copilot = modelos OBSERVADOS en la telemetría OTel de
// los runs (los que de verdad funcionaron en el seat) + los de conductor.json. Cache 10 min. ──
let _models = { at: 0, data: null };
function byokCredsLocal() {
  const env = process.env;
  if (env.COPILOT_PROVIDER_BASE_URL && env.COPILOT_PROVIDER_API_KEY) return { baseUrl: env.COPILOT_PROVIDER_BASE_URL, apiKey: env.COPILOT_PROVIDER_API_KEY };
  try {
    const j = JSON.parse(readFileSync(join(CONDUCTOR_HOME(), 'byok.json'), 'utf8'));
    // apiKeyEnc = key cifrada con DPAPI (formato nuevo); apiKey = texto plano legacy (retrocompat)
    const apiKey = j.apiKey || (j.apiKeyEnc ? decryptSecret(j.apiKeyEnc) : null);
    if (j.baseUrl && apiKey) return { baseUrl: j.baseUrl, apiKey, type: j.type || 'openai' };
  } catch {}
  return null;
}
// cache de NOMBRES de modelo (los ids NO son secretos; la KEY sí). Hace que el picker muestre qwen
// SIEMPRE, aunque la app arranque sin credenciales — se siembra al hacer `byok save` o un fetch en vivo.
const MODELS_CACHE = () => join(CONDUCTOR_HOME(), 'models-cache.json');
export function readModelsCache() { return readJson(MODELS_CACHE()); }
export function writeModelsCache(byokIds, baseUrl) {
  if (!byokIds?.length) return; // nunca sobrescribir la cache con una lista vacía (defensa en profundidad)
  try {
    const cur = readJson(MODELS_CACHE()) || {};
    cur.version = 1;
    cur.byok = { baseUrlHash: createHash('sha256').update(String(baseUrl || '')).digest('hex').slice(0, 6), models: [...new Set(byokIds || [])].sort(), at: Date.now(), source: 'LiteLLM /v1/models' };
    mkdirSync(CONDUCTOR_HOME(), { recursive: true });
    writeFileSync(MODELS_CACHE(), JSON.stringify(cur, null, 2));
  } catch {}
}
async function availableModels(registry) {
  if (Date.now() - _models.at < 600000 && _models.data) return _models.data;
  const byok = new Set(), copilot = new Set();
  // observados en TODOS los proyectos (requested y reported) — red de seguridad
  for (const p of registry.values()) {
    for (const c of listChanges(p.root)) {
      const tl = readJson(join(p.root, 'openspec', 'changes', c.name, '.conductor', 'timeline.json'));
      for (const ph of tl?.phases ?? []) {
        const m = ph.modelReported || ph.model; if (!m) continue;
        (ph.provider === 'byok' ? byok : copilot).add(m);
      }
    }
    try { const cfg = readDriveConfig(p.root).models || {}; for (const v of Object.values(cfg)) { if (typeof v !== 'string') continue; if (v.startsWith('byok:')) byok.add(v.slice(5)); else if (v.startsWith('copilot:')) copilot.add(v.slice(8)); } } catch {}
  }
  // byok: 1) en vivo desde el proveedor si hay creds (y CACHEA los nombres); 2) si no, lee la cache; 3) observados
  let byokSource = 'observados', byokCachedAt = null, live = false;
  const creds = byokCredsLocal();
  if (creds) {
    try {
      const base = String(creds.baseUrl).replace(/\/+$/, '');
      const r = await fetch((base.endsWith('/v1') ? base : base + '/v1') + '/models', { headers: { authorization: `Bearer ${creds.apiKey}` }, signal: AbortSignal.timeout(5000) });
      if (r.ok) { const j = await r.json(); const ids = []; for (const m of j.data ?? []) if (m.id) { byok.add(m.id); ids.push(m.id); } if (ids.length) { byokSource = 'LiteLLM /v1/models (en vivo)'; live = true; writeModelsCache(ids, creds.baseUrl); } }
    } catch {}
  }
  if (!live) {
    const cache = readModelsCache();
    if (cache?.byok?.models?.length) { for (const m of cache.byok.models) byok.add(m); byokSource = 'LiteLLM (cache)'; byokCachedAt = cache.byok.at || null; }
  }
  _models.at = Date.now();
  _models.data = { byok: [...byok].sort(), copilot: [...copilot].sort(), byokSource, copilotSource: 'observados en runs reales', byokCreds: !!creds, byokCachedAt };
  return _models.data;
}

// spawner IPC real (inyectable en tests): driver hijo SIN server propio, control por canal IPC
function spawnIpcRun({ engine, root, name, request, complexity, domain, models, auto }) {
  const changeDir = join(root, 'openspec', 'changes', name);
  const args = [engine, 'drive', changeDir, '--request', request, '--src', root, '--complexity', complexity || 'medium', '--domain', domain || name.split('-')[0], '--ipc'];
  if (auto) args.push('--auto');
  // modelo elegido en el lanzador → env CONDUCTOR_MODEL_{ROLE} (el driver lo respeta; verificable en el registro)
  const env = { ...process.env, CONDUCTOR_SERVE: '0' };
  if (models && typeof models === 'object') {
    if (models.planner) env.CONDUCTOR_MODEL_PLANNER = models.planner;
    if (models.coder) env.CONDUCTOR_MODEL_CODER = models.coder;
    if (models.reviewer) env.CONDUCTOR_MODEL_REVIEWER = models.reviewer;
    if (models.all) { env.CONDUCTOR_MODEL = models.all; }
  }
  const child = spawn(process.execPath, args, { stdio: ['ignore', 'ignore', 'ignore', 'ipc'], windowsHide: true, env });
  return child;
}


// estado DEMO (showcase visual: todas las situaciones de UI a la vez — QA humana y screenshots)
const DEMO_STATE = () => ({
  project: 'demo-project', branch: 'feature/header', request: 'añade un componente header con título y test',
  complexity: 'medium', verdict: null, done: false, resumed: true, total_ms: 754000, now: Date.now(),
  plan: ['propose', 'spec', 'apply', 'verify'],
  current: null,
  pending: { before: 'fix', role: 'coder', findings: ['REQ-HEADER: el scenario "shows title" no tiene test asociado', 'tasks.md: 2/3 tareas sin cerrar'] },
  approvals: [{ phase: 'apply', at: new Date().toISOString(), via: 'human-web' }],
  phases: [
    { phase: 'propose', role: 'planner', model: 'qwen36-msc1', provider: 'byok', attempts: 1, ms: 61000, tokens: { in: 433000, out: 1300 }, files: [{ p: 'proposal.md', k: 'create' }], ok: true },
    { phase: 'spec', role: 'planner', model: 'qwen36-msc1', provider: 'byok', attempts: 2, ms: 64000, tokens: { in: 510000, out: 1500 }, files: [{ p: 'specs/header/spec.md', k: 'create' }], lastError: 'timeout en el intento 1 — reintentado con éxito', ok: true },
    { phase: 'apply', role: 'coder', model: 'claude-haiku-4.5', provider: 'copilot', attempts: 1, ms: 180000, tokens: { in: 1083000, out: 16200 }, files: [{ p: 'src/header.js', k: 'create' }, { p: 'src/header.test.js', k: 'create' }, { p: 'src/app.js', k: 'edit' }], ok: true },
    { phase: 'verify', role: 'reviewer', model: 'qwen36-msc1', provider: 'byok', attempts: 1, ms: 95000, tokens: { in: 200000, out: 900 }, files: [{ p: 'verify-report.md', k: 'create' }], lenses: ['correctness', 'security', 'tests'], ok: true },
  ],
  cost: { byModel: { 'qwen36-msc1 (byok)': { in: 1143000, out: 3700, phases: 3 }, 'claude-haiku-4.5 (copilot)': { in: 1083000, out: 16200, phases: 1 } } },
  live: [{ p: 'src/header.css', k: 'create' }],
  logTail: ['[10:00:01] ⏳ propose (planner)', '[10:01:02] ✅ propose', '[10:02:31] ✅ spec', '[10:05:44] ✅ apply', '[10:05:44] ⏸ pausado antes de "fix" — el gate encontró 2 hallazgos'],
  modelOptions: ['byok:qwen36-msc1', 'byok:qwen36-msc2', 'copilot:claude-haiku-4.5', 'copilot:claude-sonnet-4.6'],
  usage: { spend: 7.18, budget: 40, runDelta: 0.0123 },
  ghUsage: { plan: 'business', used: 2219, entitlement: 6000, percentUsed: 37, reset: '07-01' },
  verifyExcerpt: '# Verify Report (multi-lens, 3/3)',
  stopRequested: false,
});

export function createAppServer({ root, engine, spawnRun = spawnIpcRun, port = 0, host = '127.0.0.1', version = null, onShutdown = null }) {
  const runs = new Map(); // key "<projId>/<change>" → { child, pending, stopRequested, exited }
  // registro de proyectos: persistido + el root inicial como proyecto por defecto
  const registry = new Map(); // id → { id, root, name }
  for (const p of loadRegistry()) registry.set(p.id, p);
  const ensureProject = (r) => {
    const abs = resolve(r);
    const id = projId(abs);
    if (!registry.has(id)) {
      registry.set(id, { id, root: abs, name: abs.split(/[\\/]/).pop() });
      saveRegistry([...registry.values()]);
    }
    return registry.get(id);
  };
  const DEFAULT = ensureProject(root);
  const projOf = (id) => registry.get(id) || null;
  const runKey = (pid, name) => pid + '/' + name;
  // ANTI-CSRF/DNS-rebinding: los POST cross-site "ciegos" llegan sin Content-Type JSON (los con JSON
  // disparan preflight CORS, que jamas aprobamos) y/o con Host ajeno. Se rechazan ANTES de enrutar.
  const guard = (req, res) => {
    const h = String(req.headers.host || '');
    if (!(h.startsWith('127.0.0.1') || h.startsWith('localhost'))) { res.writeHead(403); res.end('{"ok":false,"error":"host"}'); return false; }
    if (req.method === 'POST' && !String(req.headers['content-type'] || '').includes('application/json')) { res.writeHead(403, { 'content-type': 'application/json' }); res.end('{"ok":false,"error":"content-type application/json requerido"}'); return false; }
    return true;
  };
  const readBody = (req) => new Promise((r) => { let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => { try { r(JSON.parse(b || '{}')); } catch { r({}); } }); });
  const launch = (proj, name, request, complexity, domain, models, auto) => {
    const child = spawnRun({ engine, root: proj.root, name, request, complexity, domain, models, auto });
    const reg = { child, pending: null, stopRequested: false, exited: false };
    child.on?.('message', (m) => { if (m && m.t === 'pause') reg.pending = { before: m.before, role: m.role, findings: m.findings }; });
    child.on?.('exit', () => { reg.exited = true; reg.pending = null; });
    runs.set(runKey(proj.id, name), reg);
    return reg;
  };
  const server = createServer(async (req, res) => {
    const json = (code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
    const html = (body) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(body); };
    if (!guard(req, res)) return;
    const u = new URL(req.url || '/', 'http://x');
    const seg = u.pathname.split('/').filter(Boolean);
    try {
      if (u.pathname === '/manifest.json') { res.writeHead(200, { 'content-type': 'application/manifest+json' }); return res.end(MANIFEST); }
      if (u.pathname === '/icon.svg') { res.writeHead(200, { 'content-type': 'image/svg+xml' }); return res.end(ICON_SVG); }
      if (u.pathname === '/api/ping') return json(200, { ok: true, app: 'conductor', version, root: DEFAULT.root, projects: [...registry.values()] });
      if (req.method === 'POST' && u.pathname === '/api/shutdown') {
        // auto-reemplazo tras actualizar — JAMAS con runs vivos (un relevo mio mato un run a mitad de fix)
        const activos = [...runs.values()].filter((r2) => !r2.exited).length;
        if (activos && u.searchParams.get('force') !== '1') return json(409, { ok: false, error: 'hay ' + activos + ' run(s) en curso' });
        json(200, { ok: true, bye: true });
        for (const [, r2] of runs) { try { r2.child.kill?.(); } catch {} }
        if (onShutdown) onShutdown(); else server.close();
        return;
      }
      if (u.pathname === '/api/models') return json(200, await availableModels(registry));
      if (u.pathname === '/api/changes') {
        // openspec=true ⇔ el proyecto pasó por /sdd-init (tiene openspec/config.yaml) — el form lo señala
        const projects = [...registry.values()].map((p) => ({ id: p.id, name: p.name, root: p.root, openspec: existsSync(join(p.root, 'openspec', 'config.yaml')), changes: listChanges(p.root) }));
        const def = projects.find((p) => p.id === DEFAULT.id) || projects[0] || { name: DEFAULT.name, changes: [] };
        return json(200, { project: def.name, changes: def.changes, projects, ghUsage: ghPremiumUsage() });
      }
      if (req.method === 'POST' && u.pathname === '/api/launch') {
        const b = await readBody(req);
        if (!b.request || !/^[a-z0-9-]+$/.test(b.name || '')) return json(400, { ok: false, error: 'request y name (kebab) requeridos' });
        const proj = b.project ? (existsSync(b.project) ? ensureProject(b.project) : null) : (b.projectId ? projOf(b.projectId) : DEFAULT);
        if (!proj) return json(400, { ok: false, error: 'proyecto desconocido' });
        const ch = join(proj.root, 'openspec', 'changes', b.name);
        const k = runKey(proj.id, b.name);
        if (activeRun(ch) || (runs.get(k) && !runs.get(k).exited)) return json(409, { ok: false, error: 'ya hay un run en curso', url: `/run/${proj.id}/${b.name}` });
        launch(proj, b.name, b.request, b.complexity, b.domain, b.models, b.auto === true);
        return json(200, { ok: true, url: `/run/${proj.id}/${b.name}` });
      }
      if (req.method === 'POST' && u.pathname === '/api/resume') {
        const b = await readBody(req);
        if (!/^[a-z0-9-]+$/.test(String(b.name || ''))) return json(400, { ok: false });
        const proj = b.projectId ? projOf(b.projectId) : DEFAULT;
        if (!proj) return json(400, { ok: false, error: 'proyecto desconocido' });
        const ch = join(proj.root, 'openspec', 'changes', b.name);
        const tl = readJson(join(ch, '.conductor', 'timeline.json'));
        if (!tl?.request) return json(404, { ok: false, error: 'sin timeline que reanudar' });
        const k = runKey(proj.id, b.name);
        if (activeRun(ch) || (runs.get(k) && !runs.get(k).exited)) return json(409, { ok: false, error: 'ya hay un run en curso' });
        launch(proj, b.name, tl.request, tl.complexity, tl.domain);
        return json(200, { ok: true, url: `/run/${proj.id}/${b.name}` });
      }
      const mArt2 = u.pathname.match(/^\/artifact\/([a-z0-9-]+~[a-f0-9]{6})\/([a-z0-9-]+)\/dashboard\.html$/);
      const mArt = mArt2 ? null : u.pathname.match(/^\/artifact\/([a-z0-9-]+)\/dashboard\.html$/);
      if (mArt2) {
        const proj = projOf(mArt2[1]);
        if (!proj) { res.writeHead(404); return res.end('proyecto desconocido'); }
        const ch2 = join(proj.root, 'openspec', 'changes', mArt2[2]);
        const tl2 = readJson(join(ch2, '.conductor', 'timeline.json'));
        const rj = readJson(join(ch2, '.conductor', 'report.json'));
        if (tl2) { try { return html(renderDashboard({ change: mArt2[2], gates: rj?.gates ?? [], trace: rj?.trace ?? null, cost: null, timeline: tl2 })); } catch {} }
        const body = safeRead(ch2, 'dashboard.html', 1e6);
        res.writeHead(body != null ? 200 : 404, { 'content-type': 'text/html; charset=utf-8' }); return res.end(body ?? 'no encontrado');
      }
      if (mArt) {
        // SIEMPRE FRESCO: re-render con el estilo/datos actuales (el archivo en disco queda para offline/CI)
        const ch2 = join(root, 'openspec', 'changes', mArt[1]);
        const tl2 = readJson(join(ch2, '.conductor', 'timeline.json'));
        const rj = readJson(join(ch2, '.conductor', 'report.json'));
        if (tl2) { try { return html(renderDashboard({ change: mArt[1], gates: rj?.gates ?? [], trace: rj?.trace ?? null, cost: null, timeline: tl2 })); } catch {} }
        const body = safeRead(ch2, 'dashboard.html', 1e6);
        res.writeHead(body != null ? 200 : 404, { 'content-type': 'text/html; charset=utf-8' }); return res.end(body ?? 'no encontrado');
      }
      if (u.pathname === '/demo') return html(RUN_PAGE.replace('__API__', '/api/demo/'));
      if (seg[0] === 'api' && seg[1] === 'demo') {
        if (seg[2] === 'state') return json(200, DEMO_STATE());
        if (seg[2] === 'artifact') { res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' }); return res.end(['## ADDED Requirements (demo)', '<!-- id: REQ-HEADER -->', '### Requirement: Header', 'The system SHALL show a header.'].join(String.fromCharCode(10))); }
        if (seg[2] === 'diff') { res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' }); return res.end(['+++ src/header.js (nuevo)', '+ // @conductor REQ-HEADER', '+ export const header = (t) => ...'].join(String.fromCharCode(10))); }
        return json(200, { ok: true });
      }
      // /run/<name> → página del run (misma app, misma pestaña)
      if (seg[0] === 'run' && seg[1]) return html(RUN_PAGE.replace('__API__', '/api/'));
      // /api/run/<name>/<accion>
      if (seg[0] === 'api' && seg[1] === 'run' && seg[2]) {
        // forma 2-seg: /api/run/<projId>/<change>/<action> · forma 1-seg (compat): proyecto default
        let proj = DEFAULT, name, action;
        if (seg[3] && /~[a-f0-9]{6}$/.test(seg[2]) && projOf(seg[2])) { proj = projOf(seg[2]); name = seg[3]; action = seg[4] || ''; }
        else { name = seg[2]; action = seg[3] || ''; }
        if (!/^[a-z0-9-]+$/.test(name)) return json(400, { ok: false });
        const changeDir = join(proj.root, 'openspec', 'changes', name);
        const reg = runs.get(runKey(proj.id, name));
        if (action === 'state') {
          const alive = !!((reg && !reg.exited) || activeRun(changeDir));
          return json(200, { ...runState(changeDir, proj.root, { alive }), pending: reg?.pending ?? null, stopRequested: reg?.stopRequested ?? false, usage: await litellmUsage(), ghUsage: ghPremiumUsage(), now: Date.now() });
        }
        if (req.method === 'POST' && action === 'continue') {
          const payload = await readBody(req);
          if (!reg || reg.exited || !reg.pending) return json(409, { ok: false });
          reg.pending = null; try { reg.child.send({ t: 'continue', payload }); } catch {}
          return json(200, { ok: true });
        }
        if (req.method === 'POST' && action === 'resume') {
          const tl2 = readJson(join(changeDir, '.conductor', 'timeline.json'));
          if (!tl2?.request) return json(404, { ok: false });
          if (activeRun(changeDir) || (reg && !reg.exited)) return json(409, { ok: false, error: 'ya en curso' });
          launch(proj, name, tl2.request, tl2.complexity, tl2.domain); // proj resuelto arriba (firma correcta de launch)
          return json(200, { ok: true });
        }
        if (req.method === 'POST' && action === 'stop') {
          if (!reg || reg.exited) return json(409, { ok: false });
          reg.stopRequested = true; reg.pending = null; try { reg.child.send({ t: 'stop' }); } catch {}
          return json(200, { ok: true });
        }
        if (action === 'artifact' && req.method === 'POST') {
          const { p: rel, content } = await readBody(req);
          const okPath = rel && rel.endsWith('.md') && !rel.includes('.conductor') && safeRead(changeDir, rel) !== null;
          if (!okPath || typeof content !== 'string' || content.length > 200000) return json(400, { ok: false });
          writeFileSync(join(changeDir, rel), content);
          return json(200, { ok: true });
        }
        if (action === 'raw') {
          // CRUDO del modelo por fase ("lo que verías sin conductor"): fichero whitelisteado en .conductor/raw/
          const ph = (u.searchParams.get('phase') || '').replace(/[^a-z]/g, '');
          let body = null; try { if (ph) body = readFileSync(join(changeDir, '.conductor', 'raw', ph + '.txt'), 'utf8'); } catch {}
          res.writeHead(body != null ? 200 : 404, { 'content-type': 'text/plain; charset=utf-8' }); return res.end(body ?? 'no encontrado');
        }
        if (action === 'artifact') {
          const rel = u.searchParams.get('p') || '';
          const body = rel.includes('.conductor') ? null : safeRead(changeDir, rel);
          res.writeHead(body != null ? 200 : 404, { 'content-type': 'text/plain; charset=utf-8' }); return res.end(body ?? 'no encontrado');
        }
        if (action === 'diff') {
          const body = fileDiff(proj.root, u.searchParams.get('p') || '');
          res.writeHead(body != null ? 200 : 404, { 'content-type': 'text/plain; charset=utf-8' }); return res.end(body ?? 'no encontrado');
        }
        if (req.method === 'POST' && action === 'rollback') {
          const { phase } = await readBody(req);
          if (reg && !reg.exited && !reg.pending) return json(409, { ok: false, error: 'el run está en marcha — pausa o detén antes de deshacer' });
          try { const r2 = rollbackTo(proj.root, changeDir, String(phase || '')); return json(200, { ok: true, restored: r2.restored.length, removed: r2.removed.length }); }
          catch (e) { return json(500, { ok: false, error: e.message }); }
        }
        if (action === 'aiact') {
          try { return html(renderAiact(changeDir)); }
          catch (e) { res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); return res.end('aiact: ' + e.message); }
        }
        return json(404, { ok: false });
      }
      return html(PANEL_PAGE);
    } catch (e) { try { json(500, { ok: false, error: e.message }); } catch {} }
  });
  return new Promise((resolveP, rejectP) => {
    server.on('error', rejectP);
    server.listen(port, host, () => {
      resolveP({
        url: `http://${host}:${server.address().port}/`,
        runs,
        close: async () => { for (const [, r2] of runs) { try { r2.child.kill?.(); } catch {} } return new Promise((r3) => server.close(r3)); },
      });
    });
  });
}
