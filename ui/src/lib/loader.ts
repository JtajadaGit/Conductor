import { html, type TemplateResult } from 'lit';

/**
 * Cargador único de la app — la tira de ticks del velo (la firma de carga de conductor) en vez de
 * un anillo genérico o texto pelado. role=status + aria-live para lectores de pantalla; con
 * prefers-reduced-motion los ticks quedan estáticos (CSS en app.css).
 *
 * @param label  texto junto a los ticks (p. ej. "Cargando run").
 * @param center si true, se centra en el espacio disponible (primer pintado de la app).
 */
export function loader(label = 'Cargando', center = false): TemplateResult {
  return html`<div class="ldr ${center ? 'ldr-center' : ''}" role="status" aria-live="polite">
    <span class="veil-ticks ldr-ticks" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span>
    <span class="ldr-lbl">${label}</span>
  </div>`;
}
