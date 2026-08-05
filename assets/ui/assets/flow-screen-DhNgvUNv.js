import{f as e,h as t,u as n,v as r}from"./index-DYWWmM6P.js";var i=class extends e{constructor(...e){super(...e),this.phases=[{ph:`explore`,role:`planner`,prov:`Copilot/LiteLLM`,cond:`medium+`,does:`Exploración corta del código/contexto relevante (recibe el mapa del repo y el índice verificado).`,guard:`No avanza hasta que existe exploration.md.`},{ph:`propose`,role:`planner`,prov:`Copilot/LiteLLM`,does:`Propuesta: Why / What / Impact (lenguaje de dominio, sin nombres de framework).`,guard:`No avanza hasta que existe proposal.md.`},{ph:`clarify`,role:`planner`,prov:`Copilot/LiteLLM`,cond:`solo complex`,does:`Preguntas que cambian QUÉ se construye (mín. imprescindible) + asunciones decididas.`,guard:`Con strictClarify, una pregunta sin responder BLOQUEA el avance.`},{ph:`spec`,role:`planner`,prov:`Copilot/LiteLLM`,does:`Spec OpenSpec: requisitos SHALL + escenarios GIVEN/WHEN/THEN, con id REQ-…`,guard:`No avanza sin spec.md con contenido; la cabecera delta y el escenario por requisito los exige el GATE al verificar (bloquean el GREEN).`},{ph:`design`,role:`planner`,prov:`Copilot/LiteLLM`,cond:`medium+`,does:`Diseño: contexto, goals/non-goals, decisiones y riesgos — responsabilidades lógicas, no ficheros.`,guard:`No avanza hasta que existe design.md.`},{ph:`tasks`,role:`planner`,prov:`Copilot/LiteLLM`,cond:`medium+`,does:`Tareas trazadas: cada una etiquetada con el REQ que cumple; el coder las va cerrando.`,guard:`No avanza hasta que existe tasks.md.`},{ph:`apply`,role:`coder`,prov:`LiteLLM / Copilot`,does:`Implementa la spec a calidad de producción; comenta @conductor REQ-… en cada fichero.`,guard:`No avanza si el agente no escribió ningún fichero (reintenta; si tampoco → ABORTED, jamás se salta).`},{ph:`test (opcional)`,role:`tester`,prov:`0 tokens`,does:`Ejecuta TUS pruebas reales — determinista, sin LLM. El toggle «test» autoriza; «checks» en conductor.json define los comandos.`,guard:`Si fallan → ciclo fix → re-test (máx. 2); si no converge o el comando ni arranca → escala a ti (BLOCKED).`},{ph:`verify`,role:`reviewer`,prov:`Copilot/LiteLLM`,does:`Revisa por escenario (lentes paralelas: correctness/security/tests, +contract opt-in) + emite Verdict.`,guard:`GATE determinista (sin LLM) + el Verdict del reviewer: si FAIL → no cierra.`}]}render(){return r`
      <h1>Cómo conduce conductor</h1>
      <p class="muted">El <b>código</b> conduce las fases en orden; el modelo solo rellena el contenido de cada una.
        Ningún modelo puede saltarse una fase, no delegar, ni "freestylear": un modelo flojo da peor contenido,
        <b>no rompe la secuencia</b>. Esta página es 100% local — <b>0 tokens</b>.</p>

      <h2 class="sect">El pipeline completo (las fases con condición solo entran cuando el alcance las pide)</h2>
      <div class="flow">
        ${this.phases.map((e,t)=>r`
          <div class="flow-step">
            <div class="fs-top"><span class="fs-n">${t+1}</span><span class="fs-ph">${e.ph}</span><span class="fs-role">${e.role}</span>${e.cond?r`<span class="badge" title="esta fase solo entra con ese alcance">${e.cond}</span>`:a()}<span class="fs-prov">${e.prov}</span></div>
            <p class="fs-does">${e.does}</p>
            <p class="fs-guard"><span class="fs-lock">▣</span> ${e.guard}</p>
          </div>
          ${t<this.phases.length-1?r`<div class="flow-arrow" aria-hidden="true">↓</div>`:a()}
        `)}
        <div class="flow-arrow" aria-hidden="true">↓</div>
        <div class="flow-gate">
          <b>GATE determinista (sin LLM)</b>
          <p class="muted">Coherencia spec↔tareas↔apply-report + artefactos completos + trazabilidad REQ↔código↔test (@conductor). PASA → <span class="g-ok">GREEN</span> (Verificado).
            FALLA o el reviewer marca <code>FAIL</code> → inserta <b>fix → verify</b>; si tras los ciclos no converge → <span class="g-no">BLOCKED</span> («Necesita tu decisión»): el run escala a ti en vez de iterar a ciegas, con el motivo a la vista.</p>
        </div>
        <div class="flow-arrow" aria-hidden="true">↓</div>
        <div class="flow-step">
          <div class="fs-top"><span class="fs-ph">gates post-GREEN</span><span class="fs-role">0 tokens</span></div>
          <p class="fs-does">Aun con el gate en verde, CINCO escáneres deterministas pueden tumbar el cierre — cada uno deja su porqué en el recibo:</p>
          <p class="fs-guard"><span class="fs-lock">▣</span> secretos/PII en el código escrito · spec-freeze (migration: la spec no muta tras aprobarse) · datos/SQL peligroso · tests huecos (aserciones vacías) · contrato roto (OpenAPI). Cualquiera → NOT-GREEN con motivo.</p>
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
    `}};i=n([t(`flow-screen`)],i);function a(){return r``}export{i as FlowScreen};