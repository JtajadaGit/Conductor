import { html, type TemplateResult } from 'lit';

/**
 * Cargador profesional — sustituye al texto pelado "cargando…". Un anillo con un arco de acento
 * (conic-gradient enmascarado), no un GIF ni un emoji. role=status + aria-live para lectores de
 * pantalla; la animación se ralentiza con prefers-reduced-motion (CSS en components.css).
 *
 * @param label  texto junto al anillo (p. ej. "Cargando run").
 * @param center si true, se centra en el espacio disponible (primer pintado de la app).
 */
export function loader(label = 'Cargando', center = false): TemplateResult {
  return html`<div class="ldr ${center ? 'ldr-center' : ''}" role="status" aria-live="polite">
    <span class="ldr-ring" aria-hidden="true"></span>
    <span class="ldr-lbl">${label}<span class="ldr-dots" aria-hidden="true"></span></span>
  </div>`;
}
