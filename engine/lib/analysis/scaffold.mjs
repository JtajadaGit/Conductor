// conductor/lib/scaffold.mjs — genera la config de usuario (openspec/conductor.json) + su JSON Schema
// (autocompletado/validación en el editor — developer power). Lo invoca el CLI (`conductor init-config`)
// y la tool MCP `conductor_init_config` (así /sdd-init lo crea por NOMBRE de tool, sin rutas del plugin).
import { writeFileSync, mkdirSync, existsSync, readdirSync, statSync, readFileSync } from 'node:fs';
import { join, dirname, resolve, basename } from 'node:path';
import { detectStack } from './stack.mjs';

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
    strictTests: { type: 'boolean', description: 'Código sin test = BLOQUEA (default true). false para relajar (presets arreglo/retoque lo relajan solos).' },
    strictId: { type: 'boolean', description: 'Exigir id <!-- id: REQ-X --> en cada requisito como ERROR (no warning).' },
    strictClarify: { type: 'boolean', description: 'CLARIFY-GATE: preguntas abiertas sin responder ([ ]) BLOQUEAN el avance.' },
    semanticDelta: { type: 'boolean', description: 'Validación semántica del delta de spec (MODIFIED/REMOVED coherentes). La activa el preset migration.' },
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
const DEFAULT_CONFIG = {
  _ayuda: 'Gobierno del EQUIPO (committeable). NO necesitas rellenar nada: todo tiene default. models = tu mezcla por rol/fase (la escribe el botón 💾 del panel, o tú a mano — ver _ejemplos); preset = quick-fix|visual|feature|migration; el resto de knobs en la doc. Las claves que empiezan por _ se ignoran.',
  _ejemplos: {
    models: { planner: 'litellm:tu-modelo-barato', coder: 'copilot:claude-sonnet-4.5', spec: 'copilot:gpt-4.1' },
    preset: 'feature',
  },
  models: {},
  autoApprove: false,
};

// .copilotignore DETERMINISTA (token-first): exclusiones de contexto que, si no, inflan cada request del
// modelo. Lo genera el MOTOR (no el LLM del SKILL → fiable). El host Copilot lo honra de forma nativa.
const COPILOTIGNORE = [
  'node_modules/', 'dist/', 'build/', 'out/', 'target/', 'coverage/', '.angular/',
  '*.log', '*.lock', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
  '.env', '.env.*', '*.pem', '*.key', '*.min.js', '*.map',
  'openspec/changes/**/.conductor/',
].join('\n') + '\n';

// REFRESCO al arrancar la app (decisión de producto 2026-07-29): config.yaml es espejo DETECTADO y
// machine-owned — se regenera entero con fecha; si el humano quiere contexto editable, eso es project.md.
// una sola fuente del yaml (init y refresh): machine-owned, con fecha de detección
function buildMetaYaml(root, stk, dirs, scripts) {
  // entrecomillado JSON en valores con ": " embebido — sin comillas romperían parsers YAML conformes
  return [
    '# conductor — metadata DETECTADA del proyecto (machine-owned: la app la refresca al arrancar).',
    '# Espejo de lo que el motor VE. El contexto EDITABLE (propósito, convenciones) vive en openspec/project.md.',
    `name: ${basename(root) || 'proyecto'}`,
    `detected: ${JSON.stringify(new Date().toISOString().slice(0, 10))}`,
    'stack:',
    `  summary: ${JSON.stringify(stk.summary || 'desconocido')}`,
    stk.languages?.length ? `  languages: [${stk.languages.join(', ')}]` : '  # languages: []',
    stk.frameworks?.length ? `  frameworks: [${stk.frameworks.join(', ')}]` : '  # frameworks: []',
    stk.entrypoints?.length ? `  entrypoints: [${stk.entrypoints.map((e) => JSON.stringify(e)).join(', ')}]` : '  # entrypoints: []',
    stk.testCmd ? `test: ${JSON.stringify(stk.testCmd)}` : '# test: <comando de pruebas del proyecto>',
    dirs.length ? 'structure:' : '# structure: (sin dirs de primer nivel detectables)',
    ...dirs.map((d) => `  - ${JSON.stringify(d)}`),
    Object.keys(scripts).length ? 'scripts:' : '# scripts: (sin package.json o sin scripts)',
    ...Object.entries(scripts).slice(0, 12).map(([k, v]) => `  ${k}: ${JSON.stringify(String(v).slice(0, 120))}`),
    '',
  ].join('\n');
}

export function refreshProjectMeta(root) {
  try {
    const ymlPath = join(root, 'openspec', 'config.yaml');
    if (!existsSync(ymlPath)) return false;
    let stk = { summary: '', testCmd: null }; try { stk = detectStack(root); } catch {}
    const dirs = topDirs(root);
    const scripts = pkgScripts(root);
    writeFileSync(ymlPath, buildMetaYaml(root, stk, dirs, scripts));
    return true;
  } catch { return false; }
}

