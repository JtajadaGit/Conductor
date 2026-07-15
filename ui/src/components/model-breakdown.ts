import { html, nothing, type TemplateResult } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { CElement } from '../core/element';
import type { Cost } from '../api/types';
import { fmt } from '../lib/format';

/** <model-breakdown> — consumo por modelo (tokens + % del output total). Hace tangible el "token-first":
 * se ve qué se hizo vía LiteLLM (BYOK) vs premium, fase a fase. */
@customElement('model-breakdown')
export class ModelBreakdown extends CElement {
  @property({ attribute: false }) cost: Cost | null = null;

  override render(): TemplateResult | typeof nothing {
    const by = this.cost?.byModel;
    if (!by || !Object.keys(by).length) return nothing;
    // % por INPUT: el coste vive en la ENTRADA (ratio ≈90:1), no en el output (hallazgo senior TOKEN).
    const totIn = Object.values(by).reduce((a, e) => a + (e.in || 0), 0) || 1;
    // lista COMPACTA y sutil (una línea por modelo): nombre · barra fina · % + tokens. Sin cajas pesadas
    // que ensucien la pantalla — el coste vive en el INPUT (ratio ≈90:1), así que el % es sobre la entrada.
    return html`<h2 class="sect">Coste por modelo</h2>
      <div class="mb-list">
        ${Object.entries(by).map(([model, e]) => {
          const pct = Math.max(0, Math.min(100, Math.round(((Number(e.in) || 0) / totIn) * 100))); // L22: barra acotada 0–100 ante coste corrupto
          return html`<div class="mb-row">
            <span class="mb-name" title=${model}>${model}</span>
            <span class="mb-track"><i style="width:${pct}%"></i></span>
            <span class="mb-meta">${pct}% · ↓${fmt(e.in)} ↑${fmt(e.out)} · ${e.phases} ${e.phases === 1 ? 'fase' : 'fases'}</span>
          </div>`;
        })}
      </div>`;
  }
}

declare global { interface HTMLElementTagNameMap { 'model-breakdown': ModelBreakdown; } }
