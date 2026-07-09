import { html, nothing, type TemplateResult, type PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { CElement } from '../core/element';
import { ConductorApi } from '../api/client';
import { RunPoller } from '../api/poller';
import type { RunState, Phase, CurrentPhase, PendingDecision, DecisionFinding, FileChange, ModelsResponse, RunFiles } from '../api/types';
import { fmt, secs, verdictClass } from '../lib/format';
import { loader } from '../lib/loader';
import { phaseIcon, modelIcon } from '../lib/icons';
import '../components/status-pill';
import '../components/raw-output';
import '../components/model-breakdown';

/** PANTALLA /run : vista viva del run (polling). Coste/tokens por fase y acumulado SIEMPRE visibles. */
@customElement('run-screen')
export class RunScreen extends CElement {
  @property() apiBase = '/api/';
  @property() change = '';
  @property() projId = '';
  @property() phaseId = '';
  @state() private s: RunState | null = null;
  @state() private err = '';
  @state() private selected = new Set<number>();
  @state() private note = '';
  @state() private hotModel = '';
  @state() private models: ModelsResponse | null = null;
  @state() private files: RunFiles | null = null; // resumen de cambios (experiencia Git)
  @state() private busy = ''; // acción POST en vuelo ('resume'|'approve'|'rollback'|'archive') → botón deshabilitado con texto de progreso
  @state() private actionErr = ''; // error de la última acción — inline, nunca en silencio
  @state() private archivedMsg = ''; // resultado del archivado (promoted/needsManualMerge)
  private filesSig = ''; // re-fetch del changeset solo cuando cambia algo que lo afecta (no en cada poll)
  private pendingKey = ''; // identidad de la pausa actual (before|nFindings) → limpia la selección al cambiar de decisión
  private api = new ConductorApi('/api/');
  private poller: RunPoller | null = null;
  private activeBase = '';

  override updated(_changed: PropertyValues): void {
    if (this.apiBase && this.apiBase !== this.activeBase) { this.activeBase = this.apiBase; this.restart(); }
  }
  override disconnectedCallback(): void { super.disconnectedCallback(); this.poller?.stop(); document.title = 'conductor'; }

  private restart(): void {
    this.poller?.stop();
    this.s = null; this.err = ''; this.files = null; this.filesSig = ''; this.stopping = false; this.pendingKey = '';
    // limpia el estado de la DECISIÓN al reiniciar/reanudar: sin esto, la selección de hallazgos (por índice),
    // la nota y el modelo-en-caliente de una pausa anterior se filtraban al `continue` de la SIGUIENTE decisión
    // (targeteando hallazgos equivocados). Solo approve() los limpiaba, y solo tras éxito.
    this.selected = new Set(); this.note = ''; this.hotModel = '';
    this.api = new ConductorApi(this.apiBase);
    this.poller = new RunPoller(this.apiBase, (s) => {
      if (s.done) this.stopping = false; // el run terminó (STOPPED/GREEN/…): reactiva el botón para un futuro resume
      // si llega una decisión DISTINTA a la anterior (nueva pausa tras un fix, otra fase), limpia selección/nota/
      // modelo de la previa → no se envían índices de hallazgos obsoletos contra los de OTRA decisión.
      const pk = s.pending ? `${s.pending.before}|${(s.pending.findings || []).length}` : '';
      if (pk !== this.pendingKey) { this.pendingKey = pk; if (pk) { this.selected = new Set(); this.note = ''; this.hotModel = ''; } }
      this.s = s; void this.maybeFetchFiles(s);
      // señal de atención en la pestaña: una pausa esperando decisión no debe ser invisible con la pestaña de fondo
      document.title = s.pending ? '⏸ tu decisión — conductor' : 'conductor';
    }, (e) => { this.err = (e as Error).message; });
    this.poller.start();
    // catálogo para el select "Cambiar modelo" — los modelos son globales, siempre desde /api/ (B3)
    void new ConductorApi('/api/').models().then((m) => { this.models = m; }).catch(() => {});
  }

  // re-fetch del changeset SOLO cuando cambia algo que lo afecta (veredicto o nº de fases hechas) → no en cada poll de 5s
  private async maybeFetchFiles(s: RunState): Promise<void> {
    const sig = (s.verdict ?? '') + '|' + s.phases.filter((p) => p.ok).length;
    if (sig === this.filesSig) return;
    // #10: marca la firma SOLO tras un fetch OK. Si falla (red/carrera), no se "quema" la firma → se reintenta al
    // siguiente poll en vez de ocultar el changeset para siempre. Conserva el último bueno ante fallo puntual.
    try { this.files = await this.api.runFiles(); this.filesSig = sig; } catch { /* reintenta al próximo poll */ }
  }

  // select de modelo en caliente (sustituye al input libre): Copilot + qwen disponibles, como en el panel.
  private hotModelSelect(): TemplateResult {
    const m = this.models;
    const cop = m?.copilot ?? [];
    const byok = m?.byok ?? [];
    const creds = !!m?.byokCreds;
    return html`<label class="fl">Cambiar modelo<select .value=${this.hotModel} title=${m ? `Copilot: ${m.copilotSource} · qwen: ${m.byokSource}` : ''} @change=${(e: Event) => { this.hotModel = (e.target as HTMLSelectElement).value; }}>
      <option value="">Mantener el modelo de esta fase</option>
      ${cop.length ? html`<optgroup label="Copilot${m?.copilotPending ? ' · vistos en tus runs' : ''}">${cop.map((o) => html`<option value="copilot:${o}">${o}</option>`)}</optgroup>` : html`<option value="" disabled>catálogo Copilot aún no disponible</option>`}
      ${creds && byok.length ? html`<optgroup label="qwen · LiteLLM">${byok.map((o) => html`<option value="byok:${o}">${o}</option>`)}</optgroup>` : nothing}
    </select></label>`;
  }

  private async approve(fix: boolean): Promise<void> {
    this.busy = 'approve'; this.actionErr = '';
    try {
      const r = await this.api.continue({ selected: fix ? [...this.selected] : undefined, note: this.note || undefined, model: this.hotModel || undefined });
      if (!r.ok) { this.actionErr = r.error || 'no se pudo aprobar — reintenta o detén el run'; return; }
      this.note = ''; this.hotModel = ''; this.selected = new Set();
      if (this.s) this.s = { ...this.s, pending: null }; // óptimista: la card desaparece ya (el poll confirma en ≤2s)
    } finally { this.busy = ''; }
  }
  // Reanudar reinicia el POLLER: éste se auto-detiene en done, así que sin restart() la pantalla quedaba
  // congelada mostrando el estado terminado aunque el run ya corría de nuevo en el servidor.
  private async resumeRun(): Promise<void> {
    this.busy = 'resume'; this.actionErr = '';
    try {
      const r = await this.api.resume();
      if (!r.ok) { this.actionErr = r.error || 'no se pudo reanudar'; return; }
      this.restart();
    } finally { this.busy = ''; }
  }
  private async archiveRun(): Promise<void> {
    if (!confirm('¿Archivar este change? Se promueve la spec a la fuente de verdad y el change pasa al histórico. Tu código no se toca.')) return;
    this.busy = 'archive'; this.actionErr = '';
    try {
      const r = await this.api.archiveRun();
      if (!r.ok) { this.actionErr = r.error || 'no se pudo archivar'; return; }
      const nMerge = r.needsManualMerge?.length ?? 0;
      const manual = nMerge ? ` · ${nMerge} spec${nMerge === 1 ? '' : 's'} ${nMerge === 1 ? 'requiere' : 'requieren'} merge manual (cambios no aditivos)` : '';
      const nProm = r.promoted?.length ?? 0;
      this.archivedMsg = `Archivado. ${nProm} spec${nProm === 1 ? '' : 's'} ${nProm === 1 ? 'promovida' : 'promovidas'}${manual}.`;
    } finally { this.busy = ''; }
  }
  private toggleSel(i: number, on: boolean): void {
    const next = new Set(this.selected);
    if (on) next.add(i); else next.delete(i);
    this.selected = next;
  }
  // Detener con feedback INMEDIATO: durante una pausa el poll es lento (5s) y el botón parecía no responder.
  // Marca el estado local al instante (botón «Deteniendo…» + oculta la card de decisión de forma óptima).
  @state() private stopping = false;
  private async stopRun(): Promise<void> {
    const prevPending = this.s?.pending ?? null; // para RESTAURAR la card de decisión si el stop falla
    this.stopping = true; this.actionErr = '';
    if (this.s) this.s = { ...this.s, pending: null };
    try {
      const r = await this.api.stop();
      // si el stop FALLA, restaurar `pending`: el run sigue pausado y el poller dedupe un /state idéntico → sin
      // esto la card de Decisión (Aprobar/Corregir/Continuar) quedaba oculta para siempre (solo un reload la traía).
      if (!r.ok) { this.actionErr = r.error || 'no se pudo detener'; this.stopping = false; if (this.s) this.s = { ...this.s, pending: prevPending }; }
    } catch { this.actionErr = 'no se pudo detener'; this.stopping = false; if (this.s) this.s = { ...this.s, pending: prevPending }; }
  }
  private async rollback(phase: string): Promise<void> {
    if (!confirm(`¿Deshacer "${phase}"? Se restaurarán los archivos al estado previo a esta fase. La rama de git no se modifica.`)) return;
    this.busy = 'rollback'; this.actionErr = '';
    try {
      const r = await this.api.rollback(phase);
      if (!r.ok) this.actionErr = r.error || 'no se pudo deshacer';
    } finally { this.busy = ''; }
  }
  private viewDiff(path: string): void {
    document.dispatchEvent(new CustomEvent('cdr-view', { detail: { apiBase: this.apiBase, kind: 'diff', path } }));
  }
  private viewArtifact(path: string): void {
    document.dispatchEvent(new CustomEvent('cdr-view', { detail: { apiBase: this.apiBase, kind: 'art', path } }));
  }
  private runPath(): string { return location.pathname.replace(/\/+$/, ''); }
  private dashboardHref(): string {
    return this.projId ? `/artifact/${this.projId}/${this.change}/dashboard.html` : `/artifact/${this.change}/dashboard.html`;
  }
  private sessionHref(): string { return this.projId ? `/session/${this.projId}/${this.change}` : `/session/${this.change}`; }
  private sign(k: string): string { return k === 'create' ? '+' : k === 'delete' ? '−' : '±'; }

  override render(): TemplateResult {
    if (this.err && !this.s) return html`<p class="errline" role="alert">Error: ${this.err}</p>`;
    const s = this.s;
    if (!s) return loader('Cargando run');
    const isDemo = this.apiBase.includes('/demo');
    return html`
      ${isDemo ? html`<div class="whybox ok" role="note" style="margin-bottom:1rem"><b>Demo</b> — pantalla de muestra con datos ficticios (modelos, cambios y coste no son reales). <a href="/">Ir a tu panel</a></div>` : nothing}
      <div class="apphdr">
        <h1 class="trunc">${this.change || s.project || 'run'}</h1>
        <span role="status" aria-live="polite"><status-pill .verdict=${s.pending ? 'EN PAUSA' : (s.verdict ?? 'EN CURSO')}></status-pill></span>
      </div>
      <p class="subhead">${s.project || '—'}${s.branch ? html` · ${s.branch}` : ''}</p>
      <div class="actbar">
        <a class="btn sm sec" href=${this.sessionHref()}>📃 Ver sesión</a>
        ${s.done && verdictClass(s.verdict) !== 'GREEN' ? html`<button class="btn sm resume" ?disabled=${this.busy === 'resume'} @click=${() => void this.resumeRun()}>${this.busy === 'resume' ? 'Reanudando…' : '↻ Reanudar'}</button>` : nothing}
        ${s.done && verdictClass(s.verdict) === 'GREEN' && !this.archivedMsg ? html`<button class="btn sm arch" ?disabled=${this.busy === 'archive'} @click=${() => void this.archiveRun()}>${this.busy === 'archive' ? 'Archivando…' : '⬆ Archivar'}</button>` : nothing}
        ${s.hasDashboard ? html`<a class="btn sm dash" href=${this.dashboardHref()} target="_blank">📊 Informe</a>` : nothing}
        <a class="btn sm aiact" href=${this.apiBase + 'aiact'} target="_blank">🛡 AI Act</a>
        ${!s.done ? html`<button class="btn sm stop" ?disabled=${s.stopRequested || this.stopping} @click=${() => void this.stopRun()}>${s.stopRequested || this.stopping ? 'Deteniendo…' : '■ Detener'}</button>` : nothing}
      </div>
      ${this.actionErr ? html`<div class="errline" role="alert">${this.actionErr}</div>` : nothing}
      ${this.archivedMsg ? html`<div class="whybox ok" role="status">${this.archivedMsg} <a href="/">Volver al panel</a></div>` : nothing}
      ${s.done && s.reason && verdictClass(s.verdict) !== 'GREEN' ? html`<div class="whybox" role="alert"><svg class="why-ic" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 4.3v4.4M8 11.0v.05" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg><span><b>Por qué:</b> ${s.reason}</span></div>` : nothing}
      ${s.tests?.ran ? html`<div class="muted" style="margin:.1rem 0 .9rem;font-size:.82rem">Pruebas del proyecto (antes de verify): ${s.tests.passed ? html`<span style="color:var(--ok);font-weight:600">✓ pasaron</span>` : html`<span style="color:var(--warn);font-weight:600">✗ fallaron</span>`} <code style="font-size:.85em">${s.tests.cmds.join(' · ')}</code>${!s.tests.passed && s.tests.failed.length ? html` <span class="muted">— falló: ${s.tests.failed.join(', ')}</span>` : nothing}</div>` : nothing}
      ${s.done ? (() => { const arts = this.reviewArtifacts(s); return arts.length ? html`<div class="decision-arts" style="margin:0 0 .9rem"><span class="ctx-lbl">Artefactos</span>${arts.map((a) => html`<button type="button" class="lnk" title="abrir ${a.path} (editable)" @click=${() => this.viewArtifact(a.path)}>📄 ${a.label}</button>`)}<button type="button" class="lnk" title="abrir verify-report.md" @click=${() => this.viewArtifact('verify-report.md')}>📄 verify-report.md</button></div>` : nothing; })() : nothing}
      ${this.requestBox(s)}
      ${this.phaseId ? this.phaseDetail(s) : nothing}
      ${s.pending ? this.pendingCard(s.pending, s) : nothing}
      ${this.cards(s)}
      ${this.pipeline(s)}
      ${this.changesSection()}
      ${s.cost ? html`<model-breakdown .cost=${s.cost}></model-breakdown>` : nothing}
      ${this.logBox(s)}
    `;
  }

  private requestBox(s: RunState): TemplateResult {
    return html`<details class="req" ?open=${!(s.request && s.request.length > 90)}>
      <summary class="req-sum"><span class="req-lbl">Prompt</span><span class="req-badge">${s.complexity}${s.resumed ? ' · reanudado' : ''}</span></summary>
      <p class="req-body">${s.request}</p>
    </details>`;
  }

  private phaseDetail(s: RunState): TemplateResult | typeof nothing {
    const p = s.phases.find((x) => x.phase === this.phaseId);
    if (!p) return nothing;
    return html`<div class="ph">
      <div class="row">
        <span class="name">${phaseIcon(p.phase)} Detalle: ${p.phase}</span>
        <span class="role">${p.role}</span>
        <span class="right">${secs(p.ms)} · ↓${fmt(p.tokens?.in)} ↑${fmt(p.tokens?.out)}</span>
      </div>
      ${this.fileList(p.files)}
      ${p.hasRaw ? html`<raw-output .apiBase=${this.apiBase} .phase=${p.phase}></raw-output>` : nothing}
      <div style="margin-top:var(--sp-2)"><a class="btn sm sec" href=${this.runPath()}>← volver</a></div>
    </div>`;
  }

  // artefactos YA producidos por fases previas — la pausa dice "revisa los artefactos" pero antes no enlazaba
  // ninguno: "editar la spec" era inalcanzable sin bajar a la barra de fases. Aquí, a un clic (viewArtifact = editable).
  private reviewArtifacts(s: RunState): Array<{ label: string; path: string }> {
    const FIXED: Record<string, string> = { explore: 'exploration.md', propose: 'proposal.md', clarify: 'questions.md', design: 'design.md', tasks: 'tasks.md', apply: 'apply-report.md' };
    const out: Array<{ label: string; path: string }> = [];
    for (const p of s.phases) {
      if (!p.ok) continue;
      if (p.phase === 'spec') {
        // la ruta real de la spec depende del dominio → se extrae del fichero que la fase escribió.
        // Array.isArray: el poller solo coacciona `phases` (top-level), no `p.files`; un timeline corrupto con
        // files:"str" hacía `.find` no-función → crash de TODO el run screen (mismo blindaje que fileList).
        const f = Array.isArray(p.files) ? p.files.find((x) => /specs[\\/].+[\\/]spec\.md$/i.test(x.p)) : undefined;
        const rel = f ? f.p.replace(/\\/g, '/').replace(/^.*openspec\/changes\/[^/]+\//, '') : '';
        if (rel && rel.startsWith('specs/')) out.push({ label: 'spec.md', path: rel });
      } else if (FIXED[p.phase]) out.push({ label: FIXED[p.phase], path: FIXED[p.phase] });
    }
    return out.filter((a, i) => out.findIndex((b) => b.path === a.path) === i);
  }

  private pendingCard(pd: PendingDecision, s: RunState): TemplateResult {
    const arts = this.reviewArtifacts(s);
    // hallazgos tolerantes: string (compat/estados viejos) u objeto {message, severity, file}. Se muestra la SEVERIDAD
    // (error vs aviso — antes invisible, todos parecían igual de graves) y el FICHERO (clickable si es un artefacto del
    // cambio) → el revisor decide qué corregir VIENDO qué es grave y dónde, sin bajar a la barra de fases.
    const fnd: DecisionFinding[] = (pd.findings ?? []).map((f) => (typeof f === 'string' ? { message: f } : f));
    const nSel = this.selected.size; // corregir se basa en lo SELECCIONADO, no en si EXISTEN hallazgos
    const errSev = (s?: string) => s === 'error' || s === 'breaking'; // breaking = lo más grave → bucket rojo, nunca "aviso"
    return html`<section class="decision">
      <header class="decision-head">
        <span class="decision-led" aria-hidden="true"></span>
        <div class="decision-titles">
          <h2 class="decision-title">Decisión del revisor</h2>
          <span class="decision-sub" role="status" aria-live="polite">Antes de <b>${pd.before}</b> · ${fnd.length ? 'selecciona los hallazgos a corregir o ajusta la fase' : 'revisa y aprueba para continuar'}</span>
        </div>
      </header>
      <div class="decision-body">
        ${arts.length ? html`<div class="decision-arts"><span class="ctx-lbl">Revisar</span>${arts.map((a) => html`<button type="button" class="lnk" title="abrir ${a.path} (editable)" @click=${() => this.viewArtifact(a.path)}>📄 ${a.label}</button>`)}</div>` : nothing}
        ${fnd.length ? html`<ul class="decision-findings">${fnd.map((f, i) => html`
          <li>
            <label><input type="checkbox" .checked=${this.selected.has(i)} @change=${(e: Event) => this.toggleSel(i, (e.target as HTMLInputElement).checked)}>
              <span class="fnd">${f.severity ? html`<span class="sev ${errSev(f.severity) ? 'error' : 'aviso'}">${errSev(f.severity) ? 'error' : 'aviso'}</span>` : nothing}${f.message}</span></label>
            ${f.file ? (/\.(md|txt)$/.test(f.file)
              ? html`<button type="button" class="lnk fnd-file" title="ver ${f.file}" @click=${() => this.viewArtifact(f.file as string)}>${f.file}</button>`
              : html`<code class="fnd-file">${f.file}</code>`) : nothing}
          </li>`)}</ul>` : nothing}
        <div class="pend-controls">
          <label class="fl" style="flex:1;min-width:14rem">Nota (opcional)<textarea class="pend-note" rows="2" .value=${this.note} @input=${(e: Event) => { this.note = (e.target as HTMLTextAreaElement).value; }} placeholder="Instrucción para esta fase (opcional)"></textarea></label>
          ${this.hotModelSelect()}
        </div>
        <button class="approve" ?disabled=${this.busy === 'approve'} @click=${() => void this.approve(nSel > 0)}>${this.busy === 'approve' ? 'Enviando…' : (nSel > 0 ? `Corregir ${nSel} hallazgo${nSel === 1 ? '' : 's'}` : 'Aprobar y continuar')}</button>
      </div>
    </section>`;
  }

  // datos del run en UNA línea (antes 6-7 tarjetas): orienta sin convertir cada pantalla en un cuadro de
  // mandos. El desglose por modelo sigue abajo (model-breakdown) y el € de LiteLLM en el panel/Informe.
  private cards(s: RunState): TemplateResult {
    const done = s.phases.filter((p) => p.ok).length;
    const planned = s.plan?.length || s.phases.length;
    const tin = s.phases.reduce((a, p) => a + (p.tokens?.in ?? 0), 0);
    const tout = s.phases.reduce((a, p) => a + (p.tokens?.out ?? 0), 0);
    const files = s.phases.reduce((a, p) => a + (p.files?.length ?? 0), 0);
    const gh = s.ghUsage;
    const sv = s.savings;
    return html`<div class="statline" role="status" aria-label="resumen del run">
      <span><b>${done}/${planned}</b> fases</span>
      <span>${secs(s.total_ms ?? (s.current ? s.now - s.current.startedAt : null))}</span>
      ${tin + tout > 0 ? html`<span title="tokens de entrada/salida acumulados">↓${fmt(tin)} ↑${fmt(tout)}</span>` : nothing}
      ${files ? html`<span>${files} fichero${files === 1 ? '' : 's'}</span>` : nothing}
      ${sv && sv.byok_phases > 0 ? html`<span class="st-ok" title="fases en qwen vía LiteLLM — 0 AI Credits (↓${fmt(sv.byok_in)} ↑${fmt(sv.byok_out)} tokens fuera de Copilot)">qwen ${sv.byok_phases}/${sv.byok_phases + sv.copilot_phases} · 0 AIC</span>` : nothing}
      ${gh ? html`<span title="AI Credits de tu cuenta Copilot">AIC ${gh.used}/${gh.entitlement}</span>` : nothing}
    </div>`;
  }

  // CAMBIOS del run (experiencia Git): changeset consolidado — fichero × tipo × +/− líneas, clic → diff coloreado.
  private changesSection(): TemplateResult | typeof nothing {
    const f = this.files;
    if (!Array.isArray(f?.files) || !f.files.length) return nothing; // demo/backend parcial: objeto sin `files` array
    const t = f.totals;
    return html`
      <div class="sectrow"><h2 class="sect">Cambios</h2>${f.fromGit ? nothing : html`<span class="muted" style="font-size:.72rem">aprox. (sin git)</span>`}</div>
      <div class="changes">
        <div class="changes-head">
          <span class="ch-n">${t.files} fichero${t.files === 1 ? '' : 's'}</span>
          <span class="ch-stat"><span class="ch-add">+${fmt(t.added)}</span><span class="ch-del">−${fmt(t.removed)}</span></span>
        </div>
        <ul class="ch-list">
          ${f.files.map((c) => html`<li class="ch-row">
            <span class="k ${c.k}" title=${c.k}>${this.sign(c.k)}</span>
            <button class="ch-path" @click=${() => this.viewDiff(c.p)} title="ver diff de ${c.p}">${c.p}</button>
            ${c.added != null ? html`<span class="ch-rstat"><span class="ch-add">+${c.added}</span><span class="ch-del">−${c.removed}</span></span>` : nothing}
          </li>`)}
        </ul>
      </div>`;
  }

  private pipeline(s: RunState): TemplateResult {
    const doneNames = new Set(s.phases.map((p) => p.phase));
    const pending = (Array.isArray(s.plan) ? s.plan : []).filter((ph) => !doneNames.has(ph) && (!s.current || s.current.phase !== ph));
    return html`<h2 class="sect">Pipeline</h2>
      <div class="rail">
        ${s.phases.map((p) => this.phaseCard(p))}
        ${s.current ? this.currentCard(s.current, s.now) : nothing}
        ${pending.map((ph) => html`<div class="ph todo"><div class="row"><span class="name muted">○ ${phaseIcon(ph)} ${ph}</span></div></div>`)}
      </div>
    `;
  }

  // ROBUSTEZ: los campos internos de una fase (files, lenses…) NO los coacciona el poller (solo `phases`).
  // Un timeline.json corrupto (el coder escribe en .conductor con --allow-all-tools, o disco) podía traer
  // files:"string" → `.map`/`.length` crasheaban TODO el run. Se exige Array.isArray donde se itera.
  private fileList(files: FileChange[] | undefined): TemplateResult | typeof nothing {
    if (!Array.isArray(files) || !files.length) return nothing;
    return html`<details class="files"><summary>${files.length} ${files.length === 1 ? 'fichero' : 'ficheros'}</summary><ul>
      ${files.map((f) => html`<li><span class="k ${f.k}">${this.sign(f.k)}</span> <button class="lnk" @click=${() => this.viewDiff(f.p)}>${f.p}</button></li>`)}
    </ul></details>`;
  }

  private phaseContext(p: Phase): TemplateResult | typeof nothing {
    const ctx = p.context;
    if (!ctx) return nothing;
    const ins = Array.isArray(ctx.instructions) ? ctx.instructions : [];
    const files = Array.isArray(ctx.contextFiles) ? ctx.contextFiles : [];
    if (!ins.length && !files.length) return nothing;
    return html`<details class="ph-ctx">
      <summary>Contexto del agente</summary>
      ${ins.length ? html`<div class="ctx-row"><span class="ctx-lbl">Instrucciones</span><span class="ctx-chips">${ins.map((f) => html`<code class="ctx-chip">${f.split('/').pop()}</code>`)}</span></div>` : nothing}
      ${files.length ? html`<div class="ctx-row"><span class="ctx-lbl">Archivos</span><span class="ctx-chips">${files.map((f) => html`<code class="ctx-chip">${f}</code>`)}</span></div>` : nothing}
    </details>`;
  }

  private phaseCard(p: Phase): TemplateResult {
    return html`<div class="ph ${p.ok ? 'done' : 'bad'}">
      <div class="row">
        <span class="name"><a href="${this.runPath()}?phase=${p.phase}">${phaseIcon(p.phase)} ${p.phase}</a></span>
        <span class="role">${p.role}</span>
        ${p.model ? html`<span class="badge prov-${p.provider ?? 'none'}">${modelIcon(p.model, p.provider)} ${p.model}</span>` : nothing}
        ${p.modelMismatch ? html`<span class="badge warn" title="pedido ${p.modelRequested ?? '?'} → el proveedor reportó ${p.modelReported ?? '?'}">⚠ modelo</span>` : nothing}
        ${p.attempts > 1 ? html`<span class="badge">${p.attempts}×</span>` : nothing}
        ${Array.isArray(p.lenses) && p.lenses.length ? html`<span class="badge">${p.lenses.length} lentes</span>` : nothing}
        ${p.resumed ? html`<span class="badge">⏯ heredada</span>` : nothing}
        <span class="right">${secs(p.ms)}${p.tokens ? html` · ↓${fmt(p.tokens.in)} ↑${fmt(p.tokens.out)}` : nothing}</span>
      </div>
      ${this.fileList(p.files)}
      ${this.phaseContext(p)}
      ${(p.phase === 'apply' || p.phase === 'fix') ? html`<div style="margin-top:var(--sp-2)"><button class="rollbtn" ?disabled=${this.busy === 'rollback'} @click=${() => void this.rollback(p.phase)}>${this.busy === 'rollback' ? 'Deshaciendo…' : '↩ Deshacer'}</button></div>` : nothing}
      ${p.hasRaw ? html`<raw-output .apiBase=${this.apiBase} .phase=${p.phase}></raw-output>` : nothing}
      ${p.lastError ? html`<div class="errline">${p.lastError}</div>` : nothing}
    </div>`;
  }

  private currentCard(c: CurrentPhase, now: number): TemplateResult {
    const pct = c.timeoutMs ? Math.min(95, Math.round(((now - c.startedAt) / c.timeoutMs) * 100)) : 40;
    return html`<div class="ph now">
      <div class="row">
        <span class="name">▶ ${phaseIcon(c.phase)} ${c.phase}</span>
        <span class="role">${c.role} · intento ${c.attempt}/${c.maxAttempts} · ${c.model ?? 'sesión'}</span>
      </div>
      <div class="bar"><i style="width:${pct}%"></i></div>
      ${c.lastActivity ? html`<div class="muted" style="font:.74rem var(--mono);margin-top:.3rem" title="última acción del agente">▸ ${c.lastActivity}</div>` : nothing}
      ${c.lastError ? html`<div class="errline">${c.lastError}</div>` : nothing}
    </div>`;
  }

  private logBox(s: RunState): TemplateResult {
    return html`<h2 class="sect">Registro</h2>
      <pre class="logpre">${(Array.isArray(s.logTail) ? s.logTail : []).join('\n') || '—'}</pre>`;
  }
}

declare global { interface HTMLElementTagNameMap { 'run-screen': RunScreen; } }
