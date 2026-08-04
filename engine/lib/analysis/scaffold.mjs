// conductor/lib/scaffold.mjs — genera la config de usuario (openspec/conductor.json) + su JSON Schema
// (autocompletado/validación en el editor — developer power). Lo invoca el CLI (`conductor init-config`)
// y la tool MCP `conductor_init_config` (así /sdd-init lo crea por NOMBRE de tool, sin rutas del plugin).
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname, resolve, basename } from 'node:path';
import { detectStackDeep, renderStackDeep } from './stack.mjs';

export const CONFIG_SCHEMA = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'conductor — configuración de usuario',
  type: 'object',
  properties: {
    $schema: { type: 'string' },
    _ayuda: { type: 'string', description: 'Texto de ayuda de la plantilla — el motor lo ignora.' },
    _ejemplos: { type: 'object', description: 'Ejemplos de la plantilla — el motor los ignora.' },
    preset: { type: 'string', enum: ['quick-fix', 'visual', 'feature', 'migration'], description: 'Preset de gobierno (dial trivial→complejo): quick-fix/visual (laxo) · feature (trazabilidad+id estrictos) · migration (además spec-freeze). Fija strict/specFreeze/pausas; cualquier knob explícito gana. verify SIEMPRE presente.' },
    models: {
      type: 'object',
      description: 'Modelo por ROL (planner/coder/reviewer) y, si quieres control fino, por FASE (explore/propose/clarify/spec/design/tasks/apply/test/fix/verify — la fase GANA sobre su rol). Prefijos: "litellm:<m>" (tu proxy, $0; alias "byok:") · "copilot:<m>" (catálogo Business, AI Credits) · sin prefijo = proveedor de la sesión.',
      properties: {
        planner: { type: 'string', examples: ['litellm:deepseek-v4-flash'] },
        coder: { type: 'string', examples: ['copilot:claude-haiku-4.5'] },
        reviewer: { type: 'string', examples: ['litellm:deepseek-v4-flash'] },
      },
      additionalProperties: { type: 'string' },
    },
    rules: {
      type: 'object',
      description: 'Reglas del EQUIPO inyectadas al prompt de una fase (gobierno DECLARATIVO: cambia cómo trabaja una fase sin forkear el motor). Clave = fase conocida o "all"; valor = lista de instrucciones en lenguaje natural. Ej: {"spec":["Un requisito por comportamiento observable; no escribas escenarios para la AUSENCIA de una regla"],"apply":["Componentes standalone; signals para estado local"]}. Tope 10 reglas/fase y 240 chars/regla (token-first). SOLO TEXTO: una regla JAMÁS ejecuta nada — los comandos viven en "checks", que exigen consentimiento explícito por-run (anti-RCE).',
      additionalProperties: { type: 'array', items: { type: 'string' } },
    },
    pipeline: {
      type: 'array',
      description: 'Pipeline declarativo: fases en orden (subconjunto de las conocidas). Reordena/omite fases manteniendo el gate determinista; "verify" se exige (se añade si falta). NO aplica a complejidad "micro". Una entrada puede ser el nombre de fase, o {"phase","when"} para incluirla SOLO si se cumple una condición determinista (sin LLM): exists:<ruta> | missing:<ruta> | "complexity>=medium" | request~<substr>. Ej: ["propose","spec",{"phase":"explore","when":"missing:proposal.md"},"apply","verify"].',
      items: {
        oneOf: [
          { type: 'string', enum: ['explore', 'propose', 'clarify', 'spec', 'design', 'tasks', 'apply', 'test', 'verify'] },
          {
            type: 'object',
            additionalProperties: false,
            required: ['phase'],
            properties: {
              phase: { type: 'string', enum: ['explore', 'propose', 'clarify', 'spec', 'design', 'tasks', 'apply', 'test', 'verify'] },
              when: { type: 'string', description: 'condición determinista (sin LLM): exists:<ruta> | missing:<ruta> | "complexity>=|==|<= nivel" | request~<substr>' },
            },
          },
        ],
      },
    },
    pauseAt: {
      type: 'array',
      description: 'Fases ANTES de las que el run pausa para revisión humana (gana sobre el default). La fase "fix" siempre pausa. Ej: ["apply"].',
      items: { type: 'string', enum: ['explore', 'propose', 'clarify', 'spec', 'design', 'tasks', 'apply', 'test', 'verify'] },
    },
    lenses: {
      description: 'Lentes de review paralelas en verify: subconjunto de ["correctness","security","tests","contract"], o false para desactivarlas. Default: correctness+security+tests. (Funcionaba pero el schema la rechazaba — deriva corregida.)',
      oneOf: [
        { type: 'boolean' },
        { type: 'array', items: { type: 'string' } },
      ],
    },
    strictTrace: { type: 'boolean', description: 'Trazabilidad REQ↔código↔test BLOQUEANTE (un hueco tumba el GREEN). Lo activan los presets feature/migration; aquí lo fuerzas fuera de preset.' },
    strictTests: { type: 'boolean', description: 'true = código sin test BLOQUEA (los presets feature/migración lo activan solos). Default false: aviso visible sin bloquear — y un test sin etiqueta @conductor cuenta por referencia.' },
    strictId: { type: 'boolean', description: 'Exigir id <!-- id: REQ-X --> en cada requisito como ERROR (no warning).' },
    strictClarify: { type: 'boolean', description: 'CLARIFY-GATE: preguntas abiertas sin responder ([ ]) BLOQUEAN el avance.' },
    semanticDelta: { type: 'boolean', description: 'Validación semántica del delta de spec (MODIFIED/REMOVED coherentes). La activa el preset migration.' },
    fallback: { type: 'object', additionalProperties: { type: 'string' }, description: 'OPT-IN. Modelo de RESERVA por rol (planner/coder/reviewer) o por FASE (la fase gana). Tras agotar maxRetries con fallo NO atribuible al contenido (timeout/proveedor/crash/no-progreso), UN único intento extra con este modelo. Queda registrado honesto en timeline y AI Act. Ej: {"coder":"copilot:claude-sonnet-4.5"}.' },
    byokFallback: { type: 'boolean', default: false, description: 'true = si se pide byok: sin credenciales, permite caer al catálogo Business (gasta créditos). Por defecto se BLOQUEA.' },
    rawCapture: { type: 'boolean', default: true, description: 'Guardar la salida CRUDA del modelo por fase en .conductor/raw/ (scrubbeada, tope 40k). false la desactiva. Siempre fue leída en runtime; ahora está declarada.' },
    preconditions: {
      type: 'object',
      description: 'Pre-condiciones deterministas por fase (BLOQUEAN antes de gastar tokens). Por fase: lista de "exists:<ruta>" | "git-clean" | "cmd:<comando>". Ej: {"apply":["exists:specs"]}.',
      additionalProperties: { type: 'array', items: { type: 'string' } },
    },
    tiers: {
      type: 'object',
      description: 'Niveles de coste por modelo: economy/balanced/premium → "byok:…"/"copilot:…". Cada fase usa un tier por defecto (verify=premium; explore/tasks=economy). El modelo explícito por rol (models) gana.',
      properties: { economy: { type: 'string' }, balanced: { type: 'string' }, premium: { type: 'string' } },
      additionalProperties: false,
    },
    phaseTiers: {
      type: 'object',
      description: 'Override del tier por fase. Ej: {"verify":"premium","apply":"balanced"}.',
      additionalProperties: { type: 'string', enum: ['economy', 'balanced', 'premium'] },
    },
    timeoutSeconds: { type: 'integer', minimum: 30, default: 600, description: 'Timeout duro por fase.' },
    maxRetries: { type: 'integer', minimum: 0, maximum: 3, default: 1 },
    budget: {
      type: 'object',
      description: 'Presupuesto DURO por run (freno real, token-first). Al superarlo, el run se DETIENE. maxTokens/maxCostUsd = techos; onExceed = "block" (default, BLOCKED) | "pause" (pide decisión humana si hay revisor).',
      properties: {
        maxTokens: { type: 'integer', minimum: 0 },
        maxCostUsd: { type: 'number', minimum: 0 },
        onExceed: { type: 'string', enum: ['block', 'pause'], default: 'block' },
      },
      additionalProperties: false,
    },
    reviewTimeoutMs: { type: 'integer', minimum: 0, default: 0, description: 'Timeout (ms) de la revisión humana en una pausa. 0 = espera indefinida (default). Combínalo con onReviewTimeout para headless/CI.' },
    onReviewTimeout: { type: 'string', enum: ['wait', 'continue', 'abort'], default: 'wait', description: 'Qué hacer si una pausa de revisión no se atiende en reviewTimeoutMs: wait (espera, default) | continue (sigue como aprobado) | abort (detiene el run).' },
    secretScan: { type: 'boolean', default: true, description: 'Escanea los ficheros escritos en busca de secretos/PII hardcodeados; un hallazgo tumba el GREEN. Desactívalo (false) solo en repos con fixtures de secreto a propósito.' },
    specFreeze: { type: 'boolean', default: false, description: 'Congela el hash de la spec al completarse y bloquea el GREEN si la spec muta después (gobierno estricto/migración). Opt-in: en modo laxo "fix" puede editar la spec.' },
    dataGate: { type: 'boolean', default: false, description: 'Gate de DATOS: el SQL escrito pasa el linter de seguridad de migraciones (DDL destructivo/irreversible + PII en columnas). Lo activa el preset "migration"; ponlo aquí para forzarlo en otros flujos.' },
    hollowTests: { type: 'boolean', default: false, description: 'Gate de TESTS HUECOS: marca tests que pasan sin verificar nada (sin aserciones, tautológicos, cuerpo vacío, todos skip) sobre los tests escritos; un hallazgo error tumba el GREEN. Opt-in (algunos repos usan placeholders a propósito).' },
    contractDiff: { type: 'array', description: 'Gate de CONTRATO: diffea base↔head con los motores deterministas (autodetecta dominio por extensión: .json OpenAPI · .sql esquema BD · .ts contrato público) y un cambio incompatible tumba el GREEN. Rutas relativas al proyecto.', items: { type: 'object', required: ['base', 'head'], properties: { base: { type: 'string', description: 'ruta del contrato ANTES (relativa al proyecto)' }, head: { type: 'string', description: 'ruta del contrato DESPUÉS (relativa al proyecto)' } } } },
    checks: { type: 'array', description: 'Comandos de la fase "test" (opcional, ANTES de verify): pruebas/build REALES. Ej: ["npm test","npm run build"]. SIN shell. Si alguna falla → ciclo fix → re-test → BLOCKED si no converge. Si se omite, el toggle "test" del panel usa el testCmd autodetectado del stack.', items: { type: 'string' } },
    allowChecks: { type: 'boolean', default: false, description: 'OBSOLETO (anti-RCE): un flag del fichero del repo YA NO consiente ejecutar "checks" (un repo clonado hostil no debe correr comandos). El consentimiento válido es el toggle "test" por-run (app) o la variable de entorno CONDUCTOR_ALLOW_CHECKS=1 (CI/headless). Este campo se ignora.' },
    serve: { type: 'boolean', default: true, description: 'Mini-web del run en vivo.' },
    serveOpen: { type: 'boolean', default: true, description: 'Abrir el navegador automáticamente.' },
    autoApprove: { type: 'boolean', default: false, description: 'true = sin pausas de revisión.' },
    toolFilter: { type: 'boolean', default: true, description: 'Filtrado de VISIBILIDAD de tools en fases no-coder (--excluded-tools: web/search/shell/task/apply_patch fuera del system prompt → menos tokens por turno). false = el agente ve todos los tools en todas las fases (p.ej. si una skill de equipo necesita web en planificación).' },
    verifyCache: { type: 'boolean', default: false, description: 'OPT-IN: reutilizar la opinión de las lentes de verify cuando TODOS los inputs son bit-idénticos al último verify OK (spec, informes, ficheros tocados, prompts, lentes, modelo). El gate determinista corre SIEMPRE; el hit queda visible en timeline (cacheHit) y registro. Se ignora si diriges la pasada con nota o modelo en caliente.' },
    runner: { type: 'string', enum: ['spawn', 'sdk'], default: 'spawn' },
    gitCommit: { type: 'boolean', default: false, description: 'Un commit git por fase (audit trail).' },
    allowTools: {
      type: 'object',
      description: 'Allowlist de tools del agente por rol ("write" | "all" | spec de --allow-tool).',
      properties: { planner: { type: 'string' }, coder: { type: 'string' }, reviewer: { type: 'string' } },
      additionalProperties: false,
    },
    mcp: {
      type: 'object',
      description: 'MCPs por fase: "disable": ["nombre"] apaga MCPs globales; "<rol>": {server: {command, args}} enchufa un MCP solo a esa fase.',
      properties: {
        disable: { type: 'array', items: { type: 'string' } },
        planner: { type: 'object' }, coder: { type: 'object' }, reviewer: { type: 'object' },
      },
      additionalProperties: false,
    },
  },
  additionalProperties: false,
};

