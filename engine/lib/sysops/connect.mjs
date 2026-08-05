// conductor/lib/sysops/connect.mjs — CONEXIÓN OFICIAL a hosts MCP: fusiona la entrada de conductor en la
// config JSON del host (fusión NO destructiva, idempotente, con detección del formato). Es la instalación
// "un comando y listo" — nada de copiar bloques a mano. 0 deps, puro (texto → texto) para testearse sin FS.
//
// Formatos soportados (detectados por la clave presente en el fichero, u ordenados por `key`):
//   servers    → { type:'stdio', command:'node', args:[motor,'mcp'] }            (estilo .vscode/mcp.json)
//   mcpServers → { command:'node', args:[motor,'mcp'] }                          (estándar extendido)
//   mcp        → { type:'local', command:['node',motor,'mcp'], enabled:true }    (hosts con command en ARRAY)

const KEYS = ['servers', 'mcpServers', 'mcp'];

function entryFor(key, engineAbs, portable) {
  // portable = instalación npm (shim `conductor` en PATH global): config SIN rutas — sobrevive a
  // actualizaciones del paquete y es idéntica en todas las máquinas. Fallback: node + ruta absoluta.
  // forma mcpServers (Copilot CLI): `tools: ["*"]` lista TODAS las tools del servidor de serie
  // (contrato documentado del host) — el usuario aprueba una vez («don't ask again» persiste en su
  // permissions-config.json) en vez de chocar con un muro por tool. Conectar ES el consentimiento.
  if (portable) {
    if (key === 'servers') return { type: 'stdio', command: 'conductor', args: ['mcp'] };
    if (key === 'mcp') return { type: 'local', command: ['conductor', 'mcp'], enabled: true };
    return { command: 'conductor', args: ['mcp'], tools: ['*'] };
  }
  if (key === 'servers') return { type: 'stdio', command: 'node', args: [engineAbs, 'mcp'] };
  if (key === 'mcp') return { type: 'local', command: ['node', engineAbs, 'mcp'], enabled: true };
  return { command: 'node', args: [engineAbs, 'mcp'], tools: ['*'] };
}

// fusiona la entrada "conductor" en el TEXTO de una config JSON. Devuelve { text, changed, key, error }.
// - fichero vacío/ausente ("" o undefined) → se crea el objeto con la clave pedida (default mcpServers).
// - JSON inválido → error (JAMÁS pisar una config que no entendemos; el usuario no pierde nada).
// - clave detectada automáticamente si ya existe una de las tres; `key` explícita gana.
// - idempotente: si la entrada ya es EXACTAMENTE la nuestra, changed:false y el texto original intacto.
export function mergeMcpEntry(cfgText, engineAbs, { key = 'auto', portable = false } = {}) {
  const engine = String(engineAbs).split('\\').join('/');
  let cfg;
  const raw = String(cfgText || '').trim();
  if (!raw) cfg = {};
  else { try { cfg = JSON.parse(raw); } catch (e) { return { error: `la config existente no es JSON válido (${e.message}) — no la toco; arréglala o pásame otro fichero` }; } }
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) return { error: 'la config existente no es un objeto JSON — no la toco' };
  const effKey = KEYS.includes(key) ? key : (KEYS.find((k) => cfg[k] && typeof cfg[k] === 'object') || 'mcpServers');
  const entry = entryFor(effKey, engine, portable);
  const cur = cfg[effKey] && typeof cfg[effKey] === 'object' ? cfg[effKey] : {};
  // OpenCode (clave `mcp`): sus tools MCP se permiten por PATRÓN en `permission` — pre-autorizadas al
  // conectar (conectar ES el consentimiento). Si el usuario ya fijó su política para conductor*, se respeta.
  let permChanged = false;
  if (effKey === 'mcp' && !(cfg.permission && Object.prototype.hasOwnProperty.call(cfg.permission, 'conductor*'))) {
    cfg.permission = { ...(cfg.permission || {}), 'conductor*': 'allow' };
    permChanged = true;
  }
  if (!permChanged && JSON.stringify(cur.conductor) === JSON.stringify(entry)) return { text: cfgText, changed: false, key: effKey };
  cfg[effKey] = { ...cur, conductor: entry }; // fusión: las demás entradas del usuario quedan INTACTAS
  return { text: JSON.stringify(cfg, null, 2) + '\n', changed: true, key: effKey };
}
