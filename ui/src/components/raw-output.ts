import { html, type TemplateResult, type PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { CElement } from '../core/element';

/** <raw-output> — "lo que dijo el modelo" (crudo) por fase. Modo PANEL: el padre (tabs de la tarjeta de
 * fase) decide cuándo es visible vía `active`; la carga sigue siendo PEREZOSA (no se pide si no se mira). */
@customElement('raw-output')
export class RawOutput extends CElement {
  @property() apiBase = '/api/';
  @property() phase = '';
  @property({ type: Boolean }) active = false;
  @state() private text = '';
  @state() private loaded = false;

  override updated(_ch: PropertyValues): void { if (this.active && !this.loaded) void this.load(); }

  private async load(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    this.text = '…';
    try {
      const r = await fetch(this.apiBase + 'raw?phase=' + encodeURIComponent(this.phase));
      const t = await r.text();
      this.text = t && t !== 'no encontrado' ? t.trim() : 'No se registró salida del modelo para esta fase.';
    } catch { this.text = 'No se pudo cargar la salida del modelo.'; }
  }

  override render(): TemplateResult {
    if (!this.active) return html``;
    return html`<pre class="rawpre tp-raw">${(this.text || '…').trim() || '…'}</pre>`;
  }
}

declare global { interface HTMLElementTagNameMap { 'raw-output': RawOutput; } }
