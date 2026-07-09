// conductor/lib/dashboard.mjs — informe HTML agregado autocontenido (gate + linaje + coste + timeline).
// Usa el SISTEMA DE DISEÑO ÚNICO (theme.mjs) → mismo look&feel que panel/run/aiact (sin paletas dobles).
import { count, isBlocking } from '../core/report.mjs';
import { THEME } from '../core/theme.mjs';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// M2: coercer a número — un tokens.in string ("</td><script>…") en timeline.json se emitía CRUDO (String(n))
// → HTML injection en el dashboard. Number()||0 garantiza que fmt SIEMPRE produce dígitos, nunca markup.
const fmt = (n) => { const v = Number(n) || 0; return v >= 1000 ? (v / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : String(v); };

export function renderDashboard({ change, gates = [], trace, cost, timeline }) {
  const c = count(gates);
  const tl = timeline && timeline.phases ? timeline.phases : (Array.isArray(timeline) ? timeline : null);
  const tlVerdict = timeline && timeline.verdict;
  const verdict = tlVerdict && tlVerdict !== 'running' ? tlVerdict
    : (isBlocking(gates) || (trace && trace.gaps.length) ? 'NOT-GREEN' : 'GREEN');
  const approvals = (timeline && timeline.approvals) || [];
  const lensesUsed = tl ? (tl.find((p) => p.lenses)?.lenses || null) : null;
  // CACHÉ DE PREFIJO (R-T3): tokens de entrada servidos desde caché (precio reducido) sumados sobre todas las
  // fases → hace VISIBLE el ahorro del prefijo invariante. El driver ya los captura por fase (tokens.cached).
  const cachedTotal = tl ? tl.reduce((s, p) => s + (Number(p.tokens && p.tokens.cached) || 0), 0) : 0;
  const tick = (x) => `<span class="tick ${x ? 'y' : 'n'}">${x ? '✓' : '✗'}</span>`;

  const findRows = gates.length
    ? gates.map((f) => `<tr class="${['breaking', 'error'].includes(f.severity) ? 'gap' : ''}"><td><span class="pill ${['breaking', 'error'].includes(f.severity) ? 'bad' : 'neutral'}" style="text-transform:none">${esc(f.severity)}</span></td><td><code>${esc(f.rule)}</code></td><td>${esc(f.message)}</td><td style="color:var(--tx3)">${esc(f.file || f.pointer || '')}</td></tr>`).join('')
    : '<tr><td colspan=4 style="color:var(--ok)">✓ sin findings — el gate pasa limpio</td></tr>';
  const traceRows = trace ? trace.matrix.map((m) => `<tr class="${m.cov.task && m.cov.code && m.cov.test ? '' : 'gap'}"><td><code>${esc(m.id)}</code></td><td>${esc(m.name)}</td><td>${tick(m.cov.task)}</td><td>${tick(m.cov.code)}</td><td>${tick(m.cov.test)}</td><td>${m.scenarios.length}</td></tr>`).join('') : '';
  const tlRows = tl ? tl.map((p) => `<tr class="${p.ok ? '' : 'gap'}"><td>${esc(p.phase)}</td><td style="color:var(--tx2)">${esc(p.role || '')}</td><td><code>${esc(p.model || '—')}</code>${p.provider ? ` <span style="color:var(--tx3);font-size:.85em">${esc(p.provider)}</span>` : ''}</td><td>${(p.files || []).length}</td><td>${Number(p.attempts) || 1}</td><td>${((Number(p.ms) || 0) / 1000).toFixed(1)}s</td><td style="font-variant-numeric:tabular-nums">${p.tokens ? `↓${fmt(p.tokens.in)} ↑${fmt(p.tokens.out)}${p.tokens.cached ? ` ↺${fmt(p.tokens.cached)}` : ''}` : '—'}</td><td>${tick(p.ok)}</td></tr>`).join('') : '';

  return `<!doctype html><html lang=es><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
<script>(function(){try{var t=localStorage.getItem('conductorTheme');if(!t)t=matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light';document.documentElement.dataset.theme=t;}catch(e){}})()</script>
<title>conductor · informe · ${esc(change)}</title>
<style>${THEME}
 body{max-width:1000px;margin:0 auto;padding:1.6rem 1.4rem 4rem}
 /* tablas anchas (timeline = 8 cols) en móvil: scroll DENTRO de la tabla, no de la página (evita el scroll
    horizontal de todo el informe a 390px). display:block + overflow-x:auto es el patrón responsive estándar. */
 @media(max-width:640px){table{display:block;overflow-x:auto;-webkit-overflow-scrolling:touch;white-space:nowrap}}
 .head{display:flex;align-items:center;gap:.7rem;flex-wrap:wrap;margin-bottom:.3rem}
 .logo{width:26px;height:26px;border-radius:7px;background:linear-gradient(135deg,var(--accent),var(--accent2));color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:.85rem;box-shadow:0 2px 8px color-mix(in srgb,var(--accent) 42%,transparent)}
 .sub{color:var(--tx2);font-size:.84rem;margin:.1rem 0 1.1rem}
</style>
<button class="thm-tog" id="thm" aria-label="Cambiar tema" title="Claro/Oscuro">◐</button>
<script>(function(){var r=document.documentElement,k='conductorTheme';document.getElementById('thm').addEventListener('click',function(){var n=r.dataset.theme==='dark'?'light':'dark';r.dataset.theme=n;try{localStorage.setItem(k,n);}catch(e){}});})()</script>
<div class=head><span class=logo>C</span><h1>Informe del run</h1><span class="pill ${esc(verdict)}">${esc(verdict)}</span></div>
<p class=sub><code>${esc(change)}</code> · evidencia determinista del pipeline (gate sin LLM + linaje + timeline).</p>
<div class="cards">
 <div class="card ${c.breaking + c.error ? 'no' : 'ok'}"><small>Bloqueantes</small><span>${c.breaking + c.error}</span></div>
 <div class="card ${c.warning ? 'warn' : ''}"><small>Warnings</small><span>${c.warning}</span></div>
 ${trace ? `<div class="card ${trace.gaps.length ? 'no' : 'ok'}"><small>Huecos de traza</small><span>${trace.gaps.length}</span></div>` : ''}
 ${approvals.length ? `<div class="card ok"><small>Aprobaciones humanas</small><span>🧑‍⚖️ ${approvals.length}</span></div>` : ''}
 ${lensesUsed ? `<div class="card"><small>Lentes de review</small><span>🔍 ${lensesUsed.length}</span></div>` : ''}
 ${cost ? `<div class="card ok"><small>Ahorro vs all-Opus</small><span>${cost.saved_pct}%</span></div>` : ''}
 ${cachedTotal ? `<div class="card ok"><small>Caché de prefijo</small><span>↺ ${fmt(cachedTotal)} tok</span></div>` : ''}
</div>
<h2 class=sect>Gate determinista <span style="font-weight:400;text-transform:none;letter-spacing:0;color:var(--tx3)">— coherencia spec↔código↔artefactos, sin LLM</span></h2>
<table><tr><th>severidad</th><th>regla</th><th>mensaje</th><th>ubicación</th></tr>${findRows}</table>
${trace ? `<h2 class=sect>Linaje spec → task → code → test <span style="font-weight:400;text-transform:none;letter-spacing:0;color:var(--tx3)">— qué requisito cubre cada artefacto (rojo = hueco)</span></h2><table><tr><th>requisito</th><th>nombre</th><th>task</th><th>code</th><th>test</th><th>scn</th></tr>${traceRows}</table>` : ''}
${cost ? `<h2 class=sect>Coste por fase <span style="font-weight:400;text-transform:none;letter-spacing:0;color:var(--tx3)">— tokens por fase y modelo (Copilot = AI Credits · qwen/BYOK = LiteLLM, 0 AIC)</span></h2><table><tr><th>fase</th><th>calls</th><th>modelos</th><th>tokens in</th><th>tokens out</th></tr>${cost.phases.map((p) => `<tr><td>${esc(p.phase)}</td><td>${p.calls}</td><td><code>${esc(p.models.join(','))}</code></td><td>${fmt(p.in)}</td><td>${fmt(p.out)}</td></tr>`).join('')}</table>` : ''}
${tl ? `<h2 class=sect>Timeline del run <span style="font-weight:400;text-transform:none;letter-spacing:0;color:var(--tx3)">— fase × modelo × duración × tokens</span></h2><table><tr><th>fase</th><th>rol</th><th>modelo</th><th>archivos</th><th>intentos</th><th>duración</th><th>tokens</th><th>ok</th></tr>${tlRows}</table>` : ''}
<footer>Generado por conductor — determinista, sin LLM. Evidencia para provenance de green-gate.</footer>
</html>`;
}
