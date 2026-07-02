// conductor/lib/sdk-runner.mjs — runner del driver sobre el Copilot SDK (sesiones calientes).
//
// Validado por el spike (2026-06-10): SDK v1.0.0 GA ↔ CLI 1.0.60, bucle por fases desde código,
// BYOK por sesión, ~15s/2 fases (vs minutos con spawn-por-fase). Ventaja clave: provider+modelo POR FASE.
//
// OPCIONAL — el engine sigue 0-deps: `@github/copilot-sdk` se importa DINÁMICAMENTE; si no está
// instalado, error claro y el driver usa el runner spawn (default, ya validado). El SDK por defecto
// usa su runtime empaquetado; con COPILOT_CLI_PATH (o cliPath) puede apuntar al copilot global del
// usuario — así, si algún día se shippea, no viajan los ~550MB del CLI duplicado.
//
// Interface: misma que defaultRunAgent de drive.mjs → ({phase, role, prompt, cwd, timeoutMs, model}) ⇒ {code, out|err}
// + .close() para parar el cliente al acabar el run (drive lo llama si existe).
import { createRequire } from 'node:module';
import { decryptSecret } from '../provenance/secret.mjs';
const requireNode = createRequire(import.meta.url);

// localiza el runtime de Copilot del USUARIO (sin shippear los ~557MB): COPILOT_CLI_PATH manda; si no,
// el paquete global @github/copilot (npm root -g). La ruta va en la opción `cliPath` del SDK (si es .js,
// el propio SDK lo lanza con node — verificado en su dist/client.js).
export function resolveCliPath(env = process.env) {
  if (env.COPILOT_CLI_PATH) return env.COPILOT_CLI_PATH;
  try {
    const { execSync } = requireNode('node:child_process');
    const { existsSync, readFileSync } = requireNode('node:fs');
    const { join } = requireNode('node:path');
    const root = execSync('npm root -g', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 8000, windowsHide: true }).trim();
    const pkgDir = join(root, '@github', 'copilot');
    if (!existsSync(pkgDir)) return null;
    const pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
    const entry = pkg.bin && typeof pkg.bin === 'object' ? Object.values(pkg.bin)[0] : pkg.main || 'index.js';
    const p = join(pkgDir, entry);
    return existsSync(p) ? p : null;
  } catch { return null; }
}

// CATÁLOGO REAL sin runtime/auth/JSON-RPC: el paquete @github/copilot (el CLI que el usuario instala
// global) exporta en su subruta `./sdk` las constantes HELP_VISIBLE_MODELS / SUPPORTED_MODELS — la MISMA
// lista que el CLI muestra en su selector de modelos. La leemos en un subproceso node efímero (aísla la
// carga del módulo del CLI del servidor; muere tras imprimir). Devuelve [] si no encuentra el CLI (jamás
// inventa). 'auto' se EXCLUYE a propósito: conductor verifica modelRequested↔modelReported por fase y
// 'auto' (router) rompería ese contraste — el catálogo por fase es de modelos EXPLÍCITOS.
export async function copilotCatalogFromCli(env = process.env) {
  try {
    const cliPath = resolveCliPath(env);
    if (!cliPath) return [];
    const { dirname, join } = requireNode('node:path');
    const { existsSync } = requireNode('node:fs');
    const { execFile } = requireNode('node:child_process');
    const { pathToFileURL } = await import('node:url');
    const cand = [join(dirname(cliPath), 'sdk', 'index.js'), join(dirname(cliPath), '..', 'sdk', 'index.js')];
    // ROBUSTO: resuelve el subpath-export "@github/copilot/sdk" por el mapa de exports del PROPIO paquete (no depende
    // de adivinar dist/sdk/…). Es LA fuente del catálogo (HELP_VISIBLE_MODELS); si el guess de arriba falla, esto acierta.
    try { cand.unshift(createRequire(pathToFileURL(cliPath).href).resolve('@github/copilot/sdk')); } catch {}
    const entry = cand.find((p) => { try { return existsSync(p); } catch { return false; } });
    if (!entry) return [];
    // El CLI cambió de superficie con el tiempo: versiones viejas exportaban las CONSTANTES
    // HELP_VISIBLE_MODELS/SUPPORTED_MODELS (sin auth); versiones nuevas las sustituyeron por funciones
    // async getAvailableModels()/retrieveAvailableModels() (que requieren el token de login de Copilot).
    // Probamos primero las constantes (rápidas, sin auth) y, si no están, la función nueva en best-effort
    // (funciona cuando el proceso hereda un contexto autenticado; si pide auth, devuelve [] sin romper).
    const script = [
      "const e=process.env.__C_SDK_ENTRY;",
      "import(e).then(async m=>{",
      "  const auto=m.AUTO_MODEL_ID; let v=[];",
      "  if(Array.isArray(m.HELP_VISIBLE_MODELS)&&m.HELP_VISIBLE_MODELS.length) v=m.HELP_VISIBLE_MODELS;",
      "  else if(Array.isArray(m.SUPPORTED_MODELS)&&m.SUPPORTED_MODELS.length) v=m.SUPPORTED_MODELS;",
      "  else for(const fn of ['getAvailableModels','retrieveAvailableModels']){",
      "    if(typeof m[fn]!=='function') continue;",
      "    try{ const r=await m[fn](); const arr=Array.isArray(r)?r:(r&&Array.isArray(r.models)?r.models:[]);",
      "      if(arr.length){ v=arr.map(x=>typeof x==='string'?x:(x&&(x.id||x.name))).filter(Boolean); break; } }catch{}",
      "  }",
      // M16: delimitar con sentinel — si el SDK escribe un banner/deprecación a stdout al importarse, el
      // JSON.parse del padre fallaba y el catálogo degradaba a [] en silencio. Ahora se extrae el tramo entre
      // sentinels, ignorando cualquier ruido previo/posterior en stdout.
      "  process.stdout.write('<<CDCT>>'+JSON.stringify((v||[]).filter(x=>x&&x!==auto))+'<<TCDC>>');",
      "}).catch(()=>process.stdout.write('<<CDCT>>[]<<TCDC>>'))",
    ].join('\n');
    const out = await new Promise((res) => {
      try {
        const cp = execFile(process.execPath, ['--input-type=module', '-e', script],
          { env: { ...env, __C_SDK_ENTRY: pathToFileURL(entry).href }, timeout: 15000, windowsHide: true, maxBuffer: 1 << 20 },
          (err, stdout) => res(err ? '[]' : String(stdout || '[]')));
        cp.on?.('error', () => res('[]'));
      } catch { res('[]'); }
    });
    const m = String(out).match(/<<CDCT>>([\s\S]*?)<<TCDC>>/); // extrae SOLO el tramo entre sentinels (ignora banners del SDK)
    const arr = JSON.parse(m ? m[1] : '[]');
    return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string' && x) : [];
  } catch { return []; }
}

