import { html, type TemplateResult } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { CElement } from '../core/element';
import { verdictClass, verdictLabel } from '../lib/format';

@customElement('status-pill')
export class StatusPill extends CElement {
  @property() verdict: string | null = null;

  override render(): TemplateResult {
    // etiqueta humana visible; el token técnico (GREEN/BLOCKED…) viaja en title/aria para el tech-lead
    const v = verdictLabel(this.verdict);
    return html`<span class="pill ${verdictClass(this.verdict)}" title="${v.token}${v.hint ? ' — ' + v.hint : ''}" aria-label="${v.label} (${v.token})">${v.label}</span>`;
  }
}

declare global {
  interface HTMLElementTagNameMap { 'status-pill': StatusPill; }
}
