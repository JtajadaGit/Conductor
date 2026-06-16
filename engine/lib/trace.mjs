// conductor/lib/trace.mjs — trazabilidad spec→task→code→test (matriz + findings).
import { readFileSync, existsSync, readdirSync, statSync, lstatSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { parseSpec, parseTasks, readSpec } from './coherence.mjs';

const slug = (s) => 'REQ-' + s.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '');
const SKIP = new Set(['node_modules', '.git', 'dist', 'build', 'target', '.next', 'coverage']);
const MAX_FILES = 20000; // cota anti-DoS: nunca escanear indefinidamente
const isUnsafeRoot = (p) => { const r = p.replace(/[\\/]+$/, ''); return r === '' || /^[A-Za-z]:$/.test(r); }; // raíz de FS/unidad
const isTestFile = (p) => /(\.|_)(test|spec)\.|[._]test\.|Test\.|\.spec\./i.test(p);

function parseSpecIds(text) {
  const reqs = []; let cur = null, pendingId = null;
  for (const line of text.split(/\r?\n/)) {
    const idm = line.match(/<!--\s*id:\s*(REQ-[A-Z0-9-]+)\s*-->/i);
    if (idm) { pendingId = idm[1].toUpperCase(); continue; }
    const r = line.match(/^###\s+Requirement:\s*(.+?)\s*$/i);
    if (r) { cur = { id: pendingId || slug(r[1]), name: r[1], scenarios: [] }; reqs.push(cur); pendingId = null; continue; }
    const s = line.match(/^####\s+Scenario:\s*(.+?)\s*$/i);
    if (s && cur) cur.scenarios.push(s[1]);
  }
  return reqs;
}
let _walkDeadline = 0;
function walk(dir, acc = []) {
  if (!acc.length) _walkDeadline = Date.now() + 8000; // T9: tope de tiempo duro por escaneo
  if (acc.length >= MAX_FILES || Date.now() > _walkDeadline) return acc; // cota anti-DoS
  let entries; try { entries = readdirSync(dir); } catch { return acc; }
  for (const name of entries) {
    if (SKIP.has(name)) continue;
    if (acc.length >= MAX_FILES) break;
    const full = join(dir, name); let st; try { st = lstatSync(full); } catch { continue; }
    if (st.isSymbolicLink()) continue; // no seguir symlinks (evita bucles / salir del árbol)
    if (st.isDirectory()) walk(full, acc);
    else if (st.isFile() && st.size < 512 * 1024) acc.push(full);
  }
  return acc;
}
function scanSrc(root) {
  const files = [];
  if (isUnsafeRoot(resolve(root))) return files; // nunca escanear la raíz del FS / de una unidad
  for (const f of walk(root)) {
    let txt; try { txt = readFileSync(f, 'utf8'); } catch { continue; }
    const ids = [...txt.matchAll(/@conductor\s+(REQ-[A-Z0-9-]+)/gi)].map((x) => x[1].toUpperCase());
    if (ids.length) files.push({ path: relative(root, f).replace(/\\/g, '/'), reqIds: [...new Set(ids)], test: isTestFile(f) });
  }
  return files;
}

export function buildTrace(changeDir, srcDir) {
  const specRaw = readSpec(changeDir) || '';
  const tasksRaw = existsSync(join(changeDir, 'tasks.md')) ? readFileSync(join(changeDir, 'tasks.md'), 'utf8') : '';
  const reqs = parseSpecIds(specRaw);
  const tasks = parseTasks(tasksRaw).map((t) => ({ ...t, reqIds: [...(t.desc.matchAll(/\[(REQ-[A-Z0-9-]+)\]/gi))].map((x) => x[1].toUpperCase()) }));
  const files = srcDir && existsSync(srcDir) ? scanSrc(srcDir) : [];

  const matrix = reqs.map((r) => {
    const rTasks = tasks.filter((t) => t.reqIds.includes(r.id));
    const code = files.filter((f) => f.reqIds.includes(r.id) && !f.test);
    const tests = files.filter((f) => f.reqIds.includes(r.id) && f.test);
    return { id: r.id, name: r.name, scenarios: r.scenarios, tasks: rTasks, code, tests, cov: { task: rTasks.length > 0, code: code.length > 0, test: tests.length > 0 } };
  });
  const orphanTasks = tasks.filter((t) => !t.reqIds.length);
  // cobertura real = código + test. La "task" es informativa (no existe en complejidad simple).
  const gaps = matrix.filter((m) => !m.cov.code || !m.cov.test);

  const F = [];
  for (const m of matrix) {
    // Sólo se avisa por falta de CÓDIGO o TEST (cobertura real). La "task" es informativa (no existe en
    // complejidad simple). La trazabilidad es SEÑAL no bloqueante (warning), nunca error.
    const missing = [!m.cov.code && 'code', !m.cov.test && 'test'].filter(Boolean);
    if (missing.length) F.push({ rule: 'trace.coverage-gap', severity: 'warning', message: `${m.id} sin ${missing.join('/')} (trazabilidad opcional)`, file: 'spec.md' });
  }
  for (const t of orphanTasks) F.push({ rule: 'trace.orphan-task', severity: 'warning', message: `tarea sin requisito: ${t.id || ''} ${t.desc}`.trim(), file: 'tasks.md' });
  return { matrix, orphanTasks, gaps: gaps.map((g) => g.id), findings: F };
}
