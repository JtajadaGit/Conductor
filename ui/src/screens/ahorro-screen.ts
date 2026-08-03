import { html, nothing, type TemplateResult } from 'lit';
import { customElement } from 'lit/decorators.js';
import { CElement } from '../core/element';

/** PANTALLA /ahorro : las técnicas de ahorro de tokens, explicadas en humano (pilar "token-first" +
 * "panel de ahorro"). Consultable por el dev junior (qué gano) y el tech-lead (por qué es fiable).
 * 100% local y estática — leer esta página cuesta 0 tokens. */
@customElement('ahorro-screen')
export class AhorroScreen extends CElement {
  // Una entrada por técnica. `stat` = dato medido/duro que merece destacarse; `nuevo` marca la novedad.
  private readonly tecnicas = [
    {
      t: 'No re-escanear: índice verificado',
      d: 'Al planificar, el modelo recibe un índice compacto de lo YA verificado (las capacidades de la spec viva y los cambios archivados) en vez de re-leer el código fuente. Lo que el pipeline validó ayer no se vuelve a pagar hoy.',
      // deep-search 2026-08-03: el «30–45% observado» NO existía en el código (cifra inventada). Lo único
      // que el motor calcula es su estimación conservadora (~8k tokens por fase derivada) y la DECLARA estimación.
      stat: 'Estimación conservadora del propio motor: ~8.000 tokens de entrada evitados por fase de planificación (estimación declarada, no medición)',
    },
    {
      t: 'Mapa del repo para orientarse',
      d: 'Stack, carpetas clave, entrypoints y el comando de test, resumidos en unas pocas líneas. La fase de exploración localiza las áreas relevantes del cambio sin escanear el repo entero.',
    },
    {
      t: 'Mapa de relaciones (blast-radius)',
      d: 'Índice determinista de imports/exports y quién-usa-qué (hoy para JS/TS): el modelo sabe de qué depende un fichero y a quién rompe si lo toca, sin abrir N ficheros para descubrirlo.',
      nuevo: true,
    },
    {
      t: 'Contexto a dieta (.copilotignore)',
      d: 'El motor genera un .copilotignore con node_modules, builds, lockfiles, .env y claves; el CLI anfitrión lo honra para el contexto del modelo y el driver lo respeta al capturar cambios. Solo entra lo que un revisor humano querría leer.',
    },
    {
      t: 'Estimar antes de gastar',
      d: 'Estimación de tokens por fase ANTES de lanzar el run, sin llamar a ninguna API. Presupuestar cuesta 0: decides con el coste delante, no después de la factura.',
    },
    {
      t: 'Reanudar sin re-pagar',
      d: 'Tras un corte o un timeout, el run reanuda donde iba: las fases completadas no se vuelven a pagar. La verificación (verify) sí se re-ejecuta siempre — el gate no se hereda. Un fallo a mitad no significa empezar de cero.',
    },
    {
      t: 'El modelo justo en cada fase',
      // deep-search 2026-08-03: el routing economy/premium NO es automático (exige "tiers" en conductor.json) — decirlo
      d: 'Mezcla de suscripciones en el MISMO run: Copilot Business + tu proveedor LiteLLM (0 AI Credits). El botón «Optimizar coste» del panel arma la mezcla con un clic; con "tiers" en conductor.json el reparto economy/premium por fase queda fijado para el equipo.',
    },
    {
      t: 'Freno de presupuesto',
      d: 'Límite duro por run con "budget" en conductor.json ({ maxTokens, maxCostUsd, onExceed: "block"|"pause" }): al superarlo, el run pausa para tu revisión o corta. Se evalúa con los tokens REALES entre fases; sin datos de consumo, frena igual (fail-closed). Sin sustos a fin de mes.',
    },
    {
      t: 'Artefactos a disco, no al chat',
      d: 'Cada fase deja su artefacto en fichero (el agente escribe specs y planes; el driver, los informes); el contexto de cada fase lleva solo lo necesario, no una conversación que crece sin freno con cada turno.',
    },
    {
      t: 'Ahorro visible',
      d: 'Estadísticas reales por proveedor y modelo: cuántas fases salieron a 0 créditos y el ahorro estimado. Sin humo: si un dato no se conoce, se dice.',
    },
  ];

  override render(): TemplateResult {
    return html`
      <h1>Cómo ahorra tokens conductor</h1>
      <p class="muted">Cada fase del pipeline paga <b>solo el contexto que necesita</b> — nada de arrastrar el repo
        entero ni una conversación que engorda turno a turno. Estas son las técnicas — casi todas automáticas; las
        que piden un ajuste (mezcla de modelos, freno de presupuesto) lo dicen. Esta página es 100% local — <b>0 tokens</b>.</p>

      <h2 class="sect">Las técnicas</h2>
      <div class="ahorro-grid">
        ${this.tecnicas.map((x) => html`
          <div class="ahorro-card">
            <!-- sin círculo numerado (loop visual it.1, 2026-07-31): las técnicas NO son una secuencia — el
                 número era decoración y repetía el acento ×10; el título mono es identidad suficiente -->
            <div class="ah-top">
              <span class="ah-t">${x.t}</span>
              ${x.nuevo ? html`<span class="ah-new">Novedad</span>` : nothing}
            </div>
            <p class="ah-does">${x.d}</p>
            ${x.stat ? html`<p class="ah-stat">${x.stat}</p>` : nothing}
          </div>
        `)}
      </div>

      <div class="ahorro-note">
        <b>Tu clave, tu máquina.</b> Tu clave del proxy vive en <code>~/.conductor/litellm.json</code> tal cual tú la
        escribas (cifrado AES-256-GCM opcional con <code>"seal": true</code>) y jamás viaja al modelo ni por HTTP.
        El catálogo de modelos sale <b>en vivo</b> de tu LiteLLM y del CLI de Copilot cuando responden — con caché
        y modelos observados en tus runs como respaldo. Nunca de listas inventadas.
      </div>

      <p class="muted"><a class="lnk" href="/help">← Cómo empezar</a> · <a class="lnk" href="/flow">Cómo conduce conductor</a> · <a class="lnk" href="/">Panel</a></p>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap { 'ahorro-screen': AhorroScreen; }
}
