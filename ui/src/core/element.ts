import { LitElement } from 'lit';

/**
 * CElement — base de todos los componentes. Render en LIGHT DOM (no Shadow DOM) para reutilizar el CSS
 * global del design system (theme.css + app.css). Decisión del PLAN-UI-v6: las clases globales (.btn,.pill,
 * .card) no cruzan el shadow boundary; light DOM las usa directamente y mantiene el runtime ultra-ágil.
 */
export class CElement extends LitElement {
  protected override createRenderRoot(): HTMLElement | DocumentFragment {
    return this;
  }
}
