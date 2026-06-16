#!/usr/bin/env node
// build-ui.mjs — CODEGEN de la UI. Lee los assets REALES de lib/ui/ (.html/.css/.client.js — que el
// editor resalta y el linter revisa) y los compone en lib/ui-assets.mjs (módulo generado, transporte).
// Así la UI se edita como ficheros de verdad pero el motor sigue siendo single-file 0-deps al empaquetar.
// Pipeline: `node build-ui.mjs` (regenera) → `node build.mjs` (bundle). Determinista → se commitea.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const UI = join(dirname(fileURLToPath(import.meta.url)), 'lib', 'ui');
const read = (f) => readFileSync(join(UI, f), 'utf8');

// compone una página: la shell tiene /*__CSS__*/ dentro de <style> y /*__JS__*/ dentro de <script>
const NL = '\n';
const compose = (base) => read(`${base}.html`).replace('/*__CSS__*/', () => read(`${base}.css`) + NL + read('shared.css')).replace('/*__JS__*/', () => read(`${base}.client.js`));

const SHELL = compose('shell');
const RUN = SHELL;   // alias: el shell ES la única página (SPA)
const PANEL = SHELL;

// validación temprana: el JS de cliente debe compilar (caza el "cargando… mudo" en build, no en runtime)
for (const [name, page] of [['shell', SHELL]]) {
  const js = page.match(/<script>([\s\S]*?)<\/script>/)?.[1] || '';
  try { new Function(js); } catch (e) { console.error(`✗ build-ui: el JS de ${name} no compila: ${e.message}`); process.exit(1); }
}

const out = `// GENERADO por engine/build-ui.mjs desde lib/ui/ — NO EDITAR A MANO (edita lib/ui/*.{html,css,client.js}).
export const SHELL_PAGE = ${JSON.stringify(SHELL)};
export const RUN_PAGE = SHELL_PAGE;
export const PANEL_PAGE = SHELL_PAGE;
`;
writeFileSync(join(dirname(fileURLToPath(import.meta.url)), 'lib', 'ui-assets.mjs'), out);
console.log(`lib/ui-assets.mjs generado (run ${RUN.length}B, panel ${PANEL.length}B) — JS de cliente OK`);
