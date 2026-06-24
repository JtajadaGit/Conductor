// conductor/lib/serve.mjs — mini-web LOCAL del run (la respuesta por CÓDIGO al "no se ve nada").
// Un http server de Node puro (0 deps, solo 127.0.0.1) que sirve una página auto-refrescante con el
// timeline del run EN VIVO: lee run-timeline.json (+ .conductor-run.json) en cada poll. Estilo Notion,
// con la fase en curso viva (progress bar vs timeout, intento N/M, último error) y totales de tokens.
// Cero coste de tokens: aquí no hay LLM, solo ficheros locales.
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdirSync, renameSync, chmodSync } from 'node:fs';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { execSync, execFileSync, spawn } from 'node:child_process';
import { PRICE } from '../core/cost.mjs';
import { activeRun, rollbackTo, readDriveConfig, scrubSecrets } from '../pipeline/drive.mjs';
import { loadPolicy } from '../gates/policy.mjs';
import { classifyTier } from '../core/tiers.mjs';
import { renderAiact } from './aiact.mjs';
// UI ÚNICA = Vite (assets/ui), servida por ui-static. Este fallback mínimo solo aparece si la UI no está
// compilada (sin assets/ui) — ya no hay UI inline legacy. RUN_PAGE/PANEL_PAGE quedan como este aviso.
const NO_UI = '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>conductor</title></head><body style="font:15px/1.6 system-ui,sans-serif;color:#242424;background:#f6f8fb;margin:0;display:grid;place-items:center;min-height:100vh"><div style="max-width:30rem;padding:2rem;text-align:center"><h1 style="font-size:1.2rem;margin:0 0 .6rem">Interfaz no compilada</h1><p style="color:#46556a">Compila la UI con <code style="background:#eaf0f6;padding:.1rem .35rem;border-radius:5px">npm --prefix ui run build</code> y recarga esta página.</p></div></body></html>';
const RUN_PAGE = NO_UI, PANEL_PAGE = NO_UI;
import { uiStaticDir, hasStaticUi, serveStatic } from './ui-static.mjs';
import { estimateRun } from '../core/estimate.mjs';
import { listArchive, searchChanges, promoteSpec, archiveChange } from '../analysis/archive.mjs';
import { explain, renderSpec, renderTasks } from '../analysis/explain.mjs';
import { initConfig } from '../analysis/scaffold.mjs';
import { aggregateStats } from '../core/stats.mjs';
import { parseEvents, parseOtelSession } from '../core/events.mjs';
import { listCopilotModels } from '../pipeline/sdk-runner.mjs';
import { renderDashboard } from './dashboard.mjs';
import { decryptSecret, encryptSecret } from '../provenance/secret.mjs';