export async function createSdkRunner({ projectRoot, sdk, sdkBundle, env = process.env } = {}) {
  let mod = sdk;
  if (!mod && sdkBundle) {
    // 1º: el SDK EMPAQUETADO en el plugin (assets/copilot-sdk.mjs — ~293KB, runtime externo)
    try { const { pathToFileURL } = await import('node:url'); mod = await import(pathToFileURL(sdkBundle).href); } catch {}
  }
  if (!mod) {
    // 2º: instalación normal; 3º: node_modules del CWD (sandbox dev)
    try { mod = await import('@github/copilot-sdk'); }
    catch {
      try {
        const { pathToFileURL } = await import('node:url');
        const req = createRequire(pathToFileURL(process.cwd() + '/noop.js').href);
        mod = await import(pathToFileURL(req.resolve('@github/copilot-sdk')).href);
      } catch { throw new Error('@github/copilot-sdk no está instalado — usa el runner spawn (default) o instala el SDK (dev)'); }
    }
  }
  const { CopilotClient, RuntimeConnection, approveAll } = mod;

  const opts = {};
  if (projectRoot) opts.workingDirectory = projectRoot;
  // runtime del usuario: con el SDK empaquetado, cliPath es OBLIGATORIO (el runtime quedó fuera del
  // bundle). Con SDK instalado normal, su propia resolución basta (no llamamos a npm sin necesidad).
  const cliPath = env.COPILOT_CLI_PATH || (sdkBundle && !sdk ? resolveCliPath(env) : null);
  // connection forStdio({path}): el SDK lanza .js con node el solo (verificado en su dist); no hay opcion cliPath en v1.0
  if (cliPath && RuntimeConnection?.forStdio) opts.connection = RuntimeConnection.forStdio({ path: cliPath });
  else if (sdkBundle && !sdk) throw new Error('no encuentro el runtime de Copilot (global @github/copilot o COPILOT_CLI_PATH) para el SDK empaquetado');
  const client = new CopilotClient(opts);

  // BYOK del SDK: POR SESIÓN (las env COPILOT_PROVIDER_* del CLI no aplican). baseUrl debe llevar /v1.
  // Fallback de credenciales: ~/.conductor/byok.json (fichero del usuario en su HOME).
  let base = (env.CONDUCTOR_MODEL_URL || env.COPILOT_PROVIDER_BASE_URL || '').replace(/\/+$/, '');
  let apiKey = env.CONDUCTOR_API_KEY || env.COPILOT_PROVIDER_API_KEY || '';
  if (!base || !apiKey) {
    try {
      const { readFileSync } = await import('node:fs'); const { homedir } = await import('node:os'); const { join } = await import('node:path');
      // misma resolución que drive.mjs/serve.mjs: honra CONDUCTOR_HOME (override en tests/multi-home) y descifra
      // apiKeyEnc (DPAPI, formato nuevo). Antes: HOME hardcodeado + solo apiKey en claro → rompía BYOK fuente única.
      const home = env.CONDUCTOR_HOME || join(homedir(), '.conductor');
      const j = JSON.parse(readFileSync(join(home, 'byok.json'), 'utf8'));
      const dec = j.apiKey || (j.apiKeyEnc ? decryptSecret(j.apiKeyEnc) : '');
      base = base || String(j.baseUrl || '').replace(/\/+$/, ''); apiKey = apiKey || dec || '';
    } catch {}
  }
  const provider = base && apiKey ? { type: 'openai', baseUrl: base.endsWith('/v1') ? base : base + '/v1', apiKey } : undefined;

  const runAgent = async ({ prompt, timeoutMs = 600000, model }) => {
    try {
      // mezcla por fase: "copilot:<m>" = catálogo Business (sesión SIN provider); "byok:<m>" = LiteLLM.
      let m = model || '', sessProvider = provider;
      if (m.startsWith('copilot:')) { m = m.slice(8).trim(); sessProvider = undefined; }
      else if (m.startsWith('byok:')) m = m.slice(5).trim();
      // hardfail BYOK: una fase "byok:" SIN provider resuelto crearía la sesión contra el catálogo Copilot
      // Business (gasta AI Credits en silencio). Se rechaza con error — el driver lo trata como fallo de fase.
      if ((model || '').startsWith('byok:') && !sessProvider) {
        return { code: -1, err: `fase byok:${m} sin credenciales BYOK (CONDUCTOR_MODEL_URL/CONDUCTOR_API_KEY, COPILOT_PROVIDER_*, o ~/.conductor/byok.json) — no se cae a Copilot Business para no gastar AI Credits` };
      }
      // onPermissionRequest: approveAll = el equivalente del --allow-all-tools del runner spawn (sin él,
      // las peticiones de permiso de tools quedan PENDIENTES y la sesión no escribe ficheros — verificado).
      const session = await client.createSession({
        ...(m ? { model: m } : {}), ...(sessProvider ? { provider: sessProvider } : {}),
        ...(approveAll ? { onPermissionRequest: approveAll } : {}),
      });
      // 2º arg = timeout de sendAndWait (su default interno es 60s — corto para fases de código);
      // el Promise.race queda como cinturón por si el del SDK no dispara.
      const result = await Promise.race([
        session.sendAndWait({ prompt }, timeoutMs),
        new Promise((_, rej) => setTimeout(() => rej(new Error(`sdk timeout tras ${Math.round(timeoutMs / 1000)}s`)), timeoutMs + 5000)),
      ]);
      try { await session.destroy?.(); } catch {}
      return { code: 0, out: String(result?.data?.content ?? '') };
    } catch (e) { return { code: -1, err: e.message }; }
  };
  runAgent.close = async () => { try { await client.stop(); } catch {} };
  runAgent.kind = 'sdk';
  return runAgent;
}

