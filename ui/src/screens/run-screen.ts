import { html, nothing, type TemplateResult, type PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { CElement } from '../core/element';
import { ConductorApi } from '../api/client';
import { RunPoller } from '../api/poller';
import type { RunState, Phase, CurrentPhase, PendingDecision, FileChange, ModelsResponse } from '../api/types';
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
  private api = new ConductorApi('/api/');
  private poller: RunPoller | null = null;
  private activeBase = '';

  override updated(_changed: PropertyValues): void {
    if (this.apiBase && this.apiBase !== this.activeBase) { this.activeBase = this.apiBase; this.restart(); }
  }
  override disconnectedCallback(): void { super.disconnectedCallback(); this.poller?.stop(); }

  private restart(): void {
    this.poller?.stop();
    this.s = null; this.err = '';
    this.api = new ConductorApi(this.apiBase);
    this.poller = new RunPoller(this.apiBase, (s) => { this.s = s; }, (e) => { this.err = (e as Error).message; });
    this.poller.start();
    // catálogo para el select "Cambiar modelo" — los modelos son globales, siempre desde /api/ (B3)
    void new ConductorApi('/api/').models().then((m) => { this.models = m; }).catch(() => {});
  }

  // select de modelo en caliente (sustituye al input libre): Copilot + qwen disponibles, como en el panel.
  private hotModelSelect(): TemplateResult {
    const m = this.models;
    const cop = m?.copilot ?? [];
    const byok = m?.byok ?? [];
    const creds = !!m?.byokCreds;
    return html`<label class="fl">Cambiar modelo<select .value=${this.hotModel} @change=${(e: Event) => { this.hotModel = (e.target as HTMLSelectElement).value; }}>
      <option value="">Mantener el modelo de esta fase</option>
      ${cop.length ? html`<optgroup label="Copilot">${cop.map((o) => html`<option value="copilot:${o}">${o}</option>`)}</optgroup>` : nothing}
      ${creds && byok.length ? html`<optgroup label="qwen · LiteLLM">${byok.map((o) => html`<option value="byok:${o}">${o}</option>`)}</optgroup>` : nothing}
    </select></label>`;
  }

  private async approve(fix: boolean): Promise<void> {
    await this.api.continue({ selected: fix ? [...this.selected] : undefined, note: this.note || undefined, model: this.hotModel || undefined });
    this.note = ''; this.hotModel = ''; this.selected = new Set();
  }
  private toggleSel(i: number, on: boolean): void {
    const next = new Set(this.selected);
    if (on) next.add(i); else next.delete(i);
    this.selected = next;
  }
  private async rollback(phase: string): Promise<void> {
    if (!confirm(`¿Deshacer "${phase}"? Se restaurarán los archivos al estado previo a esta fase. La rama de git no se modifica.`)) return;
    await this.api.rollback(phase);
  }
  private viewDiff(path: string): void {
    document.dispatchEvent(new CustomEvent('cdr-view', { detail: { apiBase: this.apiBase, kind: 'diff', path } }));
  }
  private runPath(): string { return location.pathname.replace(/\/+$/, ''); }
  private dashboardHref(): string {
    return this.projId ? `/artifact/${this.projId}/${this.change}/dashboard.html` : `/artifact/${this.change}/dashboard.html`;
  }
  private sessionHref(): string { return this.projId ? `/session/${this.projId}/${this.change}` : `/session/${this.change}`; }
  private sign(k: string): string { return k === 'create' ? '+' : k === 'delete' ? '−' : '±'; }

  override render(): TemplateResult {
    if (this.err && !this.s) return html`<p class="errline">Error: ${this.err}</p>`;
    const s = this.s;
    if (!s) return loader('Cargando run');
    return html`
      <div class="apphdr">
        <h1 class="trunc">${this.change || s.project || 'run'}</h1>
        <status-pill .verdict=${s.pending ? 'EN PAUSA' : (s.verdict ?? 'EN CURSO')}></status-pill>
      </div>
      <p class="muted" style="margin:-.9rem 0 1.1rem;font-size:.82rem">${s.project || '—'}${s.branch ? html` · ${s.branch}` : ''}</p>
      <div class="actbar">
        <a class="btn sm" href=${this.sessionHref()}>Ver sesión</a>
        ${s.done && verdictClass(s.verdict) !== 'GREEN' ? html`<button class="btn sm sec resume" @click=${() => void this.api.resume()}>↻ Reanudar</button>` : nothing}
        ${s.hasDashboard ? html`<a class="btn sm sec dash" href=${this.dashboardHref()} target="_blank">Informe</a>` : nothing}
        <a class="btn sm sec aiact" href=${this.apiBase + 'aiact'} target="_blank">AI Act</a>
        ${!s.done ? html`<button class="btn sm stop" ?disabled=${s.stopRequested} @click=${() => void this.api.stop()}>${s.stopRequested ? 'Deteniendo…' : '■ Detener'}</button>` : nothing}
      </div>
      ${s.tests?.ran ? html`<div class="muted" style="margin:.1rem 0 .9rem;font-size:.82rem">Pruebas del proyecto (tras el gate): ${s.tests.passed ? html`<span style="color:var(--ok);font-weight:600">✓ pasaron</span>` : html`<span style="color:var(--warn);font-weight:600">✗ fallaron</span>`} <code style="font-size:.85em">${s.tests.cmds.join(' · ')}</code>${!s.tests.passed && s.tests.failed.length ? html` <span class="muted">— falló: ${s.tests.failed.join(', ')}</span>` : nothing}</div>` : nothing}
      ${this.requestBox(s)}
      ${this.phaseId ? this.phaseDetail(s) : nothing}
      ${s.pending ? this.pendingCard(s.pending) : nothing}
      ${this.cards(s)}
      ${this.pipeline(s)}
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
      <div style="margin-top:.5rem"><a class="btn sm sec" href=${this.runPath()}>← volver</a></div>
    </div>`;
  }

  private pendingCard(pd: PendingDecision): TemplateResult {
    const fnd = pd.findings ?? [];
    return html`<section class="decision" role="status" aria-live="polite">
      <header class="decision-head">
        <span class="decision-led" aria-hidden="true"></span>
        <div class="decision-titles">
          <span class="decision-title">Decisión del revisor</span>
          <span class="decision-sub">Antes de <b>${pd.before}</b> · ${fnd.length ? 'selecciona los hallazgos a corregir o ajusta la fase' : 'revisa y aprueba para continuar'}</span>
        </div>
      </header>
      <div class="decision-body">
        ${fnd.length ? html`<ul class="decision-findings">${fnd.map((mtxt, i) => html`
          <li><label><input type="checkbox" .checked=${this.selected.has(i)} @change=${(e: Event) => this.toggleSel(i, (e.target as HTMLInputElement).checked)}> <span>${mtxt}</span></label></li>`)}</ul>` : nothing}
        <div class="pend-controls">
          <label class="fl" style="flex:1;min-width:14rem">Nota (opcional)<textarea class="pend-note" rows="2" .value=${this.note} @input=${(e: Event) => { this.note = (e.target as HTMLTextAreaElement).value; }} placeholder="Instrucción para esta fase (opcional)"></textarea></label>
          ${this.hotModelSelect()}
        </div>
        <button class="approve" @click=${() => void this.approve(fnd.length > 0)}>${fnd.length ? 'Corregir los hallazgos seleccionados' : 'Aprobar y continuar'}</button>
      </div>
    </section>`;
  }

  private cards(s: RunState): TemplateResult {
    const done = s.phases.filter((p) => p.ok).length;
    const planned = s.plan?.length || s.phases.length;
    const tin = s.phases.reduce((a, p) => a + (p.tokens?.in ?? 0), 0);
    const tout = s.phases.reduce((a, p) => a + (p.tokens?.out ?? 0), 0);
    const files = s.phases.reduce((a, p) => a + (p.files?.length ?? 0), 0);
    const gh = s.ghUsage;
    return html`<div class="cards">
      <div class="card"><small>Fases</small><span>${done} / ${planned}</span></div>
      <div class="card"><small>Tokens entrada</small><span>↓ ${fmt(tin)}</span></div>
      <div class="card"><small>Tokens salida</small><span>↑ ${fmt(tout)}</span></div>
      <div class="card"><small>Ficheros</small><span>${files}</span></div>
      <div class="card"><small>Tiempo</small><span>${secs(s.total_ms ?? (s.current ? s.now - s.current.startedAt : null))}</span></div>
      ${s.usage ? html`<div class="card"><small>qwen · LiteLLM</small><span>$${s.usage.spend.toFixed(2)}${s.usage.budget ? html` / $${s.usage.budget.toFixed(0)}` : nothing}</span>${s.usage.budget ? html`<div class="pbar ${s.usage.spend / s.usage.budget > 0.8 ? 'warn' : ''}"><i style="width:${Math.min(100, (s.usage.spend / s.usage.budget) * 100)}%"></i></div>` : nothing}</div>` : nothing}
      ${gh ? html`<div class="card aic"><small>AI Credits</small><span>${gh.used}/${gh.entitlement}</span><div class="pbar ${gh.percentUsed > 80 ? 'warn' : ''}"><i style="width:${Math.min(100, gh.percentUsed)}%"></i></div></div>` : nothing}
    </div>`;
  }

  private pipeline(s: RunState): TemplateResult {
    const doneNames = new Set(s.phases.map((p) => p.phase));
    const pending = (s.plan ?? []).filter((ph) => !doneNames.has(ph) && (!s.current || s.current.phase !== ph));
    return html`<h2 class="sect">Pipeline</h2>
      <div class="rail">
        ${s.phases.map((p) => this.phaseCard(p))}
        ${s.current ? this.currentCard(s.current, s.now) : nothing}
        ${pending.map((ph) => html`<div class="ph"><div class="row"><span class="name muted">○ ${phaseIcon(ph)} ${ph}</span></div></div>`)}
      </div>
    `;
  }

  private fileList(files: FileChange[] | undefined): TemplateResult | typeof nothing {
    if (!files?.length) return nothing;
    return html`<details class="files"><summary>${files.length} fichero(s)</summary><ul>
      ${files.map((f) => html`<li><span class="k ${f.k}">${this.sign(f.k)}</span> <button class="lnk" @click=${() => this.viewDiff(f.p)}>${f.p}</button></li>`)}
    </ul></details>`;
  }

  private phaseContext(p: Phase): TemplateResult | typeof nothing {
    const ctx = p.context;
    if (!ctx) return nothing;
    const ins = ctx.instructions ?? [];
    const files = ctx.contextFiles ?? [];
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
        <span class="name"><a href="${this.runPath()}?phase=${p.phase}">${p.ok ? '✅' : '❌'} ${phaseIcon(p.phase)} ${p.phase}</a></span>
        <span class="role">${p.role}</span>
        ${p.model ? html`<span class="badge prov-${p.provider ?? 'none'}">${modelIcon(p.model, p.provider)} ${p.model}</span>` : nothing}
        ${p.modelMismatch ? html`<span class="badge warn" title="el proveedor reportó otro modelo">⚠ modelo</span>` : nothing}
        ${p.attempts > 1 ? html`<span class="badge">${p.attempts}×</span>` : nothing}
        ${p.lenses ? html`<span class="badge">${p.lenses.length} lentes</span>` : nothing}
        ${p.resumed ? html`<span class="badge">⏯ heredada</span>` : nothing}
        <span class="right">${secs(p.ms)} · ↓${fmt(p.tokens?.in)} ↑${fmt(p.tokens?.out)}</span>
      </div>
      ${this.fileList(p.files)}
      ${this.phaseContext(p)}
      ${(p.phase === 'apply' || p.phase === 'fix') ? html`<div style="margin-top:.4rem"><button class="rollbtn" @click=${() => void this.rollback(p.phase)}>↩ Deshacer</button></div>` : nothing}
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
      ${c.lastError ? html`<div class="errline">${c.lastError}</div>` : nothing}
    </div>`;
  }

  private logBox(s: RunState): TemplateResult {
    return html`<h2 class="sect">Registro</h2>
      <pre class="logpre">${(s.logTail ?? []).join('\n') || '—'}</pre>`;
  }
}

declare global { interface HTMLElementTagNameMap { 'run-screen': RunScreen; } }
