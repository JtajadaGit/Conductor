#!/usr/bin/env node
// conductor/plugin/hooks/guard-hook.mjs — hook PreToolUse de guarda, LEGIBLE y versionado.
//
// Reemplaza el one-liner PowerShell ofuscado (`-nop -nol -c` + ReadToEnd inline) que el EDR corporativo
// marcaba como malware (ver task/danger.md). Misma función, en Node (la runtime del proyecto), sin
// ofuscación y auditable. El usuario lo registra en sus ajustes de Copilot/Claude así (ruta completa):
//
//   PreToolUse: node <ruta-al-plugin>/plugin/hooks/guard-hook.mjs
//
// Lee el evento del tool-call por STDIN (JSON) y emite por STDOUT una decisión PreToolUse:
//   { "hookSpecificOutput": { "hookEventName": "PreToolUse", "permissionDecision": "deny"|"allow", ... } }
//
// Política (REGLA Nº2 de CLAUDE.md): git/gh = del usuario; cero red saliente; nada destructivo. Fail-open
// en errores de parseo (no romper el flujo por un evento raro) — el objetivo es atajar lo peligroso obvio.

import { readFileSync } from 'node:fs';

const deny = (reason) => {
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } }));
  process.exit(0);
};
const allow = () => {
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow' } }));
  process.exit(0);
};

let raw = '';
try { raw = readFileSync(0, 'utf8'); } catch { allow(); }

let evt = {};
try { evt = JSON.parse(raw || '{}'); } catch { allow(); }

const toolName = String(evt.tool_name || evt.toolName || '').toLowerCase();
const ti = evt.tool_input ?? evt.toolInput ?? evt.input ?? {};
// COMANDO EN CRUDO (sin JSON-escapar): un salto de línea real lo convertía JSON.stringify en "\n" literal,
// así el carácter antes de "git" pasaba a ser 'n' y el regex de posición no lo veía (M17). Tomamos los
// campos de comando reales (con saltos de línea de verdad) + un blob serializado como red de seguridad.
const fields = [ti.command, ti.cmd, ti.script, ti.code, Array.isArray(ti.args) ? ti.args.join(' ') : ti.args];
const cmd = String(typeof ti === 'string' ? ti : fields.filter((x) => typeof x === 'string').join('\n'));
const low = cmd.toLowerCase();
const blob = JSON.stringify(ti).toLowerCase(); // red secundaria (detección por subcadena)

// 1) web-fetch: por nombre de tool O por contenido (refuerza "no exfiltrar / no contactar dominios externos")
if (/web_?fetch|fetch_url|web_?search/.test(toolName) || /web_?fetch|fetch_url|web_?search/.test(blob)) deny('BLOCKED: web fetching not allowed (REGLA Nº2).');

// 2) Inspección de comando: SIEMPRE que haya texto de comando (default-deny). Antes una allowlist de nombres
// de tool dejaba pasar un tool llamado 'Terminal'/'process' sin revisar nada (M18).
if (cmd) {
  // primer token de CADA segmento (separadores de shell), con ruta y extensión .exe/.cmd/.ps1 quitadas:
  // /usr/bin/git, C:\\bin\\git.exe, git.cmd → "git" (M18: prefijo de ruta / extensión ya no evaden).
  const leads = cmd.split(/\r?\n|[;&|]|&&|\|\||`|\$\(/).map((s) => {
    const t = (s.trim().split(/\s+/)[0] || '').replace(/^['"]+|['"]+$/g, '');
    return (t.split(/[\\/]/).pop() || '').replace(/\.(exe|cmd|bat|ps1|com)$/i, '').toLowerCase();
  });
  // git/gh en POSICIÓN de comando (no subcadena: 'my-gh-pages' no dispara)
  if (leads.some((t) => t === 'git' || t === 'gh')) deny('BLOCKED: git/gh forbidden — the user manages version control, never the agent.');
  // red saliente: binarios de red por token líder + intérpretes one-liner por contenido
  if (leads.some((t) => /^(curl|wget|nc|ncat|netcat|socat|telnet|lwp-request)$/.test(t))
      || /invoke-webrequest|invoke-restmethod|\biwr\b|urllib\.request|urlopen|requests\.(get|post|put|delete)|net\/http|http\.client|httplib/.test(low)) deny('BLOCKED: outbound network calls not allowed (REGLA Nº2).');
  // borrado destructivo/recursivo: orden de flags indiferente + alias de Windows (rd/rmdir/del /s, Remove-Item/ri -Recurse)
  if (/\brm\s+(-[a-z]*r[a-z]*|--recursive)/i.test(low)
      || /\b(rmdir|rd)\b[^\n]*\/s\b/i.test(low)
      || /\bdel\b[^\n]*\/s\b/i.test(low)
      || /\b(remove-item|ri)\b[^\n]*-(recurse|r)\b/i.test(low)) deny('BLOCKED: destructive/recursive deletion not allowed (REGLA Nº2).');
}

allow();
