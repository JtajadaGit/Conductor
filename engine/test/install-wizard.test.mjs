// Test del INSTALADOR GUIADO (`conductor install`): el onboarding de un comando. Guionizado por pipe
// (CONDUCTOR_TTY=1) — cada paso saltable, jamás se cuelga, y sin TTY imprime la checklist y sale.
import { mkdirSync, rmSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const BIN = resolve(HERE, '..', 'bin', 'conductor.mjs');

await test('install: sin TTY imprime la checklist de 3 pasos y sale 0 (CI/pipes jamás se cuelgan)', () => {
  const out = execFileSync(process.execPath, [BIN, 'install'], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, timeout: 20000 });
  assert(out.includes('instalación guiada'), 'cabecera');
  assert(out.includes('byok login') && out.includes('connect') && /3\)\s+conductor/.test(out), 'los 3 pasos manuales listados');
});

await test('install: flujo interactivo guionizado — saltar todo termina limpio con el resumen final', () => {
  const home = join(HERE, '.tmp-wizard-home');
  rmSync(home, { recursive: true, force: true }); mkdirSync(home, { recursive: true });
  // respuestas: n (sin credenciales ahora) · Enter (sin host) · n (no abrir panel)
  const out = execFileSync(process.execPath, [BIN, 'install'], {
    encoding: 'utf8', input: 'n\n\nn\n', windowsHide: true, timeout: 30000,
    env: { ...process.env, CONDUCTOR_TTY: '1', CONDUCTOR_HOME: home },
  });
  assert(out.includes('1/3') && out.includes('2/3') && out.includes('3/3'), 'los 3 pasos preguntados');
  assert(out.includes('byok login'), 'recuerda el comando de credenciales al saltarlo');
  assert(out.includes('✅ Listo'), 'cierre con resumen de superficies');
  rmSync(home, { recursive: true, force: true });
});
