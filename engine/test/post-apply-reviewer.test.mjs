// B.3 (patch post-apply-reviewer): los hallazgos CONFIRMADOS y graves del revisor fresco entran en el
// sello como gate CONSULTIVO (severity warning — evidencia, no veto). Aquí se prueba el extractor.
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { plumbPath } from '../lib/core/plumb.mjs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { postApplyFindings } from '../lib/pipeline/drive.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const TMP = join(HERE, '.tmp-par');

await test('post-apply(B.3): Confirmed + error/critical/breaking → findings consultivos para el sello', () => {
  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(plumbPath(TMP), { recursive: true });
  writeFileSync(plumbPath(TMP, 'post-apply-review.md'), [
    '# Post-Apply Review',
    '- Confirmed: error — el endpoint de pago ignora el escenario de timeout',
    '- Suspect: style — nombres poco descriptivos',
    '- Confirmed: breaking change en la firma pública de applyCoupon()',
  ].join('\n'));
  const f = postApplyFindings(TMP);
  eq(f.length, 2);
  assert(f.every((x) => x.severity === 'warning' && x.rule === 'post-apply.confirmed' && x.file === '.conductor/post-apply-review.md'), 'consultivo: warning, nunca error');
  rmSync(TMP, { recursive: true, force: true });
});

await test('post-apply(B.3): sin fichero o sin graves confirmados → cero findings (cero ruido)', () => {
  rmSync(TMP, { recursive: true, force: true });
  eq(postApplyFindings(TMP).length, 0);
  mkdirSync(plumbPath(TMP), { recursive: true });
  writeFileSync(plumbPath(TMP, 'post-apply-review.md'), '# Post-Apply Review\n- Suspect: error — sin consenso entre lentes\n- Confirmed: style — nomenclatura');
  eq(postApplyFindings(TMP).length, 0);
  rmSync(TMP, { recursive: true, force: true });
});
