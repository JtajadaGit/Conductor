// conductor/lib/core/plumb.mjs — COSTURA de la fontanería runtime .
// HOY: identidad — la fontanería de un run vive en <change>/.conductor/ como siempre (cero cambio de
// comportamiento; la prueba del refactor es que NINGÚN test se toca).
// MAÑANA (fase 2 aprobada): cambiar SOLO estas dos funciones moverá TODO el estado runtime a
// ~/.conductor/state/<projId>/<change>/ (fidelidad OpenSpec: el change queda con artefactos del estándar
// + provenance) con fallback al legado y GC al archivar. Todos los join(<change>, '.conductor', …) del
// motor pasan por aquí — el flip será una función, no 66 sitios.
import { join, resolve, basename, dirname } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
// FASE 2 — una carpeta .conductor dentro de cada feature es ruido para el developer:
// la fontanería runtime vive en UN punto de la raíz del
// proyecto — <proyecto>/.conductor/runs/<change>/ (patrón .git/.angular/.terraform; las skills de
// proyecto ya vivían en <proyecto>/.conductor/skills). La carpeta del change queda SOLO con los
// artefactos OpenSpec del desarrollador. HOME (~/.conductor) quedó DESCARTADO con datos de hoy: el
// agente escribe lentes/artefactos vía su sesión y fuera del dir de confianza del CLI toda escritura
// se deniega (el muro `denied-no-approval-rule`). LEGADO: un run con <change>/.conductor/ existente
// se sigue leyendo Y escribiendo ahí (coherencia total: cada run vive donde nació).
function plumbBase(changeDir) {
  const abs = resolve(changeDir);
  const legacy = join(abs, '.conductor');
  if (existsSync(legacy)) return legacy;
  // change AÚN sin crear → legacy: quien escribe primero define el layout. Los flujos reales (serve/mcp/bin)
  // SIEMPRE crean la carpeta del change antes de conducir → esos van al layout moderno; una fixture que
  // siembra evidencia "de la nada" conserva la semántica de siempre (crear el change al escribir dentro).
  if (!existsSync(abs)) return legacy;
  const parent = dirname(abs);
  const isArch = basename(parent) === 'archive';
  const changesDir = isArch ? dirname(parent) : parent;
  // SOLO el layout real openspec/changes[/archive]/<name> migra; cualquier otra forma (fixtures,
  // rutas ad-hoc) conserva el layout legado — jamás sembramos .conductor fuera de un proyecto OpenSpec.
  if (basename(changesDir) !== 'changes' || basename(dirname(changesDir)) !== 'openspec') return legacy;
  const root = dirname(dirname(changesDir));
  return join(root, '.conductor', 'runs', ...(isArch ? ['archive'] : []), basename(abs));
}
export const plumbPath = (changeDir, ...rest) => join(plumbBase(changeDir), ...rest);
export const plumbDir = (changeDir) => plumbBase(changeDir);

// FASE 3 — provenance.json y dashboard.html tampoco pintan nada en el change:
// los GENERADOS del run (informe HTML, sello) también son fontanería — nacen en la evidencia. Los changes
// ANTERIORES los tienen en la raíz del change → los lectores buscan en ambos sitios, moderno primero.
// Sin ninguno de los dos → devuelve el moderno (es el destino de escritura).
export const evidencePath = (changeDir, file) => {
  const modern = plumbPath(changeDir, file);
  if (existsSync(modern)) return modern;
  const legacy = join(resolve(changeDir), file);
  return existsSync(legacy) ? legacy : modern;
};

// Fases PROGRAMADAS de un run (state.json del driver, con fallback legado). Los gates la usan para no
// acusar la ausencia de artefactos de fases que este run nunca programó: en complejidad simple no hay
// fase tasks/design, y el aviso «tasks.md ausente» se leía como error en el informe de un GREEN limpio.
// Solo afecta a AVISOS de presencia — los errores (spec/report ausentes) jamás dependen del plan.
export function runPhases(changeDir) {
  for (const p of [plumbPath(changeDir, 'state.json'), join(resolve(changeDir), '.conductor-run.json')]) {
    try { const s = JSON.parse(readFileSync(p, 'utf8')); if (Array.isArray(s.phases) && s.phases.length) return s.phases.map(String); } catch {}
  }
  return null;
}

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
