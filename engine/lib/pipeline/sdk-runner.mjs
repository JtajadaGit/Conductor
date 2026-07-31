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
import { decryptSecret, byokFile, isTemplateCreds } from '../provenance/secret.mjs';
const requireNode = createRequire(import.meta.url);

// localiza el runtime de Copilot del USUARIO (sin shippear los ~557MB): COPILOT_CLI_PATH manda; si no,
// el paquete global @github/copilot (npm root -g). La ruta va en la opción `cliPath` del SDK (si es .js,
// el propio SDK lo lanza con node — verificado en su dist/client.js).
// MEMO por-proceso: `npm root -g` es un execSync que BLOQUEA el event loop hasta 8s (aun disparado desde el
// refresco de catálogo en background). El path del CLI global no cambia en la vida del proceso → se resuelve UNA
// SDK del CLI AUTO-ACTUALIZADO (la fuente del catálogo REAL): el binario npm es solo un lanzador; el CLI
// de verdad vive versionado en su dir de paquetes y se actualiza solo. Elegimos la versión MÁS ALTA presente
// (comparación numérica por tramos, no lexicográfica: 1.0.100 > 1.0.70). Puro y exportado para test.
export function pickHighestVersionDir(names = []) {
  const vs = (names || []).filter((n) => /^\d+(\.\d+)*$/.test(String(n)));
  if (!vs.length) return null;
  return vs.sort((a, b) => {
    const A = a.split('.').map(Number), B = b.split('.').map(Number);
    for (let i = 0; i < Math.max(A.length, B.length); i++) { const d = (A[i] || 0) - (B[i] || 0); if (d) return d; }
    return 0;
  }).pop();
}

export function autoUpdatedSdkEntry(env = process.env) {
  try {
    const { existsSync, readdirSync } = requireNode('node:fs');
    const { join } = requireNode('node:path');
    const { homedir } = requireNode('node:os');
    const bases = [];
    if (env.LOCALAPPDATA) bases.push(join(env.LOCALAPPDATA, 'copilot', 'pkg'));
    bases.push(join(homedir(), '.local', 'share', 'copilot', 'pkg'));           // posix XDG
    bases.push(join(homedir(), 'Library', 'Application Support', 'copilot', 'pkg')); // macOS
    for (const base of bases) {
      if (!existsSync(base)) continue;
      for (const plat of readdirSync(base)) {
        const platDir = join(base, plat);
        let vers = []; try { vers = readdirSync(platDir); } catch { continue; }
        const v = pickHighestVersionDir(vers);
        if (!v) continue;
        const entry = join(platDir, v, 'sdk', 'index.js');
        if (existsSync(entry)) return entry;
      }
    }
  } catch { /* sin CLI auto-actualizado: caer a las otras vías */ }
  return null;
}

