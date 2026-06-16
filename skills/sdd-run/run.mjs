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
import { existsSync, readFileSync, statSync } from 'node:fs';
import { spawn } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE = resolve(HERE, '..', '..', 'assets', 'conductor.mjs'); // skills/sdd-run/ -> ../../assets/

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

if (!request) { process.stderr.write('run.mjs: falta --request "..."\n'); process.exit(2); }
if (!existsSync(ENGINE)) { process.stderr.write(`run.mjs: no encuentro el motor en ${ENGINE}\n`); process.exit(2); }

const changeDir = join(project, 'openspec', 'changes', changeName);

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
// ── v3 APP ÚNICA: el run vive como ruta de LA app (127.0.0.1:4750) — una pestaña, siempre la misma.
// Si la app no está levantada, este launcher la levanta (detached) y lanza el run vía su API.
// Fallback (app de OTRO proyecto en el puerto / sin red local): driver directo con --serve (legacy).
const APP = 'http://127.0.0.1:4750';
const ping = async () => { try { const r = await fetch(`${APP}/api/ping`, { signal: AbortSignal.timeout(900) }); return await r.json(); } catch { return null; } };
const launchViaApp = async () => {
  const r = await fetch(`${APP}/api/launch`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ request, name: changeName, complexity, domain, project }), signal: AbortSignal.timeout(3000) });
  const j = await r.json().catch(() => ({}));
  if (j.ok || r.status === 409) {
    // 409 = ya en curso: la URL sigue siendo la verdad (lock anti-duplicado del driver)
    const url = `${APP}${j.url || '/run/' + changeName}`;
    process.stdout.write(`🌐 SIGUE EL RUN EN VIVO: ${url}\n${j.ok ? '' : '(ya había un run en curso para este change — esa misma URL)\n'}`);
    // ABRIR el navegador (la lección: sin esto, el run corre "a ciegas" y parece roto). Opt-out: CONDUCTOR_SERVE_OPEN=0
    if (process.env.CONDUCTOR_SERVE_OPEN !== '0') {
      try {
        const { execSync } = await import('node:child_process');
        const opener = process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
        execSync(opener, { shell: true, stdio: 'ignore', timeout: 5000, windowsHide: true });
      } catch { /* sin navegador → la URL impresa basta */ }
    }
    process.stdout.write('El pipeline corre gestionado por la app de conductor; pausas y aprobaciones se hacen ahí. Este comando termina YA (el run sigue en la app).\n✅ LAUNCHED — task complete for this shell.\n');
    return true;
  }
  return false;
};

const MY_VER = (() => { try { return JSON.parse(readFileSync(resolve(HERE, '..', '..', 'plugin.json'), 'utf8')).version; } catch { return null; } })();
const main = async () => {
  let app = await ping();
  // ZOMBIE tras actualizar: el app vivo es de otra versión → pedirle el relevo y arrancar el nuevo
  if (app?.ok && MY_VER && app.version !== MY_VER) {
    process.stdout.write(`(actualizando la app de conductor ${app.version || 'antigua'} → ${MY_VER})
`);
    try { await fetch(`${APP}/api/shutdown`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(2000) }); } catch {}
    for (let i = 0; i < 10 && app; i++) { await new Promise((r) => setTimeout(r, 300)); app = await ping(); }
  }
  if (!app) {
    // levantar la app (detached, sin abrir navegador — la URL impresa es la entrada)
    spawn(process.execPath, [ENGINE, 'serve', project], { detached: true, stdio: 'ignore', windowsHide: true, env: { ...process.env, CONDUCTOR_SERVE_OPEN: '0' } }).unref();
    for (let i = 0; i < 12 && !app; i++) { await new Promise((r) => setTimeout(r, 500)); app = await ping(); }
  }
  if (app?.ok) {
    if (await launchViaApp()) { process.exit(0); }
  }
  // FALLBACK legacy: driver directo con su propia mini-web (solo si la app no pudo arrancar)
  const args = [ENGINE, 'drive', changeDir, '--request', request, '--src', project, '--complexity', complexity, '--domain', domain];
  if (process.env.CONDUCTOR_SERVE !== '0') args.push('--serve');
  const child = spawn(process.execPath, args, { stdio: 'inherit' });
  child.on('exit', (code) => process.exit(code ?? 1));
  child.on('error', (e) => { process.stderr.write(`run.mjs: ${e.message}\n`); process.exit(2); });
};
main().catch((e) => { process.stderr.write(`run.mjs: ${e.message}\n`); process.exit(2); });
