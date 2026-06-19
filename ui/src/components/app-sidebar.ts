import { html, nothing, type TemplateResult } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { CElement } from '../core/element';
import { ConductorApi } from '../api/client';
import type { ProjectSummary, ChangeSummary } from '../api/types';
import { verdictClass } from '../lib/format';

/** Sidebar: logo, link al resumen y runs recientes por proyecto (refresco 5s). Resalta el run activo. */
@customElement('app-sidebar')
export class AppSidebar extends CElement {
  @property() activeChange = '';
  @property() activeRoute = '';
  @state() private projects: ProjectSummary[] = [];
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
    try { const d = await this.api.changes(); this.projects = d.projects ?? []; } catch { /* conserva último bueno */ }
  }
  // APAGAR la app desde el sidebar (no hay comando `conductor` en PATH del usuario). 409 si hay run vivo.
  private async shutdown(): Promise<void> {
    try {
      const r = await fetch('/api/shutdown', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      this.appMsg = r.status === 409 ? 'Hay un run en curso. Detenlo antes de apagar.' : 'Aplicación detenida. Vuelve a abrirla con /sdd-run.';
    } catch { this.appMsg = 'Aplicación detenida. Vuelve a abrirla con /sdd-run.'; }
  }
  private dotClass(c: ChangeSummary): string {
    const v = verdictClass(c.verdict);
    return v === 'GREEN' ? 'GREEN' : v === 'CURSO' ? 'CURSO' : v === 'G' ? 'G' : 'bad';
  }
  // L25: etiqueta HUMANA para lectores de pantalla (antes se leía el token de clase CSS 'G'/'bad'/'CURSO').
  private dotLabel(c: ChangeSummary): string {
    const v = verdictClass(c.verdict);
    return v === 'GREEN' ? 'completado' : v === 'CURSO' ? 'en curso' : v === 'G' ? 'estado desconocido' : 'no completado';
  }

  // solo proyectos relevantes: con sdd-init (openspec) o con runs. Oculta ruido del registro
  // (p. ej. el propio repo de la herramienta), igual que el desplegable del panel.
  private shown(): ProjectSummary[] {
    return this.projects.filter((p) => p.openspec || (p.changes?.length ?? 0) > 0);
  }

  override render(): TemplateResult {
    const shown = this.shown();
    const multi = shown.length > 1;
    const allChanges = shown.flatMap((p) => p.changes ?? []);
    const nGreen = allChanges.filter((c) => verdictClass(c.verdict) === 'GREEN').length;
    const nActive = allChanges.filter((c) => verdictClass(c.verdict) === 'CURSO').length;
    return html`
      <div class="sb-logo" role="img" aria-label="conductor"><span class="logo" aria-hidden="true">C</span> conductor</div>
      <nav class="sb-nav" aria-label="Navegación principal">
        <a class="sb-link primary ${this.activeRoute === 'panel' ? 'active' : ''}" href="/" aria-current=${this.activeRoute === 'panel' ? 'page' : nothing}>📋 Dashboard</a>
      </nav>
      <nav class="sb-runs" aria-label="Runs recientes">
      ${shown.map((p) => {
        const cnt = p.changes?.length ?? 0;
        return html`
          <h2 class="sb-h">
            ${multi ? p.name : 'Runs recientes'}
            ${cnt > 0 ? html`<span class="sb-cnt">${cnt}</span>` : nothing}
          </h2>
          ${(p.changes ?? []).slice(0, 12).map((c) => html`
            <a class="sb-run" href="/run/${p.id}/${c.name}" title=${c.request} aria-current=${this.activeChange === c.name ? 'page' : nothing}>
              <span class="dot ${this.dotClass(c)}" role="img" aria-label=${this.dotLabel(c)}></span>
              <span class="nm">${c.name}</span>
            </a>`)}
          ${cnt === 0 ? html`<div class="sb-empty">Sin runs todavía</div>` : nothing}
        `;
      })}
      </nav>
      <div class="sb-bottom">
        ${allChanges.length > 0 ? html`
        <div class="sb-foot" role="status" aria-label="resumen de runs">
          <span>${allChanges.length} run${allChanges.length !== 1 ? 's' : ''}</span>
          ${nGreen > 0 ? html`<span class="g" title="green">${nGreen} ✓</span>` : nothing}
          ${nActive > 0 ? html`<span class="w" title="en curso">${nActive} ◉</span>` : nothing}
        </div>` : nothing}
        <nav class="sb-foot-nav" aria-label="Más">
          <a class="sb-flink ${this.activeRoute === 'flow' ? 'active' : ''}" href="/flow" aria-current=${this.activeRoute === 'flow' ? 'page' : nothing}>🔻 Flujo</a>
          <a class="sb-flink ${this.activeRoute === 'help' ? 'active' : ''}" href="/help" aria-current=${this.activeRoute === 'help' ? 'page' : nothing}>❓ Ayuda</a>
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
