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

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, chmodSync } from 'node:fs';
import { execSync, spawn } from 'node:child_process';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, createPrivateKey } from 'node:crypto';
const createHashSync = (s) => createHash('sha256').update(s).digest('hex');
import { checkCoherence } from '../lib/gates/coherence.mjs';
import { checkArtifacts } from '../lib/gates/artifacts.mjs';
import { checkContract } from '../lib/contract/contract.mjs';
import { buildTrace } from '../lib/gates/trace.mjs';
import { computeCost } from '../lib/core/cost.mjs';
import { estimateRun } from '../lib/core/estimate.mjs';
import { loadSkills, buildSkillsIndex } from '../lib/analysis/skills.mjs';
import { detectStack } from '../lib/analysis/stack.mjs';
import { listArchive, searchChanges } from '../lib/analysis/archive.mjs';
import { buildAtlas } from '../lib/analysis/atlas.mjs';
import { seal, verifySeal, generateKeypair, signFile, verifyFile, hashSpecs } from '../lib/provenance/provenance.mjs';
import { githubWorkflow, gitlabCi } from '../lib/sysops/ci.mjs';
import { renderDashboard } from '../lib/serving/dashboard.mjs';
import { format, human, isBlocking, count } from '../lib/core/report.mjs';
import * as R from '../lib/pipeline/runner.mjs';
import { validate } from '../lib/core/jsonschema.mjs';
import { explain, renderSpec, renderTasks } from '../lib/analysis/explain.mjs';
import { detectDrift } from '../lib/contract/drift.mjs';
import * as L from '../lib/provenance/ledger.mjs';
import { lintMigrations } from '../lib/contract/migration.mjs';
import { scoreCandidate } from '../lib/gates/eval.mjs';
import { drive, readDriveConfig } from '../lib/pipeline/drive.mjs';
import { initConfig, CONFIG_SCHEMA } from '../lib/analysis/scaffold.mjs';
import { writeAiact } from '../lib/serving/aiact.mjs';
import { createSdkRunner } from '../lib/pipeline/sdk-runner.mjs';
import { createRunServer, createAppServer, writeModelsCache, loadRegistry } from '../lib/serving/serve.mjs';
import { aggregateStats } from '../lib/core/stats.mjs';
import { encryptSecret } from '../lib/provenance/secret.mjs';
import { homedir } from 'node:os';
import { loadPolicy, validatePolicy, enforce, DEFAULT_POLICY } from '../lib/gates/policy.mjs';
import { toOtlp } from '../lib/sysops/otlp.mjs';

