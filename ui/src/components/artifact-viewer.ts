import { html, nothing, type TemplateResult } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { CElement } from '../core/element';
import { loader } from '../lib/loader';

export interface ViewDetail { apiBase: string; kind: 'art' | 'diff'; path: string; }

/**
 * <artifact-viewer> — modal accesible (role=dialog, ESC cierra, foco restaurado al opener). Se monta una
 * vez en el shell y escucha el evento global 'cdr-view' {apiBase, kind, path}. Muestra un .md (view/edit
 * contra /artifact) o un git diff (contra /diff). Paridad con el #viewbox legacy, ahora reutilizable.
 */
@customElement('artifact-viewer')
export class ArtifactViewer extends CElement {
  @state() private open = false;
  @state() private vbTitle = '';
  @state() private content = '';
  @state() private loading = false;
  @state() private editing = false;
  @state() private editable = false;
  @state() private saveErr = ''; // M15: error de guardado a la vista (antes un POST fallido se reportaba como éxito)
  @state() private dirty = false; // hay cambios sin guardar en el editor (marcador + guarda contra cierre accidental, #4)
  @state() private pendingClose = false; // se intentó cerrar con cambios sin guardar → pide confirmar (no se pierde un edit)
  private apiBase = '/api/';
  private path = '';
  private opener: HTMLElement | null = null;
  private loadGen = 0; // token por apertura: una carga que termina TARDE (otra apertura ya en curso) no pisa el contenido actual

  override connectedCallback(): void {
    super.connectedCallback();
    document.addEventListener('cdr-view', this.onOpen as EventListener);
    document.addEventListener('keydown', this.onKey);
  }
  override disconnectedCallback(): void {
    super.disconnectedCallback();
    document.removeEventListener('cdr-view', this.onOpen as EventListener);
    document.removeEventListener('keydown', this.onKey);
  }

  private onOpen = (e: Event): void => {
    const d = (e as CustomEvent<ViewDetail>).detail;
    this.apiBase = d.apiBase; this.path = d.path;
    this.editable = d.kind === 'art' && /\.md$/.test(d.path);
    this.vbTitle = (d.kind === 'art' ? '📄 ' : '± ') + d.path;
    this.opener = (document.activeElement as HTMLElement) ?? null;
    this.open = true; this.editing = false; this.loading = true; this.content = ''; this.saveErr = ''; this.dirty = false; this.pendingClose = false;
    const gen = ++this.loadGen; // sella ESTA apertura: una carga anterior aún en vuelo quedará obsoleta
    void this.load(d.kind, gen);
    queueMicrotask(() => this.querySelector<HTMLElement>('.vb')?.focus());
  };
  private onKey = (e: KeyboardEvent): void => {
    if (!this.open) return;
    if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S') && this.editing) { e.preventDefault(); void this.save(); return; } // Ctrl/Cmd+S guarda
    if (e.key === 'Escape') { this.tryClose(); return; }
    if (e.key === 'Tab') { // foco atrapado dentro de la modal (a11y, WCAG 2.4.3)
      const f = Array.from(this.querySelectorAll<HTMLElement>('.vb button, .vb a[href], .vb textarea, .vb input'));
      // M14: con 1 solo foco (p.ej. una modal de diff = solo ✕) el trap se desactivaba y el Tab escapaba a la
      // sidebar de fondo. Ahora se atrapa SIEMPRE (incluido 1 elemento) y se reconduce el foco si ya escapó.
      if (!f.length) { e.preventDefault(); return; }
      const first = f[0]!, last = f[f.length - 1]!;
      const active = document.activeElement;
      const inside = this.contains(active);
      if (e.shiftKey && (active === first || !inside)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (active === last || !inside)) { e.preventDefault(); first.focus(); }
    }
  };