// vez (el server es largo → antes se congelaba cada ~10 min). undefined = sin computar; el env override no memoiza.
let _cliPathMemo;
export function resolveCliPath(env = process.env) {
  if (env.COPILOT_CLI_PATH) return env.COPILOT_CLI_PATH;
  if (_cliPathMemo !== undefined) return _cliPathMemo;
  try {
    const { execSync } = requireNode('node:child_process');
    const { existsSync, readFileSync } = requireNode('node:fs');
    const { join } = requireNode('node:path');
    const root = execSync('npm root -g', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 8000, windowsHide: true }).trim();
    const pkgDir = join(root, '@github', 'copilot');
    if (!existsSync(pkgDir)) return (_cliPathMemo = null);
    const pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
    const entry = pkg.bin && typeof pkg.bin === 'object' ? Object.values(pkg.bin)[0] : pkg.main || 'index.js';
    const p = join(pkgDir, entry);
    return (_cliPathMemo = existsSync(p) ? p : null);
  } catch { return (_cliPathMemo = null); }
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
    // el CLI real AUTO-ACTUALIZADO manda: su SDK conoce el catálogo del picker de HOY (el del npm-global
    // envejece y FILTRA modelos nuevos — bug real: 7 vs 21 modelos con el mismo token)
    const auto = autoUpdatedSdkEntry(env);
    if (auto) cand.unshift(auto);
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
    // Las versiones NUEVAS del CLI eliminaron las constantes HELP_VISIBLE_MODELS/SUPPORTED_MODELS y exponen
    // getAvailableModels(authInfo) — que EXIGE un objeto de auth (type ∈ user|gh-cli|copilot-api-token|env|token|
    // api-key|hmac). Antes se llamaba SIN argumento → SIEMPRE throw ("copilotUser in undefined") → catálogo vacío
    // → caída silenciosa a "observados" (el bug "lista de modelos falsa"). Ahora: constantes primero (CLIs viejos)
    // y, si no, getAvailableModels() probando los tipos de auth que resuelven credencial ambiental, en un
    // subproceso que HEREDA el env (donde el contexto autenticado existe, devuelve el catálogo REAL completo).
    const script = [
      "const e=process.env.__C_SDK_ENTRY;",
      "import(e).then(async m=>{",
      "  const auto=m.AUTO_MODEL_ID; let v=[];",
      "  const pick=r=>Array.isArray(r)?r:(r&&Array.isArray(r.models)?r.models:[]);",
      // ORDEN: getAvailableModels PRIMERO — es el catálogo del SEAT real (filtrado por licencia) y trae la
      // FICHA completa por modelo (nombre, vendor, categoría de precio, límites). Las constantes
      // HELP_VISIBLE_MODELS/SUPPORTED_MODELS son strings pelados sin filtrar → solo red de seguridad.
      "  if(typeof m.getAvailableModels==='function'){",
      // token del ENTORNO primero (vía limpia, sin parsear el almacén del CLI): setups Copilot Business suelen
      // exportar COPILOT_API_TOKEN/COPILOT_GITHUB_TOKEN → con {type:'token'} devuelve el CATÁLOGO REAL completo.
      "    let tok=process.env.COPILOT_API_TOKEN||process.env.COPILOT_GITHUB_TOKEN||process.env.GH_COPILOT_TOKEN||'';",
      // sin token en env → gh auth token: la MISMA credencial que ya usa la tarjeta AIC (ghUsage). En CLIs
      // nuevos (getAvailableModels con auth) es la vía que SÍ resuelve desde un proceso externo (verificado
      // en máquina real: type user/gh-cli/env fallan todos, type token con el token de gh devuelve el catálogo).
      "    if(!tok){try{const{execSync}=await import('node:child_process');tok=String(execSync('gh auth token',{windowsHide:true,timeout:8000,stdio:['ignore','pipe','ignore']})||'').trim();}catch{}}",
      "    const auths=tok?[{type:'token',host:'https://github.com',token:tok}]:[];",
      "    auths.push({type:'user'},{type:'gh-cli'},{type:'copilot-api-token'},{type:'env'});",
      "    for(const ai of auths){",
      "      try{ const got=pick(await m.getAvailableModels(ai)); if(got.length){ v=got; break; } }catch{}",
      "    }",
      "  }",
      "  if(!v.length&&Array.isArray(m.HELP_VISIBLE_MODELS)&&m.HELP_VISIBLE_MODELS.length) v=m.HELP_VISIBLE_MODELS;",
      "  if(!v.length&&Array.isArray(m.SUPPORTED_MODELS)&&m.SUPPORTED_MODELS.length) v=m.SUPPORTED_MODELS;",
      // M16: delimitar con sentinel — si el SDK escribe un banner/deprecación a stdout al importarse, el
      // JSON.parse del padre fallaba y el catálogo degradaba a [] en silencio. Ahora se extrae el tramo entre
      // sentinels, ignorando cualquier ruido previo/posterior en stdout.
      // METADATA por modelo, la MISMA que usa el picker oficial: nombre display, vendor (agrupación real),
      // model_picker_price_category (low/medium/high — la moneda en AI credits), contexto y tope de salida.
      // CLIs viejos daban strings → quedan como {id} pelado; nada se inventa.
      "  const norm=x=>{if(typeof x==='string')return {id:x};if(!x)return null;const L=(x.capabilities&&x.capabilities.limits)||{};const o={id:x.id||x.name};if(!o.id)return null;",
      "    if(typeof x.name==='string'&&x.name&&x.name!==o.id)o.name=x.name;if(typeof x.vendor==='string'&&x.vendor)o.vendor=x.vendor;",
      "    if(typeof x.model_picker_price_category==='string'&&x.model_picker_price_category)o.cat=x.model_picker_price_category;",
      "    if(Number(L.max_context_window_tokens)>0)o.ctx=Number(L.max_context_window_tokens);if(Number(L.max_output_tokens)>0)o.out=Number(L.max_output_tokens);",
      "    if(x.preview===true)o.preview=true;return o;};",
      "  process.stdout.write('<<CDCT>>'+JSON.stringify((v||[]).map(norm).filter(x=>x&&x.id&&x.id!==auto))+'<<TCDC>>');",
      "}).catch(()=>process.stdout.write('<<CDCT>>[]<<TCDC>>'))",
    ].join('\n');
    const out = await new Promise((res) => {
      try {
        const cp = execFile(process.execPath, ['--input-type=module', '-e', script],
          // 30s, no 15: en máquina real el SDK tarda ~8s SOLO en importarse + ~3s gh + ~3s getAvailableModels
          // (≈14s justos) — con 15s moría EN EL LÍMITE y el catálogo degradaba a "observados" para siempre.
          // Corre en BACKGROUND (serve no bloquea el panel), así que el margen extra no cuesta UX.
          { env: { ...env, __C_SDK_ENTRY: pathToFileURL(entry).href }, timeout: 30000, windowsHide: true, maxBuffer: 1 << 20 },
          (err, stdout) => res(err ? '[]' : String(stdout || '[]')));
        cp.on?.('error', () => res('[]'));
      } catch { res('[]'); }
    });
    const m = String(out).match(/<<CDCT>>([\s\S]*?)<<TCDC>>/); // extrae SOLO el tramo entre sentinels (ignora banners del SDK)
    const arr = JSON.parse(m ? m[1] : '[]');
    // entradas = OBJETOS {id, name?, vendor?, cat?, ctx?, out?, preview?} — la metadata viaja CON el id
    return Array.isArray(arr) ? arr.filter((x) => x && typeof x === 'object' && typeof x.id === 'string' && x.id) : [];
  } catch { return []; }
}

