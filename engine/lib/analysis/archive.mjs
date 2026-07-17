// conductor/lib/archive.mjs — BOARD de cambios archivados + BÚSQUEDA ligera (Ola 3). Sin SQLite ni FTS
// (regla 0-dep): walk del FS + lectura de timeline/spec, búsqueda por substring sobre título/request/spec.
// Cubre la brecha vs herramientas de referencia (índice de conocimiento) acotada a la identidad de conductor.
import { readdirSync, readFileSync, existsSync, statSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { join, basename, resolve, relative } from 'node:path';
import { plumbPath } from '../core/plumb.mjs';

const readJson = (p) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };
const changesDir = (root) => join(root, 'openspec', 'changes');

function changeInfo(dir, name) {
  const tl = readJson(plumbPath(dir, 'timeline.json'));
  let mtime = 0; try { mtime = statSync(dir).mtimeMs; } catch {}
  return { name, verdict: tl?.verdict || '—', request: tl?.request || '', phases: (tl?.phases || []).length, mtime };
}

// changes archivados: openspec/changes/archive/<YYYY-MM-DD-name>/
export function listArchive(root) {
  const base = join(changesDir(root), 'archive');
  let dirs = [];
  try { dirs = readdirSync(base, { withFileTypes: true }).filter((d) => d.isDirectory()); } catch { return []; }
  const out = [];
  for (const d of dirs) {
    const info = changeInfo(join(base, d.name), d.name);
    const dm = d.name.match(/^(\d{4}-\d{2}-\d{2})-(.+)$/);
    out.push({ ...info, archivedDir: d.name, date: dm ? dm[1] : null, name: dm ? dm[2] : d.name });
  }
  return out.sort((a, b) => b.mtime - a.mtime);
}

// búsqueda ligera por substring sobre nombre/request/proposal/spec de changes activos + archivados
export function searchChanges(root, q, limit = 50) {
  const needle = String(q || '').toLowerCase().trim();
  if (!needle) return [];
  const hits = [];
  const scan = (dir, name, archived) => {
    const info = changeInfo(dir, name);
    const hay = [name, info.request];
    try { const sd = join(dir, 'specs'); for (const dom of readdirSync(sd)) { const sp = join(sd, dom, 'spec.md'); if (existsSync(sp)) hay.push(readFileSync(sp, 'utf8')); } } catch {}
    try { const p = join(dir, 'proposal.md'); if (existsSync(p)) hay.push(readFileSync(p, 'utf8')); } catch {}
    const text = hay.join('\n').toLowerCase();
    const idx = text.indexOf(needle);
    if (idx >= 0) hits.push({ name, verdict: info.verdict, archived, snippet: text.slice(Math.max(0, idx - 30), idx + 70).replace(/\s+/g, ' ').trim() });
  };
  try { for (const d of readdirSync(changesDir(root), { withFileTypes: true })) { if (!d.isDirectory() || d.name === 'archive') continue; scan(join(changesDir(root), d.name), d.name, false); } } catch {}
  for (const a of listArchive(root)) scan(join(changesDir(root), 'archive', a.archivedDir), a.name, true);
  return hits.slice(0, limit);
}

