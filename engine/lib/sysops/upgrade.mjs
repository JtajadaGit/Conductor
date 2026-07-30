// conductor/lib/sysops/upgrade.mjs — ACTUALIZACIÓN VERIFICADA (supply-chain): reinstala el paquete global
// desde SU MISMO origen git y corre el selfcheck del motor NUEVO (versión + sha + firma si hay .sig/.pub).
// Lógica PURA e inyectable (los tests jamás ejecutan npm real). La URL del origen sale de la instalación
// LOCAL del usuario — nunca hardcodeada (confidencialidad: cada org tiene su remoto).
import { join } from 'node:path';

// Origen de la instalación global actual según npm (`npm ls -g conductor --json --depth=0`):
// dependencies.conductor.resolved = "git+<url>#<commit>". Devuelve {origin, version} o null (no instalado
// por git / salida rara). El #<commit> se RECORTA: reinstalar debe seguir la RAMA/TAG del origen, no clavar
// el commit viejo — para eso se guarda el origen SIN fragmento si el fragmento parece un sha.
export function resolveInstalledOrigin({ lsJson }) {
  try {
    const j = typeof lsJson === 'string' ? JSON.parse(lsJson) : lsJson;
    const dep = j?.dependencies?.conductor;
    if (!dep) return null;
    const resolved = String(dep.resolved || '');
    if (!resolved.startsWith('git+')) return null;
    const [base, frag] = resolved.split('#');
    // un fragmento hex largo = commit clavado por npm → se quita (seguir la rama por defecto del remoto);
    // un fragmento corto no-hex (rama/tag) se CONSERVA (el usuario instaló una rama concreta)
    const keepFrag = frag && !/^[0-9a-f]{20,}$/i.test(frag) ? `#${frag}` : '';
    return { origin: base + keepFrag, version: dep.version || null };
  } catch { return null; }
}

// Plan de actualización: argumentos npm + ruta del bundle NUEVO (para el selfcheck post-instalación).
export function upgradePlan({ origin, npmRoot }) {
  if (!origin || !npmRoot) return null;
  return {
    installArgs: ['i', '-g', origin],
    bundlePath: join(String(npmRoot).trim(), 'conductor', 'assets', 'conductor.mjs'),
  };
}
