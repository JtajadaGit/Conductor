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
  assert(out.includes('litellm login') && out.includes('connect') && /3\)\s+conductor/.test(out), 'los 3 pasos manuales listados');
});

await test('install: flujo interactivo guionizado — saltar todo termina limpio con el resumen final', async () => {
  const home = join(HERE, '.tmp-wizard-home');
  rmSync(home, { recursive: true, force: true }); mkdirSync(home, { recursive: true });
  // respuestas: Enter (hosts = los detectados; CONDUCTOR_USERHOME=tmp → ninguno, JAMÁS los CLIs reales de la
  // máquina que corre la suite) · n (no abrir panel). El paso 1 (credenciales) informa del fichero sin pedir la key.
  const out = execFileSync(process.execPath, [BIN, 'setup'], {
    encoding: 'utf8', input: '\nn\n', windowsHide: true, timeout: 30000,
    env: { ...process.env, CONDUCTOR_TTY: '1', CONDUCTOR_HOME: home, CONDUCTOR_USERHOME: home },
  });
  assert(out.includes('1/3') && out.includes('2/3') && out.includes('3/3'), 'los 3 pasos presentes');
  assert(out.includes('PLANTILLA'), 'el paso 1 DEJA la plantilla creada (no pide la key, no dice solo "escribe un fichero")');
  assert(out.includes('litellm login'), 'y menciona la alternativa por terminal');
  assert(out.includes('Copilot CLI') && out.includes('Claude Code') && out.includes('OpenCode'), 'el menú ofrece los 3 CLIs');
  assert(out.includes('nada conectado'), 'con home vacío + Enter no conecta ningún CLI (y lo dice)');
  // la plantilla EXISTE tras el wizard, con placeholders — y un segundo setup NO la da por "configurada"
  const { readFileSync: rf, existsSync: ex } = await import('node:fs');
  assert(ex(join(home, 'litellm.json')), 'litellm.json creado por setup');
  const tpl = JSON.parse(rf(join(home, 'litellm.json'), 'utf8'));
  assert(/PEGA-AQUI/.test(tpl.apiKey) && /TU-PROXY/.test(tpl.baseUrl), 'placeholders que enseñan el formato');
  const out2 = execFileSync(process.execPath, [BIN, 'setup'], {
    encoding: 'utf8', input: 'n\nn\n', windowsHide: true, timeout: 30000,
    env: { ...process.env, CONDUCTOR_TTY: '1', CONDUCTOR_HOME: home, CONDUCTOR_USERHOME: home },
  });
  assert(out2.includes('PLANTILLA'), 'plantilla sin rellenar ≠ "ya configuradas" (re-informa, no miente)');
  assert(out.includes('✅ Listo'), 'cierre con resumen de superficies');
  rmSync(home, { recursive: true, force: true });
});
