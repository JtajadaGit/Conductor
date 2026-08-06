#!/usr/bin/env node
// conductor — CLI unificado de verificación SDD determinista. Cero dependencias.
//
//   conductor gate     <changeDir> [--src dir] [--contract base head] [--format human|json|rdjson|sarif|junit] [--strict]
//   conductor contract <base.json> <head.json> [--format ...]
//   conductor trace    <changeDir> --src <dir> [--html out] [--format ...]
//   conductor cost     <token-usage.jsonl> [--otel out] [--json]
//   conductor run      <changeDir> [--complexity simple|medium|complex]
//   conductor resume   <runId>
//   conductor status   <runId|changeDir> [--json]
//   conductor seal     <changeDir> [--src dir] [--usage jsonl] [--key k] [--at iso] [-o out]
//   conductor verify   <provenance.json> [--key k]
//   conductor dashboard <changeDir> --src <dir> [--usage jsonl] [-o out.html]
//   conductor ci       [--gitlab] [-o path]
//   conductor mcp                       (arranca el MCP server por stdio)
//   conductor doctor                    (autotest del entorno + validador de config)
//   conductor version | help

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, chmodSync, rmSync } from 'node:fs';
import { execSync, execFileSync, spawn } from 'node:child_process';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import { createHash, createPrivateKey } from 'node:crypto';
const createHashSync = (s) => createHash('sha256').update(s).digest('hex');
import { checkCoherence } from '../lib/gates/coherence.mjs';
import { checkArtifacts } from '../lib/gates/artifacts.mjs';
import { checkContract } from '../lib/contract/contract.mjs';
import { buildTrace } from '../lib/gates/trace.mjs';
import { computeCost } from '../lib/core/cost.mjs';
import { estimateRun } from '../lib/core/estimate.mjs';
import { loadSkills, buildSkillsIndex } from '../lib/analysis/skills.mjs';
import { detectStack, renderStackDeep } from '../lib/analysis/stack.mjs';
import { listArchive, searchChanges } from '../lib/analysis/archive.mjs';
import { buildAtlas } from '../lib/analysis/atlas.mjs';
import { seal, verifySeal, generateKeypair, signFile, verifyFile, hashSpecs } from '../lib/provenance/provenance.mjs';
import { githubWorkflow, gitlabCi } from '../lib/sysops/ci.mjs';
import { renderDashboard, renderReceipt } from '../lib/serving/dashboard.mjs';
import { format, human, isBlocking, count } from '../lib/core/report.mjs';
import * as R from '../lib/pipeline/runner.mjs';
import { validate } from '../lib/core/jsonschema.mjs';
import { explain, renderSpec, renderTasks } from '../lib/analysis/explain.mjs';
import { detectDrift } from '../lib/contract/drift.mjs';
import * as L from '../lib/provenance/ledger.mjs';
import { lintMigrations } from '../lib/contract/migration.mjs';
import { scoreCandidate } from '../lib/gates/eval.mjs';
import { drive, readDriveConfig, defaultRunAgent } from '../lib/pipeline/drive.mjs';
import { buildCodeMap, renderCodeMap } from '../lib/analysis/codemap.mjs';
import { runGolden, GOLDEN_SCENARIOS, promptsFingerprint, appendEvalResult } from '../lib/pipeline/evals.mjs';
import { resolveInstalledOrigin, upgradePlan } from '../lib/sysops/upgrade.mjs';
import { createTtyPause } from '../lib/pipeline/ttypause.mjs';
import { mergeMcpEntry } from '../lib/sysops/connect.mjs';
import { initConfig, CONFIG_SCHEMA } from '../lib/analysis/scaffold.mjs';
import { writeAiact } from '../lib/serving/aiact.mjs';
import { createSdkRunner } from '../lib/pipeline/sdk-runner.mjs';
import { createRunServer, createAppServer, writeModelsCache, fetchByokPrices, loadRegistry, registerProjectPersistent } from '../lib/serving/serve.mjs';
import { aggregateStats } from '../lib/core/stats.mjs';
import { plumbPath } from '../lib/core/plumb.mjs';
import { encryptSecret, decryptSecret, sealByokFile, byokFile, isPortableBlob, isTemplateCreds, LITELLM_TEMPLATE, ensureByokTemplate, normalizeByokShape } from '../lib/provenance/secret.mjs';
import { PROMPT_KEYS, instructionFor } from '../lib/pipeline/orchestrate.mjs';
import { homedir, tmpdir } from 'node:os';
import { loadPolicy, validatePolicy, enforce, DEFAULT_POLICY } from '../lib/gates/policy.mjs';
import { toOtlp } from '../lib/sysops/otlp.mjs';

// robustez: cualquier error no capturado → mensaje limpio + exit 2 (nunca stack trace al usuario)
process.on('uncaughtException', (e) => { process.stderr.write(`conductor: error — ${e.message}\n`); process.exit(2); });

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
// la versión REAL vive en package.json (LA fuente desde la retirada de la vía plugin; junto a assets/ en la
// instalación npm) — cero constantes fósiles. Fallback: raíz de la fábrica. Compat: plugin.json legado.
const VERSION = (() => {
  for (const p of [join(dirname(resolve(process.argv[1])), '..', 'package.json'), join(ROOT, '..', 'package.json'), join(dirname(resolve(process.argv[1])), '..', 'plugin.json')]) {
    try { const v = JSON.parse(readFileSync(p, 'utf8')).version; if (v) return v; } catch {}
  }
  return '0.0.0-dev';
})();
const argv = process.argv.slice(2);
const cmd = argv[0];
const pos = argv.slice(1).filter((a) => !a.startsWith('-'));
const flag = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const has = (n) => argv.includes(n);
const fmt = flag('--format', has('--json') ? 'json' : 'human');

function out(findings, title) {
  console.log(format(findings, fmt, { title, tool: 'conductor' }));
  process.exit(isBlocking(findings) || (has('--strict') && findings.some((f) => f.severity === 'warning')) ? 1 : 0);
}