// sin "serve": la app única :4750 ES la superficie (decisión cerrada); la mini-web por-run del CLI headless
// queda como opt-in explícito (--serve / CONDUCTOR_SERVE=1), no como default que el scaffold reactiva.
// init v2: SIN $schema — el fichero de schema ya no se escribe en el repo del usuario (apuntarlo sería
// un enlace roto). La validación real es del motor (doctor); el autocompletado, opción del editor.
// El fichero que nace en el repo del usuario es la SUPERFICIE de la herramienta: cada línea se paga en
// code review. Nace con las 3 claves que un equipo toca de verdad — models (la escribe el 💾 del panel),
// rules (gobierno por fase) y autoApprove. La documentación de los ~40 knobs es CONFIG_SCHEMA (motor,
// `conductor doctor`, panel), NO un _ayuda de 300 chars dentro del JSON del usuario.
// (_ayuda/_ejemplos siguen ACEPTADOS por el schema: los repos que ya los tienen no dejan de validar.)
const DEFAULT_CONFIG = {
  // una sola línea de ayuda (el motor la ignora): sin ella el fichero mínimo no daba NINGUNA pista de qué
  // se puede configurar (un fichero mudo obliga a imaginar los mandos). La doc completa, en
  // `conductor config` (imprime el schema explicado) — aquí solo la puerta.
  _ayuda: 'TODO es opcional (hay default para todo). Copia el mando que quieras de _ejemplos al nivel raíz y ajústalo — el motor ignora _ayuda y _ejemplos. Ejecuta `conductor config` para ver cada mando explicado; el botón 💾 del panel escribe aquí los modelos del equipo.',
  // EJEMPLOS COPIABLES dentro del propio fichero (el motor los ignora): un config que nace mudo obliga a
  // imaginar los mandos; uno con ejemplos realistas se rellena copiando la línea y ajustando el valor.
  _ejemplos: {
    models: { planner: 'litellm:deepseek-v4-flash', coder: 'copilot:claude-haiku-4.5', reviewer: 'copilot:claude-sonnet-4.5', verify: 'copilot:claude-sonnet-4.5' },
    rules: { spec: ['Un requisito por comportamiento observable'], apply: ['Componentes standalone; signals para estado local'] },
    preset: 'feature',
    pauseAt: ['apply', 'verify'],
    checks: ['npm test --silent'],
    budget: { maxTokens: 300000, onExceed: 'pause' },
    tiers: { economy: 'litellm:deepseek-v4-flash', premium: 'copilot:claude-sonnet-4.5' },
    fallback: { coder: 'copilot:claude-sonnet-4.5' },
    verifyCache: true,
    toolFilter: false,
  },
  models: {},
  rules: {},
  autoApprove: false,
};

