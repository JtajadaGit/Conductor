// conductor/lib/stack.mjs — DETECCIÓN DE STACK del repo (file-based, sin red ni ejecución). Da contexto
// para verificación específica (qué lenguaje/framework, qué comando de test) — alimenta el prompt y el
// futuro check contextual del gate. Determinista, 0 dependencias. Inspirado en la auto-detección de las
// referencias, pero acotado a "lo que ayuda a verificar", no a un registro de capacidades pesado.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const has = (root, f) => existsSync(join(root, f));
const readJson = (root, f) => { try { return JSON.parse(readFileSync(join(root, f), 'utf8')); } catch { return null; } };

// marcadores: fichero presente → lenguaje/framework
const MARKERS = [
  { f: 'package.json', lang: 'javascript' },
  { f: 'tsconfig.json', lang: 'typescript' },
  { f: 'pyproject.toml', lang: 'python' }, { f: 'requirements.txt', lang: 'python' }, { f: 'setup.py', lang: 'python' },
  { f: 'go.mod', lang: 'go' },
  { f: 'pom.xml', lang: 'java' }, { f: 'build.gradle', lang: 'java' }, { f: 'build.gradle.kts', lang: 'kotlin' },
  { f: 'composer.json', lang: 'php' },
  { f: 'Cargo.toml', lang: 'rust' },
  { f: 'Gemfile', lang: 'ruby' },
];
const FW = [
  { f: 'angular.json', fw: 'angular' },
  { f: 'next.config.js', fw: 'next' }, { f: 'next.config.mjs', fw: 'next' },
  { f: 'nuxt.config.ts', fw: 'nuxt' },
  { f: 'svelte.config.js', fw: 'svelte' },
  { f: 'vite.config.ts', fw: 'vite' }, { f: 'vite.config.js', fw: 'vite' },
  { f: 'nest-cli.json', fw: 'nestjs' },
  { f: 'manage.py', fw: 'django' },
];

export function detectStack(projectRoot) {
  const languages = new Set(), frameworks = new Set();
  for (const m of MARKERS) if (has(projectRoot, m.f)) languages.add(m.lang);
  for (const m of FW) if (has(projectRoot, m.f)) frameworks.add(m.fw);

  // package.json: dependencias revelan framework + script de test
  let testCmd = null;
  const pkg = readJson(projectRoot, 'package.json');
  if (pkg) {
    const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
    if (deps['@angular/core']) frameworks.add('angular');
    if (deps.react) frameworks.add('react');
    if (deps.vue) frameworks.add('vue');
    if (deps.svelte) frameworks.add('svelte');
    if (deps.next) frameworks.add('next');
    if (deps['@nestjs/core']) frameworks.add('nestjs');
    if (deps.vitest) frameworks.add('vitest');
    if (deps.jest) frameworks.add('jest');
    if (pkg.scripts && pkg.scripts.test) testCmd = 'npm test';
  }
  if (!testCmd) {
    if (languages.has('python')) testCmd = 'pytest';
    else if (languages.has('go')) testCmd = 'go test ./...';
    else if (has(projectRoot, 'pom.xml')) testCmd = 'mvn test';
    else if (has(projectRoot, 'Cargo.toml')) testCmd = 'cargo test';
  }

  // entrypoints típicos (best-effort, superficie pequeña)
  const entrypoints = [];
  for (const e of ['src/main.ts', 'src/index.ts', 'src/main.js', 'index.js', 'main.py', 'app.py', 'src/main/java', 'cmd']) if (has(projectRoot, e)) entrypoints.push(e);

  const langs = [...languages], fws = [...frameworks];
  const summary = [langs.join('/') || 'desconocido', fws.length ? '· ' + fws.join('/') : '', testCmd ? '· test: ' + testCmd : ''].filter(Boolean).join(' ');
  return { languages: langs, frameworks: fws, testCmd, entrypoints, summary };
}

// bloque para inyectar en el prompt (apply/verify): orienta sin imponer (DATO, no instrucción arbitraria)
export function renderStackHint(stack) {
  if (!stack || (!stack.languages.length && !stack.frameworks.length)) return '';
  return `\n\nPROJECT STACK (detected, for context): ${stack.summary}. Follow the conventions of this stack; ${stack.testCmd ? `tests run with \`${stack.testCmd}\`` : 'use the project test runner'}.`;
}