  private async load(kind: 'art' | 'diff', gen: number): Promise<void> {
    try {
      const r = await fetch(this.apiBase + (kind === 'art' ? 'artifact?p=' : 'diff?p=') + encodeURIComponent(this.path));
      const txt = (await r.text()) || '(vacío)';
      if (gen !== this.loadGen) return; // otra apertura ganó mientras esta cargaba → descartar (no pisar)
      this.content = txt;
    } catch { if (gen === this.loadGen) this.content = '(no se pudo cargar)'; }
    finally { if (gen === this.loadGen) this.loading = false; }
  }
  // cerrar con cambios sin guardar: NO se pierde en silencio (#4). Pide confirmar (guardar o descartar).
  private tryClose(): void { if (this.editing && this.dirty) { this.pendingClose = true; return; } this.close(); }
  private discardClose(): void { this.dirty = false; this.editing = false; this.close(); }
  private close(): void { this.open = false; this.pendingClose = false; this.opener?.focus?.(); }
  private async save(): Promise<void> {
    const ta = this.querySelector<HTMLTextAreaElement>('.vb-edit');
    if (!ta) return;
    // M15: verificar el resultado. Antes el fetch resolvía y el código marcaba "guardado" aunque el servidor
    // hubiera rechazado (4xx/5xx, p.ej. confinamiento) → la edición del revisor se perdía en silencio.
    try {
      const r = await fetch(this.apiBase + 'artifact', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ p: this.path, content: ta.value }) });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!r.ok || j.ok === false) { this.saveErr = j.error || `No se pudo guardar (${r.status}). Sigues editando.`; return; }
      this.content = ta.value; this.editing = false; this.saveErr = ''; this.dirty = false;
      if (this.pendingClose) this.close(); // se pidió guardar al intentar cerrar → cierra tras guardar
    } catch { this.saveErr = 'No se pudo conectar con el servidor local. Sigues editando.'; }
  }

  override render(): TemplateResult | typeof nothing {
    if (!this.open) return nothing;
    return html`
      <div class="vb-back" @click=${() => this.tryClose()}></div>
      <div class="vb" role="dialog" aria-modal="true" aria-label=${this.vbTitle} tabindex="-1">
        <header>
          <span class="vb-t">${this.vbTitle}</span>
          ${this.editing && this.dirty ? html`<span class="vb-dirty" title="cambios sin guardar" style="color:var(--warn);font:700 .64rem/1 var(--mono);letter-spacing:.04em">● sin guardar</span>` : nothing}
          ${this.editable ? html`<button class="btn sm sec" @click=${() => { if (this.editing) void this.save(); else { this.editing = true; this.saveErr = ''; this.dirty = false; } }} title=${this.editing ? 'Guardar (Ctrl/Cmd+S)' : 'Editar'}>${this.editing ? '💾 guardar' : '✏️ editar'}</button>` : nothing}
          <button class="btn sm sec" aria-label="cerrar" @click=${() => this.tryClose()}>✕</button>
        </header>
        ${this.loading
          ? loader('Cargando documento')
          : this.editing
          ? html`<textarea class="vb-edit" aria-label="contenido editable" @input=${(e: Event) => { this.dirty = (e.target as HTMLTextAreaElement).value !== this.content; }}>${this.content}</textarea>${this.saveErr ? html`<div class="errline" role="alert" style="margin-top:.4rem">${this.saveErr}</div>` : nothing}${this.pendingClose ? html`<div class="errline" role="alert" style="margin-top:.4rem;display:flex;align-items:center;gap:.6rem;flex-wrap:wrap"><span>Tienes cambios sin guardar.</span><button class="btn sm" @click=${() => void this.save()}>Guardar</button><button class="btn sm sec" @click=${() => this.discardClose()}>Descartar</button></div>` : nothing}`
          : html`<pre class="vb-c">${this.content}</pre>`}
      </div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap { 'artifact-viewer': ArtifactViewer; }
  interface DocumentEventMap { 'cdr-view': CustomEvent<ViewDetail>; }
}
