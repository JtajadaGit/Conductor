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
      const j = JSON.parse(readFileSync(join(homedir(), '.conductor', 'byok.json'), 'utf8'));
      base = base || String(j.baseUrl || '').replace(/\/+$/, ''); apiKey = apiKey || j.apiKey || '';
    } catch {}
  }
  const provider = base && apiKey ? { type: 'openai', baseUrl: base.endsWith('/v1') ? base : base + '/v1', apiKey } : undefined;

  const runAgent = async ({ prompt, timeoutMs = 600000, model }) => {
    try {
      // mezcla por fase: "copilot:<m>" = catálogo Business (sesión SIN provider); "byok:<m>" = LiteLLM.
      let m = model || '', sessProvider = provider;
      if (m.startsWith('copilot:')) { m = m.slice(8).trim(); sessProvider = undefined; }
      else if (m.startsWith('byok:')) m = m.slice(5).trim();
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
