import { html, type TemplateResult } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { CElement } from '../core/element';

/** <raw-output> — "lo que dijo el modelo" (crudo) por fase, carga PEREZOSA al expandir (ahorro: no se
 * pide si no se mira). Transparencia: lo que verías sin conductor, junto a lo que conductor verifica. */
@customElement('raw-output')
export class RawOutput extends CElement {
  @property() apiBase = '/api/';
  @property() phase = '';
  @state() private text = '';
  @state() private loaded = false;

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
    return html`<details class="raw" @toggle=${(e: Event) => { if ((e.target as HTMLDetailsElement).open) void this.load(); }}>
      <summary>Salida sin procesar del modelo</summary>
      <pre class="rawpre">${(this.text || '…').trim() || '…'}</pre>
    </details>`;
  }
}

declare global { interface HTMLElementTagNameMap { 'raw-output': RawOutput; } }
