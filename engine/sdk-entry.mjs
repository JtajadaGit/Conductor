// Punto de entrada para el bundle del Copilot SDK (esbuild, dev-only).
// Solo el JS del SDK (sdk + vscode-jsonrpc + zod); el runtime @github/copilot queda EXTERNO:
// en runtime se apunta al copilot global del usuario vía la opción `cliPath` (sin los ~557MB).
export { CopilotClient, RuntimeConnection, approveAll } from '@github/copilot-sdk';
