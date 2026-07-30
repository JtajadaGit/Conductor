// T4 — `conductor upgrade`: lógica pura con exec INYECTADO (jamás npm real en la suite).
import { resolveInstalledOrigin, upgradePlan } from '../lib/sysops/upgrade.mjs';

await test('upgrade: resuelve el origen git de la instalación local — commit clavado se recorta, rama se conserva', () => {
  const sha = 'a'.repeat(40);
  eq(resolveInstalledOrigin({ lsJson: { dependencies: { conductor: { version: '2.0.0', resolved: `git+https://x.y/repo.git#${sha}` } } } }),
    { origin: 'git+https://x.y/repo.git', version: '2.0.0' }, 'el #commit de npm NO se re-clava (seguir el remoto)');
  eq(resolveInstalledOrigin({ lsJson: { dependencies: { conductor: { version: '2.0.0', resolved: 'git+https://x.y/repo.git#feature/2.0.0' } } } }).origin,
    'git+https://x.y/repo.git#feature/2.0.0', 'una RAMA/tag instalada a propósito se conserva');
  eq(resolveInstalledOrigin({ lsJson: '{"dependencies":{}}' }), null, 'no instalado => null');
  eq(resolveInstalledOrigin({ lsJson: { dependencies: { conductor: { resolved: 'https://registry/x.tgz' } } } }), null, 'instalado de registry (no git) => null: upgrade requiere --from');
  eq(resolveInstalledOrigin({ lsJson: 'no-json' }), null, 'salida corrupta => null, no crash');
});

await test('upgrade: el plan apunta al bundle del prefix real (custom prefixes incluidos) y sin origen no hay plan', () => {
  const p = upgradePlan({ origin: 'git+https://x.y/repo.git#main', npmRoot: 'C:\\Users\\dev\\npm-global\\node_modules\n' });
  eq(p.installArgs, ['i', '-g', 'git+https://x.y/repo.git#main']);
  assert(/npm-global[\\/]node_modules[\\/]conductor[\\/]assets[\\/]conductor\.mjs$/.test(p.bundlePath), 'bundle del motor NUEVO bajo el prefix (trim del \\n de npm root)');
  eq(upgradePlan({ origin: null, npmRoot: 'x' }), null);
  eq(upgradePlan({ origin: 'x', npmRoot: null }), null);
});

await test('upgrade: el case del CLI existe con guard de repo-dev, --from, y selfcheck del motor nuevo', async () => {
  const { readFileSync } = await import('node:fs');
  const { join, dirname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'conductor.mjs'), 'utf8');
  assert(src.includes("case 'upgrade'"), 'case upgrade presente');
  assert(/--from/.test(src) && /resolveInstalledOrigin/.test(src), 'origen: --from o el de la instalación');
  assert(/selfcheck/.test(src.split("case 'upgrade'")[1].slice(0, 2500)), 'tras instalar corre selfcheck del bundle NUEVO');
  assert(/checkout de desarrollo/.test(src.split("case 'upgrade'")[1].slice(0, 2500)), 'guard: en el repo dev no se auto-actualiza');
});
