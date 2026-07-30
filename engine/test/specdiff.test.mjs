// T6 — SPEC-DIFF: el delta del change contra la spec VIVA promovida, servido como diff textual.
// Dominio saneado (jamás rutas del cliente), spec nueva = todo-en-verde, secretos redactados.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

await test('specdiff: diff real contra la spec viva · spec nueva => todo añadido · dominio raro => 404 · secreto => redactado', async () => {
  const { createAppServer } = await import('../lib/serving/serve.mjs');
  const R = join(HERE, '.tmp-specdiff');
  rmSync(R, { recursive: true, force: true });
  // proyecto con spec VIVA del dominio "core" y un change con delta que la modifica
  mkdirSync(join(R, 'openspec', 'specs', 'core'), { recursive: true });
  writeFileSync(join(R, 'openspec', 'conductor.json'), '{}');
  writeFileSync(join(R, 'openspec', 'specs', 'core', 'spec.md'), '## Requirements\n### Requirement: base\nold line\n');
  const ch = join(R, 'openspec', 'changes', 'mi-cambio');
  mkdirSync(join(ch, 'specs', 'core'), { recursive: true });
  writeFileSync(join(ch, 'specs', 'core', 'spec.md'), '## Requirements\n### Requirement: base\nnew line sk-SECRETLEAK1234567890xx\n');
  // dominio SIN spec viva (nuevo)
  mkdirSync(join(ch, 'specs', 'fresh'), { recursive: true });
  writeFileSync(join(ch, 'specs', 'fresh', 'spec.md'), '## ADDED\n### Requirement: brand-new\n');
  const srv = await createAppServer({ root: R, engine: 'E.mjs', spawnRun: () => null });
  try {
    const d1 = await (await fetch(srv.url + 'api/run/mi-cambio/specdiff?d=core')).text();
    assert(/^-.*old line/m.test(d1) && /^\+.*new line/m.test(d1), 'diff con la línea vieja en rojo y la nueva en verde');
    assert(!d1.includes('sk-SECRETLEAK1234567890xx'), 'el secreto del delta viaja REDACTADO');
    const d2 = await (await fetch(srv.url + 'api/run/mi-cambio/specdiff?d=fresh')).text();
    assert(/spec NUEVA/.test(d2) && /\+ ### Requirement: brand-new/.test(d2), 'sin spec viva => todo-en-verde declarado');
    const r3 = await fetch(srv.url + 'api/run/mi-cambio/specdiff?d=../evil');
    eq(r3.status, 404, 'dominio saneado: los ../ no llegan ni a mirar el disco');
    const r4 = await fetch(srv.url + 'api/run/mi-cambio/specdiff?d=nope');
    eq(r4.status, 404, 'dominio sin delta => 404 honesto');
  } finally { await srv.close(); rmSync(R, { recursive: true, force: true }); }
});
