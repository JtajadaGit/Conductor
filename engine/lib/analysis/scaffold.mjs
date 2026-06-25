// conductor/lib/scaffold.mjs — genera la config de usuario (openspec/conductor.json) + su JSON Schema
// (autocompletado/validación en el editor — developer power). Lo invoca el CLI (`conductor init-config`)
// y la tool MCP `conductor_init_config` (así /sdd-init lo crea por NOMBRE de tool, sin rutas del plugin).
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve, basename } from 'node:path';
import { detectStack } from './stack.mjs';

export const CONFIG_SCHEMA = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'conductor — configuración de usuario',
  type: 'object',
  properties: {
    $schema: { type: 'string' },
    preset: { type: 'string', enum: ['quick-fix', 'visual', 'feature', 'migration'], description: 'Preset de gobierno (dial trivial→complejo): quick-fix/visual (laxo) · feature (trazabilidad+id estrictos) · migration (además spec-freeze). Fija strict/specFreeze/pausas; cualquier knob explícito gana. verify SIEMPRE presente.' },
    strictTrace: { type: 'boolean', description: 'Trazabilidad CONTRACTUAL: un requisito sin código/test BLOQUEA el GREEN (no warning). Lo fija el preset; ponlo aquí para forzarlo.' },
    strictId: { type: 'boolean', description: 'Exige id estable "<!-- id: REQ-... -->" en cada requisito (error si falta). Lo fija el preset.' },
    models: {
      type: 'object',
      description: 'Modelo por fase. Prefijos: "byok:<m>" (tu LiteLLM, $0) · "copilot:<m>" (catálogo Business, AI Credits) · sin prefijo = proveedor de la sesión.',
      properties: {
        planner: { type: 'string', examples: ['byok:qwen36-msc1'] },
        coder: { type: 'string', examples: ['copilot:claude-haiku-4.5'] },
        reviewer: { type: 'string', examples: ['byok:qwen36-msc1'] },
      },
      additionalProperties: false,
    },
    pipeline: {
      type: 'array',
      description: 'Pipeline declarativo: fases en orden (subconjunto de las conocidas). Reordena/omite fases manteniendo el gate determinista; "verify" se exige (se añade si falta). NO aplica a complejidad "micro". Una entrada puede ser el nombre de fase, o {"phase","when"} para incluirla SOLO si se cumple una condición determinista (sin LLM): exists:<ruta> | missing:<ruta> | "complexity>=medium" | request~<substr>. Ej: ["propose","spec",{"phase":"explore","when":"missing:proposal.md"},"apply","verify"].',
      items: {
        oneOf: [
          { type: 'string', enum: ['explore', 'propose', 'clarify', 'spec', 'design', 'tasks', 'apply', 'verify'] },
          {
            type: 'object',
            additionalProperties: false,
            required: ['phase'],
            properties: {
              phase: { type: 'string', enum: ['explore', 'propose', 'clarify', 'spec', 'design', 'tasks', 'apply', 'verify'] },
              when: { type: 'string', description: 'condición determinista (sin LLM): exists:<ruta> | missing:<ruta> | "complexity>=|==|<= nivel" | request~<substr>' },
            },
          },
        ],
      },
    },
    pauseAt: {
      type: 'array',
      description: 'Fases ANTES de las que el run pausa para revisión humana (gana sobre el default). La fase "fix" siempre pausa. Ej: ["apply"].',
      items: { type: 'string', enum: ['explore', 'propose', 'clarify', 'spec', 'design', 'tasks', 'apply', 'verify'] },
    },
    byokFallback: { type: 'boolean', default: false, description: 'true = si se pide byok: sin credenciales, permite caer al catálogo Business (gasta créditos). Por defecto se BLOQUEA.' },
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
    checks: { type: 'array', description: 'Verify POR EJECUCIÓN (opcional, post-gate): pruebas/build REALES a correr TRAS el GREEN estructural. Ej: ["npm test","npm run build"]. SIN shell. Si alguna falla → veredicto TESTS-FAIL (construido bien · pruebas fallan), distinto del NOT-GREEN estructural. Si se omite, el toggle "test" del panel usa el testCmd autodetectado del stack.', items: { type: 'string' } },
    allowChecks: { type: 'boolean', default: false, description: 'Ejecutar "checks" automáticamente (CI/headless) sin intervención. Por defecto NO se ejecuta config clonada (anti-RCE); en la app, el toggle "test" por-run es el consentimiento humano explícito equivalente.' },
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

const DEFAULT_CONFIG = {
  $schema: './conductor.schema.json',
  models: {},
  serve: true,
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

// escribe schema (siempre, idempotente) + conductor.json (solo si no existe — nunca pisa la config del usuario)
// + .copilotignore en el ROOT del proyecto (padre de openspec/, idempotente — nunca pisa el del usuario).
export function initConfig(openspecDir) {
  mkdirSync(openspecDir, { recursive: true });
  const schemaPath = join(openspecDir, 'conductor.schema.json');
  writeFileSync(schemaPath, JSON.stringify(CONFIG_SCHEMA, null, 2) + '\n');
  const cfgPath = join(openspecDir, 'conductor.json');
  let created = false;
  if (!existsSync(cfgPath)) { writeFileSync(cfgPath, JSON.stringify(DEFAULT_CONFIG, null, 2) + '\n'); created = true; }
  const root = dirname(resolve(openspecDir));
  // config.yaml: metadata OpenSpec del proyecto (stack DETECTADO por el motor). Init ATÓMICO y COMPLETO (#6): un
  // fresh-init deja conductor.json (config EJECUTABLE) Y config.yaml (metadata) → "inicializado" deja de ser ambiguo
  // (antes una ruta creaba uno y otra el otro). Determinista, sin LLM. Idempotente: nunca pisa el del usuario.
  const ymlPath = join(openspecDir, 'config.yaml');
  let metadata = false;
  if (!existsSync(ymlPath)) {
    let stk = { summary: '', testCmd: null }; try { stk = detectStack(root); } catch { /* sin stack detectable */ }
    const yml = [
      '# conductor — metadata del proyecto (generada por el motor en init; determinista, sin LLM).',
      `name: ${basename(root) || 'proyecto'}`,
      `stack: ${stk.summary || 'desconocido'}`,
      stk.testCmd ? `test: ${stk.testCmd}` : '# test: <comando de pruebas del proyecto>',
      '',
    ].join('\n');
    writeFileSync(ymlPath, yml); metadata = true;
  }
  // .copilotignore al root del proyecto (token-first determinista)
  const ignorePath = join(root, '.copilotignore');
  let copilotignore = false;
  if (!existsSync(ignorePath)) { writeFileSync(ignorePath, COPILOTIGNORE); copilotignore = true; }
  return { schemaPath, cfgPath, created, ymlPath, metadata, ignorePath, copilotignore };
}
