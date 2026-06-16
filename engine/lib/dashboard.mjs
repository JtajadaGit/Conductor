// conductor/lib/dashboard.mjs — informe HTML agregado autocontenido (gate + linaje + coste + timeline).
// Usa el SISTEMA DE DISEÑO ÚNICO (theme.mjs) → mismo look&feel que panel/run/aiact (sin paletas dobles).
import { count, isBlocking } from './report.mjs';
import { THEME } from './theme.mjs';

const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const fmt = (n) => (n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : String(n));

export function renderDashboard({ change, gates = [], trace, cost, timeline }) {
  const c = count(gates);
  const tl = timeline && timeline.phases ? timeline.phases : (Array.isArray(timeline) ? timeline : null);
  const tlVerdict = timeline && timeline.verdict;
  const verdict = tlVerdict && tlVerdict !== 'running' ? tlVerdict
    : (isBlocking(gates) || (trace && trace.gaps.length) ? 'NOT-GREEN' : 'GREEN');
  const approvals = (timeline && timeline.approvals) || [];
  const lensesUsed = tl ? (tl.find((p) => p.lenses)?.lenses || null) : null;
  const tick = (x) => `<span class="tick ${x ? 'y' : 'n'}">${x ? '✓' : '✗'}</span>`;

  const findRows = gates.length
    ? gates.map((f) => `<tr class="${['breaking', 'error'].includes(f.severity) ? 'gap' : ''}"><td><span class="pill ${['breaking', 'error'].includes(f.severity) ? 'bad' : 'neutral'}" style="text-transform:none">${esc(f.severity)}</span></td><td><code>${esc(f.rule)}</code></td><td>${esc(f.message)}</td><td style="color:var(--tx3)">${esc(f.file || f.pointer || '')}</td></tr>`).join('')
    : '<tr><td colspan=4 style="color:var(--ok)">✓ sin findings — el gate pasa limpio</td></tr>';
  const traceRows = trace ? trace.matrix.map((m) => `<tr class="${m.cov.task && m.cov.code && m.cov.test ? '' : 'gap'}"><td><code>${esc(m.id)}</code></td><td>${esc(m.name)}</td><td>${tick(m.cov.task)}</td><td>${tick(m.cov.code)}</td><td>${tick(m.cov.test)}</td><td>${m.scenarios.length}</td></tr>`).join('') : '';
  const tlRows = tl ? tl.map((p) => `<tr class="${p.ok ? '' : 'gap'}"><td>${esc(p.phase)}</td><td style="color:var(--tx2)">${esc(p.role || '')}</td><td><code>${esc(p.model || '—')}</code>${p.provider ? ` <span style="color:var(--tx3);font-size:.85em">${esc(p.provider)}</span>` : ''}</td><td>${(p.files || []).length}</td><td>${p.attempts || 1}</td><td>${((p.ms || 0) / 1000).toFixed(1)}s</td><td style="font-variant-numeric:tabular-nums">${p.tokens ? `↓${fmt(p.tokens.in)} ↑${fmt(p.tokens.out)}` : '—'}</td><td>${tick(p.ok)}</td></tr>`).join('') : '';

  return `<!doctype html><html lang=es><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
<title>conductor · informe · ${esc(change)}</title>
<style>${THEME}
 body{max-width:1000px;margin:0 auto;padding:1.6rem 1.4rem 4rem}
 .head{display:flex;align-items:center;gap:.7rem;flex-wrap:wrap;margin-bottom:.3rem}
 .logo{width:26px;height:26px;border-radius:7px;background:linear-gradient(135deg,var(--accent),var(--accent2));color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:.85rem}
 .sub{color:var(--tx2);font-size:.84rem;margin:.1rem 0 1.1rem}
</style>
<div class=head><span class=logo>C</span><h1>Informe del run</h1><span class="pill ${verdict}">${esc(verdict)}</span></div>
<p class=sub><code>${esc(change)}</code> · evidencia determinista del pipeline (gate sin LLM + linaje + timeline).</p>
<div class="cards">
 <div class="card ${c.breaking + c.error ? 'no' : 'ok'}"><small>Bloqueantes</small><span>${c.breaking + c.error}</span></div>
 <div class="card ${c.warning ? 'warn' : ''}"><small>Warnings</small><span>${c.warning}</span></div>
 ${trace ? `<div class="card ${trace.gaps.length ? 'no' : 'ok'}"><small>Huecos de traza</small><span>${trace.gaps.length}</span></div>` : ''}
 ${approvals.length ? `<div class="card ok"><small>Aprobaciones humanas</small><span>🧑‍⚖️ ${approvals.length}</span></div>` : ''}
 ${lensesUsed ? `<div class="card"><small>Lentes de review</small><span>🔍 ${lensesUsed.length}</span></div>` : ''}
 ${cost ? `<div class="card ok"><small>Ahorro vs all-Opus</small><span>${cost.saved_pct}%</span></div>` : ''}
</div>
<h2 class=sect>Gate determinista <span style="font-weight:400;text-transform:none;letter-spacing:0;color:var(--tx3)">— coherencia spec↔código↔artefactos, sin LLM</span></h2>
<table><tr><th>severidad</th><th>regla</th><th>mensaje</th><th>ubicación</th></tr>${findRows}</table>
${trace ? `<h2 class=sect>Linaje spec → task → code → test <span style="font-weight:400;text-transform:none;letter-spacing:0;color:var(--tx3)">— qué requisito cubre cada artefacto (rojo = hueco)</span></h2><table><tr><th>requisito</th><th>nombre</th><th>task</th><th>code</th><th>test</th><th>scn</th></tr>${traceRows}</table>` : ''}
${cost ? `<h2 class=sect>Coste por fase</h2><table><tr><th>fase</th><th>calls</th><th>modelo(s)</th><th>in</th><th>out</th><th>coste</th><th>naive</th></tr>${cost.phases.map((p) => `<tr><td>${esc(p.phase)}</td><td>${p.calls}</td><td><code>${esc(p.models.join(','))}</code></td><td>${p.in}</td><td>${p.out}</td><td>$${p.cost_usd.toFixed(4)}</td><td>$${p.naive_usd.toFixed(4)}</td></tr>`).join('')}</table>` : ''}
${tl ? `<h2 class=sect>Timeline del run <span style="font-weight:400;text-transform:none;letter-spacing:0;color:var(--tx3)">— fase × modelo × duración × tokens</span></h2><table><tr><th>fase</th><th>rol</th><th>modelo</th><th>archivos</th><th>intentos</th><th>duración</th><th>tokens</th><th>ok</th></tr>${tlRows}</table>` : ''}
<footer>Generado por conductor — determinista, sin LLM. Evidencia para provenance de green-gate.</footer>
</html>`;
}