// RECIBO DE CIERRE → tokens de la fase. Al desconectar, la sesión emite "session.shutdown" con el usage
// REAL por modelo. Es la fuente de tokens del runner sdk: el export OTel del CLI NO aplica aquí (ese
// runtime lo lanza el SDK, no nosotros, así que nadie honra COPILOT_OTEL_FILE_EXPORTER_PATH). Una sesión
// por fase ⇒ la atribución fase↔tokens es exacta, sin repartir por ventanas de tiempo.
// Devuelve la MISMA forma que readTokens() de drive.mjs para que el driver no distinga la procedencia.
// Puro y exportado para test (sin red, sin SDK).
export function usageFromShutdown(data) {
  if (!data || typeof data !== 'object') return null;
  let tin = 0, tout = 0, tread = 0;
  const models = [];
  for (const [id, m] of Object.entries(data.modelMetrics || {})) {
    const u = (m && m.usage) || {};
    const i = Number(u.inputTokens) || 0, o = Number(u.outputTokens) || 0;
    tin += i; tout += o; tread += Number(u.cacheReadTokens) || 0;
    if (i || o) models.push(id);
  }
  // CONVENIO de conductor (igual que el lector OTel): `in` y `cached` son DISJUNTOS y suman el input total.
  // El SDK reporta inputTokens INCLUYENDO lo servido desde caché → se resta, o la caché se cobraría 2 veces.
  const inNet = Math.max(0, tin - tread);
  const model = (typeof data.currentModel === 'string' && data.currentModel) || models[0] || null;
  return (inNet || tout || tread || model) ? { in: inNet, out: tout, cached: tread, model } : null;
}

