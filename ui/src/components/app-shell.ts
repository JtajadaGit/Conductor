import { html, nothing, type TemplateResult } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { CElement } from '../core/element';
import { router, type Route } from '../router';
import { loader } from '../lib/loader';
import './app-sidebar';
import './artifact-viewer';
import './theme-toggle';

const SB_KEY = 'conductorSbHide';

/**
 * <conductor-app> — raíz de la SPA: sidebar + área de contenido. Carga las pantallas por code-splitting
 * (import() por ruta) para mantener el arranque ultra-ágil. El router deriva pantalla + apiBase de la URL.
 */
@customElement('conductor-app')
export class ConductorApp extends CElement {
  @state() private route: Route = router.current;
  @state() private sbHide = localStorage.getItem(SB_KEY) === '1';
  @state() private ready = false;

  private buildTimer: ReturnType<typeof setInterval> | null = null;
  private bootSig: string | null = null;

  override connectedCallback(): void {
    super.connectedCallback();
    router.addEventListener('change', this.onRoute as EventListener);
    router.start();
    // AUTO-RELEVO: vigila el build del servidor (versión del motor + hash de la UI) y recarga si cambia,
    // para no quedarse con una pestaña "desactualizada" tras un redeploy. Sin esto, el SPA en memoria sigue
    // con el JS viejo hasta un Ctrl+Shift+R manual.
    void this.checkBuild();
    this.buildTimer = setInterval(() => void this.checkBuild(), 15000);
  }
  override disconnectedCallback(): void {
    super.disconnectedCallback();
    router.removeEventListener('change', this.onRoute as EventListener);
    if (this.buildTimer) clearInterval(this.buildTimer);
  }

  private async checkBuild(): Promise<void> {
    try {
      const r = await fetch('/api/ping', { cache: 'no-store' });
      if (!r.ok) return;
      const j = await r.json() as { version?: string | null; uiBuild?: string | null };
      const sig = `${j.version ?? ''}|${j.uiBuild ?? ''}`;
      if (this.bootSig === null) { this.bootSig = sig; return; } // primera lectura = línea base
      if (sig !== this.bootSig) location.reload();
    } catch { /* servidor caído: el sidebar ya lo señala; no recargamos a ciegas */ }
  }

  private onRoute = (e: Event): void => {
    this.route = (e as CustomEvent<Route>).detail;
    void this.preload();
  };

  private async preload(): Promise<void> {
    this.ready = false;
    const n = this.route.name;
    if (n === 'panel') await import('../screens/panel-screen');
    else if (n === 'run' || n === 'demo') await import('../screens/run-screen');
    else if (n === 'help') await import('../screens/help-screen');
    else if (n === 'flow') await import('../screens/flow-screen');
    else if (n === 'session') await import('../screens/session-screen');
    this.ready = true;
  }

  private toggleSb(): void {
    this.sbHide = !this.sbHide;
    localStorage.setItem(SB_KEY, this.sbHide ? '1' : '0');
  }

  private screen(): TemplateResult | typeof nothing {
    if (!this.ready) return loader('Cargando conductor', true);
    const r = this.route;
    if (r.name === 'panel') return html`<panel-screen></panel-screen>`;
    if (r.name === 'run' || r.name === 'demo') return html`<run-screen .apiBase=${r.apiBase} .change=${r.change ?? ''} .projId=${r.projId ?? ''} .phaseId=${r.query.get('phase') ?? ''}></run-screen>`;
    if (r.name === 'help') return html`<help-screen></help-screen>`;
    if (r.name === 'flow') return html`<flow-screen></flow-screen>`;
    if (r.name === 'session') return html`<session-screen .apiBase=${r.apiBase} .change=${r.change ?? ''} .projId=${r.projId ?? ''}></session-screen>`;
    return nothing;
  }

  override render(): TemplateResult {
    const active = (this.route.name === 'run' || this.route.name === 'session') ? (this.route.change ?? '') : '';
    return html`
      <a class="skiplink" href="#main-content">Saltar al contenido</a>
      <button class="sbtog" aria-label="alternar panel lateral" @click=${() => this.toggleSb()}>☰</button>
      <theme-toggle></theme-toggle>
      <div class="layout ${this.sbHide ? 'sbhide' : ''}">
        <aside class="sb" role="navigation" aria-label="Navegación de proyectos y runs"><app-sidebar .activeChange=${active} .activeRoute=${this.route.name}></app-sidebar></aside>
        <main class="content" id="main-content">${this.screen()}</main>
      </div>
      <artifact-viewer></artifact-viewer>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap { 'conductor-app': ConductorApp; }
}
