// conductor/lib/core/plumb.mjs — COSTURA de la fontanería runtime (plan expertise 2026-07-17, fase 1/2).
// HOY: identidad — la fontanería de un run vive en <change>/.conductor/ como siempre (cero cambio de
// comportamiento; la prueba del refactor es que NINGÚN test se toca).
// MAÑANA (fase 2 aprobada): cambiar SOLO estas dos funciones moverá TODO el estado runtime a
// ~/.conductor/state/<projId>/<change>/ (fidelidad OpenSpec: el change queda con artefactos del estándar
// + provenance) con fallback al legado y GC al archivar. Todos los join(<change>, '.conductor', …) del
// motor pasan por aquí — el flip será una función, no 66 sitios.
import { join } from 'node:path';
export const plumbPath = (changeDir, ...rest) => join(changeDir, '.conductor', ...rest);
export const plumbDir = (changeDir) => plumbPath(changeDir);

// dominio de spec DERIVADO del nombre del change: el PRIMER token con SIGNIFICADO — no "quiero"/"crea"/
// "componente" (caso real: un prompt "Quiero un componente formulario..." creaba specs/quiero/spec.md,
// un dominio sin sentido que ensucia la fuente de verdad para siempre). Sin token útil → core.
const DOMAIN_STOP = new Set('quiero quieres necesito necesitamos crea crear creame hazme haz hacer anade anadir agrega agregar implementa implementar genera generar pon poner un una unos unas el la los las de del en con sin para por que y o u a al es me mi tu se lo nuevo nueva componente pagina want need create make add build new please the of with without for and or to my this este esta'.split(' '));
export function domainFromName(name) {
  for (const t of String(name || '').toLowerCase().split('-')) {
    if (t && t.length >= 3 && !DOMAIN_STOP.has(t)) return t;
  }
  return 'core';
}
