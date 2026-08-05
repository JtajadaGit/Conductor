// conductor/lib/mcp.mjs — MCP server (stdio, protocolo exponiendo TODO el motor.
// Sin deps. stdout = solo JSON-RPC; logs a stderr.
import { createInterface } from 'node:readline';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { spawn, execSync } from 'node:child_process';
import { checkCoherence } from '../gates/coherence.mjs';
import { checkArtifacts } from '../gates/artifacts.mjs';
import { checkContract } from '../contract/contract.mjs';
import { buildTrace } from '../gates/trace.mjs';
import { computeCost } from '../core/cost.mjs';
import { seal, verifySeal, hashSpecs } from '../provenance/provenance.mjs';
import { explain } from '../analysis/explain.mjs';
import { detectDrift } from '../contract/drift.mjs';
import { lintMigrations } from '../contract/migration.mjs';
import { assessReadiness } from '../contract/legacy.mjs';
import { drive } from '../pipeline/drive.mjs';
import { renderReceipt } from '../serving/dashboard.mjs';
import { initConfig } from '../analysis/scaffold.mjs';
import { assertConfined } from './confine.mjs';
import { count } from '../core/report.mjs';
import { plumbPath, domainFromName } from '../core/plumb.mjs';
import { summarizeArtifact } from '../core/estimate.mjs';

const PATH_ARGS = new Set(['changeDir', 'srcDir', 'base', 'head', 'target', 'jsonl', 'projectRoot']);

// walk de TEXTO acotado (para el evidence-gate de migración legacy): lee ficheros de código/datos, salta deps y
// binarios, topa en nº de ficheros y tamaño. Determinista y sin red.
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'target', '.next', 'coverage', 'vendor']);
const TEXT_EXT = /\.(js|ts|tsx|jsx|java|php|py|sql|cls|go|cs|rb|jsp|xml|html|vue|svelte|sru|srw|pbl|pbt|jrxml|wsdl|xsd|sh|sas)$/i;
function walkText(dir) {
  const out = []; const stack = [dir];
  while (stack.length && out.length < 3000) {
    const d = stack.pop();
    let entries; try { entries = readdirSync(d, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (out.length >= 3000) break;
      if (e.isSymbolicLink()) continue; // NO seguir symlinks (un enlace podría apuntar fuera del root → fuga de confinamiento)
      if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) stack.push(join(d, e.name)); continue; }
      if (!TEXT_EXT.test(e.name)) continue;
      const p = join(d, e.name);
      try { if (statSync(p).size <= 512 * 1024) out.push({ path: p, text: readFileSync(p, 'utf8') }); } catch {}
    }
  }
  return out;
}

