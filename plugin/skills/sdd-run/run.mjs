#!/usr/bin/env node
// conductor /sdd-run launcher. Copilot runs THIS file "from the skill's base directory" (a supported
// skill capability), so the shell inherits Copilot's env — including the user's BYOK model config
// (COPILOT_PROVIDER_BASE_URL/_API_KEY/COPILOT_MODEL). It then runs the bundled deterministic driver,
// which the MCP server itself cannot do in Copilot CLI (plugin MCP servers get only PATH, no sampling).
//
// Path safety: the engine bundle is resolved RELATIVE to this launcher's real location (via import.meta.url),
// never hardcoded — so it works wherever the plugin is installed. Skill markdown references only this
// in-skill script by its base dir, never a plugin path.
//
// Usage (the skill tells Copilot to invoke it):
//   node <skill>/run.mjs --request "..." --project "<abs project root>" [--complexity simple|medium|complex] [--domain noun] [--name kebab]
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync, statSync, mkdirSync, appendFileSync, openSync } from 'node:fs';
import { spawn, execSync, execFileSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE = resolve(HERE, '..', '..', '..', 'assets', 'conductor.mjs'); // plugin/skills/sdd-run/ -> ../../../assets/

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
// inmune al quoting del agente: si las comillas se pierden, --request llega como palabras sueltas →
// reconstruimos uniendo todo hasta el siguiente --flag (visto en runtime: "añade un componente..." → "añade")
const flagMulti = (n) => { const i = argv.indexOf(n); if (i < 0) return undefined; const out = []; for (let j = i + 1; j < argv.length && !argv[j].startsWith('--'); j++) out.push(argv[j]); return out.length ? out.join(' ') : undefined; };
// naming SDD robusto: normaliza acentos/ñ (NFD) y, como fallback si el agente no pasa --name/--domain,
// deriva un nombre de feature corto quitando palabras vacías ("añade un componente Counter con botones
// y un test" → name "counter-botones", domain "counter") — nunca el slug crudo de la frase entera.
const deaccent = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const slug = (s) => deaccent(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
const STOP = new Set(['anade', 'agrega', 'crea', 'haz', 'implementa', 'pon', 'quiero', 'necesito', 'un', 'una', 'unos', 'unas', 'el', 'la', 'los', 'las', 'de', 'del', 'al', 'con', 'y', 'o', 'u', 'para', 'por', 'que', 'en', 'a', 'mas', 'add', 'create', 'make', 'implement', 'an', 'the', 'with', 'and', 'or', 'for', 'to', 'of', 'new', 'nuevo', 'nueva', 'componente', 'component', 'modulo', 'module', 'test', 'tests', 'its']);
const meaningful = (s) => deaccent(s).toLowerCase().split(/[^a-z0-9]+/i).filter((w) => w && !STOP.has(w));
const featureName = (req) => { const w = meaningful(req); return w.length ? w.slice(0, 4).join('-').slice(0, 48) : slug(req); };

const request = flagMulti('--request');
const project = resolve(flag('--project', process.cwd()));
const complexity = flag('--complexity', 'medium');
const changeName = slug(flag('--name') || '') || featureName(request);
const domain = slug(flag('--domain') || '') || meaningful(request)[0] || 'core';
const auto = argv.includes('--auto'); // run desatendido: sin pausas de revisión (el driver corre de principio a fin)

const OPEN_ONLY = !request; // sin petición → /sdd-run solo ABRE la web (modo Storybook): escribes y lanzas en el panel
if (!existsSync(ENGINE)) { process.stderr.write(`run.mjs: no encuentro el motor en ${ENGINE}\n`); process.exit(2); }

const changeDir = join(project, 'openspec', 'changes', changeName);

// DIAGNOSABILIDAD (launcher-diagnostic-chain): el arranque encadena ping→spawn→re-ping→fallback. Antes
// era SILENCIOSO: si algo fallaba, el usuario veía "fallback" mudo o nada → percepción de "no funciona".
// Ahora cada transición se loguea a stdout y a .conductor/launcher.log (post-mortem del arranque).
const launchLog = join(changeDir, '.conductor', 'launcher.log');
const llog = (m) => {
  const line = `[${new Date().toISOString().slice(11, 19)}] ${m}`;
  process.stdout.write(line + '\n');
  try { mkdirSync(dirname(launchLog), { recursive: true }); appendFileSync(launchLog, line + '\n'); } catch {}
};

// ANTI-RELANZAMIENTO (por código, no por prompt): si el run fue DETENIDO por el usuario hace <90s,
// el launcher se niega a rearrancar — reanudar es decisión humana (o pasar --resume si lo pidió él).
try {
  const tlp = join(changeDir, '.conductor', 'timeline.json');
  const tl = JSON.parse(readFileSync(tlp, 'utf8'));
  if (tl.verdict === 'STOPPED' && Date.now() - statSync(tlp).mtimeMs < 90000 && !argv.includes('--resume')) {
    // exit 0: para Autopilot esto es un cierre CORRECTO (un código de error le haría "arreglarlo" relanzando)
    process.stdout.write('✅ TASK COMPLETE — el run fue detenido por el usuario hace un momento; nada que hacer. Reanudar es decisión del usuario (más tarde, o --resume si lo pide explícitamente).\n');
    process.exit(0);
  }
} catch {}

// PRE-FLIGHT (preflight-doctor-on-launch): el agente anfitrión (Copilot CLI por defecto) debe existir.
// Sin él, el driver aborta de forma SILENCIOSA en la ruta app (proceso detached) y el usuario no sabe
// por qué "no funciona". Fail-fast con mensaje claro. Salta el check con CONDUCTOR_SKIP_PREFLIGHT=1.
const agentCmd = process.env.CONDUCTOR_AGENT_CMD || 'copilot';
if (!OPEN_ONLY && process.env.CONDUCTOR_SKIP_PREFLIGHT !== '1') {
  const hasSep = agentCmd.includes('/') || agentCmd.includes('\\');
  const onPath = hasSep
    ? existsSync(agentCmd)
    // M19: argv SIN shell — un CONDUCTOR_AGENT_CMD='x & mkdir pwn' inyectaba comandos vía `where ${cmd}`
    // con shell:true. execFileSync pasa agentCmd como ARGUMENTO literal de where/which (cero interpolación).
    : (() => { try { execFileSync(process.platform === 'win32' ? 'where' : 'which', [agentCmd], { stdio: 'ignore', timeout: 4000, windowsHide: true }); return true; } catch { return false; } })();
  if (!onPath) {
    llog(`✋ PRE-FLIGHT: el agente '${agentCmd}' no está en el PATH. conductor lanza el agente anfitrión por fase y sin él no puede trabajar.`);
    process.stderr.write(`Instala GitHub Copilot CLI (o exporta CONDUCTOR_AGENT_CMD=<ruta al binario>) y reintenta.\n(Si sabes lo que haces, salta este check con CONDUCTOR_SKIP_PREFLIGHT=1.)\n`);
    process.exit(2);
  }
}
// ── v3 APP ÚNICA: el run vive como ruta de LA app (127.0.0.1:4750) — una pestaña, siempre la misma.
// Si la app no está levantada, este launcher la levanta (detached) y lanza el run vía su API.
// Fallback (app de OTRO proyecto en el puerto / sin red local): driver directo con --serve (legacy).
const APP = 'http://127.0.0.1:4750';
const ping = async () => { try { const r = await fetch(`${APP}/api/ping`, { signal: AbortSignal.timeout(2500) }); return await r.json(); } catch { return null; } };
const launchViaApp = async () => {
  const r = await fetch(`${APP}/api/launch`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ request, name: changeName, complexity, domain, project, auto }), signal: AbortSignal.timeout(3000) });
  const j = await r.json().catch(() => ({}));
  if (j.ok || r.status === 409) {
    // 409 = ya en curso: la URL sigue siendo la verdad (lock anti-duplicado del driver)
    const url = `${APP}${j.url || '/run/' + changeName}`;
    process.stdout.write(`🌐 SIGUE EL RUN EN VIVO: ${url}\n${j.ok ? '' : '(ya había un run en curso para este change — esa misma URL)\n'}`);
    // ABRIR el navegador (la lección: sin esto, el run corre "a ciegas" y parece roto). Opt-out: CONDUCTOR_SERVE_OPEN=0.
    // browser-open-failure-surfaced: en entorno sin escritorio (headless Linux) o si el opener FALLA
    // (WSL/SSH/contenedor), NO tragamos el error en silencio — imprimimos la URL con instrucción clara.
    if (process.env.CONDUCTOR_SERVE_OPEN !== '0') {
      const noDisplay = process.platform === 'linux' && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY && !process.env.WSL_INTEROP;
      if (noDisplay) {
        process.stdout.write(`ℹ️ Entorno sin escritorio: no abro el navegador. Ábrelo manualmente: ${url}\n`);
      } else {
        try {
          const opener = process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
          execSync(opener, { shell: true, stdio: 'ignore', timeout: 5000, windowsHide: true });
        } catch { process.stdout.write(`ℹ️ No pude abrir el navegador automáticamente. Ábrelo manualmente: ${url}\n`); }
      }
    }
    process.stdout.write('El pipeline corre gestionado por la app de conductor; pausas y aprobaciones se hacen ahí. Este comando termina YA (el run sigue en la app).\n✅ LAUNCHED — task complete for this shell.\n');
    return true;
  }
  return false;
};