switch (cmd) {
  case 'gate': {
    const dir = pos[0]; if (!dir) bad('gate <changeDir>');
    let F = [...checkCoherence(dir), ...checkArtifacts(dir)];
    const src = flag('--src'); if (src) F.push(...buildTrace(dir, src).findings);
    const ci = argv.indexOf('--contract'); if (ci >= 0) F.push(...checkContract(argv[ci + 1], argv[ci + 2]));
    else if (existsSync(join(dir, 'openapi.base.json')) && existsSync(join(dir, 'openapi.head.json'))) F.push(...checkContract(join(dir, 'openapi.base.json'), join(dir, 'openapi.head.json')));
    out(F, `conductor gate · ${dir}`);
  }
  case 'contract': { if (!pos[1]) bad('contract <base> <head>  (.json=OpenAPI · .sql=esquema BD · .ts=contrato TS)'); out(checkContract(pos[0], pos[1]), `conductor contract`); }
  case 'migrate': { if (!pos[0] || !existsSync(pos[0])) bad('migrate <dir|file.sql>  (linter de seguridad de migraciones)'); out(lintMigrations(pos[0]), `conductor migrate · ${pos[0]}`); }
  case 'policy': {
    const sub = pos[0];
    // ESCRIBIR DONDE EL MOTOR LEE. El default era `conductor.policy.json` en el cwd, un nombre que NADIE
    // lee de forma automática: el driver carga `openspec/policy.json` (drive.mjs) y `loadPolicy(undefined)`
    // devuelve la política por defecto SIN allowlist. Es decir, un equipo hacía `policy init`, rellenaba
    // `allowedModels` y el gobierno no se aplicaba nunca. Se mantiene `-o` para elegir otra ruta.
    if (sub === 'init') {
      const o = flag('-o') || (existsSync(join(process.cwd(), 'openspec')) ? join('openspec', 'policy.json') : 'conductor.policy.json');
      mkdirSync(dirname(resolve(o)), { recursive: true });
      writeFileSync(o, JSON.stringify(DEFAULT_POLICY, null, 2));
      console.log(`política por defecto → ${o}${/openspec/.test(o) ? '  (el driver la aplica sola en cada run)' : '  ⚠ fuera de openspec/: el driver NO la lee sola, pásala con --policy'}`);
      process.exit(0);
    }
    if (sub === 'validate') { if (!pos[1] || !existsSync(pos[1])) bad('policy validate <file>'); const v = validatePolicy(JSON.parse(readFileSync(pos[1], 'utf8'))); console.log(v.valid ? 'política VÁLIDA' : 'política INVÁLIDA:\n' + v.errors.map((e) => '  - ' + (e.instancePath || '/') + ' ' + e.message).join('\n')); process.exit(v.valid ? 0 : 1); }
    if (sub === 'enforce') {
      const dir = pos[1]; if (!dir || !existsSync(dir)) bad('policy enforce <changeDir> [--policy file] [--override "razón"] [--by user]');
      const { policy, source } = loadPolicy(flag('--policy'));
      const findings = [...checkCoherence(dir), ...checkArtifacts(dir)];
      const r = enforce(findings, policy, { override: flag('--override'), overrideBy: flag('--by'), at: new Date().toISOString(), ranGates: ['coherence', 'artifacts'] });
      console.log(`\nconductor policy enforce · ${r.verdict}  (política: ${source})`);
      console.log(`  bloqueantes: ${r.blocking.length}${r.reason ? ' · ' + r.reason : ''}`);
      for (const f of r.blocking.slice(0, 10)) console.log(`     - [${f.rule}] ${f.message}`);
      if (r.audit) console.log(`  OVERRIDE auditado: by=${r.audit.by} · "${r.audit.justification}"`);
      console.log('');
      process.exit(r.verdict === 'FAIL' ? 1 : 0);
    }
    bad('policy <init|validate|enforce> ...');
  }
  case 'trace': {
    const dir = pos[0], src = flag('--src'); if (!dir || !src) bad('trace <changeDir> --src <dir>');
    const t = buildTrace(dir, src);
    const html = flag('--html'); if (html) { writeFileSync(html, renderTraceHtml(t)); }
    if (fmt === 'human') { printTrace(t); process.exit(t.gaps.length ? 1 : 0); }
    out(t.findings, 'conductor trace');
  }
  case 'cost': {
    if (!pos[0]) bad('cost <jsonl>'); const r = computeCost(pos[0]);
    const otel = flag('--otel'); if (otel) writeFileSync(otel, JSON.stringify({ resourceSpans: r.otelSpans }, null, 2));
    const otlp = flag('--otlp'); if (otlp) writeFileSync(otlp, JSON.stringify(toOtlp(r.otelSpans, { version: VERSION }), null, 2));
    if (has('--json')) { console.log(JSON.stringify(r, null, 2)); process.exit(0); }
    printCost(r); if (otlp) console.log(`  OTLP → ${otlp}\n`); process.exit(0);
  }
  case 'resume': case 'status': { // legacy .runs — 'run' ya NO vive aqui: es el gesto app (como promete la ayuda)
    const runsDir = join(ROOT, '.runs');
    // sin argumento, `runIdFor(undefined)` reventaba con el error INTERNO de Node ('The "paths[0]" argument
    // must be of type string. Received undefined') — el único comando del CLI que no daba su línea de uso.
    if (cmd === 'status') { const id = pos[0]; if (!id) bad('status <runId|changeDir>'); const p = join(runsDir, (existsSync(join(runsDir, `${id}.json`)) ? id : R.runIdFor(id)) + '.json'); if (!existsSync(p)) bad(`run "${id}" no encontrado en ${runsDir} (layout .runs legado; los runs de hoy viven en .conductor/runs y se ven con \`conductor\`)`); const s = JSON.parse(readFileSync(p, 'utf8')); has('--json') ? console.log(JSON.stringify(s, null, 2)) : printRun(s); process.exit(0); }
    if (cmd === 'resume') { if (!pos[0]) bad('resume <runId>'); const p = join(runsDir, `${pos[0]}.json`); if (!existsSync(p)) bad(`run "${pos[0]}" no encontrado en ${runsDir} (layout .runs legado; para reanudar un run actual usa la miniweb o \`conductor drive <changeDir> --resume\`)`); const s = R.resume(JSON.parse(readFileSync(p, 'utf8'))); R.save(runsDir, s); printRun(s); process.exit(s.status === 'done' ? 0 : 1); }
    bad('resume <runId> | status <runId|changeDir>');
  }
  case 'drive': {
    // DRIVER DETERMINISTA: el código conduce el pipeline y llama al modelo (BYOK) por fase.
    // Garantiza la secuencia con cualquier modelo — un modelo flojo da peor contenido, no salta fases.
    const dir = pos[0]; if (!dir) bad('drive <changeDir> --request "..." [--src dir] [--complexity simple|medium|complex] [--domain name] [--preset quick-fix|visual|feature|migration] [--model-planner m] [--model-coder m] [--model-reviewer m]');
    // BLINDAJE ANTI-IMPROVISACIÓN (caso real: un agente pasó `--src src` hacia un subdirectorio y otros
    // flags plausibles): flag desconocido = ABORT con la lista válida — el agente se corrige a la primera.
    const DRIVE_FLAGS = new Set(['--request', '--src', '--complexity', '--domain', '--pipeline', '--preset', '--runner', '--auto', '--ipc', '--run-tests', '--serve', '--model-planner', '--model-coder', '--model-reviewer']);
    { const reqIdx = argv.indexOf('--request'); const unknown = argv.filter((a, i) => a.startsWith('--') && !DRIVE_FLAGS.has(a) && (reqIdx < 0 || i <= reqIdx)); if (unknown.length) bad(`drive: flag(s) desconocido(s): ${unknown.join(' ')}. Flags válidos: ${[...DRIVE_FLAGS].join(' ')}`); }
    // inmune a comillas perdidas: une todas las palabras tras --request hasta el siguiente --flag
    const reqI = argv.indexOf('--request');
    let request = '';
    if (reqI >= 0) { const w = []; for (let j = reqI + 1; j < argv.length && !argv[j].startsWith('--'); j++) w.push(argv[j]); request = w.join(' '); }
    request = request || pos[1]; if (!request) bad('drive requiere --request "..." (o el 2º posicional)');
    // modelo por fase vía flags (equivalen a CONDUCTOR_MODEL_{ROLE}; el flag gana)
    for (const [f, env] of [['--model-planner', 'CONDUCTOR_MODEL_PLANNER'], ['--model-coder', 'CONDUCTOR_MODEL_CODER'], ['--model-reviewer', 'CONDUCTOR_MODEL_REVIEWER']]) {
      const v = flag(f); if (v) process.env[env] = v;
    }
    // config del usuario (openspec/conductor.json) — capas: defaults > config > env > flag
    const srcRoot = flag('--src') ? resolve(flag('--src')) : undefined;
    const ucfg = srcRoot ? readDriveConfig(srcRoot) : {};
    // runner: sdk POR DEFECTO si el bundle del SDK viaja junto al motor (sesiones calientes, ~4x);
    // override explícito con --runner/env/config; fallback automático a spawn si algo falla.
    const sdkBundlePath = [join(dirname(resolve(process.argv[1])), 'copilot-sdk.mjs'), join(ROOT, '..', 'assets', 'copilot-sdk.mjs')].find((p) => existsSync(p));
    // default: spawn (validado e2e). El sdk empaquetado (~4x mas rapido) se activa con --runner sdk /
    // CONDUCTOR_RUNNER=sdk / "runner":"sdk" en conductor.json; pasara a default tras validarlo en runtime real.
    const runnerPref = flag('--runner') || process.env.CONDUCTOR_RUNNER || ucfg.runner || 'spawn';
    let runner;
    if (runnerPref === 'sdk') {
      try { runner = await createSdkRunner({ projectRoot: srcRoot, sdkBundle: sdkBundlePath }); console.log(`runner: sdk (sesiones calientes${sdkBundlePath ? ', bundle' : ''})`); }
      catch (e) { console.error(`runner sdk no disponible (${e.message}) → uso spawn`); }
    }
    // MODO IPC (v3, app única): el driver corre como HIJO del panel — pausas/stop/aprobaciones viajan
    // por el canal IPC del padre; NO se levanta server propio ni se abre navegador.
    const ipc = has('--ipc') && typeof process.send === 'function';
    let ipcPause = {};
    if (ipc) {
      let resolver = null;
      const stopSig = { requested: false };
      process.on('message', (m) => {
        if (!m || typeof m !== 'object') return;
        if (m.t === 'continue' && resolver) { const r2 = resolver; resolver = null; r2(m.payload || {}); }
        if (m.t === 'stop') { stopSig.requested = true; if (resolver) { const r2 = resolver; resolver = null; r2({ stop: true }); } }
      });
      // la app padre cayó o se relevó → sin canal no hay quien apruebe pausas ni pare el run: STOP limpio
      // (drive persiste STOPPED, libera el lock y el run queda reanudable) en vez de zombi huérfano.
      process.on('disconnect', () => { stopSig.requested = true; if (resolver) { const r2 = resolver; resolver = null; r2({ stop: true }); } });
      const auto0 = has('--auto') || ucfg.autoApprove === true;
      ipcPause = {
        stopSignal: stopSig,
        ...(auto0 ? {} : {
          pauseAt: ['apply', 'verify'],
          onPause: (info) => new Promise((res) => { resolver = res; try { process.send({ t: 'pause', ...info }); } catch {} }),
        }),
      };
      try { process.send({ t: 'hello', pid: process.pid }); } catch {}
    }
    // mini-web en vivo (--serve, CONDUCTOR_SERVE=1 o config serve:true; CONDUCTOR_SERVE=0 la apaga)
    let srv = null;
    if (!ipc && process.env.CONDUCTOR_SERVE !== '0' && (has('--serve') || process.env.CONDUCTOR_SERVE === '1' || ucfg.serve === true)) {
      try {
        srv = await createRunServer({ changeDir: resolve(dir), srcDir: srcRoot });
        console.log(`🌐 SIGUE EL RUN EN VIVO: ${srv.url}`);
        // abre el navegador automáticamente (opt-out: CONDUCTOR_SERVE_OPEN=0 o config serveOpen:false)
        if (process.env.CONDUCTOR_SERVE_OPEN !== '0' && ucfg.serveOpen !== false) {
          try {
            const opener = process.platform === 'win32' ? `start "" "${srv.url}"` : process.platform === 'darwin' ? `open "${srv.url}"` : `xdg-open "${srv.url}"`;
            execSync(opener, { shell: true, stdio: 'ignore', timeout: 5000, windowsHide: true });
          } catch { /* sin navegador disponible → la URL impresa basta */ }
        }
      }
      catch (e) { console.error(`serve no disponible: ${e.message}`); }
    }
    // human-in-the-loop POR DEFECTO: con web, aprueba con el botón; SIN web pero con TERMINAL interactiva,
    // las MISMAS decisiones en la consola (aprobar/nota/modelo/rehacer/stop — vía dev-first). --auto (o
    // config autoApprove:true) = sin pausas; sin TTY (CI/pipes) el comportamiento de siempre (sin pausas).
    const auto = has('--auto') || ucfg.autoApprove === true;
    let pause = {}, ttyRl = null;
    if (!auto && srv) pause = { pauseAt: ['apply', 'verify'], onPause: (info) => { console.log(`⏸ REVISIÓN: aprueba en ${srv.url} para continuar con "${info.before}"`); return srv.waitApproval(info); } };
    else if (!auto && !ipc && ((process.stdin.isTTY && process.stdout.isTTY) || process.env.CONDUCTOR_TTY === '1')) {
      let ask;
      if (process.stdin.isTTY) {
        // TTY real → readline interactivo pregunta-a-pregunta.
        ttyRl = createInterface({ input: process.stdin, output: process.stdout });
        // Ctrl-C con un question() activo: readline CAPTURA el SIGINT y sin listener el proceso no muere en
        // ningún OS (el dev quedaría atrapado en la pausa). Salida limpia: el run queda reanudable (resume).
        ttyRl.on('SIGINT', () => { console.log('\n■ interrumpido — el run queda reanudable desde el panel o con `resume`'); process.exit(130); });
        ask = (q) => new Promise((res) => ttyRl.question(q, (a) => res(a)));
      } else {
        // CONDUCTOR_TTY=1 con PIPE (Git Bash/MinTTY/scripts): el pipe cierra stdin ANTES de la primera pausa
        // (las fases tardan minutos) → readline moría con "readline was closed" en plena revisión (bug real,
 // cazado en la batería de pruebas. Misma cura que litellm login/setup: TODO stdin de golpe
        // en una cola; cada pausa consume una línea. Cola agotada = aprobar (el script ya dijo todo lo suyo).
        const cola = [];
        let colaLista = new Promise((res) => {
          let b = '';
          process.stdin.setEncoding('utf8');
          process.stdin.on('data', (d) => { b += d; });
          process.stdin.on('end', () => { cola.push(...b.split(/\r?\n/)); res(); });
          process.stdin.on('error', () => res());
        });
        let agotadas = 0; // anti-bucle: los sub-prompts (nota/modelo) re-preguntan ante vacío — un script incompleto no debe colgar
        ask = async (q) => {
          await colaLista;
          if (!cola.length && ++agotadas > 8) { console.error('✗ stdin agotado en un sub-prompt del drive por tubería — pasa las respuestas completas (una por línea)'); process.exit(2); }
          const a = cola.length ? cola.shift() : '';
          console.log(q + (a || '(aprobar)'));
          return String(a).trim();
        };
      }
      pause = { pauseAt: ['apply', 'verify'], onPause: createTtyPause({ ask, log: (m) => console.log(m) }) };
    }
    const r = await drive({
      ...(runner ? { runAgent: runner } : {}),
      ...pause,
      ...ipcPause,
      ...(srv ? { stopSignal: srv.stopSignal, serveUrl: srv.url } : {}),
      changeDir: dir, request,
      complexity: flag('--complexity', 'medium'), domain: flag('--domain', 'core'),
      preset: flag('--preset'), // dial de gobierno por run (quick-fix|visual|feature|migration); cae a conductor.json/env si no se pasa
      pipeline: flag('--pipeline') ? flag('--pipeline').split(',').map((s) => s.trim()).filter(Boolean) : undefined, // fases por-run (checkboxes app); resolvePhases reimpone verify terminal
      runTests: has('--run-tests'), // toggle "test" del panel: ejecutar pruebas REALES post-gate (verify por ejecución, opcional); fallo → TESTS-FAIL
      srcDir: flag('--src'), log: (m) => console.log(m),
    });
    if (ttyRl) try { ttyRl.close(); } catch {}
    if (srv) { await new Promise((res) => setTimeout(res, 2500)); await srv.close(); } // margen para el último poll
    // STOPPED = resultado CORRECTO pedido por el humano → exit 0 + cierre explícito; si saliera con
    // código de error, Autopilot lo interpreta como fallo y "sigue trabajando" (bug visto en runtime).
    if (r.verdict === 'STOPPED') console.log('✅ TASK COMPLETE — run detenido por el usuario (decisión humana). NO relanzar: reanudar es decisión del usuario.');
    process.exit(r.verdict === 'GREEN' || r.verdict === 'STOPPED' || r.verdict === 'DUPLICATE' ? 0 : 1);
  }
  case 'ping': case 'app-status': {
    // estado rápido de la app única (sin levantar nada): versión, root servido y proyectos registrados.
    const j = await fetch('http://127.0.0.1:4750/api/ping', { signal: AbortSignal.timeout(1500) }).then((r) => r.json()).catch(() => null);
    if (!j?.ok) { console.log('app conductor (:4750): APAGADA. Levántala con `conductor serve <proyecto>` o la skill /sdd-run.'); process.exit(1); }
    console.log(`app conductor (:4750): EN MARCHA · v${j.version || '?'}${j.root ? ` · root ${j.root}` : ''}${Array.isArray(j.projects) ? ` · ${j.projects.length} proyecto(s) registrado(s)` : ''}`);
    process.exit(0);
  }
  case 'stop': {
    // detiene la app única (POST /api/shutdown). El servidor responde 409 si hay runs EN CURSO: NO se
    // mata trabajo vivo (decisión de producto). Sin app viva = nada que hacer (no es error de uso).
    const r = await fetch('http://127.0.0.1:4750/api/shutdown', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(3000) }).catch(() => null);
    if (!r) { console.log('app conductor: no responde en :4750 (ya estaba apagada).'); process.exit(0); }
    if (r.status === 409) { console.log('⚠ NO detengo la app: hay runs EN CURSO. Detén/espera esos runs (o hazlo desde la web) y reintenta.'); process.exit(1); }
    console.log('🛑 app conductor detenida.'); process.exit(0);
  }
  case 'restart': {
    // stop + relanzar serve (detached) en el root indicado (o cwd). Respeta el guard 409: si hay runs
    // vivos, NO reinicia (no se pisa trabajo en curso). Reusa el case 'serve' vía un proceso nuevo.
    const root = resolve(pos[0] || '.');
    const r = await fetch('http://127.0.0.1:4750/api/shutdown', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(3000) }).catch(() => null);
    if (r && r.status === 409) { console.log('⚠ NO reinicio: hay runs EN CURSO en la app actual. Espera/detén esos runs y reintenta.'); process.exit(1); }
    for (let i = 0; i < 12; i++) { await new Promise((res) => setTimeout(res, 300)); const up = await fetch('http://127.0.0.1:4750/api/ping', { signal: AbortSignal.timeout(700) }).then((r2) => r2.json()).catch(() => null); if (!up?.ok) break; }
    spawn(process.execPath, [resolve(process.argv[1]), 'serve', root], { detached: true, stdio: 'ignore', windowsHide: true, env: { ...process.env, CONDUCTOR_SERVE_OPEN: '0' } }).unref();
    console.log(`♻ app reiniciada sirviendo ${root} (tarda 1-2s en responder en :4750). Comprueba con \`conductor ping\`.`);
    process.exit(0);
  }
  case 'serve': {
    // PANEL DE PROYECTO: lista los runs y permite lanzar/reanudar desde el navegador — sin LLM de
    // sesión por medio (0 tokens de orquestación). El proceso queda vivo sirviendo hasta Ctrl-C.
    const root = resolve(pos[0] || '.');
    let srv2; // APP ÚNICA (v3): puerto fijo → URL estable; si está ocupado (otra app), uno efímero
    const appOpts = { root, engine: resolve(process.argv[1]), version: VERSION, onShutdown: () => setTimeout(() => process.exit(0), 150) };
    const portOverride = process.env.CONDUCTOR_PORT;
    if (portOverride !== undefined && portOverride !== '') {
      // instancia AISLADA (tests e2e / CI / varios proyectos en paralelo): puerto PROPIO, SIN ceder a la app
      // única de :4750 ni registrar en su home. 0 = efímero. Evita que un e2e hable en SILENCIO con un servidor
      // vivo ajeno (no-hermético) y contamine su registro real — bug real detectado al chocar con un serve vivo.
      srv2 = await createAppServer({ ...appOpts, port: Number(portOverride) || 0 });
    } else
    {
      // :4750 con REINTENTO breve (anti TIME_WAIT tras un relevo, Windows sobre todo): un único intento daba
      // EADDRINUSE espurio mientras el socket del proceso anterior se soltaba → acabábamos en el fallback (o,
      // lanzado detached, en exit 1) con un "♻ reiniciada" FALSO y la app muerta. 3 intentos × 700ms cubren la ventana.
      let bindErr = null;
      for (let i = 0; i < 3 && !srv2; i++) {
        try { srv2 = await createAppServer({ ...appOpts, port: 4750 }); }
        catch (e2) { bindErr = e2; if (!/EADDRINUSE/i.test(e2?.code || e2?.message || '')) break; await new Promise((r2) => setTimeout(r2, 700)); }
      }
      if (!srv2) {
      const e = bindErr;
      const isAddr = /EADDRINUSE/i.test(e?.code || e?.message || '');
      if (isAddr) {
        // anti "varios encendidos": si :4750 lo ocupa OTRA conductor VIVA, NO levanto una 2ª app (efímera y
        // confusa) — uso esa. Solo caigo a efímero si el puerto lo ocupa algo AJENO a conductor.
        // Ping ROBUSTO (3s + reintento): con la máquina cargada, 900ms clasificaban una conductor VIVA como
        // "ajena" → 2ª app efímera zombi (bug real: 2 zombis criados en arranques a 1 min de distancia).
        let j = null;
        for (let i = 0; i < 2 && !j?.ok; i++) j = await fetch('http://127.0.0.1:4750/api/ping', { signal: AbortSignal.timeout(3000) }).then((r) => r.json()).catch(() => null);
        if (j?.ok) {
          // app única ya viva → REGISTRAR el proyecto pedido y ENFOCARLO en la web (no un ✅ mudo que ignora B, #5).
          const nm = root.split(/[\\/]/).pop();
          // ARRANQUE PER-REPO (Opción A): foco SERVER-SIDE (/api/focus), no `?project=` de cliente — así una
          // pestaña YA abierta en otro repo se re-enfoca a ÉSTE en su poll (sin depender de que el navegador navegue).
          const reg = await fetch('http://127.0.0.1:4750/api/focus', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ project: root }) }).then((r) => r.json()).catch(() => null);
          if (reg?.ok) {
            const appUrl = 'http://127.0.0.1:4750/';
            console.log(`✅ App conductor única ya en marcha. Enfocado «${nm}» (server-side, el panel lo sigue) → ${appUrl}${reg.openspec ? '' : ' (sin init: la web te ofrecerá Inicializar)'}`);
            if (process.env.CONDUCTOR_SERVE_OPEN !== '0') { try { const opener = process.platform === 'win32' ? `start "" "${appUrl}"` : process.platform === 'darwin' ? `open "${appUrl}"` : `xdg-open "${appUrl}"`; execSync(opener, { shell: true, stdio: 'ignore', timeout: 5000, windowsHide: true }); } catch {} }
            process.exit(0);
          }
          console.log(`✅ Ya hay una app conductor EN MARCHA en http://127.0.0.1:4750 (v${j.version || '?'}) — úsala (no levanto otra). Reinícala con \`conductor restart\` si quieres.`); process.exit(0);
        }
      }
      const why = isAddr ? 'el puerto 4750 lo ocupa algo AJENO a conductor' : `no pude usar el puerto 4750 (${e.message})`;
      // fallback a puerto EFÍMERO solo con TTY (alguien que VEA la URL). Lanzado detached/stdio-ignore (el
      // launcher), una app efímera es un ZOMBI que nadie conoce (la URL se imprime a la nada) → mejor salir
      // con error claro; el launcher ya diagnostica el arranque fallido en .conductor/launcher.log.
      if (!process.stdout.isTTY) { console.error(`✗ ${why} y no hay terminal que muestre una URL alternativa — NO levanto una app efímera invisible. Libera :4750 (o \`conductor stop\`) y reintenta.`); process.exit(1); }
      srv2 = await createAppServer(appOpts);
      console.log(`⚠ ${why} → sirviendo en un puerto efímero. Cierra lo que ocupe :4750 y reinicia para la app única.`);
      }
    }
    console.log(`🌐 conductor · panel del proyecto: ${srv2.url}\n   (Ctrl-C para cerrar)`);
    if (process.env.CONDUCTOR_SERVE_OPEN !== '0') {
      try { const opener = process.platform === 'win32' ? `start "" "${srv2.url}"` : process.platform === 'darwin' ? `open "${srv2.url}"` : `xdg-open "${srv2.url}"`; execSync(opener, { shell: true, stdio: 'ignore', timeout: 5000, windowsHide: true }); } catch {}
    }
    await new Promise(() => {}); // vivo hasta Ctrl-C
  }
  case 'aiact': {
    // ⭐ AI Act Pack: informe de transparencia/cumplimiento de un change (HTML autocontenido)
    const dir2 = pos[0]; if (!dir2) bad('aiact <changeDir> [-o salida.html]');
    try { const out2 = writeAiact(resolve(dir2), flag('-o') ? resolve(flag('-o')) : undefined); console.log(`🇪🇺 informe AI Act → ${out2}`); process.exit(0); }
    catch (e) { console.error(`aiact: ${e.message}`); process.exit(1); }
  }
  case 'litellm': // nombre user-facing (la palabra que usan los devs de la org); byok = alias histórico
  case 'byok': {
    // credenciales LiteLLM persistentes (~/.conductor/litellm.json; byok.json = legado, se lee y se migra al
    // sellar) — la mezcla litellm:/copilot: funciona aunque la app arranque sin las env. La KEY se cifra
    // AES-256-GCM (MISMA mecánica en Windows/Mac/Linux, lib/secret.mjs; clave maestra en ~/.conductor/.enckey
    // 0600). Tres vías: `litellm login` (INTERACTIVO, key OCULTA, el LLM NUNCA la ve — recomendado) ·
    // `litellm save` (desde el ENTORNO, para CI/scripts) · `litellm status`.
    const sub = pos[0];
    const home = process.env.CONDUCTOR_HOME || join(homedir(), '.conductor');
    const file = join(home, 'litellm.json');
    // vía COMÚN (login/save): cifra + persiste (0600) + siembra la cache de NOMBRES de modelo (jamás la key).
    const storeByok = async (baseUrl, apiKey, type, model) => {
      // VALIDAR la URL antes de guardar: un usuario inexperto que teclea mal (p.ej. "litellm.org" sin http, o basura)
      // recibía un "✓ guardadas" ENGAÑOSO + config rota → qwen fallaba en silencio después. Ahora falla claro y no guarda.
      let urlOk = false; try { const u = new URL(baseUrl); urlOk = u.protocol === 'http:' || u.protocol === 'https:'; } catch {}
      if (!urlOk) { console.error(`✗ URL no válida: "${baseUrl}". Debe ser http(s)://…/v1 (p.ej. https://litellm.tu-org/v1). No se guardó nada.`); process.exit(2); }
      mkdirSync(home, { recursive: true });
      const enc = encryptSecret(apiKey);
      // SEGURIDAD: si NO se puede cifrar (clave maestra ~/.conductor/.enckey corrupta o bloqueada por AV/permisos),
      // FALLAR — jamás escribir la key en claro (antes se guardaba en claro con un aviso que un inexperto se saltaba
      // → secreto en disco sin cifrar y "✓" engañoso). Nunca degradar la seguridad en silencio.
      if (!enc || decryptSecret(enc) !== apiKey) { console.error(`✗ No pude cifrar la clave de forma segura (la clave maestra ~/.conductor/.enckey no se pudo leer/crear, o el cifrado no verifica el round-trip — ¿corrupta, o bloqueada por antivirus/permisos?). NO guardo la key en claro. Arréglalo (borra ~/.conductor/.enckey para regenerarla, o revisa permisos) y reintenta.`); process.exit(2); }
      // límites del proveedor (si tu org los define por env o flags, viajan con las creds a TODAS las superficies)
      const maxOut = Number(flag('--max-output')) || Number(process.env.COPILOT_PROVIDER_MAX_OUTPUT_TOKENS) || null;
      const maxIn = Number(flag('--max-input')) || Number(process.env.COPILOT_PROVIDER_MAX_PROMPT_TOKENS) || null;
      // CONSERVAR lo que el dev declaró a mano en su fichero (p.ej. "models", patrón OpenCode) — renovar la
      // key jamás debe borrar su catálogo declarado. Solo se renuevan credenciales/límites.
      let keep = {}; try { const { apiKey: _a, apiKeyEnc: _e, baseUrl: _u, type: _y, model: _m, maxOutputTokens: _o, maxPromptTokens: _p, _rotar: _r, ...rest } = JSON.parse(readFileSync(byokFile(home), 'utf8')) || {}; keep = rest; } catch {}
      writeFileSync(file, JSON.stringify({ ...keep, type, baseUrl, apiKeyEnc: enc, model, ...(maxOut ? { maxOutputTokens: maxOut } : {}), ...(maxIn ? { maxPromptTokens: maxIn } : {}) }, null, 2), { mode: 0o600 });
      if (process.platform !== 'win32') try { chmodSync(file, 0o600); } catch {} // no legible por otros usuarios de la máquina
      try { const legacy = join(home, 'byok.json'); if (existsSync(legacy)) rmSync(legacy); } catch {} // migración: no dejar la key vieja atrás
      console.log(`✓ credenciales LiteLLM guardadas en ${file}\n  KEY cifrada AES-256-GCM (misma mecánica en Windows/Mac/Linux; clave maestra en ~/.conductor/.enckey, 0600). Nunca en el repo, ni en logs, ni en argv.`);
      try {
        const base = String(baseUrl).replace(/\/+$/, '');
        const r = await fetch((base.endsWith('/v1') ? base : base + '/v1') + '/models', { headers: { authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(5000) });
        if (r.ok) { const j = await r.json(); const ids = (j.data || []).map((m) => m.id).filter(Boolean); const info = await fetchByokPrices(base, apiKey); writeModelsCache(ids, baseUrl, info?.prices, info?.meta); console.log(`  catálogo cacheado: ${ids.length} modelo(s)${info?.prices ? ` · precio REAL de ${Object.keys(info.prices).length} modelo(s)` : ' · el proxy no expone precios a esta key (se mostrará "desconocido", nunca 0 inventado)'}${info?.meta ? ` · límites por modelo de ${Object.keys(info.meta).length}` : ''}`); }
        else console.log(`  (no pude listar modelos ahora: HTTP ${r.status}; la cache se sembrará en el primer uso del panel)`);
      } catch { console.log('  (sin red ahora → la cache de modelos se sembrará en el primer uso del panel)'); }
    };
    if (sub === 'login' || sub === undefined) {
      // FLUJO SIN QUE EL LLM VEA LA KEY: la tecleas TÚ (STDIN) — jamás en argv, env, historial del shell, logs ni
      // el contexto de ningún modelo. En TTY: prompts interactivos con la key OCULTA (sin eco). En pipe (scripts/
      // tests): se leen las líneas de golpe (readline pregunta-a-pregunta + pipe = carrera que pierde la 2ª línea).
      const envUrl = flag('--base-url') || process.env.COPILOT_PROVIDER_BASE_URL;
      const type = flag('--type') || process.env.COPILOT_PROVIDER_TYPE || 'openai';
      const model = flag('--model') || process.env.COPILOT_MODEL || '';
      let baseUrl, apiKey;
      if (process.stdin.isTTY) {
        const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
        let muted = false;
        rl._writeToOutput = (s) => { if (!muted) rl.output.write(s); else if (/\r|\n/.test(s)) rl.output.write('\n'); }; // oculta el eco de la key
        const ask = (q, hidden) => new Promise((res) => { if (hidden) { rl.output.write(q); muted = true; rl.question('', (a) => { muted = false; res(String(a).trim()); }); } else rl.question(q, (a) => res(String(a).trim())); });
        baseUrl = String(envUrl || await ask('URL de tu proxy LiteLLM (…/v1): ', false)).trim();
        apiKey = baseUrl ? (await ask('API Key (no se mostrará; el LLM no la ve): ', true)).trim() : '';
        rl.close();
      } else {
        const raw = await new Promise((res) => { let b = ''; process.stdin.setEncoding('utf8'); process.stdin.on('data', (d) => b += d); process.stdin.on('end', () => res(b)); });
        const parts = raw.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
        baseUrl = String(envUrl || parts.shift() || '').trim();
        apiKey = String(parts.shift() || '').trim();
      }
      if (!baseUrl) bad('litellm login: la URL de LiteLLM es obligatoria.');
      if (!apiKey) bad('litellm login: la API Key es obligatoria.');
      await storeByok(baseUrl, apiKey, type, model);
      process.exit(0);
    }
    if (sub === 'save') {
      const baseUrl = flag('--base-url') || process.env.COPILOT_PROVIDER_BASE_URL;
      const apiKey = flag('--api-key') || process.env.COPILOT_PROVIDER_API_KEY;
      if (!baseUrl || !apiKey) bad('litellm save: exporta COPILOT_PROVIDER_BASE_URL y COPILOT_PROVIDER_API_KEY y ejecuta `conductor litellm save` (para CI/scripts). Para uso normal usa `conductor litellm login` (interactivo, la key oculta).');
      if (flag('--api-key')) console.error('⚠ --api-key queda en el historial del shell y en la lista de procesos; usa `conductor litellm login` (interactivo) o exporta COPILOT_PROVIDER_API_KEY.');
      await storeByok(baseUrl, apiKey, flag('--type') || process.env.COPILOT_PROVIDER_TYPE || 'openai', flag('--model') || process.env.COPILOT_MODEL || '');
      process.exit(0);
    }
    // ('import' ELIMINADO por decisión de producto: el fichero ES la interfaz — la gente lo edita a mano;
    // el formato canónico lo enseñan el panel y `litellm status`. Menos comandos, menos follón.)
    if (sub === 'status') {
      const envOk = !!(process.env.COPILOT_PROVIDER_BASE_URL && process.env.COPILOT_PROVIDER_API_KEY);
      // key en claro (fichero escrito a mano) → SELLARLA aquí mismo antes de informar (hábito-de-fichero sin plaintext)
      const sealedNow = sealByokFile(home); // no-op salvo que el dev pusiera "seal": true (el cifrado es opt-in)
      const fRead = byokFile(home); // litellm.json, o el byok.json legado si aún no migró
      let fileOk = false, enc = false, portable = false, nDecl = 0, tpl = false, optOut = false, keyTx = '';
      try {
        const j = JSON.parse(readFileSync(fRead, 'utf8'));
        tpl = isTemplateCreds(j); optOut = j.seal === false;
        const nj = normalizeByokShape(j);
        fileOk = !tpl && !!(nj.baseUrl && (nj.apiKey || nj.apiKeyEnc)); enc = !!nj.apiKeyEnc; portable = enc && String(nj.apiKeyEnc).startsWith('c2:');
        nDecl = (!tpl && j.models) ? (Array.isArray(j.models) ? j.models.length : Object.keys(j.models).length) : 0;
        // TRANSPARENCIA: enseña QUÉ key hay dentro (últimos 4 + huella sha corta) — verificable contra la que
        // te dio tu org SIN imprimirla entera jamás. Si rotas la key y la huella no cambia… pegaste la vieja.
        const k = !tpl ? String(nj.apiKey || (nj.apiKeyEnc ? decryptSecret(nj.apiKeyEnc) || '' : '')) : '';
        if (k) keyTx = ` · key …${k.slice(-4)} (huella ${createHash('sha256').update(k).digest('hex').slice(0, 6)})`;
      } catch {}
      if (tpl) { console.log(`LiteLLM: PLANTILLA sin rellenar en ${fRead} — ábrela y pega tu baseUrl y apiKey → disponible: ❌`); process.exit(0); }
      const encTxt = enc ? (sealedNow ? 'con "seal": true → sellada AHORA (AES-256-GCM) ✓' : (portable ? 'cifrada AES-256-GCM (portable Win/Mac/Linux)' : 'blob DPAPI legacy — re-guarda con `litellm login` si cambiaste de SO'))
        : 'en claro — tu fichero, tu formato (añade "seal": true o usa `litellm login` si prefieres cifrarla)';
      console.log(`LiteLLM por env: ${envOk ? 'SÍ' : 'no'} · fichero: ${fileOk ? 'SÍ (' + fRead + ', KEY ' + encTxt + keyTx + ')' : 'no'}${nDecl ? ` · ${nDecl} modelo(s) declarado(s)` : ''} → disponible: ${envOk || fileOk ? '✅' : '❌ ejecuta `conductor litellm login`'}`);
      process.exit(0);
    }
    bad('litellm login (interactivo, key oculta) | litellm save (desde el entorno, CI) | litellm status  — o edita ~/.conductor/litellm.json a mano: {"baseUrl": "https://…/v1", "apiKey": "sk-…", "models": {"<id>": {"limit": {"context": 250000, "output": 16384}}}} (se cifra al primer uso; los models declarados salen SIEMPRE en el selector)');
  }
  case 'config': { // la doc de openspec/conductor.json por fin con PUERTA: el schema explicado, mando a mando
    const wrap = (s, w) => { const out = []; let ln = ''; for (const word of String(s).split(/\s+/)) { if ((ln + ' ' + word).trim().length > w) { out.push(ln); ln = word; } else ln = (ln ? ln + ' ' : '') + word; } if (ln) out.push(ln); return out; };
    console.log('openspec/conductor.json — gobierno del EQUIPO (committeable). TODO es opcional: hay default para todo.\n');
    for (const [k, v] of Object.entries(CONFIG_SCHEMA.properties || {})) {
      if (k.startsWith('_') || k === '$schema') continue;
      const tipo = v.enum ? v.enum.join(' | ') : (v.type || (v.oneOf ? 'boolean | array' : ''));
      console.log(`  ${k}${tipo ? `  (${tipo})` : ''}`);
      for (const ln of wrap(v.description || '', 100)) console.log(`      ${ln}`);
    }
    console.log('\nEjemplo mínimo: {"models": {"coder": "copilot:claude-sonnet-4.5"}, "preset": "feature"}');
    console.log('La FASE gana al rol: {"models": {"spec": "copilot:claude-opus-4.8", "explore": "litellm:mi-barato"}}');
    process.exit(0);
  }
  case 'init': // por-PROYECTO (el `daisy init` nuestro): crea openspec/ listo para lanzar — idempotente
  case 'init-config': {
    const rootI2 = pos[0] ? resolve(pos[0]) : process.cwd();
    const r = initConfig(join(rootI2, 'openspec'));
    // P0: init REGISTRA el proyecto — visible en la sidebar desde el minuto uno, corra o no un run.
    // Persistente siempre; si la app está viva, el alta llega también en caliente vía /api/register.
    let regId = null;
    try { regId = registerProjectPersistent(rootI2); } catch {}
    try { await fetch('http://127.0.0.1:4750/api/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ project: rootI2, persist: true }), signal: AbortSignal.timeout(1500) }); } catch { /* app apagada: el registro persistente basta */ }
    // INIT INTELIGENTE (--smart; el flag ES el consentimiento: gasta tokens): UN one-shot del agente analiza
    // ESTE repo y rellena project.md + propone checks/rules en conductor.json. REGLA DE ORO anti-duplicación:
    // lo que AGENTS.md/CLAUDE.md/copilot-instructions ya documenten se REFERENCIA, no se repite. Jamás pisa
    // un project.md rellenado por una persona (marcadores _Sustituye ausentes = suyo) ni toca models.
    if (has('--smart')) {
      const pmPath = join(rootI2, 'openspec', 'project.md');
      const cfgPathS = join(rootI2, 'openspec', 'conductor.json');
      const pmNow = existsSync(pmPath) ? readFileSync(pmPath, 'utf8') : '';
      if (pmNow && !pmNow.includes('_Sustituye')) {
        console.log('init --smart: project.md ya está rellenado por una persona — no se toca (restaura la plantilla si quieres regenerarlo).');
      } else {
        const stackS = (() => { try { return detectStack(rootI2); } catch { return null; } })();
        let mapaS = ''; try { mapaS = renderCodeMap(buildCodeMap(rootI2), { maxFiles: 30 }); } catch { /* repo sin JS/TS */ }
        const docsS = [];
        for (const f of ['AGENTS.md', 'CLAUDE.md', join('.github', 'copilot-instructions.md')]) {
          try { const t = readFileSync(join(rootI2, f), 'utf8').slice(0, 6000); if (t.trim()) docsS.push(`--- ${f} ---\n${t}`); } catch { /* no existe */ }
        }
        const outFileS = join(rootI2, '.conductor', 'smart-init.md');
        try { mkdirSync(join(rootI2, '.conductor'), { recursive: true }); } catch {}
        const promptS = [
          'Analyze THIS repository and produce the conductor project context. Write ONE file at the absolute path given below, with EXACTLY this structure:',
          '1) The full content for openspec/project.md in Spanish, sections: "## Propósito", "## Convenciones", "## Decisiones vivas", "## Fuera de alcance". REAL facts from THIS repo only — read source files as needed. GOLDEN RULE: if the agent docs included below already document something, REFERENCE them ("ver AGENTS.md") instead of repeating. Do NOT include stack/structure listings (derived data that rots). Under 60 lines.',
          '2) Then a fenced ```json block: {"checks": ["<the real test command of this repo, if any>"], "rules": {"<phase>": ["<short team rule derived from the observed conventions>"]}} — phases apply/spec/verify only, max 3 rules each; empty if nothing real. NEVER invent model names.',
          stackS ? `Detected stack (derived — do NOT repeat in project.md): ${JSON.stringify(stackS).slice(0, 600)}` : '',
          mapaS ? `Code relationship map (derived):\n${mapaS.slice(0, 2500)}` : '',
          docsS.length ? `Existing agent docs (do NOT duplicate their content):\n${docsS.join('\n\n').slice(0, 12000)}` : 'No agent docs (AGENTS.md/CLAUDE.md) found in this repo.',
          `Write the result to this absolute path and nothing else: ${outFileS}`,
        ].filter(Boolean).join('\n\n');
        console.log('init --smart: analizando el repo con el agente (un one-shot; gasta tokens)…');
        const rrS = await defaultRunAgent({ prompt: promptS, cwd: rootI2, timeoutMs: 240000, role: 'planner', phase: 'smart-init', mcp: {}, allowTools: {} });
        const rawS = existsSync(outFileS) ? readFileSync(outFileS, 'utf8') : '';
        const jmS = rawS.match(/```json\s*\n([\s\S]*?)```/);
        const mdS = (jmS ? rawS.slice(0, rawS.indexOf(jmS[0])) : rawS).trim();
        if (!mdS || !/## Propósito/.test(mdS)) {
          console.log(`init --smart: el agente no produjo un project.md válido${rrS?.err ? ` (${String(rrS.err).slice(0, 120)})` : ''} — las plantillas quedan intactas; reintenta con la sesión de Copilot activa.`);
        } else {
          writeFileSync(pmPath, mdS.replace(/\r\n/g, '\n') + '\n');
          console.log('✓ openspec/project.md rellenado desde el análisis del repo — revísalo: es TU contexto y las fases de planificación lo van a leer.');
          try {
            const jS = jmS ? JSON.parse(jmS[1]) : null;
            if (jS && typeof jS === 'object') {
              const cfgS = JSON.parse(readFileSync(cfgPathS, 'utf8'));
              let touchedS = false;
              if (Array.isArray(jS.checks) && jS.checks.length && !Array.isArray(cfgS.checks)) { cfgS.checks = jS.checks.slice(0, 3).map(String); touchedS = true; }
              if (jS.rules && typeof jS.rules === 'object' && !Object.keys(cfgS.rules || {}).length) {
                const rlS = {};
                for (const [ph, arr] of Object.entries(jS.rules)) if (['apply', 'spec', 'verify'].includes(ph) && Array.isArray(arr) && arr.length) rlS[ph] = arr.slice(0, 3).map((x) => String(x).slice(0, 240));
                if (Object.keys(rlS).length) { cfgS.rules = rlS; touchedS = true; }
              }
              if (touchedS) { writeFileSync(cfgPathS, JSON.stringify(cfgS, null, 2) + '\n'); console.log('✓ conductor.json: checks/rules propuestos desde el análisis (models NO se toca). Revísalos: el toggle «test» sigue mandando sobre checks.'); }
            }
          } catch { console.log('init --smart: el bloque json de checks/rules no parseó — solo se rellenó project.md.'); }
        }
        try { rmSync(outFileS, { force: true }); } catch {}
      }
    }
 // /conductor POR-PROYECTO y COMMITTEABLE (decisión la integración de MÁQUINA la hace
    // `setup`; init deja los comandos de PROYECTO — al clonar el repo, TODO el equipo hereda /conductor.
    // Mini-menú con TTY; en pipe/CI conecta los hosts DETECTADOS en la máquina, sin preguntar ni colgarse.
    const BODY_CMD = [
      'La petición del usuario: $ARGUMENTS',
      // FAIL-CLOSED (caso real: VS Code con skill pero sin MCP → el agente improvisó CLI, flags inventados,
      // init interactivo bloqueado y un run contra un muro de permisos): sin tools, se conecta y se PARA.
      '- REGLA DURA: si las tools `conductor_app`/`conductor_feature` NO están disponibles en esta sesión, NO uses la terminal ni improvises comandos de conductor. Responde EXACTAMENTE: «El puente MCP de conductor no está conectado en este host — ejecuta `conductor connect --vscode` (VS Code) o `conductor setup` en tu terminal y reabre el chat» y PARA.',
      '- TOOLS DIFERIDAS: si tu host esconde las tools tras un buscador (aparecen al buscar, p. ej. como `conductor-conductor_feature`), búscalas UNA vez y llámalas por el nombre EXACTO que el host te devolvió. Buscar NO es llamar: hasta que una llamada devuelva un resultado JSON de conductor, no has lanzado nada.',
      '- REGLA DURA UNIVERSAL: si una invocación falla o no sabes completarla, responde «Las tools de conductor están conectadas pero este chat no consigue invocarlas — reabre el chat o usa la miniweb (`conductor` en tu terminal)» y PARA. JAMÁS construyas tú la petición como plan B — ni crear ficheros, ni editar, ni terminal, con o sin autopilot: si conductor no conduce, tú NO construyes (entregar sin pipeline es peor que no entregar). «No puedo invocar la tool sin un cliente MCP» es una conclusión FALSA: tu host ES el cliente MCP.',
      '- PERMISOS DEL HOST: la primera vez el chat pedirá permiso por CADA tool de conductor — dile al usuario que elija «Always allow»; sin permiso para `conductor_continue` el run no se puede seguir desde el chat.',
      '- Si una tool es DENEGADA por permisos: NO reintentes en bucle (máximo 1 reintento). Da el enlace `web` («síguelo y aprueba ahí»), pide conceder el permiso, y recuerda que CUALQUIER mensaje suyo aquí te reengancha con conductor_continue {action:"wait"}.',
      '- Si el error dice «could not request permission» (el host NI PREGUNTA): dile que escriba `/allow-all` EN ESTE MISMO CHAT y repita /conductor (gesto ligero); plan B: salir y relanzar con `copilot --allow-all-tools`.',
      '- Si viene VACÍA: llama a `conductor_app` con {open:false} (NO abre navegador) y responde EN EL CHAT: cómo lanzar (`/conductor <qué construir>`), los runs del proyecto (campo `runs`) y la URL del panel como texto.',
      '- Si trae petición: llama a `conductor_feature` con {request, projectRoot: raíz absoluta del proyecto actual}.',
      '  · MODELO: pasa SIEMPRE chatModel:"litellm:<id>" | "copilot:<id>" con el modelo de ESTA conversación si lo conoces — si el repo no fija modelos en conductor.json, el run lo HEREDA (si los fija, gana el repo). Si el usuario NOMBRA un modelo, pásalo en model (gana a todo). Imprime el banner (su línea 🤖 declara lo que ejecuta de verdad) y si llega `aviso` de modelo, cuéntalo en una línea.',
      '  · status:"paused" → imprime el campo `render` TAL CUAL Y COMPLETO, hasta la última línea (la del reenganche web incluida — no la recortes ni resumas, ni pegues los artifacts) y ESPERA su respuesta;',
      '    después llama `conductor_continue` con su decisión Y phase (la fase de esa pausa) (sin note = aprobar · note = instrucción · model = cambio en caliente · action:"stop"). Repite.',
      '  · si el usuario decide en la WEB, tu turno ya habrá terminado y este chat queda en silencio — es NORMAL: en cuanto escriba CUALQUIER cosa, reengánchate con conductor_continue {action:"wait"} y sigue narrando.',
      '  · PROHIBIDO aprobar una pausa que el usuario no haya aprobado EXPLÍCITAMENTE en este chat («apruebo automáticamente» = violación del contrato: la pausa existe PARA la persona; queda auditado como human-chat en el acta).',
      '  · status:"working" → re-llama `conductor_continue` con {action:"wait"} y sigue el bucle; si la respuesta trae `decisiones` nuevas (pausas resueltas desde la web), cuéntalas en 1 línea.',
      '  · si la respuesta trae `aviso`: léelo y obedécelo (tu decisión llegó a una pausa ya resuelta — presenta el estado ACTUAL, no insistas).',
      '  · status:"done" → presenta el receipt VERBATIM. Si es GREEN, el usuario revisa y commitea ÉL — tú JAMÁS ejecutas git.',
      '  · NO orquestes fases tú ni edites ficheros tú: el motor conduce; tú solo transmites las pausas y las decisiones.',
      '  · mientras status:"working": si `progress` cambió, cuenta en UNA línea las fases ✓, la fase actual y los tokens — el usuario debe VER avanzar el run.',
      '',
    ];
    // OJO frontmatter: la descripción lleva «:» — en YAML un escalar sin comillas con «: » rompe el
    // mapping («mapping values are not allowed») y el host DESCARTA la skill entera. Siempre citada.
    const DESC = JSON.stringify('Feature con el pipeline SDD verificado de conductor — pausas de revisión EN ESTE CHAT (sin petición: estado en el chat, sin abrir navegador)');
    const homeH = process.env.CONDUCTOR_USERHOME || homedir();
    const HOSTS_PROJ = [
      { n: '1', key: 'copilot', label: 'Copilot', det: existsSync(join(homeH, '.copilot')), file: join(rootI2, '.github', 'skills', 'conductor', 'SKILL.md'), rel: '.github/skills/conductor/SKILL.md', content: ['---', 'name: conductor', `description: ${DESC}`, '---', ...BODY_CMD].join('\n') },
      // Claude: SKILLS es el estándar recomendado (crea /conductor); OpenCode además DESCUBRE .claude/skills
      // como skill del modelo → un fichero, dos hosts. El gesto /conductor de OpenCode sigue en command/.
      { n: '2', key: 'claude', label: 'Claude Code', det: existsSync(join(homeH, '.claude')), file: join(rootI2, '.claude', 'skills', 'conductor', 'SKILL.md'), rel: '.claude/skills/conductor/SKILL.md + settings.json (tools pre-autorizadas)', content: ['---', 'name: conductor', `description: ${DESC}`, '---', ...BODY_CMD].join('\n'), claudeSettings: join(rootI2, '.claude', 'settings.json') },
      { n: '3', key: 'opencode', label: 'OpenCode', det: existsSync(join(homeH, '.config', 'opencode')), file: join(rootI2, '.opencode', 'command', 'conductor.md'), rel: '.opencode/command/conductor.md', content: ['---', `description: ${DESC}`, '---', ...BODY_CMD].join('\n') },
      // VS Code Copilot Chat: LEE .github/skills (misma skill que Copilot CLI) pero necesita SU puente MCP
      // en .vscode/mcp.json (fusión no destructiva) — sin él, el agente se queda con guion y sin tools.
      { n: '4', key: 'vscode', label: 'VS Code (Copilot Chat)', det: existsSync(join(homeH, '.vscode')), file: join(rootI2, '.github', 'skills', 'conductor', 'SKILL.md'), rel: '.github/skills/conductor/SKILL.md + .vscode/mcp.json (puente MCP del chat)', content: ['---', 'name: conductor', `description: ${DESC}`, '---', ...BODY_CMD].join('\n'), mcpJson: join(rootI2, '.vscode', 'mcp.json') },
    ];
    let chosenH = HOSTS_PROJ.filter((h) => h.det);
    // --hosts none | --hosts copilot,claude,opencode,vscode → SIN menú (la vía determinista para agentes,
    // CI y scripts; el menú interactivo bloqueaba la terminal de un agente de chat esperando un Enter)
    const hostsFlag = (flag('--hosts') || '').trim().toLowerCase();
    if (hostsFlag) chosenH = hostsFlag === 'none' ? [] : HOSTS_PROJ.filter((h) => hostsFlag.split(',').map((s) => s.trim()).includes(h.key));
    const tty2 = !hostsFlag && (process.stdin.isTTY || process.env.CONDUCTOR_TTY === '1');
    if (tty2) {
      const det = chosenH.map((h) => h.label).join(', ') || 'ninguno';
      const rl2 = createInterface({ input: process.stdin, output: process.stdout });
      const ans = (await new Promise((res) => rl2.question(`  /conductor por-proyecto (committeable — tu equipo lo hereda al clonar):\n    [1] Copilot CLI  [2] Claude Code  [3] OpenCode  [4] VS Code (chat)  ·  Enter = detectados (${det})  ·  n = ninguno\n  → `, res))).trim().toLowerCase();
      rl2.close();
      if (ans === 'n') chosenH = [];
      else if (ans) chosenH = HOSTS_PROJ.filter((h) => ans.includes(h.n));
    }
    let hostLines = '';
    const engineI = resolve(process.argv[1]).split('\\').join('/');
    const portableI = /node_modules[\\/]+conductor[\\/]/i.test(resolve(process.argv[1]));
    for (const h of chosenH) {
      try {
        mkdirSync(dirname(h.file), { recursive: true }); writeFileSync(h.file, h.content); hostLines += `\n  /conductor (${h.label}) → ${h.rel}`;
        // PRE-AUTORIZACIÓN por proyecto (committeable — conectar ES el consentimiento): Claude Code
        // acepta allowlist de tools MCP en settings; el equipo hereda /conductor SIN muro de permisos.
        if (h.claudeSettings) {
          try {
            let sj = {}; try { sj = JSON.parse(readFileSync(h.claudeSettings, 'utf8')); } catch {}
            const allowSet = new Set([...(sj.permissions?.allow || []), 'mcp__conductor__*']);
            const nextSj = { ...sj, permissions: { ...(sj.permissions || {}), allow: [...allowSet] } };
            if (JSON.stringify(nextSj) !== JSON.stringify(sj)) { mkdirSync(dirname(h.claudeSettings), { recursive: true }); writeFileSync(h.claudeSettings, JSON.stringify(nextSj, null, 2) + '\n'); }
          } catch { /* settings ilegible del usuario: jamás se pisa */ }
        }
        if (h.mcpJson) {
          // el puente MCP del chat de VS Code: fusión NO destructiva (mergeMcpEntry conserva otros servers; backup si había fichero)
          const prevM = existsSync(h.mcpJson) ? readFileSync(h.mcpJson, 'utf8') : '';
          const rm = mergeMcpEntry(prevM, engineI, { key: 'servers', portable: portableI });
          if (!rm.error && rm.changed) { mkdirSync(dirname(h.mcpJson), { recursive: true }); if (prevM) writeFileSync(h.mcpJson + '.bak', prevM); writeFileSync(h.mcpJson, rm.text); }
        }
      } catch {}
    }
    if (hostLines) hostLines += '\n  (committeables: al clonar el repo, tu equipo hereda /conductor)';
    const tpl = ensureByokTemplate();
    // lo DETECTADO, a la vista (versiones, gestor, proyectos, checks reales): el init no es una caja de
    // plantillas mudas — enseña lo que ya sabe del repo y qué comandos correrá la fase test.
    const deepLines = renderStackDeep(r.deep).map((l) => `  · ${l}`).join('\n')
      + (r.instrucciones?.length ? `\n  · instrucciones del host: ${r.instrucciones.join(' y ')} — project.md las REFERENCIA, no las repite (cero duplicidad)` : '');
    console.log(`✓ proyecto inicializado (openspec/ — árbol OpenSpec completo)${deepLines ? `\n  DETECTADO en este repo (el motor lo re-detecta vivo en cada run):\n${deepLines}${r.created && r.deep?.checks?.length ? '\n  → esos checks quedan YA escritos en conductor.json (la fase test los ejecuta; ajústalos si quieres)' : ''}` : ''}
  project.md → ${r.projectMd} (propósito/convenciones: RELLÉNALO, las fases de planificación lo leen)
  conductor.json → ${r.cfgPath}${r.created ? ' (creada)' : ' (ya existía — intacta)'} (gobierno del equipo: modelos, reglas por fase, preset, gates)
  specs/ · changes/archive/ → fuente de verdad viva e histórico (los llena el ciclo)${regId ? `\n  panel → proyecto REGISTRADO: aparece ya en la sidebar, y su URL directa es /${regId}` : ''}${hostLines}${tpl ? '\n  credenciales → ~/.conductor/litellm.json (PLANTILLA creada — rellena baseUrl y apiKey)' : ''}
  Relleno semántico con IA (propósito/convenciones/reglas leyendo TU repo): \`conductor init-config . --smart\`
  Siguiente: \`conductor\` abre la miniweb aquí · /conductor en el chat de tu CLI`);
    process.exit(0);
  }
  case 'keygen': {
    const kp = generateKeypair();
    const priv = flag('--priv', 'conductor.key'), pub = flag('--pub', 'conductor.pub');
    writeFileSync(priv, kp.privateKeyPem); writeFileSync(pub, kp.publicKeyPem);
    console.log(`\nconductor keygen · Ed25519\n  clave privada → ${priv}  (¡secreta! firma sellos)\n  clave pública → ${pub}   (distribúyela para verificar)\n`);
    process.exit(0);
  }
  case 'seal': {
    const dir = pos[0]; if (!dir) bad('seal <changeDir> [--priv key.pem | --key hmac]');
    const src = flag('--src'), usage = flag('--usage'), key = flag('--key'), at = flag('--at') || new Date().toISOString();
    const privF = flag('--priv'); if (privF && !existsSync(privF)) bad('seal --priv: clave privada no encontrada: ' + privF); // NO degradar en silencio a sin-firmar
    const privateKeyPem = privF ? readFileSync(privF, 'utf8') : undefined;
    const o = flag('-o', join(dir, 'provenance.json'));
    const gates = [{ name: 'coherence', findings: checkCoherence(dir) }, { name: 'artifacts', findings: checkArtifacts(dir) }];
    const trace = src && existsSync(src) ? buildTrace(dir, src) : null;
    const cost = usage && existsSync(usage) ? computeCost(usage) : null;
    const doc = seal({ change: resolve(dir), gates, trace, cost, at, key, privateKeyPem, engineVersion: VERSION, specHash: hashSpecs(dir) });
    writeFileSync(o, JSON.stringify(doc, null, 2));
    console.log(`\nconductor seal · ${doc.verdict}\n  gates: ${doc.gates.map((g) => g.name + '=' + g.verdict).join(', ')}`);
    if (doc.traceability) console.log(`  traza: ${doc.traceability.requirements} req, ${doc.traceability.gaps.length} hueco(s)`);
    if (doc.cost) console.log(`  coste: $${doc.cost.real_usd} (ahorro ${doc.cost.saved_pct}%)`);
    console.log(`  firma: ${doc.signature.algo} sha256=${doc.signature.sha256.slice(0, 16)}…\n  → ${o}\n`);
    process.exit(doc.verdict === 'GREEN' ? 0 : 1);
  }
  case 'verify': {
    if (!pos[0] || !existsSync(pos[0])) bad('verify <provenance.json> [--pub key.pem | --key hmac]');
    const pubF = flag('--pub'); if (pubF && !existsSync(pubF)) bad('verify --pub: clave pública no encontrada: ' + pubF); // NO saltar la verificación en silencio
    const publicKeyPem = pubF ? readFileSync(pubF, 'utf8') : undefined;
    const r = verifySeal(JSON.parse(readFileSync(pos[0], 'utf8')), { key: flag('--key'), publicKeyPem });
    const okk = r.shaOk && r.sigOk;
    console.log(`\nconductor verify (${r.algo})\n  sha256:    ${r.shaOk ? 'OK' : 'TAMPERED'}\n  signature: ${r.sigOk ? 'OK' : 'INVÁLIDA'}${r.reason ? ' (' + r.reason + ')' : ''}\n  verdict sellado: ${r.verdict}\n  → ${okk ? 'INTEGRIDAD + AUTENTICIDAD VERIFICADAS' : 'SELLO INVÁLIDO'}\n`);
    process.exit(okk ? 0 : 1);
  }
  case 'receipt': {
    // RECIBO DE PR por terminal (mismo render que la web): markdown listo para pegar en la descripción del PR.
    const dirR = pos[0]; if (!dirR || !existsSync(dirR)) bad('receipt <changeDir> [-o out.md]');
    let tlR = null; try { tlR = JSON.parse(readFileSync(plumbPath(dirR, 'timeline.json'), 'utf8')); } catch {}
    if (!tlR || !Array.isArray(tlR.phases) || !tlR.phases.length) { console.error('receipt: sin timeline todavía — el recibo sale de un run ejecutado'); process.exit(1); }
    let domR = 'core'; try { domR = JSON.parse(readFileSync(plumbPath(dirR, 'state.json'), 'utf8')).domain || 'core'; } catch {}
    const readOpt = (f) => { try { return readFileSync(join(dirR, f), 'utf8'); } catch { return ''; } };
    const nameR = resolve(dirR).split(/[\\/]/).pop();
    const mdR = renderReceipt({ name: nameR, timeline: tlR, spec: readOpt(`specs/${domR}/spec.md`), proposal: readOpt('proposal.md'), verify: readOpt('verify-report.md') });
    if (!mdR) { console.error('receipt: datos insuficientes para el recibo'); process.exit(1); }
    const oR = flag('-o'); if (oR) { writeFileSync(oR, mdR); console.log(`recibo de PR → ${oR}`); } else console.log(mdR);
    process.exit(0);
  }
  case 'dashboard': {
    const dir = pos[0], src = flag('--src'); if (!dir) bad('dashboard <changeDir> --src <dir>');
    const gates = [...checkCoherence(dir), ...checkArtifacts(dir)];
    const trace = src && existsSync(src) ? buildTrace(dir, src) : null;
    const usage = flag('--usage'); const cost = usage && existsSync(usage) ? computeCost(usage) : null;
    const tlPath = existsSync(plumbPath(dir, 'timeline.json')) ? plumbPath(dir, 'timeline.json') : join(dir, 'run-timeline.json'); const timeline = existsSync(tlPath) ? JSON.parse(readFileSync(tlPath, 'utf8')) : null;
    const o = flag('-o', join(dir, 'dashboard.html'));
    writeFileSync(o, renderDashboard({ change: dir, gates, trace, cost, timeline }));
    console.log(`dashboard → ${o}`); process.exit(0);
  }
  case 'ci': {
    const o = flag('-o', has('--gitlab') ? '.gitlab-ci.yml' : '.github/workflows/conductor-gate.yml');
    const content = has('--gitlab') ? gitlabCi() : githubWorkflow();
    mkdirSync(dirname(resolve(o)), { recursive: true }); writeFileSync(o, content);
    console.log(`CI generado → ${o}`); process.exit(0);
  }
  case 'estimate': {
    // estimador estático de tokens por fase (preflight, sin API) — pilar "ahorro de tokens first"
    const dir = pos[0]; if (!dir) bad('estimate <changeDir> [--complexity micro|simple|medium|complex] [--domain n] [--request "..."]');
    const reqI = argv.indexOf('--request'); let request = '';
    if (reqI >= 0) { const w = []; for (let j = reqI + 1; j < argv.length && !argv[j].startsWith('--'); j++) w.push(argv[j]); request = w.join(' '); }
    const est = estimateRun({ changeDir: resolve(dir), complexity: flag('--complexity', 'medium'), domain: flag('--domain', 'core'), request });
    if (has('--json')) { console.log(JSON.stringify(est, null, 2)); process.exit(0); }
    console.log(`\nconductor estimate · ${est.complexity}  (tokens estimados, preflight SIN API)\n`);
    for (const r of est.phases) console.log(`  ${r.phase.padEnd(10)} in ~${String(r.estIn).padStart(6)}  out ~${String(r.estOut).padStart(6)}`);
    console.log(`\n  TOTAL ~${est.total} tokens (in ~${est.totalIn} · out ~${est.totalOut}). Con modelos LiteLLM el coste va a tu proxy (precio real en la app); con catálogo premium, AIC.\n`);
    process.exit(0);
  }
  case 'skills': {
    // catálogo de patrones de equipo (.conductor/skills/*.md) — inyectados en el prompt de fases de código
    const sub = pos[0]; const root = resolve(flag('--src', '.'));
    if (sub === 'index') { const sk = buildSkillsIndex(root); console.log(`✓ INDEX regenerado · ${sk.length} patrón(es) en .conductor/skills/`); process.exit(0); }
    const sk = loadSkills(root);
    console.log(`\nconductor skills · ${sk.length} patrón(es) de equipo en ${root}/.conductor/skills/`);
    for (const s of sk) console.log(`  ${s.name.padEnd(20)} ${s.match.length ? 'match: ' + s.match.join(',') : 'global'}${s.title ? '  — ' + s.title : ''}`);
    if (!sk.length) console.log('  (vacío — crea .conductor/skills/<nombre>.md con frontmatter opcional "match: dominio,fase")');
    console.log('');
    process.exit(0);
  }
  case 'stack': {
    // detección de stack del repo (file-based) — contexto para verificación
    const root = resolve(pos[0] || flag('--src', '.'));
    const s = detectStack(root);
    if (has('--json')) { console.log(JSON.stringify(s, null, 2)); process.exit(0); }
    console.log(`\nconductor stack · ${root}\n  lenguajes:  ${s.languages.join(', ') || '—'}\n  frameworks: ${s.frameworks.join(', ') || '—'}\n  test:       ${s.testCmd || '—'}\n  entrypoints:${s.entrypoints.length ? ' ' + s.entrypoints.join(', ') : ' —'}\n`);
    process.exit(0);
  }
  case 'search': {
    const q = pos[0]; if (!q) bad('search <texto> [--src dir]');
    const hits = searchChanges(resolve(flag('--src', '.')), q);
    console.log(`\nconductor search · "${q}" · ${hits.length} resultado(s)`);
    for (const h of hits) console.log(`  ${h.archived ? '📦' : '•'} ${h.name.padEnd(22)} [${h.verdict}]  …${h.snippet}…`);
    console.log('');
    process.exit(0);
  }
  case 'archive': {
    const root = resolve(pos[0] || flag('--src', '.'));
    const a = listArchive(root);
    console.log(`\nconductor archive · ${a.length} cambio(s) archivado(s) en ${root}`);
    for (const c of a) console.log(`  ${c.date || '—'}  ${c.name.padEnd(24)} [${c.verdict}] · ${c.phases} fases`);
    console.log('');
    process.exit(0);
  }
  case 'atlas': {
    // índice de conocimiento del proyecto (commit-eable): stack + capacidades de la spec viva + historial
    const root = resolve(pos[0] || flag('--src', '.'));
    const at = buildAtlas(root);
    if (has('--json')) { console.log(JSON.stringify({ stack: at.stack, capabilities: at.capabilities, changes: at.changes }, null, 2)); process.exit(0); }
    const o = flag('-o', join(root, 'openspec', 'ATLAS.md'));
    try { mkdirSync(dirname(o), { recursive: true }); } catch {}
    writeFileSync(o, at.markdown);
    console.log(`atlas → ${o} · ${at.capabilities.length} capacidad(es), ${at.changes.length} cambio(s) archivado(s)`);
    process.exit(0);
  }
  case 'stats': {
    // INFORME DE USO (la mezcla qwen + Copilot, "como app"): agrega TODOS los timelines y hace VISIBLE el
    // ahorro (pilar nº1). Sin --project: todos los proyectos registrados (~/.conductor/projects.json).
    // Con --project <ruta>: solo ese root. Cero API, cero LLM — lee los .conductor/timeline.json del FS.
    const projFlag = flag('--project') || flag('--src');
    const reg = projFlag ? [{ root: resolve(projFlag) }] : loadRegistry();
    const projects = reg.length ? reg : [{ root: process.cwd() }];
    const r = aggregateStats(projects);
    if (has('--json')) { console.log(JSON.stringify(r, null, 2)); process.exit(0); }
    printStats(r, projFlag ? resolve(projFlag) : null);
    process.exit(0);
  }
  case 'mcp': { await import('../lib/sysops/mcp.mjs').then((m) => m.serve()); break; }
  case 'doctor': {
    // valida un openspec/conductor.json de ejemplo contra el CONFIG_SCHEMA REAL (importado de scaffold) →
    // prueba el validador Y el schema vigente. Antes usaba un schema FÓSIL (formato `spec-driven`/x-conductor
    // + agentes sdd-planner/coder/reviewer ELIMINADOS) que ya no representa la config del producto.
    const good = { models: { planner: 'litellm:deepseek-v4-flash', coder: 'copilot:claude-haiku-4.5' }, pipeline: ['propose', 'spec', 'apply', 'verify'], autoApprove: false };
    const bad1 = { autoApprove: 'sí', pipeline: ['fase-inexistente'], propiedadDesconocida: 1 }; // tipo malo + fase inválida + additionalProperties:false
    const r1 = validate(CONFIG_SCHEMA, good), r2 = validate(CONFIG_SCHEMA, bad1);
    console.log(`\nconductor doctor`);
    console.log(`  node: ${process.version}`);
    console.log(`  jsonschema validator: config válida → ${r1.valid ? 'OK' : 'FAIL'} · config inválida detectada → ${!r2.valid ? 'OK' : 'FAIL'}`);
    if (!r2.valid) for (const e of r2.errors) console.log(`     - ${e.instancePath || '/'} ${e.message}`);
    // chequeos v3 (entorno real del usuario) — informativos, no bloquean
    const check = (name, fn) => { try { return fn() ? 'OK' : 'NO'; } catch { return 'NO'; } };
    console.log(`  git en PATH: ${check('git', () => execSync('git --version', { stdio: 'pipe', timeout: 5000, windowsHide: true }))}`);
    console.log(`  copilot en PATH: ${check('copilot', () => execSync(process.platform === 'win32' ? 'where copilot' : 'which copilot', { stdio: 'pipe', timeout: 5000, windowsHide: true, shell: true }))}`);
    const sdkB = [join(dirname(resolve(process.argv[1])), 'copilot-sdk.mjs'), join(ROOT, '..', 'assets', 'copilot-sdk.mjs')].find((p2) => existsSync(p2));
    console.log(`  runner sdk empaquetado: ${sdkB ? 'disponible (actívalo con "runner":"sdk")' : 'no incluido (spawn)'}`);
    const appUp = await fetch('http://127.0.0.1:4750/api/ping', { signal: AbortSignal.timeout(700) }).then((r3) => r3.json()).catch(() => null);
    console.log(`  app conductor (:4750): ${appUp?.ok ? 'EN MARCHA (' + appUp.root + ')' : 'apagada (se levanta sola con `conductor` en tu repo)'}`);
    // PROXY CORPORATIVO: el fetch de Node IGNORA HTTP(S)_PROXY por defecto → si el LiteLLM va detrás del proxy,
    // el catálogo/BYOK fallan en silencio donde el navegador sí llega. Aviso accionable (Node ≥24: NODE_USE_ENV_PROXY).
    const proxyEnv = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;
    if (proxyEnv) {
      const envProxyOn = process.env.NODE_USE_ENV_PROXY === '1';
      console.log(`  proxy corporativo: detectado (${proxyEnv})${envProxyOn ? ' · NODE_USE_ENV_PROXY=1 activo (fetch lo usa)' : ' · ⚠ el fetch de Node NO lo usa por defecto — si tu LiteLLM está detrás del proxy, exporta NODE_USE_ENV_PROXY=1 (Node ≥24) y añade localhost,127.0.0.1 a NO_PROXY (la app local no debe pasar por el proxy)'}`);
    } else console.log('  proxy corporativo: no detectado (fetch directo)');
    // .copilotignore (token-first): exclusiones de contexto del proyecto. Sin él cada request del modelo
    // arrastra node_modules/lockfiles/binarios. `conductor init` lo genera; aquí avisamos si falta o está vacío.
    try {
      const ig = join(process.cwd(), '.copilotignore');
      const body = existsSync(ig) ? readFileSync(ig, 'utf8').split('\n').filter((l) => l.trim() && !l.trim().startsWith('#')).length : -1;
      console.log(`  .copilotignore (token-first): ${body > 0 ? `OK (${body} patrones)` : body === 0 ? 'VACÍO → añade exclusiones o regenéralo con `conductor init`' : 'AUSENTE → genera con `conductor init` (ahorra tokens de contexto)'}`);
    } catch { console.log('  .copilotignore: (no comprobable)'); }
    // bundle-staleness-guard: desde el repo, recomputa el fingerprint de lib/ y compáralo con el embebido
    // en el bundle en ejecución → caza "edité lib/ pero el assets/ sigue viejo" (y el cp dist→assets olvidado).
    try {
      const selfP = resolve(process.argv[1]);
      const dir = dirname(selfP);
      const libDir = [join(dir, '..', 'engine', 'lib'), join(dir, '..', 'lib')].find((p) => existsSync(p));
      const embedded = (readFileSync(selfP, 'utf8').match(/\/\/ build-inputs-sha256: ([a-f0-9]{64})/) || [])[1];
      if (libDir && embedded) {
        // walk RECURSIVO (lib/ vive en subcarpetas por concern desde el reorg v6) — debe coincidir EXACTO con
        // el walkLib de build.mjs (mismo conjunto + mismo orden por ruta absoluta) o el hash nunca cuadraría.
        const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(join(d, e.name)) : (e.name.endsWith('.mjs') ? [join(d, e.name)] : []));
        const files = walk(libDir).sort();
        files.push(join(libDir, '..', 'bin', 'conductor.mjs'));
        const cur = createHashSync(files.map((f) => readFileSync(f, 'utf8')).join('\0'));
        console.log(`  bundle vs lib/: ${cur === embedded ? 'EN SYNC' : 'DESACTUALIZADO → corre `node engine/build.mjs && cp engine/dist/conductor.mjs assets/`'}`);
      } else { console.log('  bundle vs lib/: (no comprobable fuera del repo)'); }
    } catch { console.log('  bundle vs lib/: (no comprobable)'); }
 // ── DOCTOR v2 (plan expertise el mundo nuevo — credenciales, prompts, hosts ──
    // credenciales LiteLLM: existe / sellada / motivo (reutiliza la resolución central byokFile)
    try {
      const homeD = process.env.CONDUCTOR_HOME || join(homedir(), '.conductor');
      const fD = byokFile(homeD);
      let jD = null; try { jD = JSON.parse(readFileSync(fD, 'utf8')); } catch {}
      if (!jD) console.log('  credenciales LiteLLM: AUSENTES → `conductor setup` deja la plantilla en ~/.conductor/litellm.json (o `conductor litellm login`)');
      else if (isTemplateCreds(jD)) console.log(`  credenciales LiteLLM: PLANTILLA sin rellenar en ${fD} — ábrela y pega tu baseUrl y apiKey`);
      else if (jD.apiKey) console.log(`  credenciales LiteLLM: en claro en ${fD} (válido; \"seal\": true si prefieres cifrarla)`);
      else if (jD.apiKeyEnc) console.log(`  credenciales LiteLLM: OK (${fD}, key ${isPortableBlob(jD.apiKeyEnc) ? 'cifrada AES-256-GCM' : 'blob DPAPI legacy — re-guarda con `litellm login` si cambias de SO'})${jD.models ? ` · ${Array.isArray(jD.models) ? jD.models.length : Object.keys(jD.models).length} modelo(s) declarado(s)` : ' · sin models declarados (el picker dependerá del proxy vivo)'}`);
      else console.log(`  credenciales LiteLLM: fichero ${fD} sin apiKey/apiKeyEnc → revísalo`);
    } catch { console.log('  credenciales LiteLLM: (no comprobable)'); }
    // prompts del pipeline: ¿los 10 .md resueltos desde fichero o corriendo con el fallback embebido?
    try {
      const fromFile = PROMPT_KEYS.filter((k) => { try { return typeof instructionFor(k) === 'string' && instructionFor(k).length > 40; } catch { return false; } });
      console.log(`  prompts del pipeline: ${fromFile.length}/${PROMPT_KEYS.length} fases con instrucción resuelta (prompts/<fase>.md, editable; fallback embebido si faltan)`);
    } catch { console.log('  prompts del pipeline: (no comprobable)'); }
    // hosts conectados: comando global /conductor (Claude/OpenCode) + MCP en la config de Copilot CLI
    try {
      const homeU2 = process.env.CONDUCTOR_USERHOME || homedir();
      const hosts = [];
      if (existsSync(join(homeU2, '.claude', 'skills', 'conductor', 'SKILL.md')) || existsSync(join(homeU2, '.claude', 'commands', 'conductor.md'))) hosts.push('Claude Code (/conductor global)');
      if (existsSync(join(homeU2, '.config', 'opencode', 'command', 'conductor.md')) || existsSync(join(homeU2, '.config', 'opencode', 'commands', 'conductor.md'))) hosts.push('OpenCode (/conductor global)');
      try { if (readFileSync(join(homeU2, '.copilot', 'mcp-config.json'), 'utf8').includes('conductor')) hosts.push('Copilot CLI (MCP)'); } catch {}
      console.log(`  hosts conectados: ${hosts.length ? hosts.join(' · ') : 'ninguno → `conductor setup` los conecta (comando /conductor + MCP)'}`);
    } catch { console.log('  hosts conectados: (no comprobable)'); }
    console.log('');
    process.exit(r1.valid && !r2.valid ? 0 : 1);
  }
  case 'explain': {
    const src = pos[0]; if (!src || !existsSync(src)) bad('explain <srcDir> [--out dir]');
    const r = explain(src);
    const o = flag('--out');
    if (o) {
      mkdirSync(o, { recursive: true });
      writeFileSync(join(o, 'spec.md'), renderSpec(r.capabilities));
      writeFileSync(join(o, 'tasks.md'), renderTasks(r.capabilities));
      if (r.openapi) writeFileSync(join(o, 'openapi.extracted.json'), JSON.stringify(r.openapi, null, 2));
    }
    if (has('--json')) { console.log(JSON.stringify(r, null, 2)); process.exit(0); }
    console.log(`\nconductor explain · ${src}\n`);
    for (const c of r.capabilities) console.log(`  ${c.id.padEnd(28)} ${c.endpoints.length} endpoint(s), ${c.units.length} unit(s), ${c.files.length} file(s)`);
    console.log(`\n  → ${r.capabilities.length} capacidad(es)${o ? `; borrador escrito en ${o}` : ' (usa --out <dir> para volcar spec.md/tasks.md/openapi)'}\n`);
    process.exit(0);
  }
  case 'drift': {
    const dir = pos[0], src = flag('--src'); if (!dir || !src) bad('drift <changeDir> --src <dir>');
    const r = detectDrift(dir, src);
    if (fmt === 'human') {
      console.log(human(r.findings, `conductor drift · ${dir}`));
      console.log(`  superficie: ${r.summary.untracked}/${r.summary.totalFiles} ficheros sin trazar (${Math.round(r.summary.untrackedRatio * 100)}%)\n`);
      process.exit(isBlocking(r.findings) ? 1 : 0);
    }
    out(r.findings, 'conductor drift');
  }
  case 'ledger': {
    const sub = pos[0]; const ledgerPath = flag('--ledger', 'openspec/provenance.ledger.jsonl');
    if (sub === 'append') {
      const sealFile = pos[1]; if (!sealFile || !existsSync(sealFile)) bad('ledger append <seal.json> [--priv <ed25519-priv.pem>] --ledger <path>');
      const privFile = flag('--priv', null); // firma Ed25519 OPCIONAL: sin ella la cadena es solo hash-encadenada
      let privateKeyPem = null;
      if (privFile) {
        try { privateKeyPem = readFileSync(privFile, 'utf8'); } catch { bad('no se pudo leer la clave privada: ' + privFile); }
        // FAIL-CLOSED (como seal --priv): una clave presente pero INVÁLIDA / de tipo equivocado no debe degradar en
        // SILENCIO a una entrada SIN firma (L.append traga el error de edSign). Se exige una Ed25519 utilizable
        // ANTES de anexar nada (una RSA pasaría createPrivateKey pero fallaría al firmar → entrada sin firma persistida).
        try { if (createPrivateKey(privateKeyPem).asymmetricKeyType !== 'ed25519') throw new Error('tipo'); }
        catch { bad('ledger append --priv: la clave no es una Ed25519 utilizable: ' + privFile); }
      }
      const e = L.append(ledgerPath, JSON.parse(readFileSync(sealFile, 'utf8')), { privateKeyPem });
      console.log(`\nconductor ledger · append\n  seq ${e.seq} · ${e.verdict} · ${e.change}\n  hash ${e.hash.slice(0, 16)}…${e.sig ? ' · FIRMADA (Ed25519)' : ' · sin firma'} (prev ${e.prev.slice(0, 8)}…)\n  → ${ledgerPath}\n`);
      process.exit(0);
    }
    if (sub === 'verify') {
      // hash-chain íntegra ≠ AUTÉNTICA. Antes se imprimía "CADENA ÍNTEGRA" a secas aun sin firmas → un atacante
      // con escritura podía editar una entrada, quitar las firmas y recomputar hashes, y verify daba exit 0. Ahora
      // el CLI acepta --pub (verifica las firmas Ed25519) y el mensaje refleja el estado REAL (firmada/verificada/sin firma).
      const pubFile = flag('--pub', null);
      let publicKeyPem = null; if (pubFile) { try { publicKeyPem = readFileSync(pubFile, 'utf8'); } catch { bad('no se pudo leer la clave pública: ' + pubFile); } }
      const r = L.verifyChain(ledgerPath, { publicKeyPem });
      console.log(`\nconductor ledger · verify (${ledgerPath})`);
      if (!r.ok) { console.log(`  → CADENA ROTA en entrada ${r.brokenAt}: ${r.reason}\n`); process.exit(1); }
      if (r.signed && publicKeyPem) console.log(`  → CADENA ÍNTEGRA Y FIRMAS VERIFICADAS (${r.entries} entradas, head ${r.head.slice(0, 16)}…)\n`);
      else if (r.signed) console.log(`  → hash-chain íntegra; la cadena está FIRMADA pero NO se verificó autenticidad (aporta --pub <clave>). ${r.entries} entradas.\n`);
      else console.log(`  → hash-chain íntegra pero SIN FIRMAS (${r.entries} entradas): detecta ediciones casuales, NO a un atacante con acceso de escritura. Firma con --priv en 'append'.\n`);
      // --require-signed: audit ESTRICTO → falla si la cadena no está firmada Y verificada con --pub
      if (has('--require-signed') && !(r.signed && publicKeyPem)) { console.log(`  ✗ --require-signed: exige cadena firmada y verificada con --pub → FALLA (signed=${r.signed}, pub=${!!publicKeyPem})\n`); process.exit(1); }
      process.exit(0);
    }
    bad('ledger <append|verify> ...');
  }
  case 'selfcheck': {
    // detección de drift del motor vendado: versión + sha256 del propio fichero.
    // El plugin/CI compara estos valores contra los esperados para detectar copias desincronizadas.
    let selfSha = 'n/a', self = '';
    try { self = readFileSync(process.argv[1], 'utf8'); selfSha = createHashSync(self); } catch {}
    const expV = flag('--expect-version'), expS = flag('--expect-sha');
    const vOk = !expV || expV === VERSION;
    const sOk = !expS || expS === selfSha;
    // verificación criptográfica del propio bundle (cadena de suministro, T6): el instalador/CI corre
    // `conductor selfcheck --pub conductor.pub` (con el .sig junto al bundle) y aborta si está manipulado.
    const pubF = flag('--pub'); let sigOk = null;
    if (pubF) {
      // clave pedida pero AUSENTE → sigOk=false (NO null): antes se saltaba la verificación y el gate de cadena
      // de suministro pasaba (exit 0) con un --pub mal escrito / CWD equivocado — fail-open real.
      if (!existsSync(pubF)) sigOk = false;
      else {
        const sigF = flag('--sig', process.argv[1] + '.sig');
        try { sigOk = existsSync(sigF) ? verifyFile(process.argv[1], readFileSync(sigF, 'utf8').trim(), readFileSync(pubF, 'utf8')) : false; }
        catch { sigOk = false; }
      }
    }
    const allOk = vOk && sOk && (sigOk === null || sigOk);
    if (has('--json')) { console.log(JSON.stringify({ version: VERSION, sha256: selfSha, versionOk: vOk, shaOk: sOk, signatureOk: sigOk })); process.exit(allOk ? 0 : 1); }
    console.log(`\nconductor selfcheck\n  version: ${VERSION}${expV ? ` (esperado ${expV}: ${vOk ? 'OK' : 'DRIFT'})` : ''}\n  sha256:  ${selfSha.slice(0, 24)}…${expS ? ` (${sOk ? 'OK' : 'DRIFT'})` : ''}${sigOk !== null ? `\n  firma:   ${sigOk ? 'VÁLIDA (íntegro y auténtico)' : 'INVÁLIDA (manipulado o clave/sig incorrecta)'}` : ''}`);
    if (!allOk) console.log('  → FALLO: el motor no coincide con el esperado o la firma no valida. Re-vendar/re-firmar.');
    console.log('');
    process.exit(allOk ? 0 : 1);
  }
  case 'sign': {
    // firma un fichero (p.ej. el bundle del motor) con la clave privada → cadena de suministro
    const file = pos[0]; if (!file || !existsSync(file)) bad('sign <file> --priv key.pem [-o file.sig]');
    const privF = flag('--priv'); if (!privF || !existsSync(privF)) bad('sign requiere --priv key.pem');
    const sig = signFile(file, readFileSync(privF, 'utf8'));
    const o = flag('-o', file + '.sig'); writeFileSync(o, sig + '\n');
    console.log(`\nconductor sign · Ed25519\n  fichero: ${file}\n  firma:   ${o}\n`);
    process.exit(0);
  }
  case 'verify-file': {
    // verifica la firma de un fichero con la clave pública (integridad + autenticidad)
    const file = pos[0]; if (!file || !existsSync(file)) bad('verify-file <file> --sig file.sig --pub key.pem');
    const sigF = flag('--sig', file + '.sig'); const pubF = flag('--pub');
    if (!existsSync(sigF) || !pubF || !existsSync(pubF)) bad('verify-file requiere --sig file.sig y --pub key.pem');
    const ok = verifyFile(file, readFileSync(sigF, 'utf8').trim(), readFileSync(pubF, 'utf8'));
    console.log(`\nconductor verify-file\n  fichero: ${file}\n  → ${ok ? 'FIRMA VÁLIDA (íntegro y auténtico)' : 'FIRMA INVÁLIDA (manipulado o clave incorrecta)'}\n`);
    process.exit(ok ? 0 : 1);
  }
  case 'evals': {
    // GOLDEN-SET del harness (Verification & CI): 12 escenarios deterministas, offline, 0 tokens. Cada
    // gate e invariante con su EXPECTATIVA. El resultado se appendea a engine/eval/results.jsonl (repo)
    // → pass-rate TRACKEADO en git; el eval-gate de la suite exige re-certificar si cambian los prompts.
    const K = Math.max(1, Number(flag('--k')) || 2);
    const tmpE = join(tmpdir(), `conductor-evals-${process.pid}`);
    const t0e = Date.now();
    const rows = await runGolden({ tmpRoot: tmpE, K });
    try { rmSync(tmpE, { recursive: true, force: true }); } catch {}
    const pass = rows.every((r) => r.ok);
    // fingerprint de los prompts REALES junto al motor (repo: ../..; bundle npm: ..)
    const cand = [join(dirname(resolve(process.argv[1])), '..', 'prompts'), join(dirname(resolve(process.argv[1])), '..', '..', 'prompts')];
    const pDir = cand.find((d) => existsSync(d)) || null;
    const promptsSha = pDir ? promptsFingerprint(pDir) : null;
    const entry = { at: new Date().toISOString(), engineVersion: VERSION, promptsSha, k: K, pass, total: rows.length, ok: rows.filter((r) => r.ok).length, rows: rows.map((r) => ({ id: r.id, expect: r.expect, ok: r.ok, verdicts: r.verdicts, ...(r.why ? { why: r.why } : {}) })) };
    const outF = flag('--out') || (existsSync(join(process.cwd(), 'engine', 'eval')) ? join(process.cwd(), 'engine', 'eval', 'results.jsonl') : null);
    if (has('--json')) console.log(JSON.stringify(entry, null, 2));
    else {
      console.log(`\nconductor evals · golden-set del harness (offline, fake-agent, 0 tokens) · K=${K}\n`);
      for (const r of rows) console.log(`  ${r.ok ? '✅' : '❌'} ${r.id.padEnd(22)} espera ${r.expect.padEnd(9)} → ${r.verdicts.join(',')}${r.why ? '  · ' + r.why : ''}`);
      console.log(`\n  ${pass ? '✅ PASS' : '❌ FAIL'} ${entry.ok}/${entry.total} · ${Math.round((Date.now() - t0e) / 1000)}s · prompts ${promptsSha || '(no encontrados)'}`);
    }
    if (outF) { appendEvalResult(outF, entry); if (!has('--json')) console.log(`  historial → ${outF} (commitéalo: el eval-gate de la suite lo exige al cambiar prompts/)`); }
    else if (!has('--json')) console.log('  (fuera del repo y sin --out: resultado no persistido)');
    process.exit(pass ? 0 : 1);
  }
  case 'eval': {
    // puntúa un cambio producido por el pipeline (calidad determinista): coherencia/artefactos (gate) + trazabilidad
    const dir = pos[0]; if (!dir || !existsSync(dir)) bad('eval <changeDir> --src <dir> [--json]');
    const src = flag('--src'); const absSrc = src ? resolve(src) : undefined; // src del proyecto, independiente del change dir
    const rubric = { pass: 70, gate: 70, ...(absSrc ? { trace: { src: absSrc, maxGaps: 0, weight: 30 } } : {}) };
    const r = scoreCandidate(dir, rubric);
    if (has('--json')) { console.log(JSON.stringify({ ...r, change: dir }, null, 2)); process.exit(r.verdict === 'PASS' ? 0 : 1); }
    console.log(`\nconductor eval · ${dir}\n  score: ${r.pct}% (umbral ${r.threshold}%) → ${r.verdict}`);
    for (const c of r.criteria) console.log(`   ${c.pass ? '✓' : '✗'} ${c.name.padEnd(14)} ${c.detail}`);
    console.log('');
    process.exit(r.verdict === 'PASS' ? 0 : 1);
  }
  // F3 (doctrina UX v2 #5) — EL GESTO de app: `conductor` a secas arranca el servidor si está apagado y
  // abre la ventana. Con ruta opcional (`conductor app <root>`) enfoca ese proyecto. CONDUCTOR_NO_OPEN=1
  // evita abrir navegador (headless/tests).
  case undefined: case 'app': case 'run': { // `conductor` = `conductor run` = abre la miniweb en este repo
    const url = 'http://127.0.0.1:4750/';
    const rootArg = pos[0] ? resolve(pos[0]) : process.cwd();
    const pingInfo = () => fetch(url + 'api/ping', { signal: AbortSignal.timeout(1200) }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    let info = await pingInfo();
    const wasAlive = !!info;
    let alive = wasAlive;
    if (!alive) {
      console.log(`▶ arrancando conductor v${VERSION} …`);
      spawn(process.execPath, [resolve(process.argv[1]), 'serve', rootArg], { detached: true, stdio: 'ignore', windowsHide: true, env: { ...process.env, CONDUCTOR_SERVE_OPEN: '0' } }).unref();
      for (let i = 0; i < 14 && !alive; i++) { await new Promise((r) => setTimeout(r, 500)); info = await pingInfo(); alive = !!info; }
      if (!alive) { console.error('conductor: la app no arrancó (¿:4750 ocupado por otra cosa?)'); process.exit(1); }
    }
    // ARRANQUE PER-REPO (Opción A): fija el FOCO en el repo desde el que lanzaste `conductor` (server-side) → el
    // panel lo sigue en su poll aunque la pestaña ya estuviera abierta en OTRO repo. En arranque fresco el
    // `serve rootArg` ya enfoca ahí; este POST cubre el caso "app YA viva en otro repo".
    // LA URL ES EL FOCO: el gesto abre /<id> (la página del proyecto, con su formulario) — la home «/»
    // es el panel GLOBAL y ya no la teledirige nadie. El POST a focus se mantiene (default razonable
    // para el chat/conductor_app), pero la navegación viaja por la URL, no por estado del servidor.
    let projUrl = url, projName = '';
    try {
      const fr = await fetch(url + 'api/focus', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ project: rootArg }), signal: AbortSignal.timeout(3000) });
      if (fr.ok) { const fj = await fr.json().catch(() => ({})); if (fj.id) { projUrl = url + fj.id; projName = fj.name || ''; } }
      // usuario inexperto: `conductor` en un dir que NO es proyecto (sin openspec/ ni .git) → el foco se rechaza;
      // avisamos en vez de abrir EN SILENCIO el panel global y dejarlo confuso.
      else console.log(`ℹ️ "${rootArg}" no parece un proyecto conductor (falta openspec/ o .git). Te abro el panel global; para trabajar aquí inicialízalo con \`conductor init\`.`);
    } catch {}
    if (process.env.CONDUCTOR_NO_OPEN !== '1') {
      try {
        const opener = process.platform === 'win32' ? `start "" "${projUrl}"` : process.platform === 'darwin' ? `open "${projUrl}"` : `xdg-open "${projUrl}"`;
        execSync(opener, { shell: true, stdio: 'ignore', timeout: 5000, windowsHide: true });
      } catch { /* sin navegador disponible: la URL impresa basta */ }
    }
    // COPY HONESTO (P2): el mensaje dice EXACTAMENTE qué se abre — la página de ESTE proyecto, no «el panel».
    if (wasAlive) console.log(projName
      ? `✓ conductor ya estaba encendido — v${info?.version || '?'} · te abro ${projName}`
      : `✓ conductor ya estaba encendido — v${info?.version || '?'} · te abro el panel`);
    else console.log(`✓ conductor v${VERSION} en marcha · (para pararlo: conductor stop)`);
    console.log(`🌐 conductor: ${projUrl}`);
    break;
  }
  case 'upgrade': {
    // ACTUALIZACIÓN VERIFICADA (supply-chain): reinstala del MISMO origen git de tu instalación y corre el
    // selfcheck del motor NUEVO. La URL jamás va hardcodeada: sale de `npm ls -g` o de --from.
    if (!/node_modules[\\/]/i.test(resolve(process.argv[1])) && !flag('--from')) {
      console.error('⚠ esto es el checkout de desarrollo — actualízalo con git. Para probar el flujo: conductor upgrade --from "git+<url>#<rama>"');
      process.exit(2);
    }
    let origin = flag('--from') || null;
    if (!origin) {
      let lsOut = '';
      try { lsOut = execSync('npm ls -g conductor --json --depth=0', { encoding: 'utf8', windowsHide: true, timeout: 30000 }); } catch (e) { lsOut = String(e?.stdout || ''); }
      origin = resolveInstalledOrigin({ lsJson: lsOut })?.origin || null;
    }
    if (!origin) { console.error('sin origen de instalación detectable (¿instalado desde registry?). Usa: conductor upgrade --from "git+<url>#<rama>"'); process.exit(2); }
    console.log(`▶ conductor upgrade · v${VERSION} → reinstalando desde ${origin}`);
    try { execSync(`npm i -g "${origin}"`, { stdio: 'inherit', windowsHide: true }); } catch { console.error('✗ npm i -g falló — revisa la salida de npm'); process.exit(1); }
    let npmRoot = '';
    try { npmRoot = execSync('npm root -g', { encoding: 'utf8', windowsHide: true, timeout: 30000 }); } catch {}
    const plan = upgradePlan({ origin, npmRoot });
    if (!plan || !existsSync(plan.bundlePath)) { console.error('✗ no encuentro el motor recién instalado para verificarlo'); process.exit(1); }
    // selfcheck del motor NUEVO (versión+sha; con --pub verifica también la firma del bundle)
    const extra = flag('--pub') ? ['--pub', flag('--pub')] : [];
    try { execFileSync(process.execPath, [plan.bundlePath, 'selfcheck', ...extra], { stdio: 'inherit', windowsHide: true, timeout: 60000 }); } catch { console.error('✗ selfcheck del motor nuevo FALLÓ — no uses esa instalación'); process.exit(1); }
    console.log('✅ actualizado y verificado.');
    process.exit(0);
  }
  case 'setup': // el nombre que la gente espera tras `npm i -g` (patrón wizard de las referencias); install = alias
  case 'install': {
    // ONBOARDING GUIADO (estilo instalador enterprise): UNA orden tras `npm i -g …` y quedas operativo.
    // Reutiliza los comandos reales como subprocesos (stdio heredado → interactivo de verdad); cada paso es
    // saltable y un fallo no aborta el resto. Sin TTY (CI/pipes) imprime la checklist y sale — jamás se cuelga.
    const selfI = resolve(process.argv[1]);
    const runI = (args) => { try { execFileSync(process.execPath, [selfI, ...args], { stdio: 'inherit', timeout: 600000 }); return true; } catch { return false; } };
    console.log(`\nconductor ${VERSION} — instalación guiada`);
    console.log('────────────────────────────────────────────');
    if (!process.stdin.isTTY && process.env.CONDUCTOR_TTY !== '1') {
      console.log('Sin terminal interactiva. Los 3 pasos, manuales:\n  1) conductor litellm login           credenciales del proxy (una vez, key oculta y cifrada)\n  2) conductor connect --vscode        o  connect --to <config-de-tu-host-MCP>\n  3) conductor                          abre el panel en tu repo');
      process.exit(0);
    }
    // entrada: TTY real → readline interactivo; pipe con CONDUCTOR_TTY=1 (Git Bash/tests) → TODO stdin de
    // golpe y respuestas en cola (readline pregunta-a-pregunta sobre un pipe PIERDE líneas — carrera conocida,
    // la misma de byok login). askI devuelve la respuesta CRUDA (un path no debe pasar por toLowerCase).
    let rlI = null, askI;
    if (process.stdin.isTTY) {
      rlI = createInterface({ input: process.stdin, output: process.stdout });
      askI = (q) => new Promise((res) => rlI.question(q, (a) => res(String(a).trim())));
    } else {
      const rawI = await new Promise((res) => { let b = ''; process.stdin.setEncoding('utf8'); process.stdin.on('data', (d) => b += d); process.stdin.on('end', () => res(b)); });
      const colaI = rawI.split(/\r?\n/);
      askI = (q) => { process.stdout.write(q + '\n'); return Promise.resolve(String(colaI.shift() ?? '').trim()); };
    }
    const yes = (a) => { const s = String(a).toLowerCase(); return s === '' || s === 's' || s === 'si' || s === 'sí' || s === 'y' || s === 'yes'; };
    const homeI = process.env.CONDUCTOR_HOME || join(homedir(), '.conductor');
    // credenciales: NUNCA se piden aquí (la key jamás se teclea en un wizard/web). El fichero SÍ se deja
 // CREADO con PLANTILLA (decisión "debería estar creado al instalar, con plantilla para que
    // la gente vea cómo meterlo") — el usuario solo lo ABRE y RELLENA. La plantilla sin rellenar no cuenta
    // como credenciales (isTemplateCreds) ni se cifra. `litellm login` sigue para quien prefiera asistente.
    const credF = join(homeI, 'litellm.json');
    if ((existsSync(credF) || existsSync(join(homeI, 'byok.json'))) && !(existsSync(credF) && isTemplateCreds(JSON.parse(readFileSync(credF, 'utf8'))))) {
      console.log('✓ 1/3 · credenciales del proxy: ya configuradas');
    } else {
      if (!existsSync(credF)) { mkdirSync(homeI, { recursive: true }); writeFileSync(credF, JSON.stringify(LITELLM_TEMPLATE, null, 2) + '\n', { mode: 0o600 }); }
      console.log(`1/3 · credenciales del proxy: he dejado la PLANTILLA en ${credF}\n     → ábrela y sustituye baseUrl y apiKey por los de tu proxy (se quedan tal cual los escribas).\n     (alternativa con asistente: \`conductor litellm login\` — esa vía sí cifra la key)`);
    }
    // 2/3 · CONECTAR conductor a tus CLIs — TÚ eliges (Enter = los detectados). En cada host se instala el
    // comando global /conductor + el servidor MCP (fusión no destructiva). Solo se ofrece lo que hay.
    const CMD_MD = [
      '---',
      'description: "Feature con el pipeline SDD verificado de conductor — pausas de revisión EN ESTE CHAT (sin petición: abre el panel web)"',
      '---',
      '$ARGUMENTS es la petición del usuario (puede llevar @rutas y /skills del equipo).',
      '- Si $ARGUMENTS está VACÍO: llama a `conductor_app` con {open:false} (NO abre navegador) y responde EN EL CHAT: cómo lanzar (`/conductor <qué construir>`), los runs del proyecto (activos/en pausa del campo `runs`) y la URL del panel como texto por si prefiere la web.',
      '- Si trae petición: llama a `conductor_feature` con {request: $ARGUMENTS, projectRoot: raíz absoluta del proyecto actual}.',
      '  · status:"paused" → imprime el campo `render` TAL CUAL (presentación determinista — no la resumas ni pegues los artifacts) y ESPERA su respuesta;',
      '    después llama `conductor_continue` con su decisión Y phase (la fase de esa pausa) (sin note = aprobar · note = instrucción · model = cambio en caliente · action:"stop"). Repite.',
      '  · status:"done" → presenta el receipt VERBATIM. Si es GREEN, el usuario revisa y commitea ÉL — tú JAMÁS ejecutas git.',
      '  · NO orquestes fases tú ni edites ficheros tú: el motor conduce; tú solo transmites las pausas y las decisiones.',
      '  · mientras status:"working": si `progress` cambió, cuenta en UNA línea las fases ✓, la fase actual y los tokens — el usuario debe VER avanzar el run.',
      '  · si una tool de conductor es DENEGADA por permisos del host: no insistas — da la URL del panel, pide el permiso («Always allow») y cualquier mensaje del usuario te reengancha con {action:"wait"}. Si el host NI PREGUNTA («could not request permission»): que escriba `/allow-all` en este chat y repita (plan B: relanzar con `copilot --allow-all-tools`).',
      '',
    ].join('\n');
    // CONDUCTOR_USERHOME = override para TESTS (jamás tocar los CLIs reales de la máquina desde una suite)
    const homeU = process.env.CONDUCTOR_USERHOME || homedir();
    const hostsI = [
      { n: '1', key: 'copilot', label: 'Copilot CLI', det: existsSync(join(homeU, '.copilot')) },
      { n: '2', key: 'claude', label: 'Claude Code', det: existsSync(join(homeU, '.claude')) },
      { n: '3', key: 'opencode', label: 'OpenCode', det: existsSync(join(homeU, '.config', 'opencode')) },
    ];
    console.log('2/3 · ¿A qué CLIs conecto conductor? (comando /conductor + tools MCP)');
    for (const h of hostsI) console.log(`   [${h.n}] ${h.label}${h.det ? '   ← detectado' : ''}`);
    const selI = (await askI('   Elige [Enter = los detectados · números, p.ej. 1,3 · n = ninguno] ')).toLowerCase();
    const chosen = new Set();
    if (selI === '') { for (const h of hostsI) if (h.det) chosen.add(h.key); }
    else if (selI !== 'n') { for (const h of hostsI) if (selI.includes(h.n)) chosen.add(h.key); }
    // Claude Code: comando global (~/.claude/commands) + MCP de usuario vía su CLI oficial si está en PATH
    if (chosen.has('claude')) {
      try { mkdirSync(join(homeU, '.claude', 'skills', 'conductor'), { recursive: true }); writeFileSync(join(homeU, '.claude', 'skills', 'conductor', 'SKILL.md'), ['---', 'name: conductor', '---', CMD_MD].join('\n')); console.log('   ✓ Claude Code: skill /conductor instalada (global, estándar Agent Skills)'); } catch (e) { console.log(`   ⚠ Claude Code: no pude escribir la skill (${e.message})`); }
      try { execFileSync('claude', ['mcp', 'add', 'conductor', '-s', 'user', '--', 'conductor', 'mcp'], { stdio: 'pipe', timeout: 20000, windowsHide: true }); console.log('   ✓ Claude Code: servidor MCP registrado (usuario)'); }
      catch { console.log('   ⚠ Claude Code: registra el MCP tú (una vez): claude mcp add conductor -s user -- conductor mcp'); }
    }
    // OpenCode: comando global + fusión no destructiva en su config global (se crea si no existe)
    if (chosen.has('opencode')) {
      const ocDir = join(homeU, '.config', 'opencode');
      try { mkdirSync(join(ocDir, 'command'), { recursive: true }); writeFileSync(join(ocDir, 'command', 'conductor.md'), CMD_MD); console.log('   ✓ OpenCode: comando /conductor instalado (global)'); } catch (e) { console.log(`   ⚠ OpenCode: no pude escribir el comando (${e.message})`); }
      try { const oc = join(ocDir, 'opencode.json'); if (!existsSync(oc)) { mkdirSync(ocDir, { recursive: true }); writeFileSync(oc, '{}\n'); } rlI?.pause(); runI(['connect', '--to', oc, '--key', 'mcp']); rlI?.resume(); } catch {}
    }
    // Copilot CLI: MCP en su config global (~/.copilot/mcp-config.json); el plugin sigue siendo la vía completa (skills)
    if (chosen.has('copilot')) {
      try { mkdirSync(join(homeU, '.copilot'), { recursive: true }); const mc = join(homeU, '.copilot', 'mcp-config.json'); if (!existsSync(mc)) writeFileSync(mc, '{}\n'); rlI?.pause(); runI(['connect', '--to', mc]); rlI?.resume(); console.log('   ✓ Copilot CLI: MCP conductor en su config global — el comando /conductor te lo deja `conductor init` en cada proyecto (.github/skills)'); } catch {}
    }
    if (!chosen.size) console.log('   (nada conectado — cuando quieras: `conductor setup` de nuevo, o conductor connect --to <config> | --command-dir <dir>)');
    const oI = yes(await askI('3/3 · ¿Abrir el panel ahora en este repo? [S/n] '));
    rlI?.close();
    if (oI) runI([]);
    console.log('\n✅ Listo. Dos modos: 🌐 `conductor` en cualquier repo (miniweb) · 💬 /conductor en el chat de tu CLI.');
    process.exit(0);
  }
  case 'connect': {
    // INSTALACIÓN OFICIAL en hosts MCP: UN comando y conectado — sin copiar bloques a mano.
    //   conductor connect --vscode [dir]                → vía `code --add-mcp` (mecanismo oficial del editor);
    //                                                     fallback/Windows: fusión en <dir>/.vscode/mcp.json
    //   conductor connect --to <config> [--key …]       → fusión NO destructiva en la config de CUALQUIER host
    const engineC = resolve(process.argv[1]).split('\\').join('/');
    // instalación npm (motor bajo node_modules/conductor) → shim `conductor` en PATH global → config PORTABLE
    // sin rutas (sobrevive a actualizaciones; VS Code resuelve el env del shell incluso lanzado desde GUI en Mac)
    const portableC = /node_modules[\\/]+conductor[\\/]/i.test(resolve(process.argv[1]));
    const applyMerge = (f, key) => {
      const prev = existsSync(f) ? readFileSync(f, 'utf8') : '';
      const r = mergeMcpEntry(prev, engineC, { key, portable: portableC });
      if (r.error) { console.error(`✗ ${r.error}`); process.exit(1); }
      if (!r.changed) { console.log(`✓ ya estaba conectado (${f}, clave "${r.key}") — nada que hacer`); process.exit(0); }
      mkdirSync(dirname(f), { recursive: true });
      if (prev) writeFileSync(f + '.bak', prev); // backup SOLO si había algo (fusión reversible)
      writeFileSync(f, r.text);
      console.log(`✅ conductor conectado: ${f} (clave "${r.key}"${prev ? `, backup ${f}.bak` : ''}).\n   Reinicia el host y pide en su chat: "abre el panel de conductor en este proyecto".`);
      process.exit(0);
    };
    if (has('--vscode')) {
      const dirV = resolve(pos[0] || '.');
      // el CLI `code` es la vía oficial; en Windows los shims .cmd no se pueden spawnear sin shell (EINVAL) y
      // con shell el JSON se descuartiza → en win32 vamos directos a la fusión del fichero (igual de oficial).
      if (process.platform !== 'win32') {
        try {
          const addArg = portableC ? { name: 'conductor', command: 'conductor', args: ['mcp'] } : { name: 'conductor', command: 'node', args: [engineC, 'mcp'] };
          execFileSync('code', ['--add-mcp', JSON.stringify(addArg)], { stdio: 'pipe', timeout: 15000 });
          console.log('✅ conductor conectado a VS Code (code --add-mcp). Reinicia la ventana y pide en el chat: "abre el panel de conductor".');
          console.log('   La primera vez, el chat pedirá permiso por cada tool de conductor: elige «Always allow» — sin permiso para conductor_continue no se puede seguir el run desde el chat.');
          process.exit(0);
        } catch { /* sin CLI `code` en PATH → fusión directa abajo */ }
      }
      applyMerge(join(dirV, '.vscode', 'mcp.json'), 'servers');
      console.log('   La primera vez, el chat pedirá permiso por cada tool de conductor: elige «Always allow» — sin permiso para conductor_continue no se puede seguir el run desde el chat.');
    }
    // /conductor NATIVO para hosts con comandos-markdown: deja conductor.md en el dir de comandos del host
    // (el nombre del fichero se convierte en el slash-command; el cuerpo instruye al agente a llamar conductor_app).
    const cmdDir = flag('--command-dir');
    if (cmdDir) {
      const dC = resolve(cmdDir); mkdirSync(dC, { recursive: true });
      const fC = join(dC, 'conductor.md');
      writeFileSync(fC, [
        '---',
        'description: "Feature con el pipeline SDD verificado de conductor — pausas de revisión EN ESTE CHAT (sin petición: abre el panel web)"',
        '---',
        '$ARGUMENTS es la petición del usuario (puede llevar @rutas y /skills del equipo).',
        '- Si $ARGUMENTS está VACÍO: llama a `conductor_app` con {open:false} (NO abre navegador) y responde EN EL CHAT: cómo lanzar (`/conductor <qué construir>`), los runs del proyecto (activos/en pausa del campo `runs`) y la URL del panel como texto por si prefiere la web.',
        '- Si trae petición: llama a `conductor_feature` con {request: $ARGUMENTS, projectRoot: raíz absoluta del proyecto actual}.',
        '  · status:"paused" → imprime el campo `render` TAL CUAL (presentación determinista — no la resumas ni pegues los artifacts) y ESPERA su respuesta;',
        '    después llama `conductor_continue` con su decisión Y phase (la fase de esa pausa) (sin note = aprobar · note = instrucción · model = cambio en caliente · action:"stop"). Repite.',
        '  · status:"done" → presenta el receipt VERBATIM. Si es GREEN, el usuario revisa y commitea ÉL — tú JAMÁS ejecutas git.',
        '  · NO orquestes fases tú ni edites ficheros tú: el motor conduce; tú solo transmites las pausas y las decisiones.',
      '  · mientras status:"working": si `progress` cambió, cuenta en UNA línea las fases ✓, la fase actual y los tokens — el usuario debe VER avanzar el run.',
        '',
      ].join('\n'));
      console.log(`✅ comando de chat instalado: ${fC}\n   En tu host: /conductor <qué construir>   (pausas en el chat; sin argumentos abre el panel)\n   Requiere el MCP conectado: connect --to <su-config>`);
      process.exit(0);
    }
    const to = flag('--to');
    if (!to) bad('connect --vscode [dir]  |  connect --to <config-del-host> [--key servers|mcpServers|mcp]  |  connect --command-dir <dir-de-comandos-del-host>');
    applyMerge(resolve(to), flag('--key', 'auto'));
  }
  case 'mcp-config': {
    // SNIPPET OFICIAL para conectar CUALQUIER host MCP: imprime la config con la ruta REAL del motor en ESTA
    // máquina, resuelta en runtime — la documentación nunca lleva rutas de nadie y el mismo comando funciona
    // en Windows/Mac/Linux. Se usa ruta ABSOLUTA + `node` (no el shim `conductor`) a propósito: en macOS las
    // apps GUI no heredan el PATH del shell, así que un command relativo fallaría justo donde menos se ve.
    const engineAbs = resolve(process.argv[1]).split('\\').join('/');
    // PORTABLE primero (instalación npm: shim `conductor` en PATH → config sin rutas, idéntica en toda máquina;
    // VS Code resuelve el env del shell incluso lanzado desde GUI). Deeplink one-click con el formato oficial
    // vscode:mcp/install?name=…&config=<json-urlencoded>. La forma con ruta absoluta queda como fallback.
    const portableCfg = { type: 'stdio', command: 'conductor', args: ['mcp'] };
    console.log('— PORTABLE (tras `npm i -g …`: sin rutas, vale en cualquier máquina) —');
    console.log('  VS Code one-click:  vscode:mcp/install?name=conductor&config=' + encodeURIComponent(JSON.stringify(portableCfg)));
    console.log('  cualquier host:     ' + JSON.stringify({ mcpServers: { conductor: { command: 'conductor', args: ['mcp'] } } }));
    console.log('  hosts clave "mcp":  ' + JSON.stringify({ mcp: { conductor: { type: 'local', command: ['conductor', 'mcp'], enabled: true } } }));
    console.log('\n— FALLBACK con ruta absoluta (si el shim no está en el PATH del host) —');
    const vsc = { servers: { conductor: { type: 'stdio', command: 'node', args: [engineAbs, 'mcp'] } } };
    const std = { mcpServers: { conductor: { command: 'node', args: [engineAbs, 'mcp'] } } };
    console.log('— VS Code · pega en .vscode/mcp.json (workspace) o vía "MCP: Add Server":\n');
    console.log(JSON.stringify(vsc, null, 2));
    console.log('\n— hosts MCP con clave "mcpServers" (formato estándar):\n');
    console.log(JSON.stringify(std, null, 2));
    // tercer formato extendido: hosts cuya config usa la clave "mcp" con el command como ARRAY
    const arr = { mcp: { conductor: { type: 'local', command: ['node', engineAbs, 'mcp'], enabled: true } } };
    console.log('\n— hosts MCP con clave "mcp" y command en ARRAY:\n');
    console.log(JSON.stringify(arr, null, 2));
    console.log('\nPega el bloque cuyo formato coincida con la config de tu host. Prueba de humo: en su chat, pide "abre el panel de conductor en este proyecto" (tool conductor_app).');
    process.exit(0);
  }
  case 'version': case '--version': console.log(`conductor ${VERSION}`); break;
  default: printHelp();
}

