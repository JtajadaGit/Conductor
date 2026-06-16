#!/usr/bin/env node
// conductor — arnés de benchmark de evals con LLMs REALES (tarea #12). DEV/mantenedor (no se shippea).
//
// Idea: por cada (modelo × tarea) corre el DRIVER determinista (headless, reproducible) y puntúa el
// resultado con el scorer determinista (gate + trazabilidad). Saca una tabla comparativa modelo↔calidad.
// El driver es el backend ideal aquí: desatendido, mismo flujo siempre, sin intervención humana.
//
// Requiere BYOK (red + clave) — lee la config como el driver (env COPILOT_PROVIDER_* / CONDUCTOR_*, o
// ~/.conductor/byok.json). Cada tarea consume tokens del proveedor; con BYOK→qwen el coste ≈ 0 créditos.
//
// Uso:
//   node eval/bench.mjs --project <ruta-proyecto> [--models qwen36-msc1,qwen36-msc2] [--tasks E1,E2] [--out eval/.bench] [--complexity simple]
//
// OJO: la fase apply escribe ficheros en <project>/src y crea <project>/openspec/changes/*. Usa un
// proyecto de pruebas (o haz git stash/clean al terminar). Cada (modelo,tarea) va a su propio changeDir.
import { drive } from '../engine/lib/drive.mjs';
import { scoreCandidate } from '../engine/lib/eval.mjs';
import { join, resolve } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };

// Set de tareas (de fácil a difícil). Redactadas de forma genérica; el modelo lee las convenciones del
// proyecto vía --src. Añade/edita libremente. `id` = etiqueta corta; `cx` = complejidad del pipeline.
const TASKS = [
  { id: 'E1', cx: 'simple', domain: 'counter',    prompt: 'add a Counter component with increment/decrement buttons and a test' },
  { id: 'E2', cx: 'medium', domain: 'contact',    prompt: 'add a reactive contact form (name, email) with validation and a test' },
  { id: 'E3', cx: 'medium', domain: 'profile',    prompt: 'add a profile page showing the authenticated user email, protected by a route guard' },
  { id: 'E4', cx: 'medium', domain: 'authstate',  prompt: 'refactor the auth state to expose it as a reactive signal instead of a boolean, without breaking consumers' },
  { id: 'E5', cx: 'medium', domain: 'apiclient',  prompt: 'add a typed ApiClient service with list()/get(id)/create() methods and their tests' },
  { id: 'E6', cx: 'medium', domain: 'pagination', prompt: 'add pagination to the items list: page/size params, respecting a maximum page size' },
];

const project = resolve(flag('--project', process.cwd()));
const models = flag('--models', process.env.COPILOT_MODEL || process.env.CONDUCTOR_MODEL || 'qwen36-msc1').split(',').map((s) => s.trim()).filter(Boolean);
const pickTasks = flag('--tasks');
const tasks = pickTasks ? TASKS.filter((t) => pickTasks.split(',').map((s) => s.trim()).includes(t.id)) : TASKS;
const cxOverride = flag('--complexity');
const outDir = resolve(flag('--out', join('eval', '.bench')));
mkdirSync(outDir, { recursive: true });

// timeout por fase (segundos) → el driver lo lee de CONDUCTOR_AGENT_TIMEOUT_MS. Evita "parecer pillado".
const timeoutSec = Number(flag('--timeout', ''));
if (timeoutSec) process.env.CONDUCTOR_AGENT_TIMEOUT_MS = String(timeoutSec * 1000);

// progreso por fase en vivo: surfacing de los ticks ✅/❌ del driver para que NO parezca colgado.
const tick = (m) => {
  let mm;
  if ((mm = m.match(/^✅ (\w+)/))) process.stdout.write(`${mm[1]} `);
  else if ((mm = m.match(/^❌ (\w+)/))) process.stdout.write(`✗${mm[1]} `);
  else if (/gate FAIL/.test(m)) process.stdout.write('[gateFAIL] ');
};

// pequeño temporizador (script normal de Node; Date.now permitido aquí)
const now = () => Date.now();

console.log(`\nconductor bench · proyecto ${project}\n  modelos: ${models.join(', ')}\n  tareas:  ${tasks.map((t) => t.id).join(', ')}\n`);

const rows = [];
// informe incremental: se reescribe tras CADA tarea, así un corte (suspensión/crash) no pierde el run.
function flushReport() {
  const md = ['# conductor bench — resultados\n', `Proyecto: \`${project}\`\n`,
    '| Modelo | Tarea | Cx | Driver | Eval % | Eval | Fases | Tiempo |',
    '|---|---|---|---|---:|---|---:|---:|',
    ...rows.map((r) => `| ${r.model} | ${r.task} | ${r.cx} | ${r.driver} | ${r.evalPct} | ${r.eval} | ${r.phases} | ${r.secs}s |`)];
  const byModel = {};
  for (const r of rows) { (byModel[r.model] ??= []).push(r); }
  md.push('\n## Pass rate por modelo (driver GREEN + eval PASS)');
  for (const [m, rs] of Object.entries(byModel)) {
    const ok = rs.filter((r) => r.driver === 'GREEN' && r.eval === 'PASS').length;
    md.push(`- **${m}**: ${ok}/${rs.length} (${Math.round((ok / rs.length) * 100)}%) · eval medio ${Math.round(rs.reduce((a, r) => a + r.evalPct, 0) / rs.length)}%`);
  }
  const mdText = md.join('\n') + '\n';
  writeFileSync(join(outDir, 'results.md'), mdText);
  writeFileSync(join(outDir, 'results.json'), JSON.stringify(rows, null, 2));
  return mdText;
}
if (!process.env.COPILOT_PROVIDER_API_KEY && !process.env.COPILOT_API_KEY) {
  console.error(`  ✗ BYOK no configurado: exporta COPILOT_PROVIDER_BASE_URL/_API_KEY/COPILOT_MODEL antes (el driver lanza 'copilot', que los hereda). Aborto.`);
  process.exit(2);
}
for (const model of models) {
  process.env.COPILOT_MODEL = model; // el 'copilot' que lanza el driver usa este modelo (Path X)
  for (const t of tasks) {
    const changeDir = join(project, 'openspec', 'changes', `bench-${model}-${t.id}`.toLowerCase().replace(/[^a-z0-9-]+/g, '-'));
    const cx = cxOverride || t.cx;
    process.stdout.write(`  [${model}] ${t.id} (${cx}) … `);
    const t0 = now();
    let verdict = 'ERROR', score = 0, evalVerdict = 'FAIL', trail = [];
    try {
      const r = await drive({ changeDir, request: t.prompt, complexity: cx, domain: t.domain, srcDir: project, log: tick });
      verdict = r.verdict; trail = r.trail || [];
      const sc = scoreCandidate(changeDir, { pass: 70, gate: 70, trace: { src: project, maxGaps: 0, weight: 30 } });
      score = sc.pct; evalVerdict = sc.verdict;
    } catch (e) { verdict = `ERROR: ${e.message.slice(0, 60)}`; }
    const secs = ((now() - t0) / 1000).toFixed(1);
    rows.push({ model, task: t.id, cx, driver: verdict, evalPct: score, eval: evalVerdict, secs, phases: trail.length });
    console.log(`driver=${verdict} eval=${score}% (${evalVerdict}) ${secs}s`);
    flushReport(); // incremental: persistir tras cada tarea
  }
}

const mdText = flushReport();
console.log(`\n${mdText}\n→ ${join(outDir, 'results.md')} · ${join(outDir, 'results.json')}\n`);
