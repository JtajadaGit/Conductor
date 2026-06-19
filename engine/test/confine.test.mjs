import { isOutside, assertConfined } from '../lib/sysops/confine.mjs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = join(dirname(fileURLToPath(import.meta.url)), '.tmp-confine');
const ROOT = join(BASE, 'project');

await test('confine: ruta DENTRO de la raíz → permitida', () => {
  eq(isOutside(ROOT, join(ROOT, 'src', 'a.ts')), false);
  eq(isOutside(ROOT, ROOT), false);
});

await test('confine: traversal con .. → fuera', () => {
  eq(isOutside(ROOT, join(ROOT, '..', 'secret.txt')), true);
  eq(isOutside(ROOT, join(BASE, 'other')), true);
});

await test('confine: sin raíz declarada → NO confina (compatibilidad)', () => {
  eq(isOutside('', join(BASE, 'cualquiera')), false);
  assertConfined('', { srcDir: join(BASE, 'fuera') }, new Set(['srcDir'])); // no lanza
});

await test('confine: assertConfined lanza si un arg-ruta escapa de la raíz', () => {
  const keys = new Set(['changeDir', 'srcDir']);
  assertConfined(ROOT, { changeDir: join(ROOT, 'openspec', 'changes', 'x'), srcDir: join(ROOT, 'src') }, keys); // dentro → ok
  let threw = false;
  try { assertConfined(ROOT, { srcDir: join(ROOT, '..', '..', 'etc') }, keys); } catch { threw = true; }
  assert(threw, 'debe lanzar para una ruta fuera de la raíz');
});