// naming SDD: sin acentos/ñ y, si hay que derivar del request, sin palabras vacías (nunca la frase cruda)
const deaccent = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const slug = (s) => deaccent(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'change';
const STOPW = new Set(['anade', 'agrega', 'crea', 'haz', 'implementa', 'un', 'una', 'el', 'la', 'los', 'las', 'de', 'del', 'con', 'y', 'o', 'para', 'que', 'en', 'a', 'add', 'create', 'make', 'implement', 'an', 'the', 'with', 'and', 'or', 'for', 'to', 'of', 'new', 'componente', 'component', 'modulo', 'module', 'test', 'tests']);
const featureName = (req) => { const w = deaccent(req).toLowerCase().split(/[^a-z0-9]+/i).filter((x) => x && !STOPW.has(x)); return w.length ? w.slice(0, 4).join('-').slice(0, 48) : slug(req); };

const PROTOCOL = '2025-11-25';
const log = (...a) => process.stderr.write('[conductor-mcp] ' + a.join(' ') + '\n');

// ── helpers del MODO CHAT (pausas conversacionales) ─────────────────────────────────────────────
// El pipeline corre en la APP (mismo driver, mismas pausas del revisor); estas piezas son el puente:
// lanzar, ESPERAR hasta la siguiente pausa o el veredicto, y devolver los artefactos para que el AGENTE
// los presente en el chat. El usuario decide respondiendo — la conversación ES el cockpit.
const APP_URL = () => `http://127.0.0.1:${Number(process.env.CONDUCTOR_PORT) || 4750}/`;
async function appUp(root) {
  const url = APP_URL();
  const ping = () => fetch(url + 'api/ping', { signal: AbortSignal.timeout(1500) }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  let p = await ping();
  if (!p) {
    spawn(process.execPath, [resolve(process.argv[1]), 'serve', root], { detached: true, stdio: 'ignore', windowsHide: true, env: { ...process.env, CONDUCTOR_SERVE_OPEN: '0' } }).unref();
    for (let i = 0; i < 14 && !p; i++) { await new Promise((r) => setTimeout(r, 500)); p = await ping(); }
  }
  return p ? { url, ping: p } : null;
}
function makeReceipt(dir) {
  try {
    const tl = JSON.parse(readFileSync(plumbPath(dir, 'timeline.json'), 'utf8'));
    if (!tl || !Array.isArray(tl.phases) || !tl.phases.length) return null;
    let domain = 'core'; try { domain = JSON.parse(readFileSync(plumbPath(dir, 'state.json'), 'utf8')).domain || 'core'; } catch {}
    const rd = (f) => { try { return readFileSync(join(dir, f), 'utf8'); } catch { return ''; } };
    return renderReceipt({ name: resolve(dir).split(/[\\/]/).pop(), timeline: tl, spec: rd(`specs/${domain}/spec.md`), proposal: rd('proposal.md'), verify: rd('verify-report.md') }) || null;
  } catch { return null; }
}
// artefactos de la pausa, COMPACTADOS (token-first): por debajo del cap viajan enteros; por encima,
// RESUMEN ESTRUCTURADO (cabeceras + ids + primeras líneas por sección — summarizeArtifact) en vez de una
// tijera ciega a mitad de requisito. La spec conserva SIEMPRE todos sus <!-- id: REQ-* --> visibles.
const artClip = (dir, f, max = 1800) => {
  try {
    const t = readFileSync(join(dir, f), 'utf8');
    if (t.length <= max) return t;
    const sum = summarizeArtifact(t);
    const body = (sum && sum.length < t.length ? sum : t).slice(0, max);
    return body + `\n… [compactado (${t.length} chars) — completo en ${f}]`;
  } catch { return null; }
};
// la SPEC es EL OBJETO de la aprobación: jamás viaja sin sus SHALL (caso real: el revisor del chat veía
// requisitos VACÍOS porque el resumen genérico se quedaba solo con cabeceras). Presupuesto propio y, si aun
// así no cabe, recorte POR REQUISITO conservando id + nombre + línea SHALL + títulos de escenario — los
// GIVEN/WHEN/THEN caen primero. Exportada para test determinista.
export function specClip(t, max = 4000) {
  if (t.length <= max) return t;
  const keep = String(t).split('\n').filter((l) => /^\s*(<!--\s*id:|#{2,4}\s|The system SHALL)/.test(l) || /\bSHALL\b/.test(l));
  const out = keep.join('\n');
  return (out.length <= max ? out : out.slice(0, max)) + `\n… [spec compactada (${t.length} chars): SHALL y escenarios conservados — completa en el fichero]`;
}
export function pauseBundle(changeDir, pending) {
  const arts = {};
  const p1 = artClip(changeDir, 'proposal.md'); if (p1) arts['proposal.md'] = p1;
  try { for (const d of readdirSync(join(changeDir, 'specs'))) { let s = null; try { s = specClip(readFileSync(join(changeDir, 'specs', d, 'spec.md'), 'utf8')); } catch {} if (s) { arts[`specs/${d}/spec.md`] = s; break; } } } catch {}
  if (pending?.before === 'verify' || pending?.before === 'fix') { const a = artClip(changeDir, 'apply-report.md'); if (a) arts['apply-report.md'] = a; }
  if (pending?.before === 'fix') { const v = artClip(changeDir, 'verify-report.md'); if (v) arts['verify-report.md'] = v; }
  return arts;
}
// ANTI-TIMEOUT DE HOSTS (bug latente cazado en el plan de expertise): muchos hosts MATAN una tool-call
// larga. OpenCode corta a ~60s — los 85s anteriores daban «Request timed out» con el run vivo
// por debajo y el chat perdía el hilo. Cada llamada devuelve en ≤~50s SIEMPRE — si ni pausa ni veredicto,
// retorna status:"working" CON PROGRESO REAL (fases ✓, fase actual, tokens, registro) para que el chat
// narre en vez de ser una caja negra; el BUCLE lo lleva el agente (re-llama conductor_continue action:"wait").
// Presupuesto configurable por CONDUCTOR_MCP_WAIT_MS (los tests lo bajan; un host paciente puede subirlo).
// Exportado para testearlo determinista contra un servidor fake.
const secsHuman = (ms) => (ms >= 60000 ? `${Math.floor(ms / 60000)}m${Math.round((ms % 60000) / 1000)}s` : `${Math.round(ms / 1000)}s`);
const kTok = (n) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n));
// parte de progreso COMPACTO desde /state — lo que la V1 contaba en el chat (fases, modelos, tokens)
export function runProgress(st) {
  if (!st) return null;
  const done = (st.phases || []).map((p) => `${p.phase} ✓${p.ms ? ` ${secsHuman(p.ms)}` : ''}`);
  const cur = st.current?.phase ? [`▸ ${st.current.phase} EN CURSO${st.current.attempt > 1 ? ` (intento ${st.current.attempt})` : ''}`] : [];
  const total = (st.plan || []).length || null;
  const tok = (st.phases || []).reduce((a, p) => { a.in += p.tokens?.in || 0; a.out += p.tokens?.out || 0; return a; }, { in: 0, out: 0 });
  const modelos = [...new Set((st.phases || []).map((p) => p.model).filter(Boolean))];
  return {
    fases: [...done, ...cur].join(' · ') || '(arrancando)',
    hecho: total ? `${done.length}/${total} fases` : `${done.length} fases`,
    ...(tok.in + tok.out > 0 ? { tokens: `↓${kTok(tok.in)} ↑${kTok(tok.out)}` } : {}),
    ...(modelos.length ? { modelos } : {}),
    // pausas YA RESUELTAS y por qué vía — el chat re-enganchado narra lo decidido mientras no miraba
    ...(Array.isArray(st.approvals) && st.approvals.length ? { decisiones: st.approvals.map((a) => `${a.phase} ✓ ${String(a.via || '').includes('web') ? 'web' : 'chat'}`).join(' · ') } : {}),
    ...(Array.isArray(st.logTail) && st.logTail.length ? { registro: st.logTail.slice(-2) } : {}),
  };
}

// PRESENTACIÓN DETERMINISTA DE LA PAUSA — lo que el chat imprime TAL CUAL. Pegar los artefactos en bruto
// era un muro ilegible (la spec entera con GIVEN/WHEN/THEN) y cada agente lo «arreglaba» a su manera.
// Aquí decide el motor qué se ve: fase, progreso, decisiones previas, hallazgos topados y la spec en
// TITULARES (Requirement + SHALL + nº de escenarios). La spec completa queda en la web y en `artifacts`
// (contexto del agente, no para pegar). Exportada para testearla determinista.
export function renderPause(changeDir, pending, st, web) {
  const L = [];
  const ph = pending?.before || '?';
  L.push(`⏸ PAUSA antes de «${ph}» — tu decisión continúa el run`);
  const pr = runProgress(st);
  if (pr) L.push(`${pr.hecho}${pr.tokens ? ` · ${pr.tokens}` : ''}`);
  const aps = Array.isArray(st?.approvals) ? st.approvals : [];
  if (aps.length) L.push(`Decidido antes: ` + aps.map((a) => `${a.phase} ✓ (${String(a.via || '').includes('web') ? 'web' : 'chat'})`).join(' · '));
  const F = Array.isArray(pending?.findings) ? pending.findings : [];
  if (F.length) {
    L.push('', `Hallazgos del gate (${F.length}):`);
    for (const f of F.slice(0, 8)) L.push(`- [${f.severity || '?'}] ${String(f.message || '').slice(0, 240)}`);
    if (F.length > 8) L.push(`- …y ${F.length - 8} más (completos en la web)`);
  }
  let specTxt = null;
  try { for (const d of readdirSync(join(changeDir, 'specs'))) { specTxt = readFileSync(join(changeDir, 'specs', d, 'spec.md'), 'utf8'); break; } } catch {}
  if (specTxt) {
    const reqs = []; let cur = null;
    for (const ln of specTxt.split(/\r?\n/)) {
      const r = ln.match(/^###\s+Requirement:\s*(.+)$/i);
      if (r) { cur = { name: r[1].trim(), shall: null, scn: 0 }; reqs.push(cur); continue; }
      if (cur && !cur.shall && /\bSHALL\b/.test(ln)) cur.shall = ln.trim();
      if (cur && /^####\s+Scenario:/i.test(ln)) cur.scn++;
    }
    if (reqs.length) {
      L.push('', `Spec — ${reqs.length} requisito(s) (completa en la web):`);
      for (const q of reqs.slice(0, 12)) L.push(`- ${q.name}${q.shall ? ` — ${q.shall.slice(0, 160)}` : ''}${q.scn ? ` · ${q.scn} escenario(s)` : ''}`);
      if (reqs.length > 12) L.push(`- …y ${reqs.length - 12} más`);
    }
  }
  L.push('', `Responde: «aprobar» · «nota: <instrucción>» · «modelo: litellm:<m> | copilot:<m>» · «parar»${web ? ` — o decide en la web: ${web}` : ''}`);
  L.push('(si decides en la web, escríbeme cualquier cosa aquí y me reengancho al run)');
  return L.join('\n');
}
export async function pollRun(url, apiBase, changeDir, { timeoutMs, web } = {}) {
  const budget = Number(timeoutMs) || Number(process.env.CONDUCTOR_MCP_WAIT_MS) || 50000;
  const t0 = Date.now();
  let last = null; // último /state bueno → el retorno "working" lleva progreso real, no una caja negra
  while (Date.now() - t0 < budget) {
    let st = null;
    try { const r = await fetch(url + apiBase + '/state', { signal: AbortSignal.timeout(8000) }); st = r.ok ? await r.json() : null; } catch {}
    if (st) {
      last = st;
      if (st.pending) {
        return {
          status: 'paused', phase: st.pending.before || '?', findings: st.pending.findings || undefined,
          progress: runProgress(st) || undefined,
          render: renderPause(changeDir, st.pending, st, web),
          artifacts: pauseBundle(changeDir, st.pending),
          next: 'Imprime `render` TAL CUAL (presentación determinista: no la resumas, no la amplíes, no pegues los `artifacts` — esos son para TU contexto si el usuario pregunta). Espera su decisión y llama conductor_continue incluyendo phase (el campo `phase` de ESTA pausa): sin note = aprobar; note = instrucción; model = cambio en caliente (litellm:<m> | copilot:<m>); action:"stop" detiene.',
        };
      }
      const verdict = st.verdict || st.timeline?.verdict || null;
      if (verdict && verdict !== 'running' && !st.alive) {
        return {
          status: 'done', verdict, receipt: makeReceipt(changeDir) || undefined,
          next: verdict === 'GREEN' ? 'Presenta el recibo VERBATIM — el usuario lo revisa y commitea ÉL (tú jamás).' : `El run terminó ${verdict}: presenta el motivo tal cual y NO reintentes por tu cuenta — el usuario decide.`,
        };
      }
    }
    await new Promise((r) => setTimeout(r, 2500));
  }
  // payload A DIETA (OpenCode pinta el JSON entero expandido):
  // el contrato completo vive en la description de la tool — aquí solo el dato y un imperativo corto.
  return {
    status: 'working', progress: runProgress(last) || undefined,
    next: 'Narra en 1 línea avance y `decisiones` nuevas (las resueltas por web); luego conductor_continue {action:"wait"}.',
  };
}

const TOOLS = {
  echo: { def: { name: 'echo', description: 'Echo text (handshake check).', inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] } }, run: ({ text }) => ({ text: String(text) }) },
  conductor_gate: { def: { name: 'conductor_gate', title: 'Deterministic SDD gate', description: 'Run coherence + artifact + (optional) traceability gate over an OpenSpec change dir. Returns verdict + findings.', inputSchema: { type: 'object', properties: { changeDir: { type: 'string' }, srcDir: { type: 'string' } }, required: ['changeDir'] } },
    run: ({ changeDir, srcDir }) => { const F = [...checkCoherence(changeDir), ...checkArtifacts(changeDir)]; if (srcDir && existsSync(srcDir)) F.push(...buildTrace(changeDir, srcDir).findings); return { verdict: F.some((f) => f.severity === 'breaking' || f.severity === 'error') ? 'FAIL' : 'PASS', count: count(F), findings: F }; } },
  conductor_contract: { def: { name: 'conductor_contract', title: 'OpenAPI breaking-change diff', description: 'Detect breaking changes between two OpenAPI/JSON-Schema files (native engine).', inputSchema: { type: 'object', properties: { base: { type: 'string' }, head: { type: 'string' } }, required: ['base', 'head'] } },
    run: ({ base, head }) => { const F = checkContract(base, head); return { verdict: F.some((f) => f.severity === 'breaking') ? 'FAIL' : 'PASS', count: count(F), findings: F }; } },
  conductor_trace: { def: { name: 'conductor_trace', title: 'spec→code traceability', description: 'Build spec→task→code→test traceability matrix, flag coverage gaps.', inputSchema: { type: 'object', properties: { changeDir: { type: 'string' }, srcDir: { type: 'string' } }, required: ['changeDir', 'srcDir'] } },
    run: ({ changeDir, srcDir }) => { const t = buildTrace(changeDir, srcDir); return { gaps: t.gaps, matrix: t.matrix.map((m) => ({ id: m.id, cov: m.cov })), orphanTasks: t.orphanTasks.length }; } },
  conductor_cost: { def: { name: 'conductor_cost', title: 'per-phase cost telemetry', description: 'Compute per-phase token cost from a token-usage.jsonl and savings vs all-Opus.', inputSchema: { type: 'object', properties: { jsonl: { type: 'string' } }, required: ['jsonl'] } },
    run: ({ jsonl }) => { const r = computeCost(jsonl); return { cost_usd: r.cost_usd, naive_all_opus_usd: r.naive_all_opus_usd, saved_pct: r.saved_pct, phases: r.phases.map((p) => ({ phase: p.phase, cost_usd: p.cost_usd })) }; } },
  conductor_seal: { def: { name: 'conductor_seal', title: 'green-gate provenance seal', description: 'Produce a signed provenance seal (Ed25519 via privateKeyPem, or HMAC via key) proving a change passed all gates.', inputSchema: { type: 'object', properties: { changeDir: { type: 'string' }, srcDir: { type: 'string' }, key: { type: 'string' }, privateKeyPem: { type: 'string' } }, required: ['changeDir'] } },
    run: ({ changeDir, srcDir, key, privateKeyPem }) => { const gates = [{ name: 'coherence', findings: checkCoherence(changeDir) }, { name: 'artifacts', findings: checkArtifacts(changeDir) }]; const trace = srcDir && existsSync(srcDir) ? buildTrace(changeDir, srcDir) : null; return seal({ change: resolve(changeDir), gates, trace, at: '1970-01-01T00:00:00Z', key, privateKeyPem, specHash: hashSpecs(changeDir) }); } },
  conductor_verify: { def: { name: 'conductor_verify', title: 'verify provenance seal', description: 'Verify a provenance seal JSON (Ed25519 via publicKeyPem, or HMAC via key).', inputSchema: { type: 'object', properties: { sealJson: { type: 'string', description: 'raw JSON of the seal' }, key: { type: 'string' }, publicKeyPem: { type: 'string' } }, required: ['sealJson'] } },
    // el schema pide string, pero el que rellena es un modelo y pasar el sello YA PARSEADO es igual de
    // natural: antes eso daba «"[object Object]" is not valid JSON», que no orienta a nadie. Se aceptan ambos.
    run: ({ sealJson, key, publicKeyPem }) => verifySeal(typeof sealJson === 'string' ? JSON.parse(sealJson) : sealJson, { key, publicKeyPem }) },
  conductor_explain: { def: { name: 'conductor_explain', title: 'reverse-engineer code → spec draft', description: 'Reverse-engineer a source tree into a draft OpenSpec spec: capabilities, HTTP endpoints, units, and an extracted OpenAPI skeleton. For brownfield/migrations.', inputSchema: { type: 'object', properties: { srcDir: { type: 'string' } }, required: ['srcDir'] } },
    run: ({ srcDir }) => { const r = explain(srcDir); return { capabilities: r.capabilities.map((c) => ({ id: c.id, name: c.name, endpoints: c.endpoints.length, units: c.units.length, files: c.files.length })), hasOpenapi: !!r.openapi }; } },
  conductor_drift: { def: { name: 'conductor_drift', title: 'living-spec drift detection', description: 'Detect spec↔code drift: requirements without code, untracked code surface, contract drift.', inputSchema: { type: 'object', properties: { changeDir: { type: 'string' }, srcDir: { type: 'string' } }, required: ['changeDir', 'srcDir'] } },
    run: ({ changeDir, srcDir }) => { const r = detectDrift(changeDir, srcDir); return { verdict: r.findings.some((f) => f.severity === 'error' || f.severity === 'breaking') ? 'DRIFT' : 'OK', summary: r.summary, findings: r.findings }; } },
  conductor_migrate: { def: { name: 'conductor_migrate', title: 'DB migration safety linter', description: 'Lint SQL migration files for destructive/irreversible/blocking operations (large DB migrations, rolling deploys).', inputSchema: { type: 'object', properties: { target: { type: 'string', description: 'migrations dir or .sql file' } }, required: ['target'] } },
    run: ({ target }) => { const F = lintMigrations(target); return { verdict: F.some((f) => f.severity === 'breaking' || f.severity === 'error') ? 'UNSAFE' : 'OK', count: count(F), findings: F }; } },
  conductor_legacy: { def: { name: 'conductor_legacy', title: 'legacy migration readiness (evidence-gate, code-driven)', description: 'Code-driven legacy-migration evidence gate. Given a legacy source dir and the DECLARED features to migrate, deterministically traces each feature to evidence in the OLD code and BLOCKS spec/implementation until every feature is evidence-backed ("declared != ready"). Returns state READY_FOR_SPEC|NEEDS_DEEPENING|BLOCKED, allowed.generateSpec/implement, and per-feature evidence + explicit blockers (CODE_TRACE_REQUIRED, DATA_MODEL_REQUIRED, EXTERNAL_CONTRACT_REQUIRED). 0 LLM, 0 network.', inputSchema: { type: 'object', properties: { srcDir: { type: 'string', description: 'root of the legacy source tree' }, features: { type: 'array', description: 'declared features to migrate', items: { type: 'object', properties: { name: { type: 'string' }, keywords: { type: 'array', items: { type: 'string' } } }, required: ['name'] } } }, required: ['srcDir', 'features'] } },
    run: ({ srcDir, features }) => assessReadiness(features || [], walkText(resolve(srcDir))) },
  // NOTA: conductor_start/conductor_next se RETIRARON del MCP : un modelo de sesión los
  // usaba para re-hacer el pipeline a mano en paralelo al driver (carrera + tokens). La máquina de
  // estados sigue en lib/orchestrate.mjs para uso interno del driver. Robustez por capacidad, no por prompt.
  conductor_init_config: { def: { name: 'conductor_init_config', title: 'scaffold user config + JSON Schema', // la descripción prometía escribir también openspec/conductor.schema.json, y el motor dejó de hacerlo a
// propósito en init v2 (scaffold.mjs:132: apuntar a ese fichero desde el repo del usuario sería un enlace
// roto). Un modelo que lee esta descripción le decía al usuario que tenía autocompletado en el editor.
description: 'Create openspec/conductor.json in the given openspec dir (only if missing), with the OpenSpec tree (specs/, changes/archive/). No schema file is written: validation lives in the engine (conductor doctor).', inputSchema: { type: 'object', properties: { openspecDir: { type: 'string', description: 'absolute path of the project openspec/ dir' } }, required: ['openspecDir'] } },
    run: ({ openspecDir }) => initConfig(openspecDir) },
  conductor_drive: { def: { name: 'conductor_drive', title: 'run the FULL SDD pipeline headless (blocks until the very end — CI/scripts only)', description: 'Runs the ENTIRE SDD pipeline with no review pauses. TWO modes: async:true = background JOB via the local app, returns immediately with {changeName, web} (poll with conductor_continue action:wait; conductor_receipt at the end) — use this from chat hosts. async absent/false = ONE blocking call (minutes — many chat hosts will kill it): CI/scripts only. For interactive use ALWAYS prefer conductor_feature (short calls, review pauses in the chat). The SERVER drives every phase (propose→spec→…→apply→verify) in order and runs the deterministic gate at verify; phases CANNOT be skipped regardless of model quality. Reads model config from BYOK env (COPILOT_PROVIDER_BASE_URL/_API_KEY/COPILOT_MODEL or CONDUCTOR_*).', inputSchema: { type: 'object', properties: { request: { type: 'string', description: 'the feature request, in the user\'s words' }, projectRoot: { type: 'string', description: 'absolute path of the project root (where openspec/ lives)' }, changeName: { type: 'string', description: 'optional kebab name for the change; derived from request if absent' }, complexity: { type: 'string', enum: ['simple', 'medium', 'complex'] }, domain: { type: 'string', description: 'short domain noun for the spec folder' }, async: { type: 'boolean', description: 'true = launch as a background JOB via the local app and return IMMEDIATELY with {changeName, web}; then poll with conductor_continue {action:"wait"} and fetch conductor_receipt at the end. false/absent = legacy blocking mode (CI/scripts only).' } }, required: ['request', 'projectRoot'] } },
    run: async ({ request, projectRoot, changeName, complexity, domain, async: asJob }) => {
      // ASYNC (T5): job vía app — el driver corre como hijo del server (guardarraíl 1-run/repo incluido);
      // esta tool retorna al instante y el seguimiento lo hacen conductor_continue/receipt (ya existentes).
      if (asJob === true) {
        const rootA = resolve(projectRoot || process.cwd());
        const app = await appUp(rootA);
        if (!app) return { ok: false, error: 'la app local no arrancó — diagnostica con `conductor doctor`' };
        const nameA = changeName ? slug(changeName) : featureName(request);
        let lr = null, lj = null;
        try { lr = await fetch(app.url + 'api/launch', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ request, name: nameA, project: rootA, auto: true, ...(complexity ? { complexity } : {}), ...(domain ? { domain } : {}) }) }); lj = await lr.json().catch(() => null); } catch (e) { return { ok: false, error: String(e.message) }; }
        if (!lj?.ok) return { ok: false, error: lj?.error || `launch HTTP ${lr?.status}`, busyProject: lj?.busyProject || undefined, needsInit: lj?.needsInit || undefined };
        return { ok: true, changeName: nameA, web: app.url.replace(/\/$/, '') + lj.url, next: 'Job lanzado (sin pausas). Sondea con conductor_continue {projectRoot, changeName, action:"wait"} hasta status done, y pide conductor_receipt al final. NO lo relances.' };
      }
      if (!request) throw new Error('request requerido');
      const root = resolve(projectRoot || process.cwd());
      const name = changeName ? slug(changeName) : featureName(request);
      const changeDir = join(root, 'openspec', 'changes', name);
      const r = await drive({ changeDir, request, complexity: complexity || 'medium', domain: domain ? slug(domain) : domainFromName(name), srcDir: root, log: (m) => log(m) });
      return { verdict: r.verdict, gate: r.gate || null, phase: r.phase || null, trail: r.trail || [], changeDir };
    } },
  // RECIBO EN EL CHAT (feature completa SIN miniweb): tras conductor_drive, el agente presenta el recibo de
  // PR ahí mismo — qué se pidió, requisitos cubiertos, verificación, modelos y coste. La revisión humana en
  // este modo es POST-HOC (leer el recibo + verify-report y commitear); las pausas interactivas viven en la
  // web y en el TTY, no en una llamada MCP única.
  conductor_receipt: { def: { name: 'conductor_receipt', title: 'PR receipt (markdown) of a verified run', description: 'Return the PR-ready markdown receipt of a change that ran the pipeline (request, covered requirements, files, verification, models, token cost). Call it right after conductor_drive and SHOW the markdown to the user — they review it and commit themselves.', inputSchema: { type: 'object', properties: { changeDir: { type: 'string' } }, required: ['changeDir'] } },
    run: ({ changeDir }) => {
      const md = makeReceipt(resolve(changeDir));
      if (!md) throw new Error('sin timeline todavía — el recibo sale de un run ejecutado (usa conductor_drive/conductor_feature primero)');
      return { markdown: md };
    } },
  // ENTRADA UNIVERSAL POR MCP (el arranque desde cualquier chat): cualquier host MCP (IDE, CLI de agente, etc.) puede abrir
  // la app única de conductor enfocada en el repo actual. La app se arranca si está apagada; los runs se lanzan
  // desde el panel (decisión de producto: la web es la superficie de lanzamiento/revisión, el host solo la abre).
  conductor_app: { def: { name: 'conductor_app', title: 'open the conductor panel (single local app)', description: 'Open (starting it if needed) the LOCAL conductor web panel focused on the given project. The universal entry from any MCP host: runs are launched and reviewed in the panel. Returns the URL (also tries to open the browser; set CONDUCTOR_NO_OPEN=1 to skip).', inputSchema: { type: 'object', properties: { projectRoot: { type: 'string', description: 'absolute path of the repo to focus (default: the MCP server cwd)' }, open: { type: 'boolean', description: 'false = do NOT open the browser: return url + runs summary so the CHAT can answer in place (the polite default for an empty /conductor)' } }, required: [] } },
    run: async ({ projectRoot, open }) => {
      const root = resolve(projectRoot || process.cwd());
      const port = Number(process.env.CONDUCTOR_PORT) || 4750;
      const url = `http://127.0.0.1:${port}/`;
      const ping = () => fetch(url + 'api/ping', { signal: AbortSignal.timeout(1200) }).then((r) => r.ok).catch(() => false);
      let alive = await ping();
      if (!alive) {
        spawn(process.execPath, [resolve(process.argv[1]), 'serve', root], { detached: true, stdio: 'ignore', windowsHide: true, env: { ...process.env, CONDUCTOR_SERVE_OPEN: '0' } }).unref();
        for (let i = 0; i < 14 && !alive; i++) { await new Promise((r) => setTimeout(r, 500)); alive = await ping(); }
        if (!alive) return { ok: false, url, error: `la app no arrancó (¿el puerto ${port} lo ocupa otro proceso? diagnostica con \`conductor doctor\`)` };
      }
      // foco per-repo server-side (Opción A): una pestaña ya abierta en OTRO repo se re-enfoca sola en su poll
      let focused = false, name = root.split(/[\\/]/).pop(), openspec = null;
      try {
        const fr = await fetch(url + 'api/focus', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ project: root }), signal: AbortSignal.timeout(3000) });
        const j = await fr.json().catch(() => null);
        if (fr.ok && j && j.ok) { focused = true; name = j.name || name; openspec = j.openspec ?? null; }
      } catch { /* foco best-effort: sin él la app abre con el foco anterior y se avisa en note */ }
      if (open !== false && process.env.CONDUCTOR_NO_OPEN !== '1') {
        try { const opener = process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`; execSync(opener, { shell: true, stdio: 'ignore', timeout: 5000, windowsHide: true }); } catch { /* sin navegador: la URL devuelta basta */ }
      }
      // open:false = modo ESTADO para el chat (el /conductor vacío): runs del proyecto en una línea, sin ventanas
      let runs;
      if (open === false) {
        try {
          const ch = await fetch(url + 'api/changes', { signal: AbortSignal.timeout(3000) }).then((r) => (r.ok ? r.json() : null));
          const mine = (ch?.projects || []).find((pr) => pr.name === name) || null;
          const list = mine?.changes || ch?.changes || [];
          runs = { total: list.length, paused: list.filter((c) => c.pending).length, running: list.filter((c) => c.running || c.alive).length };
        } catch { /* resumen best-effort */ }
      }
      return { ok: true, url, project: name, focused, openspec, runs, note: focused ? `panel enfocado en «${name}» — escribe la feature y lánzala desde ahí` : `«${root}» no parece un proyecto conductor (falta openspec/ o .git) — el panel abre con su foco anterior; inicialízalo desde la web` };
    } },
  // ── MODO CHAT (la vía CLI de primera clase): el proceso se VE en la conversación ──
  conductor_feature: { def: { name: 'conductor_feature', title: 'run a feature WITH conversational review pauses (the chat is the cockpit)', description: 'Start the governed SDD pipeline for a feature. The FIRST call returns in a few seconds (launch confirmation + initial progress + web link); wait calls return within ~55s. Statuses: "working" = phase still running, with a `progress` snapshot (phases done ✓, current phase, tokens, log tail) → give the user a ONE-LINE update when progress changed, then IMMEDIATELY call conductor_continue {action:"wait"} and repeat; "paused" = review pause → SHOW the returned artifacts (proposal/spec/report, trimmed) to the user verbatim and wait for their reply, then call conductor_continue with their decision; "done" = final verdict + receipt. Use this when the user wants to follow the run IN THE CHAT; use conductor_app if they prefer the web panel. A /skill-name mention inside the request activates that team skill for the whole run.', inputSchema: { type: 'object', properties: { request: { type: 'string', description: 'the feature request, in the user\'s words (may include @paths and /skill mentions)' }, projectRoot: { type: 'string', description: 'absolute path of the project root' }, changeName: { type: 'string', description: 'optional kebab name; derived from the request if absent' }, model: { type: 'string', description: 'model for ALL phases, prefixed: litellm:<id> or copilot:<id>. Pass it ONLY when the user names a model — it beats everything, including the repo governance' }, chatModel: { type: 'string', description: 'the model THIS chat conversation runs on, prefixed: litellm:<id> or copilot:<id>. ALWAYS pass it when you know it: a run does NOT inherit the chat model by itself — with this field it does whenever the repo pins no models in openspec/conductor.json (repo governance, when present, wins). Invalid ids are rejected by validation and the launch retries without it (field `aviso` explains)' } }, required: ['request', 'projectRoot'] } },
    run: async ({ request, projectRoot, changeName, model, chatModel }) => {
      if (!request) throw new Error('request requerido');
      const root = resolve(projectRoot || process.cwd());
      const app = await appUp(root);
      if (!app) return { ok: false, error: 'la app local no arrancó — diagnostica con `conductor doctor`' };
      const name = changeName ? slug(changeName) : featureName(request);
      let lr = null, lj = null;
      // MODELO del run (caso real: lanzado desde OpenCode con LiteLLM, el run caía al default de la sesión de
      // Copilot y el usuario lo descubría en el visor). Precedencia: `model` (el usuario lo NOMBRÓ — gana a todo)
      // > gobierno del repo (conductor.json models) > `chatModel` (el modelo de la conversación — herencia por
      // defecto cuando el repo no fija nada) > sesión de Copilot. Todo va por el mismo canal validado que usa la
      // web (checkByokModels + policy en /api/launch); los env de launch pisan al conductor.json, por eso
      // chatModel SOLO se aplica con gobierno vacío.
      let gov = {}; try { gov = JSON.parse(readFileSync(join(root, 'openspec', 'conductor.json'), 'utf8')).models || {}; } catch {}
      const govHas = Object.values(gov).some(Boolean);
      const effModel = model || (!govHas && chatModel ? chatModel : null);
      let models = effModel ? { planner: effModel, coder: effModel, reviewer: effModel } : undefined;
      let avisoModelo = null;
      const doLaunch = async () => { lr = await fetch(app.url + 'api/launch', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ request, name, project: root, auto: false, ...(models ? { models } : {}) }) }); lj = await lr.json().catch(() => null); };
      try {
        await doLaunch();
        // id de modelo inválido (p.ej. el agente pasó el nombre bonito del chat, no el id del catálogo): UN
        // reintento sin modelos para no dejar al usuario sin run, con aviso honesto de qué se descartó.
        if (!lj?.ok && models && /model/i.test(String(lj?.error || ''))) {
          avisoModelo = `el modelo «${effModel}» no pasó la validación (${lj.error}) — el run sale SIN él (gobierno del repo o sesión de Copilot); comprueba el id con \`conductor litellm status\` o fija models en openspec/conductor.json`;
          models = undefined; await doLaunch();
        }
      } catch (e) { return { ok: false, error: String(e.message) }; }
      if (!lj?.ok) {
        // RUN ACTIVO (caso real: un timeout del host dejó el run vivo y el reintento chocaba a
        // ciegas): dile al agente CÓMO engancharse al run en marcha en vez de dejarle relanzar en bucle.
        const activeChange = lj?.url ? String(lj.url).split('/').filter(Boolean).pop() : undefined;
        return {
          ok: false, error: lj?.error || `launch HTTP ${lr?.status}`, needsInit: lj?.needsInit || undefined,
          web: lj?.url ? app.url.replace(/\/$/, '') + lj.url : undefined, activeChange,
          ...(activeChange ? { next: `Tu PRIMERA LÍNEA al usuario, literal: «⚠ NO he lanzado tu petición: este repo ya tiene un run activo («${activeChange}») y dos runs sobre el mismo código se pisarían». Después pregúntale: ¿seguir ese run, detenerlo y lanzar el tuyo, o esperar? Para seguirlo: conductor_continue {projectRoot, changeName:"${activeChange}", action:"wait"}. JAMÁS relances en bucle.` } : {}),
        };
      }
      // ARRANQUE RÁPIDO: la PRIMERA respuesta vuelve en
      // ~3s (una lectura de estado) con el enlace y la fase inicial — el spinner del host no se come 50s.
      // El ritmo largo lo llevan los conductor_continue {action:"wait"} posteriores.
      const webF = app.url.replace(/\/$/, '') + lj.url;
      const res = await pollRun(app.url, 'api' + lj.url, join(root, 'openspec', 'changes', name), { timeoutMs: Number(process.env.CONDUCTOR_MCP_FIRST_MS) || 3000, web: webF });
      // BANNER de arranque (la voz V1 en el chat): pipeline + complejidad + fases del plan, listo para
      // imprimir tal cual. Best-effort: si el driver aún no fijó su plan, se omite sin drama.
      let banner = null;
      try {
        const st = await (await fetch(app.url + 'api' + lj.url + '/state', { signal: AbortSignal.timeout(3000) })).json();
        if (Array.isArray(st.plan) && st.plan.length) banner = `🚀 Pipeline: ${name}\n📋 ${st.complexity || 'medium'} · Fases: ${st.plan.join(' → ')}`;
        // TRANSPARENCIA de modelos en el arranque: qué va a ejecutar de verdad (el run NO hereda el modelo del chat)
        if (banner) {
          const roles = Object.entries(gov).filter(([, v]) => v);
          const mLine = (models && model) ? `${model} (todas las fases — pedido en el chat)`
            : (models && effModel) ? `${effModel} (heredado de este chat)`
            : roles.length ? 'gobierno del repo: ' + roles.map(([k, v]) => `${k}=${v}`).join(' · ')
            : 'los de la sesión de Copilot (este chat no impone el suyo)';
          banner += `\n🤖 Modelos: ${mLine}`;
        }
      } catch {}
      return { ...res, ...(banner ? { banner, next: 'Imprime `banner` TAL CUAL y sigue: ' + (res.next || '') } : {}), ...(avisoModelo ? { aviso: avisoModelo } : {}), changeName: name, web: webF };
    } },
  conductor_continue: { def: { name: 'conductor_continue', title: 'answer a conductor review pause (approve / note / hot-model / stop) or keep waiting', description: 'Continue a PAUSED conductor run with the user\'s decision: no note = approve as-is; note = guidance injected into the next phase; model = hot-swap just for that phase (litellm:<m> | copilot:<m>); action:"stop" stops the run keeping everything; action:"wait" = no decision, just keep waiting. ALWAYS pass phase (the `phase` field of the pause you are answering) with a decision — if that pause was already resolved (e.g. from the web) the run is NOT touched and you get the CURRENT state back (field `aviso`). Same contract as conductor_feature: returns within ~55s with "working" + `progress` (→ one-line user update if it changed, then call again with action:"wait"), "paused" (→ print `render` verbatim, ask the user) or "done" (verdict + receipt).', inputSchema: { type: 'object', properties: { projectRoot: { type: 'string' }, changeName: { type: 'string' }, note: { type: 'string' }, model: { type: 'string' }, phase: { type: 'string', description: 'phase of the pause being answered (from the pause payload) — guards against racing a web decision' }, action: { type: 'string', enum: ['continue', 'stop', 'wait'] } }, required: ['projectRoot', 'changeName'] } },
    run: async ({ projectRoot, changeName, note, model, phase, action }) => {
      const root = resolve(projectRoot || process.cwd());
      const name = slug(changeName);
      const app = await appUp(root);
      if (!app) return { ok: false, error: 'la app local no está en marcha — lanza primero con conductor_feature' };
      // ruta 2-seg si el proyecto está en el registro (multi-proyecto); si no, forma 1-seg (default)
      let pid = null; try { pid = (app.ping?.projects || []).find((p) => resolve(p.root) === root)?.id || null; } catch {}
      const base = 'api/run/' + (pid ? pid + '/' : '') + name;
      const webC = app.url.replace(/\/$/, '') + '/run/' + (pid ? pid + '/' : '') + name;
      let stale = null; // decisión que llegó TARDE a una pausa ya resuelta (p.ej. desde la web)
      if (action === 'stop') { try { await fetch(app.url + base + '/stop', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }); } catch {} }
      else if (action !== 'wait') {
        // source:'chat' — la decisión llega TRANSMITIDA por un agente MCP, no de un clic humano en el
        // panel: el driver lo graba (via human-chat) y el acta AI Act deja de afirmar «una persona» a ciegas.
        const payload = { source: 'chat', ...(note ? { note } : {}), ...(model ? { model } : {}), ...(phase ? { expectPhase: phase } : {}) };
        try {
          const r = await fetch(app.url + base + '/continue', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
          if (r.status === 409) { const j = await r.json().catch(() => ({})); if (j.stalePause) stale = j; }
          // (un 409 sin stalePause = ya no había pausa — p.ej. terminó mientras el usuario respondía; el poll de abajo lo cuenta)
        } catch {}
      }
      // tras una DECISIÓN (aprobar/nota/stop) el usuario quiere confirmación YA (~8s: el run arranca la fase
      // y se ve el estado); el wait puro sí agota el presupuesto largo — es el que marca el ritmo del bucle.
      const res = await pollRun(app.url, base, join(root, 'openspec', 'changes', name), action === 'wait' ? { web: webC } : { timeoutMs: Number(process.env.CONDUCTOR_MCP_FIRST_MS) || 8000, web: webC });
      return {
        ...res,
        ...(stale ? { aviso: `tu decisión respondía a la pausa «${phase}», pero esa ya estaba resuelta (p.ej. desde la web) — el run NO se ha tocado; arriba va el estado ACTUAL: preséntalo (di al usuario qué se decidió sin él mirar) y sigue desde ahí` } : {}),
        changeName: name, web: webC,
      };
    } },
};

