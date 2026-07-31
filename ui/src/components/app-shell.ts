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
  // en MÓVIL el sidebar es un overlay fijo: sin preferencia guardada, arranca OCULTO (si no, TAPA el
  // contenido y todo se ve estrujado en media pantalla — bug real a ≤820px). En desktop, visible por defecto.
  @state() private sbHide = ((): boolean => {
    // try/catch: en modo privado estricto / políticas corporativas, localStorage LANZA al leer → sin guardar,
    // este inicializador de campo crasheaba TODA la app antes de renderizar (bug real visto en QA).
    let v: string | null = null;
    try { v = localStorage.getItem(SB_KEY); } catch { /* sin storage → default por viewport */ }
    if (v !== null) return v === '1';
    try { return window.matchMedia('(max-width: 820px)').matches; } catch { return false; }
  })();
  @state() private ready = false;
  @state() private online = true; // conexión con el servidor local (el ping es el latido)
  @state() private veil: string | null = null; // velo de transición (apagar/reintentar): etiqueta visible
  private pingFails = 0; // histéresis: solo declaramos «apagado» tras 3 fallos consecutivos (un blip no es una caída)

  private buildTimer: ReturnType<typeof setTimeout> | null = null;
  private bootSig: string | null = null;

  override connectedCallback(): void {
    super.connectedCallback();
    router.addEventListener('change', this.onRoute as EventListener);
    router.start();
    window.addEventListener('conductor:down', this.onShutdown);
    // AUTO-RELEVO + LATIDO DE CONEXIÓN: el ping vigila (a) el build del servidor para auto-recargar tras un
    // redeploy, y (b) que el servidor SIGA VIVO. Antes un fallo se tragaba en silencio → la UI se congelaba en
    // datos viejos sin avisar (el dev cierra la terminal y creía el panel vivo). Ahora reprograma adaptativo.
    void this.checkBuild();
  }
  override disconnectedCallback(): void {
    super.disconnectedCallback();
    router.removeEventListener('change', this.onRoute as EventListener);
    window.removeEventListener('conductor:down', this.onShutdown);
    if (this.buildTimer) clearTimeout(this.buildTimer);
  }

  private async checkBuild(): Promise<void> {
    let ok = false;
    try {
      const r = await fetch('/api/ping', { cache: 'no-store', signal: AbortSignal.timeout(4000) });
      if (r.ok) {
        ok = true;
        const j = await r.json() as { version?: string | null; uiBuild?: string | null };
        const sig = `${j.version ?? ''}|${j.uiBuild ?? ''}`;
        if (this.bootSig === null) this.bootSig = sig; // primera lectura = línea base
        else if (sig !== this.bootSig) location.reload();
      }
    } catch { /* servidor caído/red: ok queda false → estado «apagado» */ }
    this.pingFails = ok ? 0 : this.pingFails + 1;
    this.online = ok || this.pingFails < 3;
    // reprograma adaptativo: sano cada 10s (detecta la caída pronto sin martillear); caído cada 3s (recuperación rápida)
    if (this.buildTimer) clearTimeout(this.buildTimer);
    this.buildTimer = setTimeout(() => void this.checkBuild(), ok ? 10000 : 3000);
  }

  // apagado desde el sidebar: velo breve (el servidor termina de morir) y directo a «apagado» — sin
  // esperar los 3 fallos de ping. El latido sigue corriendo: si se rearranca, la pantalla se recupera sola.
  private onShutdown = (): void => {
    this.veil = 'Apagando conductor';
    setTimeout(() => { this.veil = null; this.pingFails = 3; this.online = false; }, 900);
  };

  private async retryNow(): Promise<void> {
    this.veil = 'Comprobando el servidor';
    try { await this.checkBuild(); } finally { this.veil = null; }
  }

  private onRoute = (e: Event): void => {
    this.route = (e as CustomEvent<Route>).detail;
    // en móvil, navegar cierra el drawer (patrón estándar): tras elegir un run no debe quedar tapando
    try { if (window.matchMedia('(max-width: 820px)').matches) this.sbHide = true; } catch { /* sin matchMedia */ }
    void this.preload();
  };

  private async preload(): Promise<void> {
    this.ready = false;
    const n = this.route.name;
    if (n === 'panel') await import('../screens/panel-screen');
    else if (n === 'run' || n === 'demo') await import('../screens/run-screen');
    else if (n === 'help') await import('../screens/help-screen');
    else if (n === 'flow') await import('../screens/flow-screen');
    else if (n === 'ahorro') await import('../screens/ahorro-screen');
    else if (n === 'session') await import('../screens/session-screen');
    this.ready = true;
  }

  private toggleSb(): void {
    this.sbHide = !this.sbHide;
    try { localStorage.setItem(SB_KEY, this.sbHide ? '1' : '0'); } catch { /* sin persistencia, no pasa nada */ }
  }
  // móvil: click en el velo (la propia .layout, fuera del aside/main) cierra el drawer
  private onLayoutClick(e: MouseEvent): void {
    if (this.sbHide) return;
    try { if (!window.matchMedia('(max-width: 820px)').matches) return; } catch { return; }
    if (e.target === e.currentTarget) this.sbHide = true;
  }

  private screen(): TemplateResult | typeof nothing {
    if (!this.online) {
      return html`<div class="srv-down" role="alert">
        <div class="srv-down-ic" aria-hidden="true">⏻</div>
        <h1>conductor está apagado</h1>
        <p>El servidor local no responde. Arráncalo con <code>conductor</code> en tu terminal — esta pantalla se recupera sola en cuanto vuelva.</p>
        <button class="btn" @click=${() => void this.retryNow()}>Reintentar ahora</button>
      </div>`;
    }
    if (!this.ready) return loader('Cargando conductor', true);
    const r = this.route;
    if (r.name === 'panel') return html`<panel-screen></panel-screen>`;
    if (r.name === 'run' || r.name === 'demo') return html`<run-screen .apiBase=${r.apiBase} .change=${r.change ?? ''} .projId=${r.projId ?? ''} .phaseId=${r.query.get('phase') ?? ''}></run-screen>`;
    if (r.name === 'help') return html`<help-screen></help-screen>`;
    if (r.name === 'flow') return html`<flow-screen></flow-screen>`;
    if (r.name === 'ahorro') return html`<ahorro-screen></ahorro-screen>`;
    if (r.name === 'session') return html`<session-screen .apiBase=${r.apiBase} .change=${r.change ?? ''} .projId=${r.projId ?? ''}></session-screen>`;
    return nothing;
  }

  override render(): TemplateResult {
    const active = (this.route.name === 'run' || this.route.name === 'session') ? (this.route.change ?? '') : '';
    // proyecto de la ruta actual → el sidebar enfoca ese proyecto (dentro de un run, el foco es SU proyecto)
    const activeProj = this.route.projId ?? this.route.query.get('project') ?? '';
    return html`
      <a class="skiplink" href="#main-content">Saltar al contenido</a>
      ${this.online ? html`<button class="sbtog" aria-label="alternar panel lateral" @click=${() => this.toggleSb()}>☰</button>` : nothing}
      <theme-toggle></theme-toggle>
      <div class="layout ${this.sbHide || !this.online ? 'sbhide' : ''}" @click=${(e: MouseEvent) => this.onLayoutClick(e)}>
        <aside class="sb" role="navigation" aria-label="Navegación de proyectos y runs"><app-sidebar .activeChange=${active} .activeRoute=${this.route.name} .activeProj=${activeProj}></app-sidebar></aside>
        <main class="content" id="main-content">${this.screen()}</main>
      </div>
      <artifact-viewer></artifact-viewer>
      ${this.veil ? html`<div class="veil" role="status" aria-live="assertive">
        <div class="veil-ticks" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
        <span class="veil-lbl">${this.veil}…</span>
      </div>` : nothing}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap { 'conductor-app': ConductorApp; }
}
