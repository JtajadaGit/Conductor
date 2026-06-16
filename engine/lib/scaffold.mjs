// conductor/lib/scaffold.mjs — genera la config de usuario (openspec/conductor.json) + su JSON Schema
// (autocompletado/validación en el editor — developer power). Lo invoca el CLI (`conductor init-config`)
// y la tool MCP `conductor_init_config` (así /sdd-init lo crea por NOMBRE de tool, sin rutas del plugin).
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export const CONFIG_SCHEMA = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'conductor — configuración de usuario',
  type: 'object',
  properties: {
    $schema: { type: 'string' },
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
    timeoutSeconds: { type: 'integer', minimum: 30, default: 600, description: 'Timeout duro por fase.' },
    maxRetries: { type: 'integer', minimum: 0, maximum: 3, default: 1 },
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

// escribe schema (siempre, idempotente) + conductor.json (solo si no existe — nunca pisa la config del usuario)
export function initConfig(openspecDir) {
  mkdirSync(openspecDir, { recursive: true });
  const schemaPath = join(openspecDir, 'conductor.schema.json');
  writeFileSync(schemaPath, JSON.stringify(CONFIG_SCHEMA, null, 2) + '\n');
  const cfgPath = join(openspecDir, 'conductor.json');
  let created = false;
  if (!existsSync(cfgPath)) { writeFileSync(cfgPath, JSON.stringify(DEFAULT_CONFIG, null, 2) + '\n'); created = true; }
  return { schemaPath, cfgPath, created };
}
