#!/usr/bin/env node
// build-sdk.mjs — empaqueta el Copilot SDK (JS puro) en assets/copilot-sdk.mjs con esbuild (devDep).
// EXTERNO: @github/copilot (el runtime de ~557MB) — en runtime el sdk-runner pasa `cliPath` apuntando
// al copilot GLOBAL del usuario. Si el SDK fuente no está disponible, avisa y sale 0 (build opcional).
// Fuente del SDK: env SDK_SRC (node_modules con @github/copilot-sdk) o ../../sdk-spike/node_modules.
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SDK_SRC = resolve(process.env.SDK_SRC || join(HERE, '..', '..', 'sdk-spike', 'node_modules'));
const OUT = join(HERE, '..', 'assets', 'copilot-sdk.mjs');

if (!existsSync(join(SDK_SRC, '@github', 'copilot-sdk'))) {
  console.log(`build-sdk: SDK no encontrado en ${SDK_SRC} — bundle omitido (el runner spawn sigue siendo el default).`);
  process.exit(0);
}
const { build } = await import('esbuild');
await build({
  entryPoints: [join(HERE, 'sdk-entry.mjs')],
  outfile: OUT,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node18',
  external: ['@github/copilot'],
  nodePaths: [SDK_SRC],
  banner: { js: '// copilot-sdk bundle (generado por engine/build-sdk.mjs). Runtime @github/copilot EXTERNO → cliPath.' },
  logLevel: 'warning',
});
// post-proceso: windowsHide en los spawn del SDK (sin esto, en Windows el runtime abre ventanas cmd)
const { statSync, readFileSync, writeFileSync } = await import('node:fs');
let out = readFileSync(OUT, 'utf8');
const n = (out.match(/this\.cliProcess = spawn\(.*?, \{/g) || []).length;
out = out.replace(/(this\.cliProcess = spawn\(.*?, \{)/g, '$1\n          windowsHide: true,');
writeFileSync(OUT, out);
console.log(`assets/copilot-sdk.mjs escrito (${Math.round(statSync(OUT).size / 1024)} KB, runtime externo, ${n} spawn(s) con windowsHide)`);
