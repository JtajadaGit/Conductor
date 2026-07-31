import { html, type TemplateResult } from 'lit';
import { customElement } from 'lit/decorators.js';
import { CElement } from '../core/element';

/** Ayuda: empezar DESDE LA APP (autosuficiente), el pipeline real, leyenda de estados y qué garantiza GREEN.
 *  Texto, sin emojis como único significante. El comando /conductor se menciona solo como atajo de arranque. */
@customElement('help-screen')
export class HelpScreen extends CElement {
  override render(): TemplateResult {
    return html`
      <h1>Cómo funciona</h1>
      <p class="muted">Spec primero, código contra la spec, y un <b>gate determinista (sin LLM)</b> que decide si el resultado queda <b>Verificado</b>. La <b>secuencia</b> la garantiza el código: ningún modelo se salta fases. Funciona con cualquier modelo — incluidos los de tu LiteLLM a coste 0 de AI Credits.</p>

      <h2 class="sect">Empezar (todo desde esta app)</h2>
      <ol class="muted steps">
        <li><b>Elige el proyecto</b> en el selector del panel. Si el tuyo no aparece, arranca la app desde su carpeta una vez (<code>conductor</code> en su terminal).</li>
        <li><b>Inicialízalo</b> si el panel lo pide (botón «Inicializar este proyecto»): crea <code>openspec/</code> con la config del pipeline y <code>.copilotignore</code> (ahorro de tokens). No toca tu código.</li>
        <li><b>Describe el cambio</b> en «Prompt». Puedes señalar ficheros con <code>@ruta</code> y patrones de equipo con <code>/nombre</code>. El sistema propone el plan de fases y el coste estimado; tú mandas: ajusta fases, modelos por fase y el toggle <b>test</b>.</li>
        <li><b>Lanza el run</b> y atiende las <b>pausas de revisión</b>: leer/editar la spec, dejar una nota para la fase, cambiar el modelo en caliente, o detener. En el ciclo de corrección eliges qué hallazgos se arreglan.</li>
        <li>Con el run <b>Verificado</b> (GREEN): revisa el <b>Informe</b>, haz tu commit y pulsa <b>Archivar</b> — la spec se promueve a la fuente de verdad del repo.</li>
      </ol>
      <p class="muted">Desde el chat de tu CLI solo necesitas <code>/conductor</code>: enciende esta app y abre el panel (y con una petición, corre la feature con pausas en el chat). Todo lo demás (init, lanzar, revisar, archivar, informes) vive aquí.</p>

      <h2 class="sect">El pipeline</h2>
      <p class="muted">Según el alcance: <code>propose → spec → apply → verify</code> (y en cambios mayores <code>explore</code>, <code>clarify</code>, <code>design</code>, <code>tasks</code>). Con el toggle <b>test</b>, tus pruebas reales corren <b>antes</b> de <code>verify</code>: si fallan → ciclo <code>fix</code> → re-test. Un driver determinista lanza al agente en cada fase y valida con el gate; si el fix no converge, el run <b>escala a ti</b> en vez de iterar a ciegas. Al cerrar: código + spec + informe + sello firmado.</p>

      <h2 class="sect">Estados de un run</h2>
      <ul class="muted">
        <li><b>Verificado</b> (GREEN) — el gate confirmó coherencia spec↔código↔tests. Listo para commit y Archivar.</li>
        <li><b>No verificado</b> (NOT-GREEN) — el gate encontró incumplimientos tras los ciclos de corrección. El informe dice cuáles.</li>
        <li><b>Necesita tu decisión</b> (BLOCKED) — el gobierno detuvo el run (preguntas sin responder, presupuesto, política de modelos, fix sin converger…). El motivo aparece bajo la cabecera.</li>
        <li><b>Detenido / Interrumpido</b> — lo paraste tú o se cortó el proceso. <b>Reanudar</b> continúa donde quedó sin re-pagar las fases hechas.</li>
        <li><b>Abortado</b> — una fase no produjo su artefacto; la secuencia no se salta. El motivo y el registro dicen por qué.</li>
      </ul>

      <h2 class="sect">Qué garantiza «Verificado» (y qué no)</h2>
      <p class="muted"><b>Garantiza</b>: la secuencia SDD se respetó (el código conduce, no el modelo); spec, tareas y artefactos son <b>coherentes y trazables</b> (cada requisito ↔ código ↔ test vía <code>@conductor</code>); el reviewer no marcó FAIL; y —con el toggle <b>test</b> activo— <b>tus pruebas reales pasan</b>.<br>
      <b>NO garantiza</b> por sí solo la corrección lógica: el gate estructural no ejecuta tu código. Para máxima confianza activa <b>test</b> al lanzar (o declara <code>"checks"</code> en <code>openspec/conductor.json</code>) — así Verificado = coherente <i>y</i> pasa tus pruebas.</p>

      <h2 class="sect">Dos personas</h2>
      <ul class="muted">
        <li><b>Dev</b>: describe el cambio; el sistema propone plan y coste. No hace falta clasificar nada.</li>
        <li><b>Tech-lead (revisor)</b>: en cada pausa aprueba, edita la spec, deja una nota o cambia el modelo en caliente; en el fix elige qué hallazgos arreglar. <b>El experto manda</b> — el piloto automático no existe.</li>
      </ul>

      <h2 class="sect">Ahorro de tokens, visible</h2>
      <p class="muted">Tokens y coste <b>por fase</b> y acumulado, mezcla LiteLLM (0 AI Credits) / Copilot en el mismo run, y tus AI Credits — en vivo. El runtime no re-escanea el repo entre fases y el resume no re-paga lo hecho. El chip «LiteLLM · 0 AIC» del run enseña cuántas fases salieron gratis. <a class="lnk" href="/ahorro">Todas las técnicas de ahorro →</a></p>

      <h2 class="sect">Transparencia (AI Act)</h2>
      <p class="muted">Cada run produce evidencia: informe del run, sello de procedencia firmado (Ed25519) encadenado al ledger del proyecto, y el informe de transparencia AI Act (modelos usados, aprobaciones humanas, verificación, firma).</p>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap { 'help-screen': HelpScreen; }
}
