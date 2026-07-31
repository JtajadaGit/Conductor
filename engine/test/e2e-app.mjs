#!/usr/bin/env node
// e2e-app.mjs — E2E REAL del stack v3 completo, 100% OFFLINE (0 tokens, 0 AIC, sin red externa):
//   app única real (assets/conductor.mjs serve) → POST /api/launch → driver HIJO real por IPC →
//   agente FALSO (fake-copilot.mjs) escribiendo archivos de verdad → pausas reales aprobadas por HTTP
//   con NOTA + MODELO EN CALIENTE → lentes paralelas → GREEN → informe AI Act → diff → anti-dup.
// Es la "prueba oficial" automatizada: lo que antes costaba créditos y clicks, ahora corre en CI.
import { spawn, execSync } from 'node:child_process';
import { plumbPath } from '../lib/core/plumb.mjs';
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE = resolve(HERE, '..', '..', 'assets', 'conductor.mjs');
const FAKE = join(HERE, 'fake-copilot.mjs');
const PROJ = join(HERE, '.tmp-e2e-proj');

const fail = (m) => { console.error(`✗ e2e: ${m}`); process.exit(1); };
const ok = (m) => console.log(`ok   e2e: ${m}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── proyecto de prueba (repo git con un archivo previo, para kinds/checkpoints) ──
rmSync(PROJ, { recursive: true, force: true });
mkdirSync(join(PROJ, 'src'), { recursive: true });
writeFileSync(join(PROJ, 'src', 'app.js'), 'export const app = 1;\n');
const g = (c) => execSync(c, { cwd: PROJ, stdio: 'ignore', windowsHide: true });
g('git init -q'); g('git config user.email e2e@t'); g('git config user.name e2e');
g('git add -A'); g('git commit -qm base');
mkdirSync(join(PROJ, 'openspec', 'changes'), { recursive: true });
writeFileSync(join(PROJ, 'openspec', 'conductor.json'), '{}'); // proyecto INICIALIZADO (isSdd) — el gate de gobierno de /api/launch exige init; config vacía = defaults (no toca lentes)

// ── app única REAL en puerto efímero (env de CI puede tener 4750 libre u ocupado — da igual) ──
const PROOF = join(HERE, '.tmp-e2e-proof.txt'); rmSync(PROOF, { force: true });
// CONDUCTOR_PORT=0 → puerto EFÍMERO AISLADO: el e2e nunca cede a un servidor vivo en :4750 (antes, con :4750
// ocupado, el serve cedía a esa app y el e2e probaba contra el servidor equivocado + contaminaba su registro real).
const env = { ...process.env, CONDUCTOR_HOME: join(HERE, '.tmp-e2e-home'), CONDUCTOR_PORT: '0', CONDUCTOR_PROOF_FILE: PROOF, CONDUCTOR_AGENT_CMD: `node ${FAKE}`, CONDUCTOR_SERVE_OPEN: '0', CONDUCTOR_USAGE: '0', CONDUCTOR_KEEP_SESSIONS: '1' };
const app = spawn(process.execPath, [ENGINE, 'serve', PROJ], { env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
let appOut = '';
app.stdout.on('data', (d) => { appOut += d; });
app.stderr.on('data', (d) => { appOut += d; });
let URL0 = null;
for (let i = 0; i < 30 && !URL0; i++) { await sleep(300); URL0 = (appOut.match(/http:\/\/127\.0\.0\.1:\d+\//) || [])[0]; }
if (!URL0) fail('la app no arrancó: ' + appOut.slice(0, 400));
const api = async (path, opts) => { const r = await fetch(URL0.replace(/\/$/, '') + path, opts); return { status: r.status, body: await r.text() }; };
const apiJson = async (path, opts) => JSON.parse((await api(path, opts)).body);

try {
  // ping + panel
  if (!(await apiJson('/api/ping')).ok) fail('ping');
  ok('app única arriba (ping)');
  // las DOS páginas servidas por el BUNDLE compilan (no solo las de lib/)
  for (const [nm, path] of [['panel', '/'], ['run', '/run/header-e2e']]) {
    const h = (await api(path)).body;
    const js = (h.match(/<script>([\s\S]*?)<\/script>/) || [])[1] || '';
    try { new Function(js); } catch (e) { fail(`JS de ${nm} (bundle) con SyntaxError: ` + e.message); }
  }
  ok('JS de panel y run (bundle) compilan');

  // /api/models: forma estable {byok[],copilot[],byokSource,copilotSource,byokCreds} — sin red real (sin creds → observados)
  const mods = await apiJson('/api/models');
  if (!Array.isArray(mods.byok) || !Array.isArray(mods.copilot) || typeof mods.byokCreds !== 'boolean' || !mods.byokSource || !mods.copilotSource) fail('/api/models forma inesperada: ' + JSON.stringify(mods));
  // tiers: mapa id→nivel para los presets de coste — debe existir y contener solo valores válidos
  if (!mods.tiers || typeof mods.tiers !== 'object') fail('/api/models sin mapa tiers');
  const VALID_TIERS = ['economy', 'balanced', 'premium'];
  for (const [id, t] of Object.entries(mods.tiers)) if (!VALID_TIERS.includes(t)) fail(`/api/models tiers[${id}]=${t} no es economy|balanced|premium`);
  // metadata viva del catálogo: mapas credits (AI credits low/medium/high) y vendors SIEMPRE presentes (vacíos sin catálogo)
  if (!mods.credits || typeof mods.credits !== 'object' || !mods.vendors || typeof mods.vendors !== 'object') fail('/api/models sin mapas credits/vendors');
  ok('/api/models responde con catálogo dinámico (byok+copilot+tiers+fuentes)');

  // launch
  const l = await apiJson('/api/launch', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ request: 'añade un componente header con título y test', name: 'header-e2e', complexity: 'simple', domain: 'header' }) });
  if (!l.ok) fail('launch: ' + JSON.stringify(l));
  ok('run lanzado vía API (driver hijo real, IPC)');

  // anti-duplicado mientras corre
  const dup = await api('/api/launch', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ request: 'x', name: 'header-e2e' }) });
  if (dup.status !== 409) fail('anti-duplicado esperaba 409, fue ' + dup.status);
  ok('anti-duplicado en la app (409)');

  // esperar pausa de APPLY (planning corre con el fake) y aprobar con NOTA + MODELO EN CALIENTE
  let st = null;
  for (let i = 0; i < 120; i++) { await sleep(500); st = await apiJson('/api/run/header-e2e/state'); if (st.pending?.before === 'apply') break; if (st.done) fail('terminó antes de la pausa de apply: ' + st.verdict); }
  if (st?.pending?.before !== 'apply') fail('no llegó la pausa de apply; estado: ' + JSON.stringify(st?.current || st?.verdict));
  ok('pausa de revisión ANTES de apply (IPC → web)');

  // P1: editar la spec desde la web ANTES de aprobar
  const specRel = 'specs/header/spec.md';
  const spec0 = (await api('/api/run/header-e2e/artifact?p=' + encodeURIComponent(specRel))).body;
  if (!spec0.includes('REQ-HEADER')) fail('no pude leer la spec');
  const ed = await apiJson('/api/run/header-e2e/artifact', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ p: specRel, content: spec0 + '\n<!-- edited-by-human -->' }) });
  if (!ed.ok) fail('editar spec');
  ok('spec EDITADA desde la web en la pausa');

  await apiJson('/api/run/header-e2e/continue', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ note: 'usa data-testid en el html', model: 'fake-hot-model' }) });
  ok('aprobado con nota 📣 + modelo en caliente 🎛');

  // esperar pausa de VERIFY y aprobar
  for (let i = 0; i < 120; i++) { await sleep(500); st = await apiJson('/api/run/header-e2e/state'); if (st.pending?.before === 'verify') break; if (st.done) break; }
  if (st.pending?.before === 'verify') { await apiJson('/api/run/header-e2e/continue', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }); ok('pausa de verify aprobada'); }

  // esperar final GREEN
  for (let i = 0; i < 120; i++) { await sleep(500); st = await apiJson('/api/run/header-e2e/state'); if (st.done) break; }
  if (st.verdict !== 'GREEN') fail('veredicto final: ' + st.verdict + ' — ' + JSON.stringify(st.current));
  ok('🏁 GREEN end-to-end (driver real + gate real)');

  // la nota del humano llegó al "modelo" (el fake la escribe en el código)
  const header = readFileSync(join(PROJ, 'src', 'header.js'), 'utf8');
  if (!header.includes('honoring user note: usa data-testid')) fail('la nota no llegó al agente');
  ok('la nota del developer viajó hasta el código');

  // el modelo en caliente quedó en la telemetría de apply
  const tl = JSON.parse(readFileSync(plumbPath(join(PROJ, 'openspec', 'changes', 'header-e2e'), 'timeline.json'), 'utf8'));
  const applyPh = tl.phases.find((p) => p.phase === 'apply');
  if (applyPh.model !== 'fake-hot-model') fail('modelo en caliente no registrado: ' + applyPh.model);
  ok('modelo en caliente registrado en telemetría');
  // PRUEBA DE PROCESO: el agente de apply recibió REALMENTE el COPILOT_MODEL pedido (no cosmético)
  const proofLines = readFileSync(PROOF, 'utf8').split(String.fromCharCode(10)).filter(Boolean);
  if (!proofLines.includes('fake-hot-model')) fail('el PROCESO del agente NO recibió el modelo en caliente; recibió: ' + JSON.stringify(proofLines));
  ok('✅ PRUEBA DE PROCESO: el agente recibió COPILOT_MODEL=fake-hot-model (cambio de modelo REAL, no cosmético)');
  if (!tl.approvals?.length) fail('sin approvals');
  ok('aprobaciones humanas registradas (' + tl.approvals.length + ')');
  const verifyPh = tl.phases.find((p) => p.phase === 'verify');
  if (!verifyPh?.lenses?.length) fail('verify sin lentes');
  ok('review multi-lente ejecutada: ' + verifyPh.lenses.join(', '));
  const vr = readFileSync(join(PROJ, 'openspec', 'changes', 'header-e2e', 'verify-report.md'), 'utf8');
  if (!vr.includes('multi-lens')) fail('verify-report no es multi-lens');

  // spec conserva la edición humana
  const specNow = (await api('/api/run/header-e2e/artifact?p=' + encodeURIComponent(specRel))).body;
  if (!specNow.includes('edited-by-human')) fail('la edición humana de la spec se perdió');
  ok('la edición humana de la spec sobrevivió al pipeline');

  // diff por archivo + informe AI Act
  const diff = await api('/api/run/header-e2e/diff?p=src/header.js');
  if (diff.status !== 200 || !diff.body.includes('header')) fail('diff');
  ok('diff por archivo servido');
  const aiact = await api('/api/run/header-e2e/aiact');
  if (aiact.status !== 200 || !aiact.body.includes('fake-hot-model') || !aiact.body.includes('aprobada por <b>una persona</b>')) fail('aiact');
  ok('🇪🇺 informe AI Act generado con modelos + aprobaciones reales');

  // rollback del apply tras terminar (restaura app.js, borra header.js)
  const rb = await apiJson('/api/run/header-e2e/rollback', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"phase":"apply"}' });
  if (!rb.ok) fail('rollback: ' + JSON.stringify(rb));
  if (existsSync(join(PROJ, 'src', 'header.js'))) fail('rollback no borró header.js');
  if (readFileSync(join(PROJ, 'src', 'app.js'), 'utf8').includes('wired header')) fail('rollback no restauró app.js');
  ok('↩ rollback del apply: creado fuera, editado restaurado, rama intacta');

  // ── ESCENARIO 2: STOP en pausa → STOPPED → RESUME desde la app → GREEN (el flujo del desastre v1.30) ──
  const l2 = await apiJson('/api/launch', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ request: 'añade un footer simple', name: 'footer-e2e', complexity: 'simple', domain: 'footer' }) });
  if (!l2.ok) fail('launch 2: ' + JSON.stringify(l2));
  for (let i = 0; i < 120; i++) { await sleep(400); st = await apiJson('/api/run/footer-e2e/state'); if (st.pending?.before === 'apply') break; }
  if (st.pending?.before !== 'apply') fail('escenario 2: no llegó la pausa');
  await apiJson('/api/run/footer-e2e/stop', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  for (let i = 0; i < 60; i++) { await sleep(400); st = await apiJson('/api/run/footer-e2e/state'); if (st.verdict === 'STOPPED') break; }
  if (st.verdict !== 'STOPPED') fail('stop no marcó STOPPED: ' + st.verdict);
  ok('■ STOP en pausa → STOPPED limpio');
  const rs2 = await apiJson('/api/resume', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'footer-e2e' }) });
  if (!rs2.ok) fail('resume: ' + JSON.stringify(rs2));
  // anti-carrera: esperar a que el hijo nuevo SOBRESCRIBA el STOPPED viejo antes de mirar done
  for (let i = 0; i < 60; i++) { await sleep(400); st = await apiJson('/api/run/footer-e2e/state'); if (st.verdict !== 'STOPPED' || st.pending) break; }
  for (let i = 0; i < 150; i++) { await sleep(400); st = await apiJson('/api/run/footer-e2e/state'); if (st.pending) await apiJson('/api/run/footer-e2e/continue', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }); if (st.done && st.verdict !== 'STOPPED') break; }
  if (st.verdict !== 'GREEN') fail('resume no llegó a GREEN: ' + st.verdict);
  const names2 = st.phases.map((p) => p.phase);
  if (!(names2.indexOf('propose') >= 0 && names2.indexOf('propose') < names2.indexOf('apply'))) fail('timeline heredado desordenado: ' + names2.join('>'));
  ok('⏯ RESUME desde la app → GREEN con timeline heredado en orden (adiós follón v1.30)');

  // ── ESCENARIO 3: MICRO RETIRADO (decisión: lanzar = SIEMPRE SDD gobernado) + modo AUTO (sin pausas) ──
  // El cliente envía complexity:'micro' pero el server lo IGNORA y deriva un flujo GOBERNADO (resolvePlan):
  // no hay vía a un run sin spec desde el producto. Verificamos que el run pasa por verify (gobierno) y cierra GREEN.
  // el run anterior (resume) acaba de dar GREEN: su driver puede tardar unos ms/s en soltar el lock y
  // salir (más en máquinas cargadas). busyProject aquí NO es fallo: es el guardarraíl 1-run/repo haciendo
  // su trabajo — reintento acotado, como haría un humano que espera un segundo y vuelve a pulsar.
  let l3 = null;
  for (let i = 0; i < 40; i++) {
    l3 = await apiJson('/api/launch', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ request: 'añade un componente header con título y test', name: 'micro-e2e', complexity: 'micro', auto: true }) });
    if (l3.ok || !l3.busyProject) break;
    await sleep(500);
  }
  if (!l3.ok) fail('launch (micro ignorado): ' + JSON.stringify(l3));
  for (let i = 0; i < 220; i++) { await sleep(400); st = await apiJson('/api/run/micro-e2e/state'); if (st.pending) fail('auto NO debe pausar'); if (st.done) break; }
  if (st.verdict !== 'GREEN') fail('no llegó a GREEN: ' + st.verdict + ' — registro:\n' + (st.logTail || []).join('\n'));
  const names3 = st.phases.map((p) => p.phase);
  if (names3.length <= 1 || !names3.includes('verify')) fail('micro retirado: debe ser un flujo GOBERNADO con verify, no 1 fase: ' + names3.join('>'));
  if (!names3.includes('spec')) fail('micro retirado: el flujo gobernado debe dejar rastro de spec: ' + names3.join('>'));
  ok('🚫 MICRO retirado: el cliente pide micro, el server deriva un flujo SDD gobernado (spec+…+verify) → GREEN');

  // CRUDO del modelo ("lo que verías sin conductor"): el driver persiste el stdout del agente y la web lo sirve (fase apply)
  const mtl = JSON.parse(readFileSync(plumbPath(join(PROJ, 'openspec', 'changes', 'micro-e2e'), 'timeline.json'), 'utf8'));
  const mApply = (mtl.phases || []).find((p) => p.phase === 'apply');
  if (!mApply || !mApply.hasRaw) fail('la fase apply debía marcar hasRaw=true');
  const rawResp = await api('/api/run/micro-e2e/raw?phase=apply');
  if (rawResp.status !== 200 || !rawResp.body.includes('FAKE-MODEL raw')) fail('endpoint raw no devolvió el crudo del modelo: ' + JSON.stringify(rawResp));
  ok('📤 crudo del modelo capturado y servido por /raw (transparencia "qué dice el LLM")');

  console.log('\n# e2e-app: TODO VERDE — el stack v3 completo funciona de punta a punta (offline)');
} finally {
  try { app.kill(); } catch {}
  await sleep(300);
  rmSync(PROJ, { recursive: true, force: true });
}
