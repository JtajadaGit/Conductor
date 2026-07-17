#!/usr/bin/env node
// Ensambla dist-plugin/ — la superficie limpia de distribución (la MISMA que produce el tarball de
// `npm i -g git+<repo>#tag` vía export-ignore). Solo la allowlist entra; CLAUDE.md, engine/, ui/, task/ fuera.
//
// Uso: node engine/build-dist.mjs   (el dir puede ser el clon del repo de distribución: se vacía sin tocar .git)

import { existsSync, mkdirSync, cpSync, rmSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DIST = join(ROOT, 'dist-plugin');

// dist-plugin/ puede ser el CLON permanente del repo de distribución: se vacía en cada build (los chunks
// hasheados de la UI se acumularían) pero JAMÁS su .git — así "release" = build + commit + tag + push.
if (existsSync(DIST)) {
  for (const e of readdirSync(DIST)) {
    if (e === '.git') continue;
    rmSync(join(DIST, e), { recursive: true, force: true });
  }
}

// Superficie de distribución (vía ÚNICA: npm i -g git+<repo>#tag) — lo que un dev necesita, nada más.
const INCLUDE = [
  'package.json', // EL manifest (bin + files + versión — la fuente de versión desde la retirada de la vía plugin)
  'LICENSE',
  'README.md',
  'assets/conductor.mjs',
  'assets/ui',
  'prompts', // el ALMA a la vista: la instrucción de cada fase, markdown editable (contribución sin JS)
  'hooks', // guard-hook.mjs legible: los devs lo referencian desde su PreToolUse (defensa en profundidad)
];

let ok = 0, skipped = 0;
for (const rel of INCLUDE) {
  const src = join(ROOT, rel);
  const dst = join(DIST, rel);
  if (!existsSync(src)) {
    console.warn(`SKIP (not found): ${rel}`);
    skipped++;
    continue;
  }
  mkdirSync(dirname(dst), { recursive: true });
  cpSync(src, dst, { recursive: true, force: true });
  console.log(`ok   ${rel}`);
  ok++;
}

console.log(`\ndist-plugin/ listo — ${ok} items copiados${skipped ? `, ${skipped} saltados` : ''}.`);
console.log('Es la superficie EXACTA que instala `npm i -g git+<repo>#tag` (git archive + export-ignore producen lo mismo).');