// lectura SEGURA dentro de una raíz (sin .., sin absolutos, sin .conductor para artefactos)
function safeRead(root, rel, maxLen = 20000) {
  if (!root || !rel) return null;
  const p = resolve(root, rel);
  const r = relative(resolve(root), p);
  if (r.startsWith('..') || isAbsolute(r)) return null;
  try { return readFileSync(p, 'utf8').slice(0, maxLen); } catch { return null; }
}
// H2: ¿la ruta toca la "fontanería" .conductor? CASE-INSENSITIVE — en NTFS (Windows, plataforma primaria)
// `.CONDUCTOR/state.json` apunta al mismo fichero, así que un `rel.includes('.conductor')` sensible a
// mayúsculas se saltaba el confinamiento y exponía el state interno + el crudo SIN scrubear. Match por
// SEGMENTO de ruta (inicio/sep … sep/fin) para no marcar ficheros tipo `.conductorX`.
const touchesPlumbing = (rel) => /(^|[\\/])\.conductor([\\/]|$)/i.test(String(rel || ''));
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
// extra a redactar en egress: la key de byok.json NO está en el env del server, así que el patrón sk-/Bearer
// no la cubre si tiene otro formato (virtual key LiteLLM). Se resuelve UNA vez y se memoiza (byokCredsLocal
// puede descifrar DPAPI → no llamarlo por poll). Defensa en profundidad: si el modelo ecoa la key, se redacta.
let _scrubExtra = null;
function scrubExtra() {
  if (_scrubExtra) return _scrubExtra;
  try { const c = byokCredsLocal(); _scrubExtra = c?.apiKey ? [c.apiKey] : []; } catch { _scrubExtra = []; }
  return _scrubExtra;
}
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
      // H3: coercer budget a número FINITO. Un proxy LiteLLM que devuelve max_budget:"40" (string) pasaba el
      // guard de la UI (truthy) y reventaba el render entero con `.toFixed is not a function`. null si no es número.
      const budget = i.max_budget == null ? null : (Number.isFinite(+i.max_budget) ? +i.max_budget : null);
      _usage.data = { spend, budget, runDelta: +(spend - _usage.startSpend).toFixed(4) };
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
    // etiqueta de proveedor LEGIBLE (sin jerga "byok"): qwen vía LiteLLM, o Copilot.
    const provLabel = (prov, tier) => prov === 'byok' ? 'LiteLLM' : prov === 'copilot' ? 'Copilot' : tier && tier !== 'byok' ? 'Copilot' : tier === 'byok' ? 'LiteLLM' : '';
    const lab = provLabel(p.provider, pr?.tier);
    const key = (p.model || 'desconocido') + (lab ? ` · ${lab}` : '');
    const b = (byModel[key] ??= { in: 0, out: 0, phases: 0 });
    b.in += p.tokens.in; b.out += p.tokens.out; b.phases++;
  }
  // AHORRO VISIBLE en la web (pilar nº1): coste con la mezcla REAL vs si TODO fuera el tope premium (opus).
  // El dato vivía solo en la CLI (`conductor stats`); aquí llega al run para que el ahorro se VEA. byok=$0.
  // REPARTO de esta feature en las unidades que IMPORTAN: AI Credits (las fases Copilot = peticiones premium)
  // vs qwen/BYOK (0 AIC; su consumo va a tu LiteLLM). NADA de dólares: Copilot va por AIC (la cuota global la
  // da ghUsage; el gasto LiteLLM lo da /key/info → runState.usage). priceFor solo clasifica byok por tier.
  let byokPhases = 0, copilotPhases = 0, byokIn = 0, byokOut = 0, copIn = 0, copOut = 0;
  for (const p of tl?.phases ?? []) {
    if (!p.tokens) continue;
    const i = p.tokens.in || 0, o = p.tokens.out || 0;
    const pr = priceFor(p.model);
    if (p.provider === 'byok' || (pr && pr.tier === 'byok')) { byokPhases++; byokIn += i; byokOut += o; }
    else { copilotPhases++; copIn += i; copOut += o; } // desconocido sin provider → Copilot (consume AIC)
  }
  const savings = (byokPhases + copilotPhases) > 0 ? {
    copilot_phases: copilotPhases, byok_phases: byokPhases,
    byok_in: byokIn, byok_out: byokOut, copilot_in: copIn, copilot_out: copOut,
  } : null;
  return {
    ...projectCtx(srcDir),
    cost: { byModel },
    savings,
    live: isCode ? liveFiles(srcDir, cur) : [],
    logTail: (readHead(join(changeDir, '.conductor', 'log.txt'), 1e6) || '').split('\n').filter(Boolean).slice(-30).map((l) => scrubSecrets(l, process.env, scrubExtra())),
    modelOptions: modelOptions(srcDir, tl),
    verifyExcerpt: scrubSecrets(readHead(join(changeDir, 'verify-report.md')), process.env, scrubExtra()),
    verdict: tl?.verdict && tl.verdict !== 'running' ? tl.verdict : (st?.status === 'done' ? st.verdict : (alive === false && tl ? 'INTERRUMPIDO' : null)),
    request: scrubSecrets(String(tl?.request ?? st?.request ?? '').slice(0, 8000), process.env, scrubExtra()), // L19: acota el request servido (re-render por poll)
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
          const okPath = rel && rel.endsWith('.md') && !touchesPlumbing(rel) && safeRead(changeDir, rel) !== null;
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
      const body = touchesPlumbing(rel) ? null : scrubSecrets(safeRead(changeDir, rel)); // H2: confina .conductor (case-insens) + scrub
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
      let body = null; try { if (ph) body = scrubSecrets(readFileSync(join(changeDir, '.conductor', 'raw', ph + '.txt'), 'utf8')); } catch {}
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
      if (!b.request || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(b.name || '')) return json(400, { ok: false, error: 'request y name (kebab) requeridos' });
      const r = spawnRun({ engine, root, name: b.name, request: b.request, complexity: b.complexity, domain: b.domain });
      json(200, { ok: true, ...r });
    } else if (req.method === 'POST' && req.url?.startsWith('/api/resume')) {
      const b = await readBody(req);
      if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(String(b.name || ''))) return json(400, { ok: false });
      const ch = join(root, 'openspec', 'changes', b.name);
      const tl = readJson(join(ch, '.conductor', 'timeline.json'));
      if (!tl?.request) return json(404, { ok: false, error: 'sin timeline/request que reanudar' });
      if (activeRun(ch)) return json(409, { ok: false, error: 'ya hay un run en curso' });
      const r = spawnRun({ engine, root, name: b.name, request: tl.request, complexity: tl.complexity, domain: tl.domain, models: tl.models });
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
  icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
});
const ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#6e56cf"/><text x="32" y="45" font-size="38" font-weight="800" font-family="sans-serif" fill="#fff" text-anchor="middle">C</text></svg>';
// SERVICE WORKER versionado (instalabilidad PWA + offline del historial). Cache nombrada por versión del
// plugin → al actualizar el motor (auto-relevo), 'activate' purga la vieja (skipWaiting+clients.claim) y
// NUNCA sirve un app-shell rancio. /api/* = network-first (cachea /api/changes para ver historial offline);
// /assets/* hasheados = cache-first (inmutables); navegación = network-first con fallback al shell cacheado.
const swJs = (version) => `const V='conductor-v${version || '0'}';const SHELL=['/','/manifest.json','/icon.svg'];
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(V).then(c=>c.addAll(SHELL).catch(()=>{})))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==V).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{const r=e.request;if(r.method!=='GET')return;const u=new URL(r.url);
if(u.pathname.startsWith('/assets/')){e.respondWith(caches.match(r).then(h=>h||fetch(r).then(res=>{const cp=res.clone();caches.open(V).then(c=>c.put(r,cp));return res})));return}
if(u.pathname.startsWith('/api/')){e.respondWith(fetch(r).then(res=>{if(u.pathname==='/api/changes'){const cp=res.clone();caches.open(V).then(c=>c.put(r,cp))}return res}).catch(()=>caches.match(r)));return}
if(r.mode==='navigate'){e.respondWith(fetch(r).catch(()=>caches.match('/')))}});`;

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
// lectura defensiva: descarta entradas sin root o con root inexistente (proyectos fantasma) y JSON no-array.
export function loadRegistry() {
  try {
    const j = JSON.parse(readFileSync(REG_FILE(), 'utf8'));
    if (!Array.isArray(j)) return [];
    return j.filter((p) => p && p.root && existsSync(p.root));
  } catch { return []; }
}
// escritura ATÓMICA (tmp + rename) + dedup por id: un crash a media escritura no corrompe el registro
// global (rompía la entrada única a la app para TODOS los proyectos). Ola 1 (projects-registry-recovery).
export function saveRegistry(list) {
  try {
    mkdirSync(CONDUCTOR_HOME(), { recursive: true });
    const seen = new Map();
    for (const p of (Array.isArray(list) ? list : [])) if (p && p.id) seen.set(p.id, p);
    const tmp = REG_FILE() + '.' + process.pid + '.tmp';
    writeFileSync(tmp, JSON.stringify([...seen.values()], null, 2));
    renameSync(tmp, REG_FILE());
  } catch {}
}