// PERMISOS POR ROL — paridad con `--allow-tool write` / `--allow-all-tools` del runner spawn.
// `approveAll` aprobaba TODO en TODAS las fases: con --runner sdk, explore/propose/spec/verify corrían con
// shell, red y MCP auto-aprobados. Como los prompts inyectan contenido del repo (specs, AGENTS.md), eso
// convertía una inyección en ejecución de comandos durante una fase que solo debía escribir un .md.
// Kinds que emite el SDK: shell | write | read | mcp | url | memory | custom-tool | hook | extension-*.
// Decisión: { kind:'approve-once' } (lo mismo que devuelve su `approveAll`) o { kind:'reject', feedback }.
// Puro y exportado para test.
const ALLOW_KINDS = { write: new Set(['write', 'read']) }; // 'all' = sin restricción (el coder necesita shell)
export function permissionHandlerFor(allow) {
  if (allow === 'all') return () => ({ kind: 'approve-once' });
  const ok = ALLOW_KINDS[allow] || ALLOW_KINDS.write; // allowlist desconocida → la MÁS restrictiva, nunca abrir
  return (req) => {
    const k = req && req.kind;
    return ok.has(k)
      ? { kind: 'approve-once' }
      : { kind: 'reject', feedback: `permiso "${k}" denegado: esta fase solo puede escribir su artefacto (allowlist "${allow}")` };
  };
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
      const j = JSON.parse(readFileSync(byokFile(home), 'utf8'));
      if (isTemplateCreds(j)) throw new Error('plantilla'); // sin rellenar ≠ credenciales (cae al catch)
      const dec = j.apiKey || (j.apiKeyEnc ? decryptSecret(j.apiKeyEnc) : '');
      base = base || String(j.baseUrl || '').replace(/\/+$/, ''); apiKey = apiKey || dec || '';
    } catch {}
  }
  const provider = base && apiKey ? { type: 'openai', baseUrl: base.endsWith('/v1') ? base : base + '/v1', apiKey } : undefined;

  const runAgent = async ({ prompt, timeoutMs = 600000, model, allow = 'all', stopSignal, onActivity }) => {
    let session = null, unsub = null, shutdownData = null, shutdownSeen = null, stopPoll = null;
    // ABORTO del turno en vuelo. El spawn mata el proceso con taskkill; aquí es `session.abort()`, que la
    // propia doc del SDK describe como "aborta el mensaje en curso; la sesión sigue válida".
    const abortNow = async () => { try { if (session && typeof session.abort === 'function') await session.abort(); } catch {} };
    // Cierra la sesión y espera su recibo. OJO: `destroy()` NO EXISTE en el SDK (v1.0: el método es
    // `disconnect()`) — el `session.destroy?.()` anterior era un no-op silencioso por el `?.`, así que
    // ninguna sesión se cerraba hasta el client.stop() final y el recibo no llegaba nunca.
    // Best-effort y ACOTADO: ni el disconnect ni la espera del evento pueden colgar al driver.
    const closeAndUsage = async () => {
      if (stopPoll) { clearInterval(stopPoll); stopPoll = null; }
      if (!session) return null;
      const s = session; session = null;
      try { if (typeof s.disconnect === 'function') await Promise.race([s.disconnect(), new Promise((r) => setTimeout(r, 3000))]); } catch {}
      // gracia corta: el recibo se emite durante el teardown, así que si no llegó ya, no va a llegar
      try { await Promise.race([shutdownSeen, new Promise((r) => setTimeout(r, 1500))]); } catch {}
      try { unsub?.(); } catch {}
      return usageFromShutdown(shutdownData);
    };
    try {
      // mezcla por fase: "copilot:<m>" = catálogo Business (sesión SIN provider); "byok:<m>" = LiteLLM.
      let m = model || '', sessProvider = provider;
      if (m.startsWith('copilot:')) { m = m.slice(8).trim(); sessProvider = undefined; }
      else if (m.startsWith('byok:')) m = m.slice(5).trim();
      else if (m.startsWith('litellm:')) m = m.slice(8).trim();
      // hardfail BYOK: una fase "byok:/litellm:" SIN provider resuelto crearía la sesión contra el catálogo
      // Copilot Business (gasta AI Credits en silencio). Se rechaza — el driver lo trata como fallo de fase.
      if (/^(byok|litellm):/.test(model || '') && !sessProvider) {
        return { code: -1, err: `fase ${model} sin credenciales LiteLLM (CONDUCTOR_MODEL_URL/CONDUCTOR_API_KEY, COPILOT_PROVIDER_*, o ~/.conductor/litellm.json) — no se cae a Copilot Business para no gastar AI Credits` };
      }
      // onPermissionRequest es OBLIGATORIO: sin handler, las peticiones de permiso quedan PENDIENTES y la
      // sesión no escribe nada (verificado). Antes iba `approveAll` fijo; ahora la allowlist del ROL, que
      // resuelve el driver (resolveAllow) y es la MISMA que traduce el spawn a flags del CLI.
      session = await client.createSession({
        ...(m ? { model: m } : {}), ...(sessProvider ? { provider: sessProvider } : {}),
        onPermissionRequest: permissionHandlerFor(allow),
      });
      // la suscripción se arma ANTES de enviar: el recibo es asíncrono y si se registra después se pierde.
      // De paso alimenta la ACTIVIDAD EN VIVO: con spawn sale de events.jsonl, que en sdk no existe — sin
      // esto la barra del run era solo un reloj y no se distinguía "trabajando" de "colgado".
      if (typeof session.on === 'function') shutdownSeen = new Promise((res) => {
        unsub = session.on((e) => {
          if (!e) return;
          if (e.type === 'session.shutdown') { shutdownData = e.data; res(); }
          else if (onActivity && e.type === 'tool.execution_start') { try { onActivity(String(e.data?.toolName || e.data?.name || 'tool')); } catch {} }
        });
      });
      // STOP del usuario: sin esto el botón Detener no hacía NADA con --runner sdk (el driver solo mira
      // stopSignal DESPUÉS de que la promesa resuelva) y el run seguía quemando tokens hasta el timeout.
      if (stopSignal) stopPoll = setInterval(() => { if (stopSignal.requested) { clearInterval(stopPoll); stopPoll = null; void abortNow(); } }, 1000);
      // 2º arg = timeout de sendAndWait (su default interno es 60s — corto para fases de código);
      // el Promise.race queda como cinturón por si el del SDK no dispara.
      const result = await Promise.race([
        session.sendAndWait({ prompt }, timeoutMs),
        new Promise((_, rej) => setTimeout(() => rej(new Error(`sdk timeout tras ${Math.round(timeoutMs / 1000)}s`)), timeoutMs + 5000)),
      ]);
      const usage = await closeAndUsage();
      return { code: 0, out: String(result?.data?.content ?? ''), ...(usage ? { usage } : {}) };
    } catch (e) {
      // ABORTAR ANTES DE NADA. El timeout de `sendAndWait` NO detiene el trabajo en vuelo — su propia doc
      // lo dice: "does not abort in-flight agent work". Sin este abort, tras un timeout de apply el driver
      // lanzaba el reintento mientras la sesión anterior SEGUÍA escribiendo los mismos ficheros: dos
      // agentes en el mismo árbol, con checkpoint y rollback calculados sobre suelo que se movía.
      await abortNow();
      // una fase caída (timeout, error del proveedor) TAMBIÉN gastó tokens: se cobran igual o el
      // presupuesto duro y el coste del run se quedarían cortos justo en los runs que peor van.
      const usage = await closeAndUsage();
      return { code: -1, err: e.message, ...(usage ? { usage } : {}) };
    }
  };
  runAgent.close = async () => { try { await client.stop(); } catch {} };
  runAgent.kind = 'sdk';
  return runAgent;
}

// CATÁLOGO REAL de modelos Copilot: lo que el SDK reporta (client.listModels()), NUNCA una lista inventada.
// Resuelve el SDK como createSdkRunner; si no está disponible o el runtime no arranca, devuelve [] (sin fake,
// nada de seeds). Con timeout para no colgar al llamador. El llamador (serve) lo usa en BACKGROUND + cache.
export async function listCopilotCatalog({ sdk, sdkBundle, env = process.env, timeoutMs = 12000 } = {}) {
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
      return (Array.isArray(models) ? models : []).map((m) => { const id = m && (m.id || m.name); return id ? { id, ...(m.name && m.id && m.name !== m.id ? { name: m.name } : {}) } : null; }).filter(Boolean);
    } finally { try { await client.stop?.(); } catch {} }
  } catch { return []; }
}

// compat: SOLO los ids (string[]) — la vista clásica para quien no necesita la metadata.
export async function listCopilotModels(opts = {}) {
  return (await listCopilotCatalog(opts)).map((o) => o.id);
}