// robustez: cualquier error no capturado → mensaje limpio + exit 2 (nunca stack trace al usuario)
process.on('uncaughtException', (e) => { process.stderr.write(`conductor: error — ${e.message}\n`); process.exit(2); });

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
// la versión REAL vive en plugin.json (junto a assets/ en la instalación) — cero constantes fósiles
const VERSION = (() => { try { return JSON.parse(readFileSync(join(dirname(resolve(process.argv[1])), '..', 'plugin.json'), 'utf8')).version; } catch { try { return JSON.parse(readFileSync(join(ROOT, '..', 'plugin.json'), 'utf8')).version; } catch { return '0.0.0-dev'; } } })();
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
    if (sub === 'init') { const o = flag('-o', 'conductor.policy.json'); writeFileSync(o, JSON.stringify(DEFAULT_POLICY, null, 2)); console.log(`política por defecto → ${o}`); process.exit(0); }
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
  case 'run': case 'resume': case 'status': {
    const runsDir = join(ROOT, '.runs');
    if (cmd === 'status') { const id = pos[0]; const p = join(runsDir, (existsSync(join(runsDir, `${id}.json`)) ? id : R.runIdFor(id)) + '.json'); if (!existsSync(p)) bad('run no encontrado'); const s = JSON.parse(readFileSync(p, 'utf8')); has('--json') ? console.log(JSON.stringify(s, null, 2)) : printRun(s); process.exit(0); }
    if (cmd === 'resume') { const p = join(runsDir, `${pos[0]}.json`); if (!existsSync(p)) bad('run no encontrado'); const s = R.resume(JSON.parse(readFileSync(p, 'utf8'))); R.save(runsDir, s); printRun(s); process.exit(s.status === 'done' ? 0 : 1); }
    const s = R.advance(R.loadOrNew(runsDir, pos[0], flag('--complexity', 'medium'))); R.save(runsDir, s); printRun(s); process.exit(s.status === 'done' ? 0 : 1);
  }
  case 'drive': {
    // DRIVER DETERMINISTA: el código conduce el pipeline y llama al modelo (BYOK) por fase.
    // Garantiza la secuencia con cualquier modelo — un modelo flojo da peor contenido, no salta fases.
    const dir = pos[0]; if (!dir) bad('drive <changeDir> --request "..." [--src dir] [--complexity simple|medium|complex] [--domain name] [--preset quick-fix|visual|feature|migration] [--model-planner m] [--model-coder m] [--model-reviewer m]');
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
    // human-in-the-loop POR DEFECTO cuando hay web: pausa antes de apply y verify para revisar
    // los artefactos (specs) y aprobar con el botón. --auto (o config autoApprove:true) = sin pausas.
    const auto = has('--auto') || ucfg.autoApprove === true;
    const pause = srv && !auto ? { pauseAt: ['apply', 'verify'], onPause: (info) => { console.log(`⏸ REVISIÓN: aprueba en ${srv.url} para continuar con "${info.before}"`); return srv.waitApproval(info); } } : {};
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
    try { srv2 = await createAppServer({ ...appOpts, port: 4750 }); }
    catch (e) {
      const isAddr = /EADDRINUSE/i.test(e?.code || e?.message || '');
      if (isAddr) {
        // anti "varios encendidos": si :4750 lo ocupa OTRA conductor VIVA, NO levanto una 2ª app (efímera y
        // confusa) — uso esa. Solo caigo a efímero si el puerto lo ocupa algo AJENO a conductor.
        const j = await fetch('http://127.0.0.1:4750/api/ping', { signal: AbortSignal.timeout(900) }).then((r) => r.json()).catch(() => null);
        if (j?.ok) {
          // app única ya viva → REGISTRAR el proyecto pedido y ENFOCARLO en la web (no un ✅ mudo que ignora B, #5).
          const nm = root.split(/[\\/]/).pop();
          const reg = await fetch('http://127.0.0.1:4750/api/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ project: root }) }).then((r) => r.json()).catch(() => null);
          if (reg?.ok) {
            const focusUrl = `http://127.0.0.1:4750/?project=${encodeURIComponent(reg.id)}`;
            console.log(`✅ App conductor única ya en marcha. Registrado y enfocado «${nm}» → ${focusUrl}${reg.openspec ? '' : ' (sin init: la web te ofrecerá Inicializar)'}`);
            if (process.env.CONDUCTOR_SERVE_OPEN !== '0') { try { const opener = process.platform === 'win32' ? `start "" "${focusUrl}"` : process.platform === 'darwin' ? `open "${focusUrl}"` : `xdg-open "${focusUrl}"`; execSync(opener, { shell: true, stdio: 'ignore', timeout: 5000, windowsHide: true }); } catch {} }
            process.exit(0);
          }
          console.log(`✅ Ya hay una app conductor EN MARCHA en http://127.0.0.1:4750 (v${j.version || '?'}) — úsala (no levanto otra). Reinícala con \`conductor restart\` si quieres.`); process.exit(0);
        }
      }
      const why = isAddr ? 'el puerto 4750 lo ocupa algo AJENO a conductor' : `no pude usar el puerto 4750 (${e.message})`;
      srv2 = await createAppServer(appOpts);
      console.log(`⚠ ${why} → sirviendo en un puerto efímero. Cierra lo que ocupe :4750 y reinicia para la app única.`);
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
  case 'byok': {
    // credenciales BYOK persistentes (~/.conductor/byok.json) — la mezcla funciona aunque la app
    // arranque sin las env. `byok save` las toma del ENTORNO ACTUAL (ejecútalo desde tu shell BYOK).
    const sub = pos[0];
    const home = process.env.CONDUCTOR_HOME || join(homedir(), '.conductor');
    const file = join(home, 'byok.json');
    if (sub === 'save') {
      const baseUrl = flag('--base-url') || process.env.COPILOT_PROVIDER_BASE_URL;
      const apiKey = flag('--api-key') || process.env.COPILOT_PROVIDER_API_KEY;
      const type = flag('--type') || process.env.COPILOT_PROVIDER_TYPE || 'openai';
      const model = flag('--model') || process.env.COPILOT_MODEL || '';
      if (!baseUrl || !apiKey) bad('byok save: exporta COPILOT_PROVIDER_BASE_URL y COPILOT_PROVIDER_API_KEY en tu shell y ejecuta `conductor byok save` (modo recomendado).');
      if (flag('--api-key')) console.error('⚠ --api-key queda en el historial del shell y en la lista de procesos; prefiere exportar COPILOT_PROVIDER_API_KEY.');
      mkdirSync(home, { recursive: true });
      // la KEY se cifra con DPAPI (Windows): el fichero es inútil copiado a otra cuenta/equipo. Fuera de
      // win32 no hay DPAPI → se guarda en claro con aviso. baseUrl/model NO son secretos (quedan legibles).
      const enc = encryptSecret(apiKey);
      writeFileSync(file, JSON.stringify(enc ? { type, baseUrl, apiKeyEnc: enc, model } : { type, baseUrl, apiKey, model }, null, 2), { mode: 0o600 });
      if (process.platform !== 'win32') try { chmodSync(file, 0o600); } catch {} // la key no queda legible por otros usuarios de la máquina
      console.log(`✓ credenciales BYOK guardadas en ${file} ${enc ? '(KEY cifrada con DPAPI — inútil en otra cuenta/equipo)' : '(⚠ KEY en claro: DPAPI solo existe en Windows)'}. NUNCA en el repo. La mezcla byok:/copilot: ya funciona arranque quien arranque la app.`);
      // sembrar la cache de NOMBRES de modelo (no la key) → el picker mostrará qwen SIEMPRE, con o sin env
      try {
        const base = String(baseUrl).replace(/\/+$/, '');
        const r = await fetch((base.endsWith('/v1') ? base : base + '/v1') + '/models', { headers: { authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(5000) });
        if (r.ok) { const j = await r.json(); const ids = (j.data || []).map((m) => m.id).filter(Boolean); writeModelsCache(ids, baseUrl); console.log(`  catálogo cacheado: ${ids.length} modelo(s) — el picker los mostrará en todo arranque`); }
      } catch { /* sin red ahora → la cache se sembrará en el primer fetch en vivo del panel */ }
      process.exit(0);
    }
    if (sub === 'status') {
      const envOk = !!(process.env.COPILOT_PROVIDER_BASE_URL && process.env.COPILOT_PROVIDER_API_KEY);
      let fileOk = false, enc = false; try { const j = JSON.parse(readFileSync(file, 'utf8')); fileOk = !!(j.baseUrl && (j.apiKey || j.apiKeyEnc)); enc = !!j.apiKeyEnc; } catch {}
      console.log(`byok por env: ${envOk ? 'SÍ' : 'no'} · byok.json: ${fileOk ? 'SÍ (' + file + (enc ? ', KEY cifrada DPAPI' : ', KEY en claro') + ')' : 'no'} → byok disponible: ${envOk || fileOk ? '✅' : '❌ ejecuta `conductor byok save` desde tu shell con las variables exportadas'}`);
      process.exit(0);
    }
    bad('byok save  (toma las credenciales del entorno: exporta COPILOT_PROVIDER_BASE_URL y COPILOT_PROVIDER_API_KEY) | byok status');
  }
  case 'init-config': {
    const dir = pos[0] || join(process.cwd(), 'openspec');
    const r = initConfig(resolve(dir));
    console.log(`conductor init-config\n  schema → ${r.schemaPath}\n  config → ${r.cfgPath}${r.created ? ' (creada)' : ' (ya existía — intacta)'}`);
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
  case 'dashboard': {
    const dir = pos[0], src = flag('--src'); if (!dir) bad('dashboard <changeDir> --src <dir>');
    const gates = [...checkCoherence(dir), ...checkArtifacts(dir)];
    const trace = src && existsSync(src) ? buildTrace(dir, src) : null;
    const usage = flag('--usage'); const cost = usage && existsSync(usage) ? computeCost(usage) : null;
    const tlPath = existsSync(join(dir, '.conductor', 'timeline.json')) ? join(dir, '.conductor', 'timeline.json') : join(dir, 'run-timeline.json'); const timeline = existsSync(tlPath) ? JSON.parse(readFileSync(tlPath, 'utf8')) : null;
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
    console.log(`\n  TOTAL ~${est.total} tokens (in ~${est.totalIn} · out ~${est.totalOut}). Con BYOK/qwen ≈ $0; con catálogo premium, × tarifa del modelo.\n`);
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
    const good = { models: { planner: 'byok:qwen36-msc1', coder: 'copilot:claude-haiku-4.5' }, pipeline: ['propose', 'spec', 'apply', 'verify'], autoApprove: false };
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
    console.log(`  app conductor (:4750): ${appUp?.ok ? 'EN MARCHA (' + appUp.root + ')' : 'apagada (se levanta sola con /sdd-run o `conductor serve`)'}`);
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
        const cur = createHashSync(files.map((f) => readFileSync(f, 'utf8')).join(' '));
        console.log(`  bundle vs lib/: ${cur === embedded ? 'EN SYNC' : 'DESACTUALIZADO → corre `node engine/build.mjs && cp engine/dist/conductor.mjs assets/`'}`);
      } else { console.log('  bundle vs lib/: (no comprobable fuera del repo)'); }
    } catch { console.log('  bundle vs lib/: (no comprobable)'); }
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
  case undefined: case 'app': {
    const url = 'http://127.0.0.1:4750/';
    const ping2 = () => fetch(url + 'api/ping', { signal: AbortSignal.timeout(1200) }).then((r) => r.ok).catch(() => false);
    let alive = await ping2();
    if (!alive) {
      const rootArg = pos[0] ? resolve(pos[0]) : process.cwd();
      spawn(process.execPath, [resolve(process.argv[1]), 'serve', rootArg], { detached: true, stdio: 'ignore', windowsHide: true, env: { ...process.env, CONDUCTOR_SERVE_OPEN: '0' } }).unref();
      for (let i = 0; i < 14 && !alive; i++) { await new Promise((r) => setTimeout(r, 500)); alive = await ping2(); }
      if (!alive) { console.error('conductor: la app no arrancó (¿:4750 ocupado por otra cosa?)'); process.exit(1); }
    }
    if (process.env.CONDUCTOR_NO_OPEN !== '1') {
      try {
        const opener = process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
        execSync(opener, { shell: true, stdio: 'ignore', timeout: 5000, windowsHide: true });
      } catch { /* sin navegador disponible: la URL impresa basta */ }
    }
    console.log(`🌐 conductor: ${url}`);
    break;
  }
  // instala el comando `conductor` en el PATH del usuario SIN tocar variables de entorno: en Windows un
  // shim .cmd en WindowsApps (ya está en PATH); en POSIX un script en ~/.local/bin (avisa si no está en PATH).
  case 'setup': {
    const engineAbs = resolve(process.argv[1]);
    if (process.platform === 'win32') {
      const dir = join(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'Microsoft', 'WindowsApps');
      const shim = join(dir, 'conductor.cmd');
      writeFileSync(shim, `@echo off\r\n"${process.execPath}" "${engineAbs}" %*\r\n`);
      console.log(`✅ comando instalado: ${shim}\n   Abre una terminal nueva y escribe: conductor`);
    } else {
      const dir = join(homedir(), '.local', 'bin');
      mkdirSync(dir, { recursive: true });
      const shim = join(dir, 'conductor');
      writeFileSync(shim, `#!/bin/sh\nexec "${process.execPath}" "${engineAbs}" "$@"\n`);
      try { chmodSync(shim, 0o755); } catch {}
      const onPath = String(process.env.PATH || '').split(':').includes(dir);
      const aviso = onPath ? '' : '\n   ⚠ añade ' + dir + ' a tu PATH (en la mayoría de distros basta reabrir la sesión)';
      console.log('✅ comando instalado: ' + shim + aviso + '\n   Escribe: conductor');
    }
    break;
  }
  case 'version': case '--version': console.log(`conductor ${VERSION}`); break;
  default: printHelp();
}

function bad(usage) { console.error(`uso: conductor ${usage}`); process.exit(2); }
function printHelp() {
  console.log(`conductor ${VERSION} — verificación SDD determinista (0 deps)\n
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
  keygen [--priv key.pem] [--pub key.pem]      # genera par Ed25519 para firmar provenance/bundle
  seal <changeDir> [--src d] [--usage j] [--priv key.pem | --key hmac] [-o out]
  verify <prov.json> [--pub key.pem | --key hmac]
  sign <file> --priv key.pem [-o file.sig]     # firma el bundle (cadena de suministro)
  verify-file <file> --sig file.sig --pub key.pem
  explain <srcDir> [--out dir]                 # ingeniería inversa código → borrador de spec
  drift <changeDir> --src <dir> [--format ...] # living-spec: divergencia spec↔código
  ledger append <seal.json> --ledger <p>  ·  ledger verify --ledger <p>   # audit chain
  policy init|validate <f>|enforce <changeDir> [--policy f] [--override "razón"] [--by user]
  dashboard <changeDir> --src <d> [--usage j] [-o html]
  eval <changeDir> --src <dir> [--json]        # puntúa la calidad de un cambio del pipeline
  selfcheck [--expect-version v] [--expect-sha h] [--pub key.pem [--sig f]]   # drift + firma del motor
  (sin comando) | app [root]                   # EL GESTO: abre la app (la arranca si está apagada)
  setup                                        # instala el comando 'conductor' en tu PATH (shim, 3 OS)
  serve <root>                                 # app única (panel) en :4750
  ping | stop | restart [root]                 # ciclo de vida de la app única (:4750)
  stats [--project <ruta>] [--json]            # uso real qwen+Copilot: tokens, coste y AHORRO por proveedor/modelo
  ci [--gitlab] [-o path]  ·  mcp  ·  doctor  ·  version`);
  process.exit(cmd && !['help', '--help', undefined].includes(cmd) ? 2 : 0);
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
  if (!r.runs) { console.log('  (sin runs con timeline todavía — lanza uno con `/sdd-run` o `conductor drive`)\n'); return; }
  console.log(`  RUNS     ${r.runs} total · ${r.green} GREEN · ${r.failed} fallido(s)${r.stopped ? ` · ${r.stopped} detenido(s)` : ''}${r.running ? ` · ${r.running} en curso` : ''}`);
  console.log(`  FASES    ${r.phases} · duración media ${dur(r.mean_ms)}`);
  console.log(`  TOKENS   ↓ ${k(r.tokens.in)} entrada · ↑ ${k(r.tokens.out)} salida`);
  console.log(`\n  POR PROVEEDOR`);
  for (const p of r.byProvider) {
    const label = p.provider === 'byok' ? 'byok (qwen-class · $0)' : p.provider === 'copilot' ? 'copilot (premium · AIC)' : p.provider;
    console.log(`    ${trunc(label, 24).padEnd(24)} ${String(p.calls).padStart(4)} fase(s) · ↓${k(p.in)} ↑${k(p.out)}`);
  }
  console.log(`\n  POR MODELO`);
  for (const m of r.byModel) console.log(`    ${trunc(m.model, 22).padEnd(22)} ${String(m.calls).padStart(4)} fase(s) · ↓${k(m.in)} ↑${k(m.out)}  [${m.provider}]`);
  const cop = r.byProvider.find((p) => p.provider === 'copilot'); const byk = r.byProvider.find((p) => p.provider === 'byok');
  const copPh = cop ? cop.calls : 0, byokPh = byk ? byk.calls : 0, totPh = copPh + byokPh;
  console.log(`\n  AI CREDITS  ${copPh} fase(s) Copilot (premium · consumen AIC) · ${byokPh} fase(s) qwen a 0 AIC (LiteLLM)`);
  if (byokPh) console.log(`  AHORRO      qwen evitó ~${byokPh} petición(es) premium → ${totPh ? Math.round((byokPh / totPh) * 100) : 0}% del trabajo a 0 AIC  (coste estimado ≈${money(r.cost_usd)} · sin mezcla ≈${money(r.naive_all_premium_usd)})`);
  if (r.perProject.length > 1) {
    console.log(`\n  POR PROYECTO`);
    for (const p of r.perProject) console.log(`    ${trunc(p.id || p.root.split(/[\\/]/).pop(), 24).padEnd(24)} ${p.runs} run(s) (${p.green}✓) · ${p.byok_phases} qwen(0 AIC) / ${p.copilot_phases} Copilot`);
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
