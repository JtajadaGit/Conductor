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
  'LICENSE',
  'README.md',
  'docs/como-probar.md',
  'assets/conductor.mjs',
  'assets/ui',
  'plugin/skills',
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
