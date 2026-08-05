import { html, nothing, type TemplateResult } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { CElement } from '../core/element';
import { ConductorApi } from '../api/client';
import type { ProjectSummary, ChangeSummary } from '../api/types';
import { verdictClass, sanitizeProjects } from '../lib/format';
import { icon } from '../lib/svg-icons';

/** Sidebar con TODAS las runs de TODOS los proyectos (decisión de producto: las archivadas fuera —
 *  ya tienen su sección en el panel). El proyecto en foco va primero; cada grupo lleva su cabecera.
 *  Arriba, «Tu atención»: pausas esperando decisión, de cualquier proyecto. Refresco 5s. */
@customElement('app-sidebar')
export class AppSidebar extends CElement {
  @property() activeChange = '';
  @property() activeRoute = '';
  @property() activeProj = ''; // proyecto de la ruta actual (run/session) — manda sobre el foco recordado
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
    try { const d = await this.api.changes(); this.projects = sanitizeProjects(d.projects); } catch { /* conserva último bueno */ }
  }

  // LA URL ES EL FOCO: solo la ruta marca el proyecto «actual» (dentro de un run o en /<proyecto>).
  // En la home global no hay actual — todos los grupos al mismo nivel, en el orden del registro.
  private focusedProject(): ProjectSummary | null {
    const id = this.activeProj;
    // la ruta puede traer NOMBRE (URL a mano): vale para resaltar el grupo; la resolución honesta vive en el panel
    return id ? (this.projects.find((x) => x.id === id || x.name === id) ?? null) : null;
  }
  // pausas esperando decisión humana, en CUALQUIER proyecto — la única señal que cruza el foco
  private attention(): Array<{ p: ProjectSummary; c: ChangeSummary }> {
    return this.projects.flatMap((p) => (p.changes ?? []).filter((c) => c.pending).map((c) => ({ p, c })));
  }
  // APAGAR la app desde el sidebar (no hay comando `conductor` en PATH del usuario). 409 si hay run vivo.
  private async shutdown(): Promise<void> {
    try {
      const r = await fetch('/api/shutdown', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      if (r.status === 409) { this.appMsg = 'Hay un run en curso. Detenlo antes de apagar.'; return; }
    } catch { /* el servidor murió a mitad de respuesta: apagado igualmente */ }
    // apagado ACEPTADO → el shell toma el mando: velo de transición + pantalla «apagado» (sin quedarnos
    // en un panel vivo de mentira esperando a que el ping caduque)
    window.dispatchEvent(new CustomEvent('conductor:down'));
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
    const ordered = focus ? [focus, ...this.projects.filter((p) => p.id !== focus.id)] : this.projects;
    const att = this.attention();
    // resumen del pie sobre TODO lo visible (todas las runs no archivadas, de todos los proyectos)
    const all = ordered.flatMap((p) => p.changes ?? []);
    const nGreen = all.filter((c) => verdictClass(c.verdict) === 'GREEN').length;
    const nActive = all.filter((c) => verdictClass(c.verdict) === 'CURSO').length;
    return html`
      <div class="sb-logo" role="img" aria-label="conductor"><span class="logo" aria-hidden="true">C</span> conductor</div>
      <nav class="sb-nav" aria-label="Navegación principal">
        <a class="sb-link primary ${this.activeRoute === 'panel' ? 'active' : ''}" href="/" aria-current=${this.activeRoute === 'panel' ? 'page' : nothing}>${icon('panel')} Panel</a>
      </nav>
      ${att.length ? html`
      <nav class="sb-runs sb-attn" aria-label="Runs que esperan tu decisión">
        <h2 class="sb-h">Tu atención <span class="sb-cnt">${att.length}</span></h2>
        ${att.map(({ p, c }) => html`
          <a class="sb-run" href="/run/${p.id}/${c.name}" title="${c.request} · ${p.name}" aria-current=${this.activeChange === c.name ? 'page' : nothing}>
            <span class="dot CURSO" role="img" aria-label="esperando tu decisión"></span>
            <span class="nm">${icon('pause')} ${c.name}</span>
          </a>`)}
      </nav>` : nothing}
      ${ordered.map((p) => html`
      <nav class="sb-runs" aria-label="Runs de ${p.name}">
        <!-- cabecera CLICABLE = conmutador de proyecto (P1): clic → /<id> enfoca ese proyecto en el
             panel. Affordance sin ruido: carpeta + nombre, flecha de acento al hover, barra del actual. -->
        <h2 class="sb-h"><a class="sb-hlink ${focus?.id === p.id ? 'cur' : ''}" href="/${p.id}" title="Enfocar ${p.name} en el panel (URL directa: /${p.id})" aria-current=${focus?.id === p.id ? 'true' : nothing}>${icon('folder')}<span class="sb-hname">${p.name}</span>${(p.changes ?? []).length ? html`<span class="sb-cnt">${(p.changes ?? []).length}</span>` : nothing}<span class="sb-go" aria-hidden="true">→</span></a></h2>
        ${(p.changes ?? []).slice(0, 12).map((c) => html`
          <a class="sb-run" href="/run/${p.id}/${c.name}" title=${c.request} aria-current=${this.activeChange === c.name && this.activeProj === p.id ? 'page' : nothing}>
            <span class="dot ${this.dotClass(c)}" role="img" aria-label=${this.dotLabel(c)}></span>
            <span class="nm">${c.name}</span>
          </a>`)}
        ${(p.changes ?? []).length === 0 ? html`<div class="sb-empty">Sin runs todavía</div>` : nothing}
      </nav>`)}
      <div class="sb-bottom">
        ${all.length > 0 ? html`
        <div class="sb-foot" role="status" aria-label="resumen de runs">
          <span>${all.length} run${all.length !== 1 ? 's' : ''}</span>
          ${nGreen > 0 ? html`<span class="g" title="GREEN">${nGreen} ✓</span>` : nothing}
          ${nActive > 0 ? html`<span class="w" title="en curso">${nActive} ◉</span>` : nothing}
        </div>` : nothing}
        <!-- notebook: índice discreto en mono, sin emojis (decisión UX: los iconos de colores
             desentonaban con la voz de instrumento del resto del cockpit) -->
        <nav class="sb-foot-nav" aria-label="Más">
          <a class="sb-flink ${this.activeRoute === 'flow' ? 'active' : ''}" href="/flow" aria-current=${this.activeRoute === 'flow' ? 'page' : nothing}>Flujo</a>
          <a class="sb-flink ${this.activeRoute === 'help' ? 'active' : ''}" href="/help" aria-current=${this.activeRoute === 'help' ? 'page' : nothing}>Ayuda</a>
          <a class="sb-flink ${this.activeRoute === 'ahorro' ? 'active' : ''}" href="/ahorro" aria-current=${this.activeRoute === 'ahorro' ? 'page' : nothing}>Ahorro de tokens</a>
        </nav>
        ${this.appMsg ? html`<div class="sb-appmsg" role="status" aria-live="polite">${this.appMsg}</div>` : nothing}
        <button class="sb-shutdown" @click=${() => void this.shutdown()} aria-label="Apagar la app de conductor (se reabre con conductor en terminal)">⏻ Apagar conductor</button>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap { 'app-sidebar': AppSidebar; }
}