// .copilotignore DETERMINISTA (token-first): exclusiones de contexto que, si no, inflan cada request del
// modelo. Lo genera el MOTOR (no el LLM del SKILL → fiable). El host Copilot lo honra de forma nativa.
const COPILOTIGNORE = [
  'node_modules/', 'dist/', 'build/', 'out/', 'target/', 'coverage/', '.angular/',
  '*.log', '*.lock', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
  '.env', '.env.*', '*.pem', '*.key', '*.min.js', '*.map',
  // delta token-first: más generados/cachés multi-stack. Solo proyectos NUEVOS
  // (el fichero jamás se pisa si existe). vendor/* con asterisco A PROPÓSITO: así ignoreDirsFrom (solo
  // nombres simples) NO deja de capturar un cambio legítimo dentro de vendor/, pero el host sí lo excluye.
  '.next/', '.nuxt/', '.svelte-kit/', 'dist-esm/', 'storybook-static/', 'generated/',
  '__pycache__/', '*.pyc', '.pytest_cache/', '.mypy_cache/', '.tox/', '.venv/', 'venv/',
  '.gradle/', '.terraform/', 'vendor/*',
  '*.min.css', '*.wasm',
  'openspec/changes/**/.conductor/',
  '.conductor/',
].join('\n') + '\n';

