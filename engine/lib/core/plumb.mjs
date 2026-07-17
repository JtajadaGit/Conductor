// conductor/lib/core/plumb.mjs — COSTURA de la fontanería runtime (plan expertise 2026-07-17, fase 1/2).
// HOY: identidad — la fontanería de un run vive en <change>/.conductor/ como siempre (cero cambio de
// comportamiento; la prueba del refactor es que NINGÚN test se toca).
// MAÑANA (fase 2 aprobada por Jorge): cambiar SOLO estas dos funciones moverá TODO el estado runtime a
// ~/.conductor/state/<projId>/<change>/ (fidelidad OpenSpec: el change queda con artefactos del estándar
// + provenance) con fallback al legado y GC al archivar. Todos los join(<change>, '.conductor', …) del
// motor pasan por aquí — el flip será una función, no 66 sitios.
import { join } from 'node:path';
export const plumbPath = (changeDir, ...rest) => join(changeDir, '.conductor', ...rest);
export const plumbDir = (changeDir) => plumbPath(changeDir);
