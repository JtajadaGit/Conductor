// conductor/lib/archive.mjs — BOARD de cambios archivados + BÚSQUEDA ligera (Ola 3). Sin SQLite ni FTS
// (regla 0-dep): walk del FS + lectura de timeline/spec, búsqueda por substring sobre título/request/spec.
// Cubre la brecha vs herramientas de referencia (índice de conocimiento) acotada a la identidad de conductor.
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

const readJson = (p) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };
const changesDir = (root) => join(root, 'openspec', 'changes');

function changeInfo(dir, name) {
  const tl = readJson(join(dir, '.conductor', 'timeline.json'));
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
