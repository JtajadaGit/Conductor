#!/usr/bin/env node
// Runner de tests dependency-free (TAP-ish). Descubre *.test.mjs en este dir y los ejecuta.
import { readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
let passed = 0, failed = 0;
const fails = [];

globalThis.test = async (name, fn) => {
  try { await fn(); passed++; console.log(`ok   ${name}`); }
  catch (e) { failed++; fails.push({ name, e }); console.log(`FAIL ${name}\n       ${e.message}`); }
};
globalThis.assert = (cond, msg) => { if (!cond) throw new Error(msg || 'assert falló'); };
globalThis.eq = (a, b, msg) => { const A = JSON.stringify(a), B = JSON.stringify(b); if (A !== B) throw new Error(`${msg || 'eq'}: ${A} !== ${B}`); };

const files = readdirSync(HERE).filter((f) => f.endsWith('.test.mjs')).sort();
console.log(`# ejecutando ${files.length} ficheros de test\n`);
for (const f of files) { console.log(`# ${f}`); await import(pathToFileURL(join(HERE, f)).href); }

console.log(`\n# ${passed + failed} tests · ${passed} ok · ${failed} fail`);
process.exit(failed ? 1 : 0);
