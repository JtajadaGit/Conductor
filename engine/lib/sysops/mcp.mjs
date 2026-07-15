// conductor/lib/mcp.mjs — MCP server (stdio, protocolo 2025-11-25) exponiendo TODO el motor.
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
    run: ({ sealJson, key, publicKeyPem }) => verifySeal(JSON.parse(sealJson), { key, publicKeyPem }) },
  conductor_explain: { def: { name: 'conductor_explain', title: 'reverse-engineer code → spec draft', description: 'Reverse-engineer a source tree into a draft OpenSpec spec: capabilities, HTTP endpoints, units, and an extracted OpenAPI skeleton. For brownfield/migrations.', inputSchema: { type: 'object', properties: { srcDir: { type: 'string' } }, required: ['srcDir'] } },
    run: ({ srcDir }) => { const r = explain(srcDir); return { capabilities: r.capabilities.map((c) => ({ id: c.id, name: c.name, endpoints: c.endpoints.length, units: c.units.length, files: c.files.length })), hasOpenapi: !!r.openapi }; } },
  conductor_drift: { def: { name: 'conductor_drift', title: 'living-spec drift detection', description: 'Detect spec↔code drift: requirements without code, untracked code surface, contract drift.', inputSchema: { type: 'object', properties: { changeDir: { type: 'string' }, srcDir: { type: 'string' } }, required: ['changeDir', 'srcDir'] } },
    run: ({ changeDir, srcDir }) => { const r = detectDrift(changeDir, srcDir); return { verdict: r.findings.some((f) => f.severity === 'error' || f.severity === 'breaking') ? 'DRIFT' : 'OK', summary: r.summary, findings: r.findings }; } },
  conductor_migrate: { def: { name: 'conductor_migrate', title: 'DB migration safety linter', description: 'Lint SQL migration files for destructive/irreversible/blocking operations (large DB migrations, rolling deploys).', inputSchema: { type: 'object', properties: { target: { type: 'string', description: 'migrations dir or .sql file' } }, required: ['target'] } },
    run: ({ target }) => { const F = lintMigrations(target); return { verdict: F.some((f) => f.severity === 'breaking' || f.severity === 'error') ? 'UNSAFE' : 'OK', count: count(F), findings: F }; } },
  conductor_legacy: { def: { name: 'conductor_legacy', title: 'legacy migration readiness (evidence-gate, code-driven)', description: 'Code-driven legacy-migration evidence gate. Given a legacy source dir and the DECLARED features to migrate, deterministically traces each feature to evidence in the OLD code and BLOCKS spec/implementation until every feature is evidence-backed ("declared != ready"). Returns state READY_FOR_SPEC|NEEDS_DEEPENING|BLOCKED, allowed.generateSpec/implement, and per-feature evidence + explicit blockers (CODE_TRACE_REQUIRED, DATA_MODEL_REQUIRED, EXTERNAL_CONTRACT_REQUIRED). 0 LLM, 0 network.', inputSchema: { type: 'object', properties: { srcDir: { type: 'string', description: 'root of the legacy source tree' }, features: { type: 'array', description: 'declared features to migrate', items: { type: 'object', properties: { name: { type: 'string' }, keywords: { type: 'array', items: { type: 'string' } } }, required: ['name'] } } }, required: ['srcDir', 'features'] } },
    run: ({ srcDir, features }) => assessReadiness(features || [], walkText(resolve(srcDir))) },
  // NOTA: conductor_start/conductor_next se RETIRARON del MCP (2026-06-10): un modelo de sesión los
  // usaba para re-hacer el pipeline a mano en paralelo al driver (carrera + tokens). La máquina de
  // estados sigue en lib/orchestrate.mjs para uso interno del driver. Robustez por capacidad, no por prompt.
  conductor_init_config: { def: { name: 'conductor_init_config', title: 'scaffold user config + JSON Schema', description: 'Create openspec/conductor.json (only if missing) and openspec/conductor.schema.json (editor autocomplete/validation) in the given openspec dir.', inputSchema: { type: 'object', properties: { openspecDir: { type: 'string', description: 'absolute path of the project openspec/ dir' } }, required: ['openspecDir'] } },
    run: ({ openspecDir }) => initConfig(openspecDir) },
  conductor_drive: { def: { name: 'conductor_drive', title: 'run the FULL SDD pipeline (deterministic driver)', description: 'Run the ENTIRE SDD pipeline deterministically end-to-end. The SERVER drives every phase (propose→spec→…→apply→verify) in order, calling the BYOK model itself for each artifact and running the deterministic gate at verify. Phases CANNOT be skipped regardless of model quality. Call this ONCE with the feature request; it returns the final verdict. The server reads model config from BYOK env (COPILOT_PROVIDER_BASE_URL/_API_KEY/COPILOT_MODEL or CONDUCTOR_*).', inputSchema: { type: 'object', properties: { request: { type: 'string', description: 'the feature request, in the user\'s words' }, projectRoot: { type: 'string', description: 'absolute path of the project root (where openspec/ lives)' }, changeName: { type: 'string', description: 'optional kebab name for the change; derived from request if absent' }, complexity: { type: 'string', enum: ['simple', 'medium', 'complex'] }, domain: { type: 'string', description: 'short domain noun for the spec folder' } }, required: ['request', 'projectRoot'] } },
    run: async ({ request, projectRoot, changeName, complexity, domain }) => {
      if (!request) throw new Error('request requerido');
      const root = resolve(projectRoot || process.cwd());
      const name = changeName ? slug(changeName) : featureName(request);
      const changeDir = join(root, 'openspec', 'changes', name);
      const r = await drive({ changeDir, request, complexity: complexity || 'medium', domain: domain ? slug(domain) : name.split('-')[0], srcDir: root, log: (m) => log(m) });
      return { verdict: r.verdict, gate: r.gate || null, phase: r.phase || null, trail: r.trail || [], changeDir };
    } },
  // RECIBO EN EL CHAT (feature completa SIN miniweb): tras conductor_drive, el agente presenta el recibo de
  // PR ahí mismo — qué se pidió, requisitos cubiertos, verificación, modelos y coste. La revisión humana en
  // este modo es POST-HOC (leer el recibo + verify-report y commitear); las pausas interactivas viven en la
  // web y en el TTY, no en una llamada MCP única.
  conductor_receipt: { def: { name: 'conductor_receipt', title: 'PR receipt (markdown) of a verified run', description: 'Return the PR-ready markdown receipt of a change that ran the pipeline (request, covered requirements, files, verification, models, token cost). Call it right after conductor_drive and SHOW the markdown to the user — they review it and commit themselves.', inputSchema: { type: 'object', properties: { changeDir: { type: 'string' } }, required: ['changeDir'] } },
    run: ({ changeDir }) => {
      const dir = resolve(changeDir);
      let tl = null; try { tl = JSON.parse(readFileSync(join(dir, '.conductor', 'timeline.json'), 'utf8')); } catch {}
      if (!tl || !Array.isArray(tl.phases) || !tl.phases.length) throw new Error('sin timeline todavía — el recibo sale de un run ejecutado (usa conductor_drive primero)');
      let domain = 'core'; try { domain = JSON.parse(readFileSync(join(dir, '.conductor', 'state.json'), 'utf8')).domain || 'core'; } catch {}
      const rd = (f) => { try { return readFileSync(join(dir, f), 'utf8'); } catch { return ''; } };
      const md = renderReceipt({ name: resolve(dir).split(/[\\/]/).pop(), timeline: tl, spec: rd(`specs/${domain}/spec.md`), proposal: rd('proposal.md'), verify: rd('verify-report.md') });
      if (!md) throw new Error('datos insuficientes para el recibo');
      return { markdown: md };
    } },
  // ENTRADA UNIVERSAL POR MCP (equivale a /sdd-run): cualquier host MCP (IDE, CLI de agente, etc.) puede abrir
  // la app única de conductor enfocada en el repo actual. La app se arranca si está apagada; los runs se lanzan
  // desde el panel (decisión de producto: la web es la superficie de lanzamiento/revisión, el host solo la abre).
  conductor_app: { def: { name: 'conductor_app', title: 'open the conductor panel (single local app)', description: 'Open (starting it if needed) the LOCAL conductor web panel focused on the given project. Equivalent to /sdd-run from any MCP host: runs are launched and reviewed in the panel. Returns the URL (also tries to open the browser; set CONDUCTOR_NO_OPEN=1 to skip).', inputSchema: { type: 'object', properties: { projectRoot: { type: 'string', description: 'absolute path of the repo to focus (default: the MCP server cwd)' } }, required: [] } },
    run: async ({ projectRoot }) => {
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
      if (process.env.CONDUCTOR_NO_OPEN !== '1') {
        try { const opener = process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`; execSync(opener, { shell: true, stdio: 'ignore', timeout: 5000, windowsHide: true }); } catch { /* sin navegador: la URL devuelta basta */ }
      }
      return { ok: true, url, project: name, focused, openspec, note: focused ? `panel enfocado en «${name}» — escribe la feature y lánzala desde ahí` : `«${root}» no parece un proyecto conductor (falta openspec/ o .git) — el panel abre con su foco anterior; inicialízalo desde la web` };
    } },
};

export function serve() {
  // ENTRADA ÚNICA `/sdd-run`: el MCP ya NO auto-instala ningún comando `conductor` en el PATH al cargar el plugin
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
