import { html, type TemplateResult } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { CElement } from '../core/element';
import { verdictClass, verdictLabel } from '../lib/format';

@customElement('status-pill')
export class StatusPill extends CElement {
  @property() verdict: string | null = null;

  override render(): TemplateResult {
    // vocabulario inglés-técnico (decisión de producto): la pill muestra el TOKEN en crudo (GREEN/BLOCKED/…);
    // la explicación humana viaja en el tooltip/aria — una palabra por concepto, sin traducciones.
    const v = verdictLabel(this.verdict);
    return html`<span class="pill ${verdictClass(this.verdict)}" title="${v.hint || v.label}" aria-label="${v.token}${v.hint ? ' — ' + v.hint : ''}">${v.token}</span>`;
  }
}

declare global {
  interface HTMLElementTagNameMap { 'status-pill': StatusPill; }
}
