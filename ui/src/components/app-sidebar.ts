import { html, nothing, type TemplateResult } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { CElement } from '../core/element';
import { ConductorApi } from '../api/client';
import type { ProjectSummary, ChangeSummary } from '../api/types';
import { verdictClass, sanitizeProjects } from '../lib/format';

/** Sidebar EN FOCO: solo los cambios del proyecto activo + una sección «Tu atención» (pausas esperando
 *  decisión, de CUALQUIER proyecto — lo único que justifica cruzar el foco). El inventario multi-proyecto
 *  vive detrás del conmutador del panel, no aquí. Refresco 5s; resalta el run activo. */
@customElement('app-sidebar')
export class AppSidebar extends CElement {
  @property() activeChange = '';
  @property() activeRoute = '';
  @property() activeProj = ''; // proyecto de la ruta actual (run/session) — manda sobre el foco recordado
  @state() private projects: ProjectSummary[] = [];
  @state() private served = ''; // projectId servido por defecto (último fallback de foco)
  @state() private appMsg = '';
  private api = new ConductorApi('/api/');
  private timer: ReturnType<typeof setInterval> | null = null;

  override connectedCallback(): void {
    super.connectedCallback();
    void this.load();
    this.timer = setInterval(() => void this.load(), 5000);
  }
  override disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this.timer) clearInterval(this.timer);
  }
  private async load(): Promise<void> {
    try { const d = await this.api.changes(); this.projects = sanitizeProjects(d.projects); this.served = d.projectId ?? ''; } catch { /* conserva último bueno */ }
  }

  // FOCO: la ruta (si estás dentro de un run) > el proyecto elegido en el panel (localStorage) > el servido.
  private focusedProject(): ProjectSummary | null {
    let stored: string | null = null; try { stored = localStorage.getItem('conductor.activeProject'); } catch { /* sin storage */ }
    for (const id of [this.activeProj, stored, this.served]) {
      const p = id ? this.projects.find((x) => x.id === id) : undefined;
      if (p) return p;
    }
    return this.projects[0] ?? null;
  }
  // pausas esperando decisión humana, en CUALQUIER proyecto — la única señal que cruza el foco
  private attention(): Array<{ p: ProjectSummary; c: ChangeSummary }> {
    return this.projects.flatMap((p) => (p.changes ?? []).filter((c) => c.pending).map((c) => ({ p, c })));
  }
  // APAGAR la app desde el sidebar (no hay comando `conductor` en PATH del usuario). 409 si hay run vivo.
  private async shutdown(): Promise<void> {
    try {
      const r = await fetch('/api/shutdown', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      this.appMsg = r.status === 409 ? 'Hay un run en curso. Detenlo antes de apagar.' : 'Aplicación detenida. Vuelve a abrirla con /sdd-run.';
    } catch { this.appMsg = 'Aplicación detenida. Vuelve a abrirla con /sdd-run.'; }
  }
  private dotClass(c: ChangeSummary): string {
    if (c.pending) return 'CURSO'; // pausa esperando decisión → punto "vivo" (ámbar pulsante)
    const v = verdictClass(c.verdict);
    return v === 'GREEN' ? 'GREEN' : v === 'CURSO' ? 'CURSO' : v === 'G' ? 'G' : 'bad';
  }
  // L25: etiqueta HUMANA para lectores de pantalla (antes se leía el token de clase CSS 'G'/'bad'/'CURSO').
  private dotLabel(c: ChangeSummary): string {
    if (c.pending) return 'esperando tu decisión';
    const v = verdictClass(c.verdict);
    return v === 'GREEN' ? 'completado' : v === 'CURSO' ? 'en curso' : v === 'G' ? 'estado desconocido' : 'no completado';
  }

  override render(): TemplateResult {
    const focus = this.focusedProject();
    const changes = focus?.changes ?? [];
    const att = this.attention();
    const nGreen = changes.filter((c) => verdictClass(c.verdict) === 'GREEN').length;
    const nActive = changes.filter((c) => verdictClass(c.verdict) === 'CURSO').length;
    return html`
      <div class="sb-logo" role="img" aria-label="conductor"><span class="logo" aria-hidden="true">C</span> conductor</div>
      <nav class="sb-nav" aria-label="Navegación principal">
        <a class="sb-link primary ${this.activeRoute === 'panel' ? 'active' : ''}" href="/" aria-current=${this.activeRoute === 'panel' ? 'page' : nothing}>📋 Panel</a>
      </nav>
      ${att.length ? html`
      <nav class="sb-runs sb-attn" aria-label="Runs que esperan tu decisión">
        <h2 class="sb-h">Tu atención <span class="sb-cnt">${att.length}</span></h2>
        ${att.map(({ p, c }) => html`
          <a class="sb-run" href="/run/${p.id}/${c.name}" title="${c.request} · ${p.name}" aria-current=${this.activeChange === c.name ? 'page' : nothing}>
            <span class="dot CURSO" role="img" aria-label="esperando tu decisión"></span>
            <span class="nm">⏸ ${c.name}</span>
          </a>`)}
      </nav>` : nothing}
      <nav class="sb-runs" aria-label="Runs del proyecto en foco">
        <h2 class="sb-h">${focus?.name ?? 'Runs'}${changes.length ? html`<span class="sb-cnt">${changes.length}</span>` : nothing}</h2>
        ${changes.slice(0, 12).map((c) => html`
          <a class="sb-run" href="/run/${focus?.id}/${c.name}" title=${c.request} aria-current=${this.activeChange === c.name ? 'page' : nothing}>
            <span class="dot ${this.dotClass(c)}" role="img" aria-label=${this.dotLabel(c)}></span>
            <span class="nm">${c.name}</span>
          </a>`)}
        ${changes.length === 0 ? html`<div class="sb-empty">Sin runs todavía</div>` : nothing}
      </nav>
      <div class="sb-bottom">
        ${changes.length > 0 ? html`
        <div class="sb-foot" role="status" aria-label="resumen de runs del proyecto">
          <span>${changes.length} run${changes.length !== 1 ? 's' : ''}</span>
          ${nGreen > 0 ? html`<span class="g" title="GREEN">${nGreen} ✓</span>` : nothing}
          ${nActive > 0 ? html`<span class="w" title="en curso">${nActive} ◉</span>` : nothing}
        </div>` : nothing}
        <nav class="sb-foot-nav" aria-label="Más">
          <a class="sb-flink ${this.activeRoute === 'flow' ? 'active' : ''}" href="/flow" aria-current=${this.activeRoute === 'flow' ? 'page' : nothing}>🔻 Flujo</a>
          <a class="sb-flink ${this.activeRoute === 'help' ? 'active' : ''}" href="/help" aria-current=${this.activeRoute === 'help' ? 'page' : nothing}>❓ Ayuda</a>
          <a class="sb-flink wide ${this.activeRoute === 'ahorro' ? 'active' : ''}" href="/ahorro" aria-current=${this.activeRoute === 'ahorro' ? 'page' : nothing}>💶 Ahorro de tokens</a>
        </nav>
        ${this.appMsg ? html`<div class="sb-appmsg" role="status" aria-live="polite">${this.appMsg}</div>` : nothing}
        <button class="sb-shutdown" @click=${() => void this.shutdown()} aria-label="Apagar la app de conductor (se reabre con /sdd-run)">⏻ Apagar conductor</button>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap { 'app-sidebar': AppSidebar; }
}
