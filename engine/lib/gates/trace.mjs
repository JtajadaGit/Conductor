// conductor/lib/trace.mjs — trazabilidad spec→task→code→test (matriz + findings).
import { readFileSync, existsSync, readdirSync, statSync, lstatSync, openSync, readSync, closeSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { parseSpec, parseTasks, readSpec } from './coherence.mjs';

const slug = (s) => 'REQ-' + s.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '');
const SKIP = new Set(['node_modules', '.git', 'dist', 'build', 'target', '.next', 'coverage']);
const MAX_FILES = 20000; // cota anti-DoS: nunca escanear indefinidamente
const MAX_FILE_BYTES = 4 * 1024 * 1024; // L7: descubrir hasta 4MB (antes 512KB saltaba ficheros con tag → falso hueco)
const HEAD_BYTES = 262144; // se lee SOLO la cabecera (el comentario @conductor va arriba) → coste por fichero acotado
const isUnsafeRoot = (p) => { const r = p.replace(/[\\/]+$/, ''); return r === '' || /^[A-Za-z]:$/.test(r); }; // raíz de FS/unidad
// L5: un `Test\.` sin frontera (con flag i) marcaba 'latest.js'/'contest.js'/'greatest.ts'/'attest.go' como
// tests → falsa cobertura/FALSE FAIL. Se exige separador antes de test/spec, y el sufijo camelCase 'XTest'
// se compara SENSIBLE a mayúsculas (JUnit FooTest.java) para no pillar 'latest'.
const isTestFile = (p) => {
  const stem = (String(p).replace(/\\/g, '/').split('/').pop() || '').replace(/\.[^.]+$/, '');
  return /(^|[._-])(test|spec)([._-]|$)/i.test(stem) || /[A-Za-z0-9]Test$/.test(stem);
};
// lectura de SOLO la cabecera (head) de un fichero, acotada — para encontrar el tag @conductor sin cargar
// ficheros enormes enteros (L7): el coste por fichero queda en HEAD_BYTES pase lo que pase su tamaño.
function readHead(f, bytes = HEAD_BYTES) {
  let fd;
  try { fd = openSync(f, 'r'); const buf = Buffer.alloc(bytes); const n = readSync(fd, buf, 0, bytes, 0); return buf.subarray(0, n).toString('utf8'); }
  catch { return ''; }
  finally { try { if (fd !== undefined) closeSync(fd); } catch {} }
}

function parseSpecIds(text) {
  const reqs = []; let cur = null, pendingId = null;
  const seen = new Map(); // L6: desambigua ids colisionantes (dos nombres distintos → mismo slug) con un contador
  const uniq = (raw) => {
    let id = raw && raw !== 'REQ-' ? raw : 'REQ-UNNAMED'; // REQ- vacío (nombre sin alfanuméricos) → fallback explícito
    if (seen.has(id)) { const n = seen.get(id) + 1; seen.set(id, n); return `${id}-${n}`; }
    seen.set(id, 1); return id;
  };
  for (const line of text.split(/\r?\n/)) {
    const idm = line.match(/<!--\s*id:\s*(REQ-[A-Z0-9-]+)\s*-->/i);
    if (idm) { pendingId = idm[1].toUpperCase(); continue; }
    const r = line.match(/^###\s+Requirement:\s*(.+?)\s*$/i);
    if (r) { cur = { id: uniq(pendingId || slug(r[1])), name: r[1], scenarios: [] }; reqs.push(cur); pendingId = null; continue; }
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
    else if (st.isFile() && st.size < MAX_FILE_BYTES) acc.push(full);
  }
  return acc;
}
function scanSrc(root) {
  const files = [];
  if (isUnsafeRoot(resolve(root))) return files; // nunca escanear la raíz del FS / de una unidad
  for (const f of walk(root)) {
    const txt = readHead(f); // solo la cabecera (el tag @conductor va arriba) → coste acotado aunque el fichero sea grande
    if (!txt) continue;
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