// abre el navegador en una URL (opt-out CONDUCTOR_SERVE_OPEN=0; degradación clara en headless/WSL)
const openUrl = (url) => {
  if (process.env.CONDUCTOR_SERVE_OPEN === '0') return;
  const noDisplay = process.platform === 'linux' && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY && !process.env.WSL_INTEROP;
  if (noDisplay) { process.stdout.write(`ℹ️ Entorno sin escritorio: ábrelo manualmente: ${url}\n`); return; }
  try { const opener = process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`; execSync(opener, { shell: true, stdio: 'ignore', timeout: 5000, windowsHide: true }); }
  catch { process.stdout.write(`ℹ️ No pude abrir el navegador. Ábrelo manualmente: ${url}\n`); }
};

const MY_VER = (() => { try { return JSON.parse(readFileSync(resolve(HERE, '..', '..', '..', 'plugin.json'), 'utf8')).version; } catch { return null; } })();
const main = async () => {
  if (OPEN_ONLY) {
    // modo STORYBOOK: sin feature, solo abrimos la web. El usuario escribe y pulsa "Lanzar run" en el panel.
    let app = await ping();
    if (!app?.ok) {
      process.stdout.write('la app no está viva → levantándola…\n');
      spawn(process.execPath, [ENGINE, 'serve', project], { detached: true, stdio: 'ignore', windowsHide: true, env: { ...process.env, CONDUCTOR_SERVE_OPEN: '0', CONDUCTOR_UI_STATIC: '1' } }).unref();
      for (let i = 0; i < 14 && !app?.ok; i++) { await new Promise((r) => setTimeout(r, 500)); app = await ping(); }
    }
    if (!app?.ok) { process.stderr.write('No pude abrir la app (¿puerto 4750 ocupado por otra cosa?).\n'); process.exit(1); }
    openUrl(APP);
    process.stdout.write(`🌐 conductor abierto: ${APP}\nEscribe tu feature y pulsa "Lanzar run" ahí — sin pasar por el chat.\n✅ LAUNCHED — task complete for this shell.\n`);
    process.exit(0);
  }
  llog(`comprobando si la app ya está viva en ${APP} …`);
  let app = await ping();
  // ZOMBIE tras actualizar: el app vivo es de otra versión → pedirle el relevo y arrancar el nuevo
  if (app?.ok && MY_VER && app.version !== MY_VER) {
    llog(`app v${app.version || 'antigua'} ≠ v${MY_VER} → pidiendo relevo y rearranque`);
    try { await fetch(`${APP}/api/shutdown`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(2000) }); } catch {}
    for (let i = 0; i < 10 && app; i++) { await new Promise((r) => setTimeout(r, 300)); app = await ping(); }
  } else if (app?.ok) {
    llog(`app ya viva (v${app.version || '?'})`);
  }
  if (!app) {
    llog('la app no responde → levantándola (detached); su salida va a launcher.log');
    // levantar la app (detached). Capturamos su stdout/stderr a launcher.log: si el arranque falla
    // (puerto, error de JS, bundle stale), el motivo queda registrado en vez de perderse (stdio:'ignore').
    let outFd = null; try { mkdirSync(dirname(launchLog), { recursive: true }); outFd = openSync(launchLog, 'a'); } catch {}
    const stdio = outFd != null ? ['ignore', outFd, outFd] : 'ignore';
    spawn(process.execPath, [ENGINE, 'serve', project], { detached: true, stdio, windowsHide: true, env: { ...process.env, CONDUCTOR_SERVE_OPEN: '0', CONDUCTOR_UI_STATIC: '1' } }).unref();
    let tries = 0;
    for (let i = 0; i < 12 && !app; i++) { tries++; await new Promise((r) => setTimeout(r, 500)); app = await ping(); }
    if (app?.ok) llog(`app levantada tras ~${(tries * 0.5).toFixed(1)}s`);
    else llog(`la app NO respondió tras ~${(tries * 0.5).toFixed(1)}s de arranque (revisa ${launchLog}: ¿puerto 4750 ocupado por otra app? ¿error en el bundle?)`);
  }
  if (app?.ok) {
    if (await launchViaApp()) { llog('ruta usada: APP (el run vive en la app)'); process.exit(0); }
    // la app está viva pero rechazó el launch (ni ok ni 409) → fallo CLARO, nunca una vía paralela
    llog('✋ la app está viva pero /api/launch no aceptó el run.');
    process.stderr.write(`La app de conductor (${APP}) rechazó el lanzamiento.\nDiagnóstico: ${launchLog}\n`);
    process.exit(1);
  }
  // ── UN SOLO PUNTO DE ENTRADA ──────────────────────────────────────────────────────────────────────
  // Todo el gobierno vive en la app :4750 (una pestaña, siempre la misma). Si la app no pudo arrancar NO
  // levantamos una segunda mini-web (el viejo fallback `drive --serve` confundía y rompía "un solo punto
  // de entrada"): fallamos con diagnóstico accionable. El motivo del fallo está en launcher.log.
  llog(`✋ no pude usar la app en ${APP}. conductor se gobierna SIEMPRE desde ahí; no hay vía alternativa.`);
  process.stderr.write(`No se pudo arrancar la app de conductor en ${APP}.\nDiagnóstico: ${launchLog}\nComprueba que el puerto 4750 esté libre (o ciérrala: conductor stop) y reintenta /sdd-run.\n`);
  process.exit(1);
};
main().catch((e) => { process.stderr.write(`run.mjs: ${e.message}\n`); process.exit(2); });