// ── MODELOS REALES (cero listas inventadas): byok = GET /v1/models de LiteLLM (estándar OpenAI,
// con creds de env o ~/.conductor/byok.json); copilot = modelos OBSERVADOS en la telemetría OTel de
// los runs (los que de verdad funcionaron en el seat) + los de conductor.json. Cache 10 min. ──
let _models = { at: 0, data: null };
// catálogo REAL de modelos Copilot vía el SDK (client.listModels), cacheado y rellenado en BACKGROUND.
// NUNCA una lista inventada: si el SDK/runtime no responde, el picker muestra SOLO lo OBSERVADO en runs.
let _copilotCat = { at: 0, models: [], fetching: false };
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
// ¿es `id` un modelo de la familia Copilot (claude/gpt/gemini/o-series/grok)? Se usa para que el grupo
// BYOK (proveedor propio: qwen/deepseek/…) nunca liste un modelo Copilot por una cache vieja o un run mal
// marcado (el bug "sonnet dentro de BYOK"). Función PURA exportada para poder testearla en aislado.
export function isCopilotFamily(id) {
  return /^(claude|gpt|gemini|o[134]|opus|sonnet|haiku|grok)\b|[-/](claude|gpt|gemini|opus|sonnet|haiku)\b/i.test(String(id || ''));
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
  let byokSource = 'observados', byokCachedAt = null, live = false, byokReason = null;
  const creds = byokCredsLocal();
  if (!creds) {
    // byok-decrypt-crossplatform: distinguir "no hay key" de "key cifrada DPAPI, ilegible fuera de Windows"
    try { const j = JSON.parse(readFileSync(join(CONDUCTOR_HOME(), 'byok.json'), 'utf8')); if (j.apiKeyEnc && process.platform !== 'win32') byokReason = 'byok.json usa cifrado DPAPI (solo descifrable en Windows). Exporta COPILOT_PROVIDER_API_KEY o re-guarda con `conductor byok save` en este SO.'; } catch {}
  }
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
  // catálogo REAL de Copilot (SDK client.listModels) fusionado con lo observado. Refresco en BACKGROUND
  // (no bloquea el panel) + cache 10 min; si aún no hay catálogo del SDK, NO inventamos — solo lo observado.
  for (const m of _copilotCat.models) copilot.add(m);
  if (!_copilotCat.fetching && Date.now() - _copilotCat.at > 600000) {
    _copilotCat.fetching = true;
    let sdkBundle = null; try { sdkBundle = [join(resolve(process.argv[1]), '..', 'copilot-sdk.mjs')].find(existsSync) || null; } catch {}
    listCopilotModels({ sdkBundle }).then((ids) => { if (ids.length) { _copilotCat.models = ids; _models.at = 0; } _copilotCat.at = Date.now(); }).catch(() => {}).finally(() => { _copilotCat.fetching = false; });
  }
  // anti-fuga de familia Copilot en el grupo BYOK: un run mal configurado o una cache vieja pudo
  // marcar provider:'byok' sobre un modelo Copilot (claude/gpt/gemini/o-series). El grupo BYOK es SOLO
  // proveedor propio (qwen/deepseek/…); descartamos los nombres de familia Copilot para no confundir.
  for (const id of [...byok]) if (isCopilotFamily(id)) { byok.delete(id); copilot.add(id); }
  const byokIds = [...byok].sort(), copilotIds = [...copilot].sort();
  // tier por modelo (economy|balanced|premium) → el panel arma el preset "Optimizar coste" sin adivinar
  const tiers = {};
  for (const id of [...byokIds, ...copilotIds]) tiers[id] = classifyTier(id);
  _models.data = { byok: byokIds, copilot: copilotIds, tiers, byokSource, copilotSource: _copilotCat.models.length ? 'SDK Copilot (listModels)' : 'observados en runs', byokCreds: !!creds, byokUrl: creds ? String(creds.baseUrl || '') : '', byokCachedAt, byokReason };
  return _models.data;
}