export function serve() {
  // ENTRADA ÚNICA: el MCP ya NO auto-instala ningún comando `conductor` en el PATH al cargar el plugin
  // (era opaco y fallaba fuera de Windows — en Mac ~/.local/bin no está en PATH; en Linux hasta re-login). El
  // atajo de terminal solo vía instalación npm (crea los shims ella sola). Nada se escribe en tu PATH a tus espaldas.
  const send = (m) => process.stdout.write(JSON.stringify(m) + '\n');
  const reply = (id, result) => send({ jsonrpc: '2.0', id, result });
  const failrpc = (id, code, message) => send({ jsonrpc: '2.0', id, error: { code, message } });
  async function handle(msg) {
    const { id, method, params } = msg;
    if (method === undefined) return;
    switch (method) {
      case 'initialize': return reply(id, { protocolVersion: PROTOCOL, capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'conductor', version: '0.2.0' }, instructions: 'Deterministic SDD verification gates as MCP tools.' });
      case 'notifications/initialized': case 'notifications/cancelled': return;
      case 'ping': return reply(id, {});
      case 'tools/list': return reply(id, { tools: Object.values(TOOLS).map((t) => t.def) });
      case 'tools/call': {
        const tool = TOOLS[params?.name]; if (!tool) return failrpc(id, -32602, `Unknown tool: ${params?.name}`);
        // ARGUMENTOS REQUERIDOS: los schemas los declaran, pero nadie los comprobaba y la llamada caía
        // directa al fs. Quien rellena estos args es un MODELO, no un humano, así que omitir uno es el
        // caso NORMAL — y devolvía el error interno de Node ("The \"path\" argument must be of type
        // string. Received undefined"), que no le dice al agente qué arreglar. Ahora se nombra el que falta.
        const miss = (tool.def?.inputSchema?.required || []).filter((k) => (params.arguments || {})[k] === undefined || (params.arguments || {})[k] === null || (params.arguments || {})[k] === '');
        if (miss.length) return reply(id, { content: [{ type: 'text', text: `tool error: faltan argumentos obligatorios en ${params.name}: ${miss.join(', ')}` }], isError: true });
        try { assertConfined(process.env.CONDUCTOR_ROOT, params.arguments, PATH_ARGS); const r = await tool.run(params.arguments || {}); return reply(id, { content: [{ type: 'text', text: JSON.stringify(r, null, 2) }], isError: false }); }
        catch (e) { return reply(id, { content: [{ type: 'text', text: `tool error: ${e.message}` }], isError: true }); }
      }
      default: if (id !== undefined) failrpc(id, -32601, `Method not found: ${method}`);
    }
  }
  log(`started, protocol ${PROTOCOL}, ${Object.keys(TOOLS).length} tools`);
  const rl = createInterface({ input: process.stdin });
  rl.on('line', (line) => { const s = line.trim(); if (!s) return; let m; try { m = JSON.parse(s); } catch { return send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }); } handle(m).catch((e) => log('err', e.message)); });
}
