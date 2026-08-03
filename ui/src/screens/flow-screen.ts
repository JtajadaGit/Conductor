import { html, type TemplateResult } from 'lit';
import { customElement } from 'lit/decorators.js';
import { CElement } from '../core/element';

/** PANTALLA /flow : dibuja el DRIVER DETERMINISTA paso a paso (pilar "qué pasa por debajo"). Da confianza
 * al tech-lead de que el CÓDIGO conduce las fases — ningún modelo puede saltárselas. 0 tokens, estático. */
@customElement('flow-screen')
export class FlowScreen extends CElement {
  // Las fases tal y como las impone el código (orchestrate.mjs PHASES). El "guard" es lo que el driver
  // EXIGE antes de avanzar (no opinión del LLM): por eso un modelo flojo da peor contenido, no rompe la
  // secuencia.
  private readonly phases = [
    { ph: 'propose', role: 'planner', prov: 'Copilot/LiteLLM', does: 'Propuesta: Why / What / Impact (lenguaje de dominio, sin nombres de framework).', guard: 'No avanza hasta que existe proposal.md.' },
    // el guard de avance solo exige spec.md CON CONTENIDO; delta+escenarios los exige el GATE (bloquean el GREEN, no el paso)
    { ph: 'spec', role: 'planner', prov: 'Copilot/LiteLLM', does: 'Spec OpenSpec: requisitos SHALL + escenarios GIVEN/WHEN/THEN, con id REQ-…', guard: 'No avanza sin spec.md con contenido; la cabecera delta y el escenario por requisito los exige el GATE al verificar (bloquean el GREEN).' },
    { ph: 'apply', role: 'coder', prov: 'LiteLLM / Copilot', does: 'Implementa la spec a calidad de producción; comenta @conductor REQ-… en cada fichero.', guard: 'No avanza si el agente no escribió ningún fichero (reintenta).' },
    // "checks" define QUÉ comandos, el toggle AUTORIZA a ejecutarlos (anti-RCE) — el "o" anterior mentía
    { ph: 'test (opcional)', role: 'tester', prov: '0 tokens', does: 'Ejecuta TUS pruebas reales — determinista, sin LLM. El toggle «test» autoriza; «checks» en conductor.json define los comandos.', guard: 'Si fallan → ciclo fix → re-test (máx. 2); si no converge o el comando ni arranca → escala a ti (BLOCKED).' },
    { ph: 'verify', role: 'reviewer', prov: 'Copilot/LiteLLM', does: 'Revisa por escenario (lentes paralelas: correctness/security/tests, +contract opt-in) + emite Verdict.', guard: 'GATE determinista (sin LLM) + el Verdict del reviewer: si FAIL → no cierra.' },
  ];

  override render(): TemplateResult {
    return html`
      <h1>Cómo conduce conductor</h1>
      <p class="muted">El <b>código</b> conduce las fases en orden; el modelo solo rellena el contenido de cada una.
        Ningún modelo puede saltarse una fase, no delegar, ni "freestylear": un modelo flojo da peor contenido,
        <b>no rompe la secuencia</b>. Esta página es 100% local — <b>0 tokens</b>.</p>

      <h2 class="sect">El pipeline (cambio típico — medium añade explore/design/tasks; complex, además clarify)</h2>
      <div class="flow">
        ${this.phases.map((p, i) => html`
          <div class="flow-step">
            <div class="fs-top"><span class="fs-n">${i + 1}</span><span class="fs-ph">${p.ph}</span><span class="fs-role">${p.role}</span><span class="fs-prov">${p.prov}</span></div>
            <p class="fs-does">${p.does}</p>
            <p class="fs-guard"><span class="fs-lock">▣</span> ${p.guard}</p>
          </div>
          ${i < this.phases.length - 1 ? html`<div class="flow-arrow" aria-hidden="true">↓</div>` : nothing()}
        `)}
        <div class="flow-arrow" aria-hidden="true">↓</div>
        <div class="flow-gate">
          <b>GATE determinista (sin LLM)</b>
          <p class="muted">Coherencia spec↔tareas↔apply-report + artefactos completos + trazabilidad REQ↔código↔test (@conductor). PASA → <span class="g-ok">GREEN</span> (Verificado).
            FALLA o el reviewer marca <code>FAIL</code> → inserta <b>fix → verify</b>; si tras los ciclos no converge → <span class="g-no">BLOCKED</span> («Necesita tu decisión»): el run escala a ti en vez de iterar a ciegas, con el motivo a la vista.</p>
        </div>
        <div class="flow-arrow" aria-hidden="true">↓</div>
        <!-- "firmado" a secas mentía — por defecto es SHA-256 de integridad; Ed25519 exige clave -->
        <div class="flow-seal"><b>GREEN</b> → código + spec + informe + <b>sello de procedencia</b> (SHA-256 de integridad; firma Ed25519 si configuras <code>CONDUCTOR_PRIV_KEY</code>) + entrada en el <i>ledger</i> (audit trail).</div>
      </div>

      <h2 class="sect">Lo que el driver garantiza</h2>
      <ul class="muted">
        <li><b>Secuencia</b>: el orden de fases lo impone el código (no el prompt). Probado en tests.</li>
        <li><b>Modelo por fase verificable</b>: cada fase registra modelo+proveedor y sus tokens reales (recibo de cierre de la sesión del CLI); badge de aviso si el proveedor reporta otro modelo.</li>
        <li><b>Mezcla LiteLLM/Copilot</b>: el Coder (lo más caro en tokens) puede ir a un modelo económico vía LiteLLM y el Reviewer a un Copilot capaz — un clic con «Optimizar coste».</li>
        <li><b>Pausas de revisión</b>: apruebas, editas la spec, dejas nota, cambias el modelo en caliente o rehaces una fase — antes de implementar/verificar (salvo el toggle «ejecutar sin pausas»).</li>
      </ul>
      <p class="muted"><a class="lnk" href="/help">← Cómo empezar</a> · <a class="lnk" href="/">Panel</a></p>
    `;
  }
}

function nothing(): TemplateResult { return html``; }

declare global {
  interface HTMLElementTagNameMap { 'flow-screen': FlowScreen; }
}
