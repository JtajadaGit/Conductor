// conductor/lib/dashboard.mjs — informe HTML agregado autocontenido (gate + linaje + coste + timeline).
// Usa el SISTEMA DE DISEÑO ÚNICO (theme.mjs) → mismo look&feel que panel/run/aiact (sin paletas dobles).
import { count, isBlocking } from '../core/report.mjs';
import { THEME } from '../core/theme.mjs';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// M2: coercer a número — un tokens.in string ("</td><script>…") en timeline.json se emitía CRUDO (String(n))
// → HTML injection en el dashboard. Number()||0 garantiza que fmt SIEMPRE produce dígitos, nunca markup.
const fmt = (n) => { const v = Number(n) || 0; return v >= 1000 ? (v / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : String(v); };

// RECIBO DE PR (dev-first, determinista, 0 LLM): markdown listo para pegar en la descripción del PR — qué se
// pidió, qué cambió, requisitos cubiertos, verificación y coste. El gobierno se vuelve beneficio personal del
// dev (su PR se defiende solo). PURA (datos → markdown) para testearse sin FS; el caller lee los ficheros.
export function renderReceipt({ name = '', timeline = null, spec = '', proposal = '', verify = '' }) {
  const tl = (timeline && Array.isArray(timeline.phases)) ? timeline.phases : [];
  if (!tl.length) return null;
  const md = (s) => String(s || '').replace(/\r/g, '');
  const L = [`## ✔ ${name || 'cambio'} — verificado con conductor`];
  if (timeline.request) L.push(`> ${md(timeline.request).replace(/\s+/g, ' ').slice(0, 300)}`);
  const inT = tl.reduce((s, p) => s + (Number(p.tokens && p.tokens.in) || 0), 0);
  const outT = tl.reduce((s, p) => s + (Number(p.tokens && p.tokens.out) || 0), 0);
  const byok = tl.filter((p) => p.provider === 'byok').length;
  const mins = Math.round(((Number(timeline.total_ms) || tl.reduce((s, p) => s + (Number(p.ms) || 0), 0)) / 60000) * 10) / 10;
  L.push('', `**Resultado:** ${timeline.verdict || '?'} · ${tl.length} fase(s) · ${mins} min · ↓${fmt(inT)} ↑${fmt(outT)} tokens${byok ? ` · ${byok} fase(s) a 0 créditos premium` : ''}`);
  const what = (md(proposal).split(/^##\s*What Changes\s*$/mi)[1] || '').split(/^##\s/m)[0].trim();
  if (what) L.push('', '### Qué cambia', ...what.split('\n').slice(0, 10));
  const reqs = [...md(spec).matchAll(/<!--\s*id:\s*(REQ-[A-Z0-9-]+)\s*-->\s*\n###\s*Requirement:\s*([^\n]+)/gi)].slice(0, 12);
  if (reqs.length) { L.push('', '### Requisitos cubiertos'); for (const [, id, nm] of reqs) L.push(`- \`${id}\` ${nm.trim()}`); }
  const files = []; const seen = new Set();
  for (const p of tl) for (const f of (Array.isArray(p.files) ? p.files : [])) { const key = typeof f === 'string' ? f : f && f.p; if (key && !seen.has(key)) { seen.add(key); files.push(typeof f === 'string' ? { p: f } : f); } }
  if (files.length) { L.push('', '### Ficheros'); for (const f of files.slice(0, 20)) L.push(`- ${f.p}${f.k ? ` (${f.k})` : ''}`); if (files.length > 20) L.push(`- …y ${files.length - 20} más`); }
  const rvLine = (md(verify).match(/##\s*Verdict[^\n]*(\n[^\n#]*)?/i) || [''])[0];
  const rv = (rvLine.match(/\b(PASS|RISK|FAIL)\b/i) || [])[1] || null;
  L.push('', '### Verificación');
  L.push(`- gate determinista (coherencia + artefactos + traza): ${timeline.verdict === 'GREEN' ? 'PASS' : (timeline.verdict || '?')}`);
  if (rv) L.push(`- revisión de calidad (verify): ${rv.toUpperCase()}`);
  const models = tl.filter((p) => p.model || p.modelReported).map((p) => `${p.phase}=${p.modelReported || p.model}`);
  if (models.length) L.push(`- modelo por fase: ${models.join(' · ')}`);
  L.push('', '_Recibo generado por conductor a partir de los artefactos y el timeline del run (determinista, 0 LLM)._');
  return L.join('\n');
}

// T3: desviación estimado-vs-real por fase (puro, testeable sin FS). Solo compara fases con tokens
// REALES; la primera ocurrencia de cada fase (un retry no duplica la estimación). null = sin datos.
export function estimateDeviation(estimate, phases) {
  if (!estimate || !Array.isArray(estimate.phases) || !Array.isArray(phases)) return null;
  const est = new Map(estimate.phases.map((p) => [p.phase, p]));
  const seen = new Set();
  const rows = [];
  for (const p of phases) {
    if (!p || seen.has(p.phase) || !p.tokens || !est.has(p.phase)) continue;
    seen.add(p.phase);
    const e = est.get(p.phase);
    const realIn = Number(p.tokens.in) || 0, realOut = Number(p.tokens.out) || 0;
    const estIn = Number(e.estIn) || 0, estOut = Number(e.estOut) || 0;
    const dev = (estIn + estOut) > 0 ? Math.round((((realIn + realOut) / (estIn + estOut)) - 1) * 100) : null;
    rows.push({ phase: p.phase, estIn, estOut, realIn, realOut, devPct: dev });
  }
  if (!rows.length) return null;
  const tEst = rows.reduce((s, r) => s + r.estIn + r.estOut, 0);
  const tReal = rows.reduce((s, r) => s + r.realIn + r.realOut, 0);
  return { phases: rows, totalDevPct: tEst > 0 ? Math.round(((tReal / tEst) - 1) * 100) : null };
}

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
  const devInfo = estimateDeviation(timeline?.estimate, tl || []);
  const devMap = new Map((devInfo?.phases || []).map((r) => [r.phase, r]));
  const tlRows = tl ? tl.map((p) => `<tr class="${p.ok ? '' : 'gap'}"><td>${esc(p.phase)}</td><td style="color:var(--tx2)">${esc(p.role || '')}</td><td><code>${esc(p.model || '—')}</code>${p.provider ? ` <span style="color:var(--tx3);font-size:.85em">${esc(p.provider)}</span>` : ''}</td><td>${(p.files || []).length}</td><td>${Number(p.attempts) || 1}</td><td>${((Number(p.ms) || 0) / 1000).toFixed(1)}s</td><td style="font-variant-numeric:tabular-nums">${p.tokens ? `↓${fmt(p.tokens.in)} ↑${fmt(p.tokens.out)}${p.tokens.cached ? ` ↺${fmt(p.tokens.cached)}` : ''}` : '—'}</td><td style="font-variant-numeric:tabular-nums;color:var(--tx3)">${devMap.has(p.phase) ? `~↓${fmt(devMap.get(p.phase).estIn)} ↑${fmt(devMap.get(p.phase).estOut)}${devMap.get(p.phase).devPct !== null ? ` (${devMap.get(p.phase).devPct > 0 ? '+' : ''}${devMap.get(p.phase).devPct}%)` : ''}` : '—'}</td><td>${tick(p.ok)}</td></tr>`).join('') : '';

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
${cost ? `<h2 class=sect>Coste por fase <span style="font-weight:400;text-transform:none;letter-spacing:0;color:var(--tx3)">— tokens por fase y modelo (Copilot = AI Credits · LiteLLM = 0 AIC)</span></h2><table><tr><th>fase</th><th>calls</th><th>modelos</th><th>tokens in</th><th>tokens out</th></tr>${cost.phases.map((p) => `<tr><td>${esc(p.phase)}</td><td>${p.calls}</td><td><code>${esc(p.models.join(','))}</code></td><td>${fmt(p.in)}</td><td>${fmt(p.out)}</td></tr>`).join('')}</table>` : ''}
${tl ? `<h2 class=sect>Timeline del run <span style="font-weight:400;text-transform:none;letter-spacing:0;color:var(--tx3)">— fase × modelo × duración × tokens</span></h2><table><tr><th>fase</th><th>rol</th><th>modelo</th><th>archivos</th><th>intentos</th><th>duración</th><th>tokens</th><th>est (preflight)</th><th>ok</th></tr>${tlRows}</table>` : ''}
<footer>Generado por conductor — determinista, sin LLM. Evidencia para provenance de green-gate.</footer>
</html>`;
}
