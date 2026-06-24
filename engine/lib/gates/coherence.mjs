// conductor/lib/coherence.mjs — gate de coherencia spec↔tasks↔apply-report (findings unificados).
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const read = (dir, ...names) => { for (const n of names) { const p = join(dir, n); if (existsSync(p)) return readFileSync(p, 'utf8'); } return null; };

// Lee la spec del cambio desde CUALQUIERA de las ubicaciones OpenSpec válidas: spec.md en la raíz
// del cambio, y/o specs/{domain}/spec.md (convención estándar: una o varias capacidades). Concatena.
export function readSpec(dir) {
  const parts = [];
  const top = join(dir, 'spec.md'); if (existsSync(top)) parts.push(readFileSync(top, 'utf8'));
  const specsDir = join(dir, 'specs');
  if (existsSync(specsDir)) {
    let domains = []; try { domains = readdirSync(specsDir); } catch {}
    for (const d of domains) {
      const p = join(specsDir, d, 'spec.md');
      try { if (statSync(join(specsDir, d)).isDirectory() && existsSync(p)) parts.push(readFileSync(p, 'utf8')); } catch {}
    }
    const flat = join(specsDir, 'spec.md'); if (existsSync(flat)) parts.push(readFileSync(flat, 'utf8'));
  }
  return parts.length ? parts.join('\n\n') : null;
}