// aísla el CUERPO bajo "## ADDED Requirements" (hasta la próxima cabecera nivel-2 o EOF), conservando los
// comentarios de id (<!-- id: REQ-… -->, ancla de trazabilidad) y los #### Scenario. `## MODIFIED|REMOVED|RENAMED`
// NO se tocan (los hace la skill/humano) — esto es el subconjunto ADITIVO seguro.
function extractAddedBody(raw) {
  const lines = String(raw).split(/\r?\n/);
  let inAdded = false; const buf = [];
  for (const line of lines) {
    if (/^##\s+ADDED\s+Requirements\s*$/i.test(line)) { inAdded = true; continue; }
    if (inAdded && /^##\s+\S/.test(line)) { inAdded = false; continue; } // otra sección nivel-2 → fin de ADDED
    if (inAdded) buf.push(line);
  }
  return buf.join('\n').trim();
}

// Promueve los delta specs de un change a openspec/specs/ — SUBCONJUNTO SEGURO (solo ADDED, aditivo, no
// destructivo). Replica el algoritmo de sdd-archive/SKILL.md de forma determinista (sin LLM). Si hay
// MODIFIED/REMOVED/RENAMED, los DEJA intactos para la skill/humano y marca needsManualMerge=true.
export function promoteSpec(changeDir, specsRoot) {
  const specsSrc = join(changeDir, 'specs');
  let domains = [];
  try { domains = readdirSync(specsSrc, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name); } catch { return { promoted: [], needsManualMerge: false }; }
  const promoted = []; let needsManualMerge = false;
  for (const domain of domains) {
    const srcSpec = join(specsSrc, domain, 'spec.md');
    if (!existsSync(srcSpec)) continue;
    const raw = readFileSync(srcSpec, 'utf8');
    if (/^##\s+(MODIFIED|REMOVED|RENAMED)\s+Requirements\s*$/im.test(raw)) needsManualMerge = true; // delta no-aditivo → manual
    const body = extractAddedBody(raw);
    if (!body || !/###\s+Requirement:/i.test(body)) continue; // nada aditivo que promover
    const targetDir = join(specsRoot, domain);
    const targetSpec = join(targetDir, 'spec.md');
    mkdirSync(targetDir, { recursive: true });
    let created = false;
    if (!existsSync(targetSpec)) {
      created = true;
      const title = domain.charAt(0).toUpperCase() + domain.slice(1);
      writeFileSync(targetSpec, `# ${title} Specification\n\n## Purpose\n\nTODO: describe the ${domain} domain.\n\n` + body + '\n');
    } else {
      const cur = readFileSync(targetSpec, 'utf8').replace(/\s+$/, '');
      writeFileSync(targetSpec, cur + '\n\n' + body + '\n'); // preserva # Title / ## Purpose existentes
    }
    promoted.push({ domain, created });
  }
  return { promoted, needsManualMerge };
}

// Mueve un change a openspec/changes/archive/<YYYY-MM-DD-name>/ con renameSync (MOVER, no borrado recursivo).
// Confinamiento: el change debe colgar de openspec/changes/ y NO ser el propio archive/. Idempotente: si el
// destino ya existe → "Already archived" (no se re-archiva). `date` se inyecta desde el llamador (ISO yyyy-mm-dd).
export function archiveChange(changeDir, archiveBaseDir, date, { allowNonGreen = false } = {}) {
  const src = resolve(changeDir);
  const changesRoot = resolve(archiveBaseDir, '..'); // .../openspec/changes
  const rel = relative(changesRoot, src);
  const seg0 = rel.split(/[\\/]/)[0];
  if (!rel || rel.startsWith('..') || seg0 === 'archive' || seg0 === '..') throw new Error('changeDir fuera de openspec/changes/ — archivado rechazado');
  if (!existsSync(src)) throw new Error('el change no existe');
  const archivedDir = `${date}-${basename(src)}`;
  const dest = join(archiveBaseDir, archivedDir);
  if (existsSync(dest)) throw new Error('Already archived');
  // GOBIERNO (defensa en profundidad, JUSTO antes de promover): archivar = promover el change a la spec viva. El
  // CÓDIGO conduce esa promoción: no se archiva un change que no cerró GREEN, salvo override EXPLÍCITO del experto
  // (auditable). Así CUALQUIER llamador (HTTP, MCP, CLI) queda gateado, no solo el boundary HTTP. Verdict = timeline.
  if (!allowNonGreen) {
    let verdict = null; try { verdict = JSON.parse(readFileSync(plumbPath(src, 'timeline.json'), 'utf8'))?.verdict ?? null; } catch {}
    if (verdict !== 'GREEN') { const e = new Error(`no se archiva un change sin veredicto GREEN (actual: ${verdict || 'desconocido'}) — corrígelo, o archiva con override explícito`); e.code = 'NOT_GREEN'; throw e; }
  }
  mkdirSync(archiveBaseDir, { recursive: true });
  renameSync(src, dest); // move atómico (mismo FS) — sin Remove-Item recursivo
  return { archivedDir, dest };
}