// dirs de primer nivel con señal (para structure: de config.yaml) — sin recursión, sin ejecutar nada
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'out', 'coverage', 'target', 'openspec']);
function topDirs(root) {
  try {
    return readdirSync(root).filter((d) => { try { return !d.startsWith('.') && !SKIP_DIRS.has(d) && statSync(join(root, d)).isDirectory(); } catch { return false; } }).slice(0, 12);
  } catch { return []; }
}
function pkgScripts(root) {
  try { return JSON.parse(String(readFileSync(join(root, 'package.json')))).scripts || {}; } catch { return {}; }
}

// escribe conductor.json (solo si no existe — nunca pisa la config del usuario)
// + .copilotignore en el ROOT del proyecto (padre de openspec/, idempotente — nunca pisa el del usuario).
export function initConfig(openspecDir) {
  mkdirSync(openspecDir, { recursive: true });
  const cfgPath = join(openspecDir, 'conductor.json');
  let created = false;
  if (!existsSync(cfgPath)) { writeFileSync(cfgPath, JSON.stringify(DEFAULT_CONFIG, null, 2) + '\n'); created = true; }
  const root = dirname(resolve(openspecDir));
  // ÁRBOL OpenSpec visible desde el minuto uno (init v2, 2026-07-29): un dev que conoce el estándar debe
  // RECONOCERLO al abrir el repo — specs/ (fuente de verdad viva, la llena el archivado) + changes/archive/.
  mkdirSync(join(openspecDir, 'changes', 'archive'), { recursive: true });
  mkdirSync(join(openspecDir, 'specs'), { recursive: true });
  const specsReadme = join(openspecDir, 'specs', 'README.md');
  if (!existsSync(specsReadme)) writeFileSync(specsReadme, 'Fuente de verdad VIVA (estándar OpenSpec): al archivar un change GREEN, conductor promueve aquí sus delta specs. No se edita a mano — se cambia proponiendo un change.\n');
  const keep = join(openspecDir, 'changes', 'archive', '.gitkeep');
  if (!existsSync(keep)) writeFileSync(keep, '');
  // config.yaml: metadata OpenSpec del proyecto (stack DETECTADO por el motor). Init ATÓMICO y COMPLETO (#6): un
  // fresh-init deja conductor.json (config EJECUTABLE) Y config.yaml (metadata) → "inicializado" deja de ser ambiguo
  // (antes una ruta creaba uno y otra el otro). Determinista, sin LLM. Idempotente: nunca pisa el del usuario.
  const ymlPath = join(openspecDir, 'config.yaml');
  let metadata = false;
  if (!existsSync(ymlPath)) {
    let stk = { summary: '', testCmd: null }; try { stk = detectStack(root); } catch { /* sin stack detectable */ }
    const dirs = topDirs(root);
    const scripts = pkgScripts(root);
    writeFileSync(ymlPath, buildMetaYaml(root, stk, dirs, scripts)); metadata = true;
    // project.md: el CONTEXTO del estándar para humanos y agentes (lo que en v1 escribía la skill con LLM,
    // ahora nace determinista y editable; las fases de planificación lo leen si existe)
    const pmPath = join(openspecDir, 'project.md');
    if (!existsSync(pmPath)) {
      writeFileSync(pmPath, [
        `# ${basename(root) || 'proyecto'} — contexto del proyecto`,
        '',
        '> Lo leen las fases de planificación de conductor Y cualquier dev nuevo. Manténlo corto y cierto.',
        '',
        '## Propósito',
        '(1-3 líneas: qué hace este producto y para quién)',
        '',
        '## Stack (detectado)',
        `- ${stk.summary || 'desconocido'}`,
        stk.entrypoints?.length ? `- entrypoints: ${stk.entrypoints.join(', ')}` : '',
        stk.testCmd ? `- tests: \`${stk.testCmd}\`` : '',
        '',
        '## Estructura',
        ...(dirs.length ? dirs.map((d) => `- \`${d}/\``) : ['(añade aquí un mapa breve de carpetas)']),
        '',
        '## Convenciones',
        '(reglas de la casa: naming, patrones, librerías vetadas, cómo se escriben los tests)',
        '',
        '## Decisiones vivas',
        '(decisiones de arquitectura que un agente NO debe reabrir sin preguntar)',
        '',
      ].filter((l) => l !== '').join('\n') + '\n');
    }
  }
  // .copilotignore al root del proyecto (token-first determinista)
  const ignorePath = join(root, '.copilotignore');
  let copilotignore = false;
  if (!existsSync(ignorePath)) { writeFileSync(ignorePath, COPILOTIGNORE); copilotignore = true; }
  return { cfgPath, created, ymlPath, metadata, projectMd: join(openspecDir, 'project.md'), ignorePath, copilotignore };
}