export function parseSpec(text) {
  const deltaHeaders = [...text.matchAll(/^##\s+(ADDED|MODIFIED|REMOVED|RENAMED)\s+Requirements/gim)].map((m) => m[1].toUpperCase());
  const reqs = []; let cur = null, pendingId = null, currentDelta = 'ADDED';
  for (const line of text.split(/\r?\n/)) {
    const dm = line.match(/^##\s+(ADDED|MODIFIED|REMOVED|RENAMED)\s+Requirements/i);
    if (dm) { currentDelta = dm[1].toUpperCase(); continue; } // rastrea la sección delta actual (R-S6)
    const idm = line.match(/<!--\s*id:\s*(REQ-[A-Z0-9-]+)\s*-->/i);
    if (idm) { pendingId = idm[1].toUpperCase(); continue; }
    const r = line.match(/^###\s+Requirement:\s*(.+?)\s*$/i);
    if (r) { cur = { name: r[1], id: pendingId, scenarios: [], deltaType: currentDelta }; reqs.push(cur); pendingId = null; continue; }
    const s = line.match(/^####\s+Scenario:\s*(.+?)\s*$/i);
    if (s && cur) cur.scenarios.push(s[1]);
  }
  return { deltaHeaders, requirements: reqs };
}
export function parseTasks(text) {
  const tasks = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*-\s*\[( |x|X)\]\s*([\d.]+)?\s*(.*)$/);
    if (m) tasks.push({ done: m[1].toLowerCase() === 'x', id: m[2] || null, desc: m[3].trim() });
  }
  return tasks;
}
export function parseReport(text) {
  // H9: NO anclar a fin de línea ($) — "Status: done (entrega completa)" no casaba → status=null y los
  // checks de coherencia gateados en status==='done' (¿hay ficheros?, etc.) se SALTABAN (false PASS). \b basta.
  const status = (text.match(/^Status:\s*(done|partial|blocked)\b/im) || [])[1]?.toLowerCase() || null;
  const tc = text.match(/Tasks completed:\s*(\d+)\s*\/\s*(\d+)/i);
  const fileList = (label) => {
    const line = (text.match(new RegExp(`^${label}:\\s*(.*)$`, 'im')) || [])[1] || '';
    const inner = line.replace(/^\[|\]$/g, '').trim();
    if (!inner || /^(none|-|n\/a)$/i.test(inner)) return [];
    return inner.split(',').map((s) => s.trim()).filter(Boolean);
  };
  return { status, tasksCompleted: tc ? { x: +tc[1], y: +tc[2] } : null, filesCreated: fileList('Files created'), filesModified: fileList('Files modified') };
}

export function checkCoherence(dir, opts = {}) {
  const F = [];
  const E = (rule, message, file) => F.push({ rule, severity: 'error', message, file });
  const W = (rule, message, file) => F.push({ rule, severity: 'warning', message, file });
  const specRaw = readSpec(dir);
  const tasksRaw = read(dir, 'tasks.md');
  const reportRaw = read(dir, 'apply-report.md');
  if (specRaw == null) E('files.spec-missing', 'falta spec.md', 'spec.md');
  if (tasksRaw == null) W('files.tasks-missing', 'tasks.md ausente (normal en complejidad simple, que no tiene fase tasks)', 'tasks.md');
  if (reportRaw == null) E('files.report-missing', 'falta apply-report.md', 'apply-report.md');

  const spec = specRaw != null ? parseSpec(specRaw) : null;
  const tasks = tasksRaw != null ? parseTasks(tasksRaw) : null;
  const report = reportRaw != null ? parseReport(reportRaw) : null;

  if (spec) {
    if (!spec.deltaHeaders.length) E('spec.no-delta', 'spec.md sin cabecera delta (## ADDED|MODIFIED|REMOVED|RENAMED Requirements)', 'spec.md');
    if (!spec.requirements.length) E('spec.no-requirement', 'spec.md sin "### Requirement:"', 'spec.md');
    for (const r of spec.requirements) if (!r.scenarios.length) E('spec.requirement-no-scenario', `requisito "${r.name}" sin "#### Scenario:"`, 'spec.md');
    // ID estable (R-S2): el id explícito `<!-- id: REQ-{SLUG} -->` desacopla la trazabilidad de la redacción.
    // Sin él, renombrar el requisito ROMPE la traza en silencio. En preset estricto/migración (opts.strictId)
    // su ausencia es error (bloquea); en modo laxo no se emite (cero regresión — antes no había finding de id).
    if (opts.strictId) for (const r of spec.requirements) if (!r.id) E('spec.requirement-no-id', `requisito "${r.name}" sin id estable "<!-- id: REQ-... -->" (exigido por el preset)`, 'spec.md');
    // VALIDACIÓN SEMÁNTICA DEL DELTA (R-S6, preset migration): MODIFIED/REMOVED coherentes con la spec VIVA
    // (opts.liveSpecIds) y el código TRAZADO (opts.tracedReqIds). Opt-in (solo si opts.semanticDelta) → cero
    // regresión cuando no se pasa. Determinista, sin LLM.
    if (opts.semanticDelta) {
      const liveIds = new Set(opts.liveSpecIds || []);
      const tracedIds = new Set(opts.tracedReqIds || []);
      for (const r of spec.requirements) {
        if (r.deltaType === 'MODIFIED') {
          if (!r.id) E('delta.modified-no-id', `requisito MODIFIED "${r.name}" sin id estable — no se puede rastrear en la spec viva`, 'spec.md');
          else if (liveIds.size && !liveIds.has(r.id)) E('delta.modified-not-in-live', `MODIFIED ${r.id} no existe en la spec viva (no se puede modificar lo inexistente)`, 'spec.md');
        } else if (r.deltaType === 'REMOVED' && r.id && tracedIds.has(r.id)) {
          E('delta.removed-code-exists', `REMOVED ${r.id} aún tiene código trazado en el árbol (debe desaparecer antes de cerrar la migración)`, 'spec.md');
        }
      }
    }
  }
  if (tasks && !tasks.length) E('tasks.empty', 'tasks.md sin tareas', 'tasks.md');
  if (tasks && report) {
    const total = tasks.length, done = tasks.filter((t) => t.done).length;
    if (report.tasksCompleted) {
      if (report.tasksCompleted.y !== total) E('report.total-mismatch', `report ${report.tasksCompleted.x}/${report.tasksCompleted.y} vs ${total} tareas reales (deriva)`, 'apply-report.md');
      if (report.tasksCompleted.x !== done) E('report.done-mismatch', `report dice ${report.tasksCompleted.x} hechas vs ${done} marcadas [x] (deriva)`, 'apply-report.md');
    } else W('report.no-count', 'apply-report sin "Tasks completed: X/Y"', 'apply-report.md');
    if (report.status === 'done') {
      if (done !== total) E('status.done-incomplete', `Status: done pero ${done}/${total} tareas [x]`, 'apply-report.md');
      if (!report.filesCreated.length && !report.filesModified.length) E('status.done-no-files', 'Status: done sin ficheros listados', 'apply-report.md');
    }
    if (report.status === 'partial' && done === total) W('status.partial-complete', 'Status: partial con todas las tareas [x]', 'apply-report.md');
  }
  return F;
}