// model-validation-before-send (función pura, testable): valida que los modelos "byok:" pedidos existan
// en el catálogo. copilot: no se valida (catálogo "observados", no autoritativo). Sin credenciales o sin
// lista byok → NO bloquea (no podemos validar de forma fiable; degradamos a permitir, no a 400).
export function checkByokModels(models, byokList, hasCreds) {
  if (!models || typeof models !== 'object') return { ok: true };
  const specs = ['planner', 'coder', 'reviewer', 'all'].map((k) => models[k]).filter((v) => typeof v === 'string' && v.startsWith('byok:')).map((v) => v.slice(5).trim()).filter(Boolean);
  if (!specs.length || !hasCreds || !byokList?.length) return { ok: true };
  const set = new Set(byokList);
  const missing = [...new Set(specs.filter((m) => !set.has(m)))];
  if (missing.length) return { ok: false, error: `modelo(s) BYOK no disponible(s): ${missing.join(', ')}. Disponibles: ${byokList.slice(0, 20).join(', ')}` };
  return { ok: true };
}

// board/búsqueda AGREGADOS sobre varios proyectos (coherente con la lista de runs multi-proyecto del panel).
// Cada resultado se etiqueta con su proyecto para poder enlazar al run correcto y rotularlo en la UI.
export function aggregateArchive(projects) {
  const archive = [];
  for (const p of projects) for (const a of listArchive(p.root)) archive.push({ ...a, project: p.name, projectId: p.id });
  return archive.sort((a, b) => b.mtime - a.mtime);
}
export function aggregateSearch(projects, q, limit = 80) {
  const hits = [];
  for (const p of projects) for (const h of searchChanges(p.root, q)) hits.push({ ...h, project: p.name, projectId: p.id });
  return hits.slice(0, limit);
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
  const runs = new Map(); // key "<projId>/<change>" → { child, pending, stopRequested, exited, exitedAt }
  let lastReq = Date.now(); // marca para el auto-apagado por inactividad
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
  // UI v6 (Vite+Lit) servida como estáticos desde assets/ui. Activada por env CONDUCTOR_UI_STATIC=1, que el
  // LAUNCHER (/sdd-run → run.mjs) SIEMPRE pone al levantar la app → los ~150 devs ven la v6 (catálogo real,
  // tarjeta de ahorro, cockpit limpio). El default del motor sigue en legacy (cero regresión en `conductor
  // serve` directo y en los tests, que usan engine paths de prueba). Para forzar legacy: CONDUCTOR_UI_STATIC=0.
  const UI_DIR = uiStaticDir(engine);
  // UI Vite por DEFECTO: si hay UI construida (assets/ui), se sirve esa. La inline legacy queda solo como
  // fallback si NO hay build, o si se fuerza con CONDUCTOR_UI_STATIC=0. (Antes era opt-in con =1.)
  const useStaticUi = hasStaticUi(UI_DIR) && process.env.CONDUCTOR_UI_STATIC !== '0';
  // huella de build de la UI: el index.html referencia los assets HASHEADOS, así que su hash cambia en cada
  // build. El cliente lo vigila vía /api/ping y se auto-recarga cuando cambia (no más "lo veo desactualizado"
  // tras un redeploy). Null con la UI legacy. Fichero ~1KB → hashear por ping es trivial.
  const UI_INDEX = UI_DIR ? join(UI_DIR, 'index.html') : null;
  const uiBuild = () => { if (!useStaticUi || !UI_INDEX) return null; try { return createHash('sha256').update(readFileSync(UI_INDEX)).digest('hex').slice(0, 12); } catch { return null; } };
  const projOf = (id) => registry.get(id) || null;
  const runKey = (pid, name) => pid + '/' + name;
  // ANTI-CSRF/DNS-rebinding: los POST cross-site "ciegos" llegan sin Content-Type JSON (los con JSON
  // disparan preflight CORS, que jamas aprobamos) y/o con Host ajeno. Se rechazan ANTES de enrutar.
  const guard = (req, res) => {
    const h = String(req.headers.host || '');
    // hostname EXACTO (no startsWith): '127.0.0.1.evil.com' pasaba el startsWith → vector de DNS-rebinding
    let host = ''; try { host = new URL('http://' + h).hostname.toLowerCase().replace(/^\[|\]$/g, ''); } catch {} // IPv6 '[::1]' → '::1'
    if (!(host === '127.0.0.1' || host === 'localhost' || host === '::1')) { res.writeHead(403); res.end('{"ok":false,"error":"host"}'); return false; }
    if (req.method === 'POST' && !String(req.headers['content-type'] || '').includes('application/json')) { res.writeHead(403, { 'content-type': 'application/json' }); res.end('{"ok":false,"error":"content-type application/json requerido"}'); return false; }
    return true;
  };
  // body con TOPE (anti-OOM): un POST gigante no debe acumular sin límite en memoria
  const readBody = (req) => new Promise((r) => { let b = '', over = false; req.on('data', (c) => { if (over) return; b += c; if (b.length > 1048576) { over = true; try { req.destroy(); } catch {} r({}); } }); req.on('end', () => { if (over) return; try { r(JSON.parse(b || '{}')); } catch { r({}); } }); });
  const launch = (proj, name, request, complexity, domain, models, auto) => {
    const child = spawnRun({ engine, root: proj.root, name, request, complexity, domain, models, auto });
    const reg = { child, pending: null, stopRequested: false, exited: false };
    child.on?.('message', (m) => { if (m && m.t === 'pause') reg.pending = { before: m.before, role: m.role, findings: m.findings }; });
    child.on?.('exit', () => { reg.exited = true; reg.exitedAt = Date.now(); reg.pending = null; }); // exitedAt → la purga puede sacarlo del Map
    runs.set(runKey(proj.id, name), reg);
    return reg;
  };
  const server = createServer(async (req, res) => {
    const json = (code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
    const html = (body) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(body); };
    if (!guard(req, res)) return;
    lastReq = Date.now();
    const u = new URL(req.url || '/', 'http://x');
    const seg = u.pathname.split('/').filter(Boolean);
    try {
      // UI v6 estática (opt-in): sirve /assets/* y el index.html de navegación; /api y /artifact siguen su curso.
      if (useStaticUi && serveStatic({ uiDir: UI_DIR, pathname: u.pathname, method: req.method, res })) return;
      if (u.pathname === '/manifest.json') { res.writeHead(200, { 'content-type': 'application/manifest+json' }); return res.end(MANIFEST); }
      if (u.pathname === '/icon.svg') { res.writeHead(200, { 'content-type': 'image/svg+xml' }); return res.end(ICON_SVG); }
      if (u.pathname === '/sw.js') { res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-cache' }); return res.end(swJs(version)); }
      if (u.pathname === '/api/ping') return json(200, { ok: true, app: 'conductor', version, uiBuild: uiBuild(), root: DEFAULT.root, projects: [...registry.values()] });
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
      // uso/ahorro agregado (mismo cálculo que `conductor stats`) — multi-proyecto o por ?projectId=
      if (u.pathname === '/api/stats') { const pid = u.searchParams.get('projectId'); const scope = pid ? [projOf(pid)].filter(Boolean) : [...registry.values()]; const st = aggregateStats(scope); const realRunning = [...runs.values()].filter((r2) => !r2.exited).length; return json(200, { ...st, running: realRunning }); }
      // estimador de tokens preflight (coste visible en el punto de decisión, sin API)
      if (u.pathname === '/api/estimate') return json(200, estimateRun({ complexity: u.searchParams.get('complexity') || 'medium', request: u.searchParams.get('request') || '' }));
      // explain app-native: borrador de spec por ingeniería inversa del código (motor determinista, 0 LLM,
      // 0 red). Por ?projectId= o el default; ?src= opcional (subdir confinado). Devuelve CONTEOS + borradores
      // (no vuelca files[] → token-first). El walk salta node_modules/.git/dist/... y topa en MAX_FILES.
      if (u.pathname === '/api/explain') {
        const pid = u.searchParams.get('projectId');
        const proj = pid ? projOf(pid) : DEFAULT;
        if (!proj) return json(400, { ok: false, error: 'proyecto no válido' });
        const srcRel = u.searchParams.get('src') || '';
        const srcDir = srcRel ? resolve(proj.root, srcRel) : proj.root;
        if (relative(resolve(proj.root), srcDir).startsWith('..')) return json(400, { ok: false, error: 'src fuera del proyecto' });
        const { capabilities, openapi } = explain(srcDir);
        return json(200, { ok: true, capabilities: capabilities.map((c) => ({ id: c.id, name: c.name, endpoints: c.endpoints.length, units: c.units.length, files: c.files.length })), specDraft: renderSpec(capabilities), tasksDraft: renderTasks(capabilities), hasOpenapi: !!openapi });
      }
      // init app-native (#74): scaffold SDD del proyecto (openspec/conductor.json + conductor.schema.json +
      // .copilotignore) vía el motor DETERMINISTA — la app arranca SDD sin depender de la skill. POST (escribe);
      // idempotente (initConfig NUNCA pisa la config del usuario). Proyecto = el registrado (projectId) o el default.
      if (req.method === 'POST' && u.pathname === '/api/init') {
        const b = await readBody(req);
        const proj = b.projectId ? projOf(b.projectId) : DEFAULT;
        if (!proj) return json(400, { ok: false, error: 'proyecto no válido' });
        try { const r = initConfig(join(proj.root, 'openspec')); return json(200, { ok: true, created: r.created, copilotignore: r.copilotignore }); }
        catch (e) { return json(500, { ok: false, error: String(e.message) }); }
      }
      // board de archive + búsqueda ligera (sin SQLite). Sin projectId → AGREGA sobre todos los
      // proyectos registrados (coherente con la lista de runs del panel, que es multi-proyecto).
      if (u.pathname === '/api/archive') {
        const pid = u.searchParams.get('projectId');
        const scope = pid ? [projOf(pid)].filter(Boolean) : [...registry.values()];
        return json(200, { archive: aggregateArchive(scope) });
      }
      if (u.pathname === '/api/search') {
        const pid = u.searchParams.get('projectId');
        const scope = pid ? [projOf(pid)].filter(Boolean) : [...registry.values()];
        return json(200, { hits: aggregateSearch(scope, u.searchParams.get('q') || '') });
      }
      if (req.method === 'POST' && u.pathname === '/api/byok/save') {
        const b = await readBody(req);
        const { url: bUrl, key, type } = b;
        if (!bUrl || !key) return json(400, { ok: false, error: 'url y key requeridos' });
        try {
          const home = CONDUCTOR_HOME();
          mkdirSync(home, { recursive: true });
          const apiKeyEnc = encryptSecret(key);
          // H12: en Windows (DPAPI disponible) NUNCA caer a texto plano si el cifrado falla — una key sin
          // cifrar en ~/.conductor/byok.json es exactamente lo que el cifrado evita ({mode:0600} no aplica en
          // NTFS). Hard-fail con diagnóstico + round-trip (descifra == key) antes de declarar éxito.
          if (process.platform === 'win32' && (!apiKeyEnc || decryptSecret(apiKeyEnc) !== key)) {
            return json(500, { ok: false, error: 'no se pudo cifrar la clave con DPAPI; no se guarda en texto plano. Reintenta; si persiste, exporta COPILOT_PROVIDER_API_KEY en tu shell.' });
          }
          const data = apiKeyEnc ? { type: type || 'openai', baseUrl: bUrl, apiKeyEnc } : { type: type || 'openai', baseUrl: bUrl, apiKey: key };
          const bf = join(home, 'byok.json');
          writeFileSync(bf, JSON.stringify(data, null, 2), { mode: 0o600 });
          if (process.platform !== 'win32') try { chmodSync(bf, 0o600); } catch {} // la key no queda legible por otros usuarios
          _models.at = 0;
          try {
            const base = String(bUrl).replace(/\/+$/, '');
            const r2 = await fetch((base.endsWith('/v1') ? base : base + '/v1') + '/models', { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(5000) });
            if (r2.ok) { const j2 = await r2.json(); const ids = (j2.data ?? []).map((m) => m.id).filter(Boolean); writeModelsCache(ids, bUrl); }
          } catch {}
          return json(200, { ok: true, encrypted: !!apiKeyEnc });
        } catch (e) { return json(500, { ok: false, error: String(e.message) }); }
      }
      if (u.pathname === '/api/changes') {
        // openspec=true ⇔ el proyecto pasó por /sdd-init: tiene openspec/config.yaml (metadata OpenSpec) O
        // openspec/conductor.json (la config EJECUTABLE, fuente de verdad única del pipeline). Cualquiera basta.
        const isSdd = (root) => existsSync(join(root, 'openspec', 'config.yaml')) || existsSync(join(root, 'openspec', 'conductor.json'));
        const projects = [...registry.values()].map((p) => ({ id: p.id, name: p.name, root: p.root, openspec: isSdd(p.root), changes: listChanges(p.root) }));
        const def = projects.find((p) => p.id === DEFAULT.id) || projects[0] || { name: DEFAULT.name, changes: [] };
        // usage = gasto/presupuesto de TU key LiteLLM (solo si hay creds); el panel muestra "Uso total" cuando llega.
        return json(200, { project: def.name, changes: def.changes, projects, ghUsage: ghPremiumUsage(), usage: await litellmUsage() });
      }
      if (req.method === 'POST' && u.pathname === '/api/launch') {
        const b = await readBody(req);
        if (!b.request || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(b.name || '')) return json(400, { ok: false, error: 'request y name (kebab) requeridos' });
        // SEGURIDAD (auditoría P1 — ejecución en FS arbitrario): b.project llega por HTTP. NO lanzar el agente
        // (--allow-all-tools en la fase coder) en una ruta ARBITRARIA del FS ni auto-persistirla. Solo se acepta
        // si es el root servido por defecto, o un proyecto REAL (tiene openspec/ o .git). Un dir cualquiera
        // (p.ej. C:\sensible) se rechaza → cierra el vector de un POST local/CSRF que ejecutaría donde quisiera.
        const isRealProject = (p) => { try { const rp = resolve(p); return rp === resolve(DEFAULT.root) || existsSync(join(rp, 'openspec')) || existsSync(join(rp, '.git')); } catch { return false; } };
        const proj = b.project ? ((existsSync(b.project) && isRealProject(b.project)) ? ensureProject(b.project) : null) : (b.projectId ? projOf(b.projectId) : DEFAULT);
        if (!proj) return json(400, { ok: false, error: 'proyecto no válido: debe ser una ruta con openspec/ o .git (no se ejecuta en rutas arbitrarias)' });
        const ch = join(proj.root, 'openspec', 'changes', b.name);
        const k = runKey(proj.id, b.name);
        if (activeRun(ch) || (runs.get(k) && !runs.get(k).exited)) return json(409, { ok: false, error: 'ya hay un run en curso', url: `/run/${proj.id}/${b.name}` });
        runs.set(k, { child: null, pending: null, stopRequested: false, exited: false }); // RESERVA síncrona: cierra el TOCTOU (dos POST casi a la vez pasarían el check de arriba antes del await de abajo → dos drivers)
        // model-validation-before-send: rechaza modelos byok: inexistentes ANTES de gastar minutos hasta el timeout
        const av = await availableModels(registry);
        const mv = checkByokModels(b.models, av.byok, av.byokCreds);
        if (!mv.ok) { runs.delete(k); return json(400, { ok: false, error: mv.error }); } // libera la reserva si rechazamos
        // GOBIERNO (policy.mjs cableado): si el proyecto define openspec/policy.json con allowedModels, exigir
        // que los modelos pedidos estén en la lista. OPT-IN: sin policy.json (source 'default') NO se restringe
        // (el catálogo completo sigue disponible). Normaliza prefijo proveedor + formato de versión (.→-).
        try {
          const { policy, source } = loadPolicy(join(proj.root, 'openspec', 'policy.json'));
          if (source !== 'default' && Array.isArray(policy.allowedModels) && policy.allowedModels.length) {
            const norm = (s) => String(s || '').toLowerCase().replace(/^(byok|copilot):/, '').replace(/[.\-_]/g, '');
            const allow = new Set(policy.allowedModels.map(norm));
            const bad = Object.values(b.models || {}).filter((m) => m && !allow.has(norm(m))).map((m) => String(m).replace(/^(byok|copilot):/, ''));
            if (bad.length) { runs.delete(k); return json(400, { ok: false, error: `política del proyecto: modelo(s) no permitido(s): ${[...new Set(bad)].join(', ')} (openspec/policy.json → allowedModels)` }); }
          }
        } catch (e) { runs.delete(k); return json(400, { ok: false, error: `openspec/policy.json inválida: ${e.message}` }); }
        // launch-target-confirm-security (visibilidad): deja constancia si se lanza en un proyecto que NO es
        // el root servido por defecto (con colisión de puerto, ayuda a detectar ejecución en el repo equivocado).
        if (proj.id !== DEFAULT.id) { try { process.stderr.write(`conductor: /api/launch en proyecto NO-default ${proj.root} (la app sirve ${DEFAULT.root})\n`); } catch {} }
        launch(proj, b.name, b.request, b.complexity, b.domain, b.models, b.auto === true);
        return json(200, { ok: true, url: `/run/${proj.id}/${b.name}` });
      }
      if (req.method === 'POST' && u.pathname === '/api/resume') {
        const b = await readBody(req);
        if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(String(b.name || ''))) return json(400, { ok: false });
        const proj = b.projectId ? projOf(b.projectId) : DEFAULT;
        if (!proj) return json(400, { ok: false, error: 'proyecto desconocido' });
        const ch = join(proj.root, 'openspec', 'changes', b.name);
        const tl = readJson(join(ch, '.conductor', 'timeline.json'));
        if (!tl?.request) return json(404, { ok: false, error: 'sin timeline que reanudar' });
        const k = runKey(proj.id, b.name);
        if (activeRun(ch) || (runs.get(k) && !runs.get(k).exited)) return json(409, { ok: false, error: 'ya hay un run en curso' });
        launch(proj, b.name, tl.request, tl.complexity, tl.domain, tl.models);
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
        if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(name)) return json(400, { ok: false });
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
          launch(proj, name, tl2.request, tl2.complexity, tl2.domain, tl2.models); // resume EXACTO: reusa los modelos por fase persistidos (RunState robusto)
          return json(200, { ok: true });
        }
        if (req.method === 'POST' && action === 'stop') {
          if (!reg || reg.exited) return json(409, { ok: false });
          reg.stopRequested = true; reg.pending = null; try { reg.child.send({ t: 'stop' }); } catch {}
          return json(200, { ok: true });
        }
        if (action === 'artifact' && req.method === 'POST') {
          const { p: rel, content } = await readBody(req);
          const okPath = rel && rel.endsWith('.md') && !touchesPlumbing(rel) && safeRead(changeDir, rel) !== null;
          if (!okPath || typeof content !== 'string' || content.length > 200000) return json(400, { ok: false });
          writeFileSync(join(changeDir, rel), content);
          return json(200, { ok: true });
        }
        if (action === 'raw') {
          // CRUDO del modelo por fase ("lo que verías sin conductor"): fichero whitelisteado en .conductor/raw/
          const ph = (u.searchParams.get('phase') || '').replace(/[^a-z]/g, '');
          let body = null; try { if (ph) body = scrubSecrets(readFileSync(join(changeDir, '.conductor', 'raw', ph + '.txt'), 'utf8')); } catch {}
          res.writeHead(body != null ? 200 : 404, { 'content-type': 'text/plain; charset=utf-8' }); return res.end(body ?? 'no encontrado');
        }
        if (action === 'artifact') {
          const rel = u.searchParams.get('p') || '';
          const body = touchesPlumbing(rel) ? null : scrubSecrets(safeRead(changeDir, rel)); // H2: confina .conductor (case-insens) + scrub
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
        if (action === 'events') {
          // VISOR DE SESIÓN: stream de eventos del CLI de Copilot, CONFINADO a <run>/.conductor/events.jsonl
          // (jamás una ruta arbitraria del cliente). 0 tokens: solo lee y pagina el fichero.
          const cats = (u.searchParams.get('cat') || '').split(',').filter(Boolean);
          const opts = { categories: cats, limit: Math.min(500, +(u.searchParams.get('limit') || 250) || 250), offset: Math.max(0, +(u.searchParams.get('offset') || 0) || 0), q: u.searchParams.get('q') || '' };
          // 1) traza nativa del CLI (events.jsonl); 2) si no la hay (p.ej. qwen vía LiteLLM), se RECONSTRUYE
          // desde los spans OTel (.conductor/otel/) → el visor funciona también con qwen. Ambas confinadas.
          const r2 = parseEvents(join(changeDir, '.conductor', 'events.jsonl'), opts) || parseOtelSession(join(changeDir, '.conductor', 'otel'), opts);
          if (!r2) return json(404, { ok: false, error: 'sin traza de sesión (ni events.jsonl ni spans OTel) en este run' });
          // scrub: la traza del CLI puede contener secretos que el agente ecoó → redactar al servir (auditoría)
          res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' }); return res.end(scrubSecrets(JSON.stringify(r2)));
        }
        if (action === 'aiact') {
          try { return html(renderAiact(changeDir)); }
          catch (e) { res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); return res.end('aiact: ' + e.message); }
        }
        if (req.method === 'POST' && action === 'archive') {
          // archive app-native: promueve delta specs (ADDED, aditivo-seguro) + mueve el change a archive/ (renameSync).
          // Pre-vuelo: GREEN y NO en curso. El merge no-aditivo (MODIFIED/REMOVED/RENAMED) se deja a /sdd-archive.
          if (reg && !reg.exited) return json(409, { ok: false, error: 'run en curso — pausa o detén antes de archivar' });
          const tlA = readJson(join(changeDir, '.conductor', 'timeline.json'));
          if (tlA?.verdict !== 'GREEN') return json(409, { ok: false, error: 'solo se archiva un change con veredicto GREEN' });
          try {
            const { promoted, needsManualMerge } = promoteSpec(changeDir, join(proj.root, 'openspec', 'specs'));
            const isoDate = new Date().toISOString().slice(0, 10);
            const { archivedDir } = archiveChange(changeDir, join(proj.root, 'openspec', 'changes', 'archive'), isoDate);
            runs.delete(runKey(proj.id, name)); // el change ya no vive en changes/ → limpia el registro de runs
            return json(200, { ok: true, promoted, needsManualMerge, archivedDir });
          } catch (e) { return json(500, { ok: false, error: e.message }); }
        }
        return json(404, { ok: false });
      }
      return html(PANEL_PAGE);
    } catch (e) { try { json(500, { ok: false, error: e.message }); } catch {} }
  });
  // ROBUSTEZ DEL CICLO DE VIDA: purga de runs terminados (anti memory-leak del Map), apagado limpio por
  // señal (SIGINT/SIGTERM → no deja node huérfanos) y auto-apagado por inactividad. Lo de señal/idle solo
  // para la app REAL (`serve` pasa onShutdown); los tests crean servers sin onShutdown y no se ven afectados.
  const killChildren = () => { for (const [, r2] of runs) { try { r2.child?.kill?.(); } catch {} } };
  const idleMin = onShutdown ? (Number(process.env.CONDUCTOR_IDLE_EXIT_MIN) || 480) : 0; // 8h por defecto; 0 lo desactiva
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [k, r2] of runs) if (r2.exited && r2.exitedAt && now - r2.exitedAt > 600000) runs.delete(k); // saca runs terminados > 10 min del Map
    const activos = [...runs.values()].filter((r2) => !r2.exited).length;
    if (idleMin && !activos && now - lastReq > idleMin * 60000) { try { process.stderr.write(`conductor: auto-apagado tras ${idleMin} min sin actividad\n`); } catch {} killChildren(); if (onShutdown) onShutdown(); else server.close(); }
  }, 60000);
  sweep.unref?.();
  if (onShutdown) for (const sig of ['SIGINT', 'SIGTERM']) process.once(sig, () => { try { clearInterval(sweep); } catch {} killChildren(); onShutdown(); });
  return new Promise((resolveP, rejectP) => {
    server.on('error', rejectP);
    server.listen(port, host, () => {
      resolveP({
        url: `http://${host}:${server.address().port}/`,
        runs,
        close: async () => { try { clearInterval(sweep); } catch {} killChildren(); return new Promise((r3) => server.close(r3)); },
      });
    });
  });
}