// openspec/config.yaml YA NO SE GENERA . Era un ESPEJO de lo detectado que se reescribía en
// cada arranque y que NADIE parseaba (su único consumidor era un existsSync de isSdd) — 20 líneas de diff
// diario en el repo del usuario a cambio de cero información. Un dato derivado no se versiona: se
// recalcula (detectStack en cada run) y se enseña en el panel. Los repos que ya lo tienen lo conservan y
// isSdd() lo sigue reconociendo: cero regresión, simplemente deja de nacer y de refrescarse.

// .gitignore: la FONTANERÍA del run (events.jsonl, otel/, raw/, lock.json con un PID) es estado de
// MÁQUINA. Ya la excluíamos del contexto del modelo (.copilotignore) pero no de git, así que acababa
// commiteada en el repo del usuario. Append IDEMPOTENTE: jamás reescribe el .gitignore existente.
const GITIGNORE_LINE = '.conductor/'; // punto ÚNICO de estado en la raíz (los runs legados quedan cubiertos por la línea antigua si existe)
function ensureGitignore(root) {
  const p = join(root, '.gitignore');
  try {
    const prev = existsSync(p) ? readFileSync(p, 'utf8') : '';
    if (prev.split(/\r?\n/).some((l) => l.trim() === GITIGNORE_LINE)) return false;
    const sep = prev === '' ? '' : (prev.endsWith('\n') ? '\n' : '\n\n');
    writeFileSync(p, `${prev}${sep}# conductor — fontanería del run (estado de máquina, no del repo)\n${GITIGNORE_LINE}\n`);
    return true;
  } catch { return false; }
}

