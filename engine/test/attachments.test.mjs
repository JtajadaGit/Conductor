// ADJUNTOS del panel (imágenes/capturas pegadas en la petición): /api/launch las guarda como CONTENIDO
// del change (attachments/, junto a la spec — entrada del revisor, no fontanería) y el request que viaja
// al driver referencia sus rutas → cualquier fase puede abrirlas con la tool `view`.
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

await test('attachments: launch con imágenes base64 → ficheros saneados en el change + rutas en el request del driver', async () => {
  const { createAppServer } = await import('../lib/serving/serve.mjs');
  const { EventEmitter } = await import('node:events');
  const ROOT = join(dirname(fileURLToPath(import.meta.url)), '.tmp-atts');
  rmSync(ROOT, { recursive: true, force: true });
  mkdirSync(join(ROOT, 'openspec', 'changes'), { recursive: true });
  writeFileSync(join(ROOT, 'openspec', 'conductor.json'), '{}');
  const spawned = [];
  const mkChild = (a) => { const c = new EventEmitter(); c.sent = []; c.send = () => {}; c.kill = () => {}; c.args = a; spawned.push(c); return c; };
  const srv = await createAppServer({ root: ROOT, engine: 'E.mjs', spawnRun: mkChild });
  try {
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10, 1, 2, 3]);
    const b64 = bytes.toString('base64');
    const r = await (await fetch(srv.url + 'api/launch', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
      request: 'replica este mockup', name: 'con-captura', complexity: 'simple',
      attachments: [
        { name: 'Mockup Final (v2).PNG', data: 'data:image/png;base64,' + b64 },
        { name: '../evil.exe', data: b64 }, // nombre hostil: se sanea y la extensión se fuerza a imagen
      ],
    }) })).json();
    eq(r.ok, true, 'launch con adjuntos acepta');
    const dir = join(ROOT, 'openspec', 'changes', 'con-captura', 'attachments');
    assert(existsSync(join(dir, 'mockup-final-v2-1.png')), 'imagen guardada con nombre saneado');
    eq(readFileSync(join(dir, 'mockup-final-v2-1.png')).toString('base64'), b64, 'bytes intactos (dataURL decodificado)');
    assert(existsSync(join(dir, 'evil-2.png')), 'nombre hostil saneado y JAMÁS ejecutable (extensión imagen forzada)');
    const req = spawned[0].args.request;
    assert(req.includes('attachments/mockup-final-v2-1.png') && req.includes('attachments/evil-2.png'), 'el request del driver referencia las rutas (el agente las abre con view)');
    assert(req.startsWith('replica este mockup'), 'la petición original va primero, intacta');
  } finally { await srv.close(); rmSync(ROOT, { recursive: true, force: true }); }
});
