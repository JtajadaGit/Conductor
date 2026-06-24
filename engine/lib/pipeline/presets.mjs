// conductor/lib/pipeline/presets.mjs — los 4 PRESETS nombrados (el "dial" trivial→complejo) sobre el MISMO
// driver determinista. Un preset NO es un pipeline distinto: es un paquete de KNOBS de gobierno (complejidad
// + dureza del gate + freeze + pausas + timeout de revisión). `verify` está SIEMPRE presente (invariante de
// gobierno innegociable, lo reimpone resolvePhases). El sistema PROPONE preset por la carpeta tocada; el
// experto manda (cualquier knob explícito en conductor.json gana sobre el del preset). Sin dependencias.

export const PRESETS = {
  'quick-fix': { label: 'Arreglo rápido', complexity: 'simple', strict: { trace: false, id: false, clarify: false }, specFreeze: false, pauseAt: [], reviewTimeoutMs: 0, onReviewTimeout: 'wait' },
  'visual': { label: 'Retoque visual', complexity: 'simple', strict: { trace: false, id: false, clarify: false }, specFreeze: false, pauseAt: [], reviewTimeoutMs: 0, onReviewTimeout: 'wait' },
  'feature': { label: 'Funcionalidad', complexity: 'medium', strict: { trace: true, id: true, clarify: false }, specFreeze: false, pauseAt: ['apply'], reviewTimeoutMs: 0, onReviewTimeout: 'wait' },
  'migration': { label: 'Gran migración', complexity: 'complex', strict: { trace: true, id: true, clarify: true, semanticDelta: true }, specFreeze: true, pauseAt: ['spec', 'apply'], reviewTimeoutMs: 0, onReviewTimeout: 'wait' },
};

export const DEFAULT_PRESET = 'feature';
export const PRESET_NAMES = Object.keys(PRESETS);

// devuelve el bundle del preset (con su nombre) o null si el nombre no existe (→ el caller usa sus defaults).
export function resolvePreset(name) {
  return name && PRESETS[name] ? { name, ...PRESETS[name] } : null;
}

// PROPONE un preset a partir de las RUTAS tocadas (determinista, sin LLM). Solo sugiere: la decisión es del
// experto. Orden de especificidad: migración (datos/DDL) > visual (estilos/UI) > arreglo rápido (docs/config)
// > funcionalidad (default). Pensado para "detectar la carpeta tocada y proponer", no para imponer.
export function suggestPreset(paths = []) {
  const p = (paths || []).map((x) => String(x).toLowerCase());
  const any = (re) => p.some((x) => re.test(x));
  if (any(/migrat|\.sql$|\/ddl|schema\.|liquibase|flyway|alembic/)) return 'migration';
  if (any(/\.(css|scss|sass|less|html|vue|svelte|svg)$|(^|\/)(styles?|theme|assets)\//)) return 'visual';
  if (any(/\.(md|txt|rst|adoc)$|(^|\/)(docs?|readme)/)) return 'quick-fix';
  return DEFAULT_PRESET;
}
