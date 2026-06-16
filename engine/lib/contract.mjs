// conductor/lib/contract.mjs — gate de contrato multi-dominio → findings.
// Autodetecta por extensión: .sql → esquema BD · .ts/.tsx → contrato público TS · .json → OpenAPI.
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { diffOpenApi } from './openapi-diff.mjs';
import { diffSchema } from './sqldiff.mjs';
import { diffPublic } from './tsdiff.mjs';

function oasdiffAvailable() { try { execFileSync('oasdiff', ['--version'], { stdio: 'ignore' }); return true; } catch { return false; }
}

export function checkContract(baseFile, headFile, { preferOasdiff = true } = {}) {
  const F = [];
  if (!existsSync(baseFile) || !existsSync(headFile)) { F.push({ rule: 'contract.files-missing', severity: 'error', message: `faltan base/head (${baseFile}, ${headFile})` }); return F; }

  // dominio por extensión
  if (/\.sql$/i.test(baseFile)) { for (const f of diffSchema(readFileSync(baseFile, 'utf8'), readFileSync(headFile, 'utf8'))) F.push({ ...f, rule: `contract.${f.rule}`, file: headFile }); return F; }
  if (/\.tsx?$/i.test(baseFile)) { for (const f of diffPublic(readFileSync(baseFile, 'utf8'), readFileSync(headFile, 'utf8'))) F.push({ ...f, rule: `contract.${f.rule}`, file: headFile }); return F; }

  // OpenAPI/JSON-Schema. Producción: oasdiff (450+ reglas) si está y se prefiere. Si no, motor nativo.
  if (preferOasdiff && oasdiffAvailable()) {
    try {
      const out = execFileSync('oasdiff', ['breaking', baseFile, headFile, '--format', 'json'], { encoding: 'utf8' });
      const parsed = JSON.parse(out || '[]');
      for (const c of parsed) F.push({ rule: `oasdiff.${c.id || 'breaking'}`, severity: c.level >= 3 ? 'breaking' : 'warning', message: c.text || JSON.stringify(c), pointer: c.path });
      return F;
    } catch (e) { /* cae al motor nativo */ }
  }

  let base, head;
  try { base = JSON.parse(readFileSync(baseFile, 'utf8')); } catch (e) { F.push({ rule: 'contract.invalid-json', severity: 'error', message: `JSON inválido en ${baseFile}: ${e.message}`, file: baseFile }); return F; }
  try { head = JSON.parse(readFileSync(headFile, 'utf8')); } catch (e) { F.push({ rule: 'contract.invalid-json', severity: 'error', message: `JSON inválido en ${headFile}: ${e.message}`, file: headFile }); return F; }
  if (!base || typeof base !== 'object' || !head || typeof head !== 'object') { F.push({ rule: 'contract.not-object', severity: 'error', message: 'el contrato no es un objeto OpenAPI/JSON-Schema' }); return F; }
  const findings = diffOpenApi(base, head);
  for (const f of findings) F.push({ rule: `contract.${f.rule}`, severity: f.severity, message: f.message, pointer: f.pointer, file: headFile });
  return F;
}
