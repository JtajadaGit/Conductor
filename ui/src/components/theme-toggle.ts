import { html, svg, type TemplateResult } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { CElement } from '../core/element';

const SUN = svg`<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/>`;
const MOON = svg`<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/>`;

/** Conmutador de tema claro/oscuro. El tema vive en <html data-theme> (lo fija index.html sin flash);
 *  aquí solo se alterna y se persiste. Accesible: aria-pressed + label que dice el destino. */
@customElement('theme-toggle')
export class ThemeToggle extends CElement {
  @state() private theme: 'light' | 'dark' = (document.documentElement.dataset.theme as 'light' | 'dark') || 'dark';

  private toggle(): void {
    this.theme = this.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = this.theme;
    try { localStorage.setItem('conductorTheme', this.theme); } catch { /* sin persistencia, no pasa nada */ }
  }

  override render(): TemplateResult {
    const dark = this.theme === 'dark';
    return html`<button class="theme-toggle" @click=${() => this.toggle()}
      aria-pressed=${dark ? 'true' : 'false'}
      aria-label=${dark ? 'Activar tema claro' : 'Activar tema oscuro'}
      title=${dark ? 'Tema claro' : 'Tema oscuro'}>
      <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${dark ? SUN : MOON}</svg>
    </button>`;
  }
}

declare global { interface HTMLElementTagNameMap { 'theme-toggle': ThemeToggle; } }
