#!/usr/bin/env node
// build.mjs — bundler dependency-free: colapsa lib/*.mjs + bin/conductor.mjs en UN solo fichero
// portable (dist/conductor.mjs) sin imports relativos ni rutas. Resuelve la restricción de
// plugins Copilot: el artefacto ejecutable no puede depender de rutas del plugin.
//
// Estrategia: cada módulo lib se envuelve en un IIFE que devuelve sus exports a un registro __M.
// Los imports relativos (./x.mjs) → const {..} = __M['x']. Los imports node: se hoistean al top.
// Uso: node build.mjs  → escribe dist/conductor.mjs

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
// regenera lib/ui-assets.mjs desde lib/ui/ antes de empaquetar (UI = ficheros reales)
execFileSync(process.execPath, [new URL('./build-ui.mjs', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')], { stdio: 'inherit' });
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const LIB = join(HERE, 'lib');

// orden topológico (dependencias primero)
const ORDER = ['theme', 'secret', 'report', 'jsonschema', 'openapi-diff', 'sqldiff', 'tsdiff', 'coherence', 'artifacts', 'contract', 'trace', 'explain', 'drift', 'eval', 'migration', 'policy', 'cost', 'otlp', 'provenance', 'ledger', 'runner', 'orchestrate', 'confine', 'scaffold', 'aiact', 'ui-assets', 'dashboard', 'drive', 'sdk-runner', 'serve', 'ci', 'mcp'];

const nodeImports = new Map(); // mod -> Set(names)
function collectNodeImports(src) {
  const re = /^import\s*\{([^}]*)\}\s*from\s*'(node:[^']+)';?\s*$/gm;
  let m; while ((m = re.exec(src))) { const set = nodeImports.get(m[2]) || new Set(); m[1].split(',').forEach((n) => n.trim() && set.add(n.trim())); nodeImports.set(m[2], set); }
}
function stripShebang(src) { return src.replace(/^#!.*\r?\n/, ''); }
function stripImports(src) {
  return stripShebang(src)
    .replace(/^import\s*\{[^}]*\}\s*from\s*'node:[^']+';?\s*$/gm, '') // node: (hoisted)
    .replace(/^import\s*\*\s*as\s*(\w+)\s*from\s*'(?:\.\/|\.\.\/lib\/)([\w.-]+)\.mjs';?\s*$/gm, (_, ns, dep) => `const ${ns} = __M['${dep}'];`)
    .replace(/^import\s*\{([^}]*)\}\s*from\s*'(?:\.\/|\.\.\/lib\/)([\w.-]+)\.mjs';?\s*$/gm, (_, names, dep) => `const {${names.replace(/\s+as\s+/g, ': ')}} = __M['${dep}'];`);
}
function collectExports(src) {
  const names = new Set();
  for (const m of src.matchAll(/^export\s+(?:async\s+)?function\s+(\w+)/gm)) names.add(m[1]);
  for (const m of src.matchAll(/^export\s+const\s+(\w+)/gm)) names.add(m[1]);
  for (const m of src.matchAll(/^export\s*\{([^}]*)\}/gm)) m[1].split(',').forEach((n) => { const id = n.trim().split(/\s+as\s+/)[0].trim(); if (id) names.add(id); });
  return [...names];
}
function stripExports(src) {
  return src
    .replace(/^export\s+(async\s+)?function\s+/gm, (_, a) => `${a || ''}function `)
    .replace(/^export\s+const\s+/gm, 'const ')
    .replace(/^export\s*\{[^}]*\};?\s*$/gm, '');
}

let body = '';
for (const name of ORDER) {
  const src = readFileSync(join(LIB, `${name}.mjs`), 'utf8');
  collectNodeImports(src);
  const exports = collectExports(src);
  const code = stripExports(stripImports(src));
  body += `\n// ===== lib/${name}.mjs =====\n__M['${name}'] = (function(){\n${code}\nreturn { ${exports.join(', ')} };\n})();\n`;
}

// CLI: reescribe imports y el import dinámico de mcp
let cli = readFileSync(join(HERE, 'bin', 'conductor.mjs'), 'utf8');
collectNodeImports(cli);
cli = stripImports(cli).replace(/await import\('\.\.\/lib\/mcp\.mjs'\)\.then\(\(m\)\s*=>\s*m\.serve\(\)\)/, "__M['mcp'].serve()");
// quita el import.meta.url (usaremos la ruta del propio bundle)
cli = cli.replace(/const HERE = dirname\(fileURLToPath\(import\.meta\.url\)\);/, 'const HERE = dirname(fileURLToPath(import.meta.url));');

// hoist de imports node: consolidados
let header = '#!/usr/bin/env node\n// conductor.mjs — BUNDLE single-file (generado por build.mjs). 0 deps, 0 rutas externas.\n';
for (const [mod, names] of nodeImports) header += `import { ${[...names].join(', ')} } from '${mod}';\n`;
header += '\nconst __M = {};\n';

const bundle = header + body + '\n// ===== CLI =====\n' + cli;
mkdirSync(join(HERE, 'dist'), { recursive: true });
writeFileSync(join(HERE, 'dist', 'conductor.mjs'), bundle);
console.log(`dist/conductor.mjs escrito (${bundle.length} bytes, ${ORDER.length} módulos + CLI, 0 dependencias)`);
