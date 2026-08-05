import { html, nothing, type TemplateResult, type PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { CElement } from '../core/element';
import { ConductorApi } from '../api/client';
import { loader } from '../lib/loader';
import { icon } from '../lib/svg-icons';
import type { SessionEvents, SessionEvent } from '../api/types';

/** PANTALLA /session : VISOR de la sesión del CLI de Copilot (events.jsonl) — "qué hizo la IA" tool a tool,
 *  hook a hook, con modelos, permisos y subagentes. Cero tokens: el motor lee y pagina un fichero local.
 *  Iconos: set SVG del sistema (svg-icons.ts); ◆/✦ son marcas tipográficas deliberadas (sesión/skills). */
const CATS: { key: string; icon: TemplateResult | string; label: string }[] = [
  { key: 'tool', icon: icon('wrench'), label: 'Tools' },
  { key: 'hook', icon: icon('shield'), label: 'Hooks' },
  { key: 'message', icon: icon('chat'), label: 'Mensajes' },
  { key: 'permission', icon: icon('key'), label: 'Permisos' },
  { key: 'subagent', icon: icon('bot'), label: 'Subagentes' },
  { key: 'session', icon: '◆', label: 'Sesión' },
  { key: 'skill', icon: '✦', label: 'Skills' },
];
const ICON: Record<string, TemplateResult | string> = { ...Object.fromEntries(CATS.map((c) => [c.key, c.icon])), other: '•' };

@customElement('session-screen')
export class SessionScreen extends CElement {
  @property() apiBase = '/api/';
  @property() change = '';
  @property() projId = '';
  @state() private data: SessionEvents | null = null;
  @state() private err = '';
  @state() private cats = new Set<string>();
  @state() private q = '';
  @state() private limit = 250;
  private api = new ConductorApi('/api/');
  private activeBase = '';
  private qTimer: ReturnType<typeof setTimeout> | null = null;
  private seq = 0; // secuencia monotónica: solo la última carga aplica (ignora respuestas fuera de orden)

  override updated(_c: PropertyValues): void {
    if (this.apiBase && this.apiBase !== this.activeBase) { this.activeBase = this.apiBase; this.api = new ConductorApi(this.apiBase); void this.load(); }
  }
  // M13: al desmontar (p.ej. "Volver al run") cancela el debounce pendiente → no se dispara load() sobre un
  // elemento desconectado; e invalida cargas en vuelo (su respuesta ya no aplica).
  override disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this.qTimer) { clearTimeout(this.qTimer); this.qTimer = null; }
    this.seq++;
  }
  private async load(): Promise<void> {
    const my = ++this.seq;
    try { const d = await this.api.events({ cat: [...this.cats], q: this.q, limit: this.limit }); if (my !== this.seq) return; this.data = d; this.err = ''; }
    catch (e) { if (my !== this.seq) return; this.err = (e as Error).message; this.data = null; }
  }
  // "cargar más" por OFFSET + append. Antes crecía `limit` y re-pedía desde 0 → topaba el cap 500 del server y un
  // run con >500 eventos NUNCA cargaba del todo (botón inútil). Ahora pide la SIGUIENTE página y la concatena.
  private async loadMore(): Promise<void> {
    if (!this.data) return;
    const my = ++this.seq;
    const off = this.data.events.length;
    try {
      const d = await this.api.events({ cat: [...this.cats], q: this.q, limit: this.limit, offset: off });
      if (my !== this.seq || !this.data) return;
      this.data = { ...this.data, events: [...this.data.events, ...d.events] };
    } catch { /* mantiene lo ya cargado */ }
  }
  private toggleCat(k: string): void { const n = new Set(this.cats); if (n.has(k)) n.delete(k); else n.add(k); this.cats = n; void this.load(); }
  private onSearch(e: Event): void { this.q = (e.target as HTMLInputElement).value; if (this.qTimer) clearTimeout(this.qTimer); this.qTimer = setTimeout(() => void this.load(), 250); }
  private runPath(): string { return this.projId ? `/run/${this.projId}/${this.change}` : `/run/${this.change}`; }
  private dur(ms: number): string { if (!ms) return '—'; const s = Math.round(ms / 1000); return s < 60 ? s + 's' : Math.floor(s / 60) + 'm ' + (s % 60) + 's'; }
  private clock(ts: string | null): string { if (!ts) return ''; const d = new Date(ts); return Number.isNaN(+d) ? '' : d.toISOString().slice(11, 19); }
  private dchip(ms: number): string { return ms >= 1000 ? (ms / 1000).toFixed(1) + 's' : ms + 'ms'; }

  override render(): TemplateResult {
    if (this.err) {
      // mensaje HUMANO (no el crudo "GET …/events → 404"). Ahora los runs qwen también tienen traza
      // (reconstruida desde OTel), así que el 404 solo ocurre si el run no dejó ni events.jsonl ni spans.
      const noTrace = /404|sin traza|sin events|no hay/i.test(this.err);
      return html`<div class="apphdr"><h1 class="trunc">Sesión</h1></div>
        <p class="muted" style="margin-top:.6rem">${noTrace
          ? 'Este run no dejó traza de sesión (ni del CLI ni telemetría). Aún no ha producido pasos, o se lanzó con un runner que no la emite.'
          : 'No se pudo cargar la traza de sesión de este run.'}</p>
        <p style="margin-top:.8rem"><a class="btn sm sec" href=${this.runPath()}>Volver al run</a></p>`;
    }
    const d = this.data;
    if (!d) return loader('Cargando sesión', true);
    // "sin traza" ahora llega como 200 vacío (noTrace) en vez de 404 — mismo estado vacío, sin ruido de consola.
    // AUSENCIA REAL = summary.total (total del run, SIN filtrar). Antes se usaba d.total (conteo FILTRADO): buscar/
    // filtrar a 0 resultados disparaba el dead-end "sin traza" y OCULTABA la barra de filtro → usuario atrapado.
    if (d.noTrace || !d.summary || d.summary.total === 0) {
      return html`<div class="apphdr"><h1 class="trunc">Sesión</h1></div>
        <p class="muted" style="margin-top:.6rem">Este run no dejó traza de sesión (ni del CLI ni telemetría). Aún no ha producido pasos, o se lanzó con un runner que no la emite.</p>
        <p style="margin-top:.8rem"><a class="btn sm sec" href=${this.runPath()}>Volver al run</a></p>`;
    }
    const s = d.summary;
    return html`
      <header class="se-head">
        <span class="se-eyebrow">Sesión del agente</span>
        <div class="se-titlerow"><h1 class="trunc">${this.change}</h1><a class="btn sm sec" href=${this.runPath()}>Volver al run</a></div>
        <div class="se-stats">
          ${s.start?.branch ? html`<span title="rama de git">⎇ ${s.start.branch}</span>` : nothing}
          <span title="duración total">${this.dur(s.durationMs)}</span>
          <span>${s.total} eventos</span>
          <span class="zero-tok">Visor local · 0 tokens</span>
          ${s.reconstructed ? html`<span class="zero-tok" title="Reconstruida desde la telemetría OTel del run (los modelos LiteLLM no emiten la traza nativa del CLI)">Reconstruida desde telemetría</span>` : nothing}
        </div>
        ${s.models.length ? html`<p class="se-models" style="margin:0"><span class="se-mlbl">Modelos usados</span>${[...s.models.reduce((acc, m) => acc.set(m, (acc.get(m) ?? 0) + 1), new Map<string, number>())].map(([m, n]) => html`<code class="ctx-chip">${m}${n > 1 ? ` ×${n}` : ''}</code>`)}</p>` : nothing}
        <p class="se-models" style="margin:0"><span class="se-mlbl">Papeles</span><span class="muted" style="font-size:.78rem">planner planifica (no toca código) · coder edita src/ (apply/fix) · reviewer verifica con lentes (sin escritura) — orquesta el driver determinista, no un LLM</span></p>
      </header>
      <div class="se-filters">
        <button class="chip ${this.cats.size === 0 ? 'on' : ''}" @click=${() => { this.cats = new Set(); void this.load(); }}>Todo · ${s.total}</button>
        ${CATS.filter((c) => s.byCategory[c.key]).map((c) => html`<button class="chip ${this.cats.has(c.key) ? 'on' : ''}" @click=${() => this.toggleCat(c.key)}>${c.icon} ${c.label} · ${s.byCategory[c.key]}</button>`)}
        <input class="search se-q" type="search" placeholder="Buscar en la sesión" .value=${this.q} @input=${(e: Event) => this.onSearch(e)} aria-label="buscar eventos de la sesión">
      </div>
      <div class="se-rail" role="list">${d.events.map((e) => this.row(e))}</div>
      ${d.total > d.events.length ? html`<button class="btn sm sec" style="margin:.7rem 0" @click=${() => void this.loadMore()}>cargar más · ${d.events.length}/${d.total}</button>` : nothing}
      ${d.total === 0 ? html`<p class="muted" style="margin-top:.6rem">Sin eventos para este filtro.</p>` : nothing}
    `;
  }

  private row(e: SessionEvent): TemplateResult {
    return html`<div class="se-row cat-${e.category}" role="listitem" style="--d:${Math.min(e.depth, 6)}">
      <span class="se-time">${this.clock(e.ts)}</span>
      <span class="se-ic" aria-hidden="true">${ICON[e.category] ?? '•'}</span>
      <span class="se-body">
        <span class="se-lbl">${e.label}</span>
        ${e.detail ? html`<span class="se-det">${e.detail}</span>` : nothing}
      </span>
      ${e.durationMs != null ? html`<span class="se-dur" title="duración">${this.dchip(e.durationMs)}</span>` : nothing}
    </div>`;
  }
}

declare global { interface HTMLElementTagNameMap { 'session-screen': SessionScreen; } }
