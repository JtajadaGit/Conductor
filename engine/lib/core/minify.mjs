// conductor/lib/minify.mjs — minificador de CONTEXTO para el prompt (token-first, determinista, 0 deps).
// Reduce tokens SIN perder semántica: recorta espacios finales, colapsa 3+ líneas en blanco a una, y quita
// blancos al inicio/fin. Lossless en markdown/texto. Para CÓDIGO (opt-in) puede además quitar comentarios de
// línea y colapsar blancos — útil si algún día se inyecta fuente en el prompt (hoy el contexto es perezoso por
// ruta, así que se aplica sobre todo a los RESÚMENES inlineados). Complementa a summarizeArtifact (no lo sustituye).

export function minifyText(s) {
  return String(s == null ? '' : s)
    .replace(/[ \t]+$/gm, '')   // espacios/tabs al final de cada línea
    .replace(/\n{3,}/g, '\n\n') // 3+ líneas en blanco → 1
    .replace(/^\n+|\n+$/g, ''); // sin líneas en blanco al inicio/fin
}

// minificador para código (opt-in): quita comentarios de línea (// y #, sin tocar :// de URLs) y colapsa blancos.
// NO toca comentarios de bloque ni strings con precisión (es heurístico) → usar solo donde la pérdida sea aceptable.
export function minifyCode(s) {
  return minifyText(String(s == null ? '' : s)
    .replace(/(?<!:)\/\/[^\n]*/g, '')
    .replace(/^\s*#[^\n]*/gm, ''));
}

const toks = (x) => Math.ceil(String(x == null ? '' : x).length / 4);
// tokens (aprox chars/4) ahorrados entre el original y el minificado; nunca negativo.
export function minifySaved(orig, min) { return Math.max(0, toks(orig) - toks(min)); }
