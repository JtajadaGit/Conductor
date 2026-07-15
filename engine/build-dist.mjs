#!/usr/bin/env node
// Assembles dist-plugin/ — the clean distribution surface shipped to devs.
// Only the allowlisted files (plugin surface) land here; CLAUDE.md, engine/, ui/, task/ stay out.
//
// Usage: node engine/build-dist.mjs
// After running, set marketplace.json > plugins[0].source = "./dist-plugin" to use it.

import { existsSync, mkdirSync, cpSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DIST = join(ROOT, 'dist-plugin');

// Plugin distribution surface — what devs need, nothing more.
const INCLUDE = [
  'plugin.json',
  '.mcp.json',
  '.github/plugin/marketplace.json', // el repo dist ES el marketplace: /plugin marketplace add <url-dist> funciona solo
  'package.json', // manifest de la vía npm (npm i -g git+<repo-dist>): bin + files, 0 deps
  'LICENSE',
  'README.md',
  'docs/MAPA.md', // el producto en una página (pitch + mapa + uso)
  'docs/integraciones.md', // vías alternativas (npm, hosts MCP, terminal)
  'assets/conductor.mjs',
  'assets/ui',
  'plugin/skills',
  'plugin/hooks', // guard-hook.mjs legible: los devs lo referencian desde su PreToolUse (defensa en profundidad)
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

console.log(`\ndist-plugin/ ready — ${ok} items copied${skipped ? `, ${skipped} skipped` : ''}.`);
console.log('Next: set marketplace.json source to "./dist-plugin" to publish this surface only.');
