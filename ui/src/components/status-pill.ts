import { html, type TemplateResult } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { CElement } from '../core/element';
import { verdictClass } from '../lib/format';

@customElement('status-pill')
export class StatusPill extends CElement {
  @property() verdict: string | null = null;

  override render(): TemplateResult {
    return html`<span class="pill ${verdictClass(this.verdict)}">${this.verdict ?? 'EN CURSO'}</span>`;
  }
}

declare global {
  interface HTMLElementTagNameMap { 'status-pill': StatusPill; }
}
