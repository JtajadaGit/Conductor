import { buildTrace } from '../lib/trace.mjs';
import { explain } from '../lib/explain.mjs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync, symlinkSync, rmSync, existsSync } from 'node:fs';

const TMP = join(dirname(fileURLToPath(import.meta.url)), '.tmp-sec');
rmSync(TMP, { recursive: true, force: true }); mkdirSync(join(TMP, 'change'), { recursive: true });
mkdirSync(join(TMP, 'src'), { recursive: true });
writeFileSync(join(TMP, 'change', 'spec.md'), '## ADDED Requirements\n<!-- id: REQ-X -->\n### Requirement: X\n#### Scenario: s\n- **GIVEN** a\n');
writeFileSync(join(TMP, 'src', 'a.ts'), '// @conductor REQ-X\nexport const a=1;');

await test('seguridad: NO escanea la raíz del filesystem (anti disco-entero)', () => {
  // un srcDir = raíz de unidad/FS no debe escanear todo el disco → 0 ficheros trazados
  const root = process.platform === 'win32' ? 'C:\\' : '/';
  const t = buildTrace(join(TMP, 'change'), root);
  // no debe petar ni colgarse; al ser raíz insegura, no escanea → el requisito queda sin code (warning)
  assert(Array.isArray(t.findings));
  assert(t.matrix[0].code.length === 0, 'no traza código desde la raíz del FS');
});

await test('seguridad: srcDir normal sí funciona', () => {
  const t = buildTrace(join(TMP, 'change'), join(TMP, 'src'));
  assert(t.matrix[0].cov.code, 'traza el código del proyecto normal');
});

await test('seguridad: symlinks no se siguen (anti-bucle / anti-escape)', () => {
  if (process.platform === 'win32') return; // symlink en Windows requiere privilegios; se omite
  const sdir = join(TMP, 'src2'); mkdirSync(sdir, { recursive: true });
  writeFileSync(join(sdir, 'real.ts'), '// @conductor REQ-X\n');
  try { symlinkSync(TMP, join(sdir, 'loop'), 'dir'); } catch { return; } // si no se puede crear, omite
  const r = explain(sdir); // no debe colgarse por el bucle del symlink
  assert(Array.isArray(r.capabilities));
});

rmSync(TMP, { recursive: true, force: true });
