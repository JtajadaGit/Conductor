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

// DETECCIÓN PROFUNDA para `init` (determinista, 0 red, 0 tokens): versiones exactas, package manager,
// monorepo/proyectos, comandos reales de build/test/lint/typecheck y frameworks de test. Es lo que un
// dev espera ver tras un init — el motor la re-detecta viva en cada run (esto NO se versiona como espejo;
// solo alimenta los `checks` iniciales de conductor.json y el resumen que imprime init).
export function detectStackDeep(root) {
  const base = detectStack(root);
  const pkg = readJson(root, 'package.json');
  const deps = pkg ? { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) } : {};
  const v = (n) => (deps[n] ? String(deps[n]).replace(/^[\^~>=]+/, '') : null);
  const versions = {};
  for (const [dep, label] of [['@angular/core', 'angular'], ['react', 'react'], ['vue', 'vue'], ['next', 'next'], ['svelte', 'svelte'], ['@nestjs/core', 'nestjs'], ['typescript', 'typescript'], ['jest', 'jest'], ['vitest', 'vitest']]) {
    const ver = v(dep); if (ver) versions[label] = ver;
  }
  const packageManager = pkg?.packageManager ? String(pkg.packageManager).split('@')[0]
    : has(root, 'pnpm-lock.yaml') ? 'pnpm' : has(root, 'yarn.lock') ? 'yarn' : has(root, 'package-lock.json') ? 'npm' : (pkg ? 'npm' : null);
  // proyectos de un workspace (angular.json / npm workspaces) — el mapa que un planner agradece
  const projects = [];
  const ng = readJson(root, 'angular.json');
  if (ng?.projects) for (const [name, p] of Object.entries(ng.projects).slice(0, 12)) projects.push({ name, type: p.projectType || '?', root: p.root || '' });
  const monorepo = !!(ng && Object.keys(ng.projects || {}).length > 1) || Array.isArray(pkg?.workspaces) && pkg.workspaces.length > 0 || has(root, 'pnpm-workspace.yaml') || has(root, 'nx.json');
  // comandos REALES (solo lo que existe — jamás inventar): la semilla de `checks` en conductor.json
  const run = (s) => (packageManager === 'yarn' ? `yarn ${s}` : packageManager === 'pnpm' ? `pnpm ${s}` : `npm run ${s}`);
  const checks = [];
  if (pkg?.scripts?.test) checks.push(packageManager === 'npm' || !packageManager ? 'npm test' : `${packageManager} test`);
  else if (base.testCmd && !pkg) checks.push(base.testCmd);
  if (pkg?.scripts?.build) checks.push(run('build'));
  if (pkg?.scripts?.lint) checks.push(run('lint'));
  if (versions.typescript && !pkg?.scripts?.lint?.includes('tsc')) checks.push('npx tsc --noEmit');
  const strictTs = (() => { const t = readJson(root, 'tsconfig.json'); return t?.compilerOptions?.strict === true; })();
  const testFramework = versions.jest ? 'jest' : versions.vitest ? 'vitest' : (deps.karma ? 'karma' : null);
  return { ...base, name: pkg?.name || null, versions, packageManager, monorepo, projects, checks, strictTs, testFramework };
}

// resumen humano multilínea para la salida de `init` — lo que la detección sabe, a la vista
export function renderStackDeep(d) {
  if (!d) return [];
  const L = [];
  const vs = Object.entries(d.versions || {}).map(([k, ver]) => `${k} ${ver}`).join(' · ');
  if (d.languages.length || vs) L.push(`stack: ${d.languages.join('/') || '?'}${vs ? ` — ${vs}` : ''}${d.strictTs ? ' · TS strict' : ''}`);
  if (d.packageManager) L.push(`gestor: ${d.packageManager}${d.monorepo ? ' · monorepo' : ''}${d.testFramework ? ` · tests: ${d.testFramework}` : ''}`);
  if (d.projects?.length) L.push(`proyectos: ${d.projects.map((p) => `${p.name} (${p.type})`).join(' · ')}`);
  if (d.checks?.length) L.push(`checks detectados: ${d.checks.join('  ·  ')}`);
  return L;
}

// bloque para inyectar en el prompt (apply/verify): orienta sin imponer (DATO, no instrucción arbitraria)
export function renderStackHint(stack) {
  if (!stack || (!stack.languages.length && !stack.frameworks.length)) return '';
  return `\n\nPROJECT STACK (detected, for context): ${stack.summary}. Follow the conventions of this stack; ${stack.testCmd ? `tests run with \`${stack.testCmd}\`` : 'use the project test runner'}.`;
}
