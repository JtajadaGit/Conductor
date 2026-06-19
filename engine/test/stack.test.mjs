// Detección de stack (Ola 3): file-based, sin ejecución.
import { detectStack, renderStackHint } from '../lib/analysis/stack.mjs';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '.tmp-stack');
const w = (p, c) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, c); };

await test('stack: node+ts+angular+vitest y testCmd desde package.json', () => {
  rmSync(ROOT, { recursive: true, force: true }); mkdirSync(ROOT, { recursive: true });
  w(join(ROOT, 'package.json'), JSON.stringify({ dependencies: { '@angular/core': '^17' }, devDependencies: { vitest: '^1' }, scripts: { test: 'vitest' } }));
  w(join(ROOT, 'tsconfig.json'), '{}');
  const s = detectStack(ROOT);
  assert(s.languages.includes('javascript') && s.languages.includes('typescript'), 'js + ts');
  assert(s.frameworks.includes('angular') && s.frameworks.includes('vitest'), 'angular + vitest');
  eq(s.testCmd, 'npm test');
  const hint = renderStackHint(s);
  assert(/angular/.test(hint) && /npm test/.test(hint), 'el hint refleja stack + test');
  rmSync(ROOT, { recursive: true, force: true });
});

await test('stack: python por pyproject → testCmd pytest', () => {
  rmSync(ROOT, { recursive: true, force: true }); mkdirSync(ROOT, { recursive: true });
  w(join(ROOT, 'pyproject.toml'), '[project]\nname="x"');
  const s = detectStack(ROOT);
  assert(s.languages.includes('python'), 'python');
  eq(s.testCmd, 'pytest');
  rmSync(ROOT, { recursive: true, force: true });
});

await test('stack: repo sin marcadores → hint vacío', () => {
  rmSync(ROOT, { recursive: true, force: true }); mkdirSync(ROOT, { recursive: true });
  eq(renderStackHint(detectStack(ROOT)), '');
  rmSync(ROOT, { recursive: true, force: true });
});