// escribe conductor.json (solo si no existe — nunca pisa la config del usuario)
// + .copilotignore en el ROOT del proyecto (padre de openspec/, idempotente — nunca pisa el del usuario).
export function initConfig(openspecDir) {
  mkdirSync(openspecDir, { recursive: true });
  const cfgPath = join(openspecDir, 'conductor.json');
  const root = dirname(resolve(openspecDir));
  // DETECCIÓN PROFUNDA (determinista, 0 tokens): versiones, package manager, proyectos y comandos REALES.
  // Semilla de `checks` en el config recién nacido + resumen que imprime init — el config no nace mudo.
  // Jamás se escribe como espejo versionado: el motor re-detecta vivo en cada run.
  let deep = null; try { deep = detectStackDeep(root); } catch {}
  let created = false;
  if (!existsSync(cfgPath)) {
    const cfg = { ...DEFAULT_CONFIG, ...(deep?.checks?.length ? { checks: deep.checks } : {}) };
    writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + '\n'); created = true;
  }
  // ÁRBOL OpenSpec visible desde el minuto uno (init v2): un dev que conoce el estándar debe
  // RECONOCERLO al abrir el repo — specs/ (fuente de verdad viva, la llena el archivado) + changes/archive/.
  mkdirSync(join(openspecDir, 'changes', 'archive'), { recursive: true });
  mkdirSync(join(openspecDir, 'specs'), { recursive: true });
  const specsReadme = join(openspecDir, 'specs', 'README.md');
  if (!existsSync(specsReadme)) writeFileSync(specsReadme, 'Fuente de verdad VIVA (estándar OpenSpec): al archivar un change GREEN, conductor promueve aquí sus delta specs. No se edita a mano — se cambia proponiendo un change.\n');
  const keep = join(openspecDir, 'changes', 'archive', '.gitkeep');
  if (!existsSync(keep)) writeFileSync(keep, '');
  // project.md: el CONTEXTO del estándar para humanos y agentes. SIN stack ni estructura: eso es DERIVADO y
  // aquí se escribía UNA sola vez (nada lo refrescaba nunca) mientras drive.mjs lo inyecta al planner con
  // "honor it" — o sea, la única fuente de contexto PODRIDO que llegaba al prompt. El stack se detecta en
  // cada run y se enseña en el panel. Aquí queda solo lo que un humano sabe y una máquina no puede deducir.
  // (Antes colgaba del `if (!existsSync(config.yaml))`: un repo con yaml pero sin project.md no lo recibía
  //  jamás. Ahora es independiente e idempotente.)
  const pmPath = join(openspecDir, 'project.md');
  let projectMdCreated = false;
  // BLOQUE DETECTADO dentro de project.md (la riqueza de la detección aterriza EN el fichero, no solo en
  // el terminal) — entre marcadores para que cada `conductor init` lo REFRESQUE sin tocar lo humano.
  // Así no se pudre (la lección del espejo config.yaml): el bloque es regenerable, el resto es tuyo.
  const detBlock = (d) => {
    const L = renderStackDeep(d);
    return ['<!-- conductor:detected (no lo edites: cada `conductor init` lo refresca) -->',
      ...(L.length ? L.map((l) => `- ${l}`) : ['- (nada detectable todavía — repo sin manifiestos de stack)']),
      '<!-- /conductor:detected -->'].join('\n');
  };
  if (!existsSync(pmPath)) {
    writeFileSync(pmPath, [
      `# ${basename(root) || 'proyecto'} — contexto del proyecto`,
      '',
      '> Lo leen las fases de planificación de conductor Y cualquier dev nuevo. Manténlo corto y cierto.',
      '> El bloque «detectado» se refresca solo en cada `conductor init`; el resto es tuyo.',
      '',
      '## Stack y comandos (detectado)',
      detBlock(deep),
      '',
      '## Propósito',
      '_Sustituye este ejemplo:_ App interna de reservas de salas para los equipos de la oficina; la usan',
      '~200 empleados desde el móvil. Prioridad: fiabilidad sobre features.',
      '',
      '## Convenciones',
      '_Sustituye estos ejemplos por las reglas de TU casa:_',
      '- Nombres de componentes en kebab-case; un componente por fichero.',
      '- Tests junto al código (`x.spec.ts`), un test real por comportamiento — nada de tests vacíos.',
      '- Prohibido añadir dependencias sin aprobación (el package.json lo revisa una persona).',
      '- Errores siempre visibles para el usuario: nada de catch silencioso.',
      '',
      '## Decisiones vivas',
      '_Decisiones de arquitectura que un agente NO debe reabrir sin preguntar. Ejemplos:_',
      '- El estado global vive en el servidor; el cliente solo cachea (no introducir stores nuevos).',
      '- La autenticación es del gateway corporativo: las vistas asumen usuario ya autenticado.',
      '',
      '## Fuera de alcance',
      '_Lo que este repo NO hace (evita que un agente lo intente):_',
      '- Nada de pagos ni datos personales sensibles: eso vive en otro servicio.',
      '',
    ].join('\n') + '\n');
    projectMdCreated = true;
  } else {
    // project.md EXISTENTE: refrescar el bloque detectado si tiene marcadores; si es nuestra plantilla
    // sin editar (_Sustituye) y aún no lo lleva, se le AÑADE (mismo consentimiento que --smart). Un
    // project.md humano sin marcadores jamás se toca.
    try {
      let txt = readFileSync(pmPath, 'utf8');
      // la nota antigua de cabecera contradice al bloque — en plantillas se actualiza junto a él
      if (txt.includes('_Sustituye')) txt = txt.replace('> El stack NO se escribe aquí: el motor lo detecta en cada run y lo enseña en el panel.', '> El bloque «detectado» se refresca solo en cada `conductor init`; el resto es tuyo.');
      const RE = /<!-- conductor:detected[\s\S]*?<!-- \/conductor:detected -->/;
      if (RE.test(txt)) writeFileSync(pmPath, txt.replace(RE, detBlock(deep)));
      else if (txt.includes('_Sustituye') && txt.includes('## Propósito')) writeFileSync(pmPath, txt.replace('## Propósito', `## Stack y comandos (detectado)\n${detBlock(deep)}\n\n## Propósito`));
    } catch {}
  }
  // .copilotignore al root del proyecto (token-first determinista) + .gitignore (la fontanería fuera del repo)
  const ignorePath = join(root, '.copilotignore');
  let copilotignore = false;
  if (!existsSync(ignorePath)) { writeFileSync(ignorePath, COPILOTIGNORE); copilotignore = true; }
  const gitignore = ensureGitignore(root);
  return { cfgPath, created, projectMd: pmPath, projectMdCreated, ignorePath, copilotignore, gitignore, deep };
}