function bad(usage) { console.error(`uso: conductor ${usage}`); process.exit(2); }
function printHelp() {
  // AYUDA EN DOS NIVELES (anti-Frankenstein): el corto enseña EL BUCLE DIARIO; `help --all` la sala de
  // máquinas (gates, sellos, ledger, CI…). 35 comandos con la misma jerarquía era el monstruo, no el motor.
  if (!has('--all')) {
    console.log(`conductor ${VERSION} — pipeline SDD verificado (0 deps)

  EL BUCLE DIARIO
    run  (o sin comando)                 abre la miniweb en este repo (la arranca si está apagada)
    init [dir]                           inicializa el proyecto (crea openspec/ — una vez por repo)
    config                               los mandos de openspec/conductor.json, explicados uno a uno
    receipt <changeDir>                  recibo de PR (markdown) del run verificado
    stats                                tokens, coste REAL y ahorro por proveedor/modelo
    doctor                               autotest del entorno (proxy, app, bundle)
    stop | restart                       apaga o reinicia la app (se niega a parar con runs vivos)

  PRIMERA VEZ (tras npm i -g)
    setup                                elige tus CLIs (Copilot/Claude/OpenCode) → /conductor en su chat
    ~/.conductor/litellm.json            tus credenciales+modelos del proxy (o \`litellm login\`)

  conductor help --all                   → la sala de máquinas completa (gates, sellos, ledger, CI…)`);
    process.exit(cmd && !['help', '--help', undefined].includes(cmd) ? 2 : 0);
  }
  console.log(`conductor ${VERSION} — sala de máquinas completa\n
  gate <changeDir> [--src d] [--contract b h] [--format human|json|rdjson|sarif|junit] [--strict]
  contract <base> <head> [--format ...]   # .json=OpenAPI · .sql=esquema BD · .ts=contrato front
  migrate <dir|file.sql>                   # linter de seguridad de migraciones de BD
  trace <changeDir> --src <d> [--html out]
  cost <jsonl> [--otel out] [--json]
  drive <changeDir> --request "..." [--src d] [--complexity simple|medium|complex] [--domain n]
        [--preset quick-fix|visual|feature|migration] [--model-planner m] [--model-coder m] [--model-reviewer m] [--runner spawn|sdk]
                                          # DRIVER determinista: el código conduce el pipeline fase a fase;
                                          # garantiza la secuencia con cualquier modelo. runner sdk = sesiones
                                          # calientes (requiere @github/copilot-sdk; spawn = default validado)
  run|resume|status ...
  init [dir] [--hosts copilot,claude,opencode,vscode|none]   # árbol OpenSpec + detección profunda + /conductor por-proyecto
  init-config <root> [--smart]                 # config+project.md; --smart = relleno semántico con IA (un one-shot)
  setup                                        # instalación guiada: credenciales + hosts (/conductor + MCP)
  upgrade [origen]                             # reinstala desde tu origen + selfcheck del motor nuevo
  evals [--k N] [--json]                       # golden-set del harness (offline, 0 tokens) → eval/results.jsonl
  estimate <changeDir> ...                     # preflight de tokens SIN gastar API
  litellm login|status                         # credenciales del proxy (asistente con cifrado / huella de la key)
  byok save|status                             # credenciales BYOK por variables de entorno
  archive <changeDir>                          # archiva un GREEN: promueve la spec a specs/ + evidencia al histórico
  aiact <changeDir> [--src d]                  # informe de transparencia («quién hizo qué») de un change
  search <texto> · skills · stack · atlas · app-status · config   # exploración del proyecto y del registro
  keygen [--priv key.pem] [--pub key.pem]      # genera par Ed25519 para firmar provenance/bundle
  seal <changeDir> [--src d] [--usage j] [--priv key.pem | --key hmac] [-o out]
  verify <prov.json> [--pub key.pem | --key hmac]
  sign <file> --priv key.pem [-o file.sig]     # firma el bundle (cadena de suministro)
  verify-file <file> --sig file.sig --pub key.pem
  explain <srcDir> [--out dir]                 # ingeniería inversa código → borrador de spec
  drift <changeDir> --src <dir> [--format ...] # living-spec: divergencia spec↔código
  ledger append <seal.json> --ledger <p>  ·  ledger verify --ledger <p>   # audit chain
  policy init|validate <f>|enforce <changeDir> [--policy f] [--override "razón"] [--by user]
  receipt <changeDir> [-o out.md]              # recibo de PR (markdown) del run verificado — pégalo en tu PR
  dashboard <changeDir> --src <d> [--usage j] [-o html]
  eval <changeDir> --src <dir> [--json]        # puntúa la calidad de un cambio del pipeline
  selfcheck [--expect-version v] [--expect-sha h] [--pub key.pem [--sig f]]   # drift + firma del motor
  (sin comando) | app [root]                   # EL GESTO: abre la app (la arranca si está apagada)
  serve <root>                                 # app única (panel) en :4750
  ping | stop | restart [root]                 # ciclo de vida de la app única (:4750)
  stats [--project <ruta>] [--json]            # uso real qwen+Copilot: tokens, coste y AHORRO por proveedor/modelo
  install                                      # instalación GUIADA (credenciales → host → panel) — empieza aquí
  connect --vscode [dir] | --to <config>       # conecta conductor a tu host MCP (un comando, fusión no destructiva)
  mcp-config                                   # (alternativa manual) imprime el snippet MCP con la ruta real del motor
  ci [--gitlab] [-o path]  ·  mcp  ·  doctor  ·  version`);
  process.exit(0);
}
function printTrace(t) {
  console.log(`\nconductor trace\n`);
  console.log('  REQ                        task code test  scenarios');
  for (const m of t.matrix) console.log(`  ${m.id.padEnd(25)} ${m.cov.task ? '✓' : '·'}    ${m.cov.code ? '✓' : '·'}    ${m.cov.test ? '✓' : '·'}    ${m.scenarios.length}`);
  if (t.orphanTasks.length) console.log(`\n  ⚠ ${t.orphanTasks.length} tarea(s) huérfana(s)`);
  console.log(`\n  → ${t.gaps.length ? 'HUECOS: ' + t.gaps.join(', ') : 'TRAZABILIDAD COMPLETA'}\n`);
}
function printCost(r) {
  console.log(`\nconductor cost · ledger por fase\n`);
  for (const p of r.phases) console.log(`  ${p.phase.padEnd(12)} ${String(p.calls).padStart(3)}  ${p.models.join(',').padEnd(20)} in ${String(p.in).padStart(6)} out ${String(p.out).padStart(6)}  $${p.cost_usd.toFixed(4)}`);
  console.log(`\n  TOTAL $${r.cost_usd} · naive(all-Opus) $${r.naive_all_opus_usd} · AHORRO ${r.saved_pct}%\n`);
}
function printStats(r, single) {
  const k = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : String(n || 0));
  const dur = (ms) => { if (!ms) return '—'; const s = Math.round(ms / 1000); if (s < 60) return s + 's'; return Math.floor(s / 60) + 'm ' + (s % 60) + 's'; };
  const money = (n) => '$' + Number(n || 0).toFixed(2);
  const trunc = (s, n) => { s = String(s); return s.length > n ? s.slice(0, n - 1) + '…' : s; }; // evita desalinear con ids/rutas largas
  console.log(`\nconductor stats · uso real · ${single || r.projects_scanned + ' proyecto(s) registrado(s)'}\n`);
  if (!r.runs) { console.log('  (sin runs con timeline todavía — lanza uno desde la miniweb `conductor` o con /conductor en tu chat)\n'); return; }
  console.log(`  RUNS     ${r.runs} total · ${r.green} GREEN · ${r.failed} fallido(s)${r.stopped ? ` · ${r.stopped} detenido(s)` : ''}${r.running ? ` · ${r.running} en curso` : ''}`);
  console.log(`  FASES    ${r.phases} · duración media ${dur(r.mean_ms)}`);
  console.log(`  TOKENS   ↓ ${k(r.tokens.in)} entrada · ↑ ${k(r.tokens.out)} salida`);
  if (r.estimator) console.log(`\n  ESTIMADOR   ${r.estimator.phases} fase(s) medidas en ${r.estimator.runs} run(s) · desviación total ${r.estimator.dev_pct > 0 ? '+' : ''}${r.estimator.dev_pct}% · error medio por fase (MAPE) ${r.estimator.mape_pct}%  — preflight sin API vs tokens reales`);
  if (r.byDay?.length) {
    // el corte día × modelo — la MISMA granularidad que el informe de consumo de tu org: allí ves el €,
    // aquí el "en qué se fue" (peticiones y tokens de ese día, por modelo y proveedor)
    console.log('\n  POR DÍA (cruzable con el informe de consumo de tu organización)');
    for (const d of r.byDay.slice(0, 14)) console.log(`    ${d.date}  ${d.provider === 'byok' ? 'LiteLLM' : 'Copilot'}  ${d.model}  ·  ${d.calls} petición(es) · ↓ ${d.in.toLocaleString('es')} ↑ ${d.out.toLocaleString('es')} tokens`);
    if (r.byDay.length > 14) console.log(`    … y ${r.byDay.length - 14} fila(s) más (conductor stats --json para todas)`);
  }
  console.log(`\n  POR PROVEEDOR`);
  for (const p of r.byProvider) {
    const label = p.provider === 'byok' ? 'LiteLLM (BYOK · tu proxy)' : p.provider === 'copilot' ? 'copilot (premium · AIC)' : p.provider;
    console.log(`    ${trunc(label, 24).padEnd(24)} ${String(p.calls).padStart(4)} fase(s) · ↓${k(p.in)} ↑${k(p.out)}`);
  }
  console.log(`\n  POR MODELO`);
  for (const m of r.byModel) console.log(`    ${trunc(m.model, 22).padEnd(22)} ${String(m.calls).padStart(4)} fase(s) · ↓${k(m.in)} ↑${k(m.out)}  [${m.provider}]`);
  const cop = r.byProvider.find((p) => p.provider === 'copilot'); const byk = r.byProvider.find((p) => p.provider === 'byok');
  const copPh = cop ? cop.calls : 0, byokPh = byk ? byk.calls : 0, totPh = copPh + byokPh;
  console.log(`\n  AI CREDITS  ${copPh} fase(s) Copilot (premium · consumen AIC) · ${byokPh} fase(s) vía LiteLLM a 0 AIC`);
  if (byokPh) console.log(`  AHORRO      LiteLLM evitó ~${byokPh} petición(es) premium → ${totPh ? Math.round((byokPh / totPh) * 100) : 0}% del trabajo a 0 AIC  (coste estimado ≈${money(r.cost_usd)} · sin mezcla ≈${money(r.naive_all_premium_usd)})`);
  if (r.unpriced) console.log(`  ⚠ COSTE INCOMPLETO  ${r.unpriced} fase(s) con modelo SIN precio conocido, excluidas del total — \`conductor byok login\` trae el precio real de tu proxy`);
  if (r.perProject.length > 1) {
    console.log(`\n  POR PROYECTO`);
    for (const p of r.perProject) console.log(`    ${trunc(p.id || p.root.split(/[\\/]/).pop(), 24).padEnd(24)} ${p.runs} run(s) (${p.green}✓) · ${p.byok_phases} LiteLLM(0 AIC) / ${p.copilot_phases} Copilot`);
  }
  console.log('');
}
function printRun(s) {
  console.log(`\nconductor run · ${s.runId} [${s.status.toUpperCase()}] (${s.complexity})`);
  for (const ph of s.phases) console.log(`  ${ph.status === 'done' ? '✓' : ph.status === 'paused' ? '⏸' : '·'} ${ph.name.padEnd(10)} (${ph.agent})${ph.gate ? '  gate:' + ph.gate : ''}`);
  if (s.status === 'paused') { console.log(`\n  ⏸ pausado en "${s.currentPhase}" → conductor resume ${s.runId}`); for (const f of s.lastFindings || []) console.log(`     - ${f.message}`); }
  console.log('');
}
function renderTraceHtml(t) {
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const b = (x) => `<span class="b ${x ? 'ok' : 'no'}">${x ? '✓' : '✗'}</span>`;
  return `<!doctype html><meta charset=utf-8><title>linaje</title><style>body{font:14px system-ui;max-width:820px;margin:2rem auto}.r{border:1px solid #ddd;border-radius:8px;margin:.4rem 0;padding:.4rem .8rem}.r.gap{border-color:#e0245e;background:#fff5f8}.b{display:inline-block;width:1.2em;text-align:center;border-radius:3px;color:#fff}.b.ok{background:#1aa260}.b.no{background:#e0245e}code{background:#f0f0f5;padding:0 .3em;border-radius:4px}</style><h1>conductor · linaje spec→task→code→test</h1>${t.matrix.map((m) => `<div class="r ${m.cov.task && m.cov.code && m.cov.test ? '' : 'gap'}"><b><code>${esc(m.id)}</code></b> ${esc(m.name)} — task ${b(m.cov.task)} code ${b(m.cov.code)} test ${b(m.cov.test)}<br><small>tasks: ${m.tasks.length} · code: ${m.code.map((f) => esc(f.path)).join(', ') || '—'} · tests: ${m.tests.map((f) => esc(f.path)).join(', ') || '—'}</small></div>`).join('')}`;
}
