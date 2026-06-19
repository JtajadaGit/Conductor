// Regresión REAL (2026-06-16): comillas tipográficas (" " ' ') en el fuente de la UI COMPILAN con
// TypeScript/Vite (dentro de un template literal de Lit son texto), pero el navegador NO las reconoce como
// delimitadores de atributo → class="card" deja de casar → el CSS no aplica → panel roto. Lo destapó la
// verificación en navegador, no el build. Este guard lo caza en CI sin necesidad de abrir el navegador.
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const UI_SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'ui', 'src');
function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (/\.(ts|css|html)$/.test(e.name)) out.push(p);
  }
  return out;
}

await test('ui: sin comillas tipográficas en el fuente (compilan pero rompen los atributos HTML en runtime)', () => {
  let files = [];
  try { files = walk(UI_SRC); } catch { return; } // checkout solo-motor (sin ui/) → no aplica, no falla
  const bad = [];
  for (const f of files) {
    const m = readFileSync(f, 'utf8').match(/[“”‘’]/g);
    if (m) bad.push(`${f.split(/[\\/]/).slice(-2).join('/')} (${m.length})`);
  }
  assert(bad.length === 0, 'comillas tipográficas (usa rectas " \'): ' + bad.join(', '));
});