// CATÁLOGO REAL de modelos Copilot: lo que el SDK reporta (client.listModels()), NUNCA una lista inventada.
// Resuelve el SDK como createSdkRunner; si no está disponible o el runtime no arranca, devuelve [] (sin fake,
// nada de seeds). Con timeout para no colgar al llamador. El llamador (serve) lo usa en BACKGROUND + cache.
export async function listCopilotModels({ sdk, sdkBundle, env = process.env, timeoutMs = 12000 } = {}) {
  // 1) PRIMARIA: constantes del CLI instalado (rápida, sin runtime/auth/JSON-RPC, version-matched con el
  // CLI del usuario). Es la lista que el propio Copilot muestra en su selector.
  try { const fast = await copilotCatalogFromCli(env); if (fast.length) return fast; } catch {}
  // 2) FALLBACK: client.listModels() vía JSON-RPC (auth-filtrado) si el SDK cliente está disponible.
  try {
    let mod = sdk;
    if (!mod && sdkBundle) { try { const { pathToFileURL } = await import('node:url'); mod = await import(pathToFileURL(sdkBundle).href); } catch {} }
    if (!mod) { try { mod = await import('@github/copilot-sdk'); } catch {} }
    if (!mod) { try { const { pathToFileURL } = await import('node:url'); const req = createRequire(pathToFileURL(process.cwd() + '/noop.js').href); mod = await import(pathToFileURL(req.resolve('@github/copilot-sdk')).href); } catch {} }
    if (!mod || !mod.CopilotClient) return [];
    const { CopilotClient, RuntimeConnection } = mod;
    const opts = {};
    const cliPath = env.COPILOT_CLI_PATH || (sdkBundle && !sdk ? resolveCliPath(env) : null);
    if (cliPath && RuntimeConnection?.forStdio) opts.connection = RuntimeConnection.forStdio({ path: cliPath });
    const client = new CopilotClient(opts);
    try {
      const models = await Promise.race([
        client.listModels(),
        new Promise((_, rej) => setTimeout(() => rej(new Error('listModels timeout')), timeoutMs)),
      ]);
      return (Array.isArray(models) ? models : []).map((m) => m && (m.id || m.name)).filter(Boolean);
    } finally { try { await client.stop?.(); } catch {} }
  } catch { return []; }
}
