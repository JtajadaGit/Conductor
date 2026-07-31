import{_ as e,d as t,m as n,t as r}from"./index-DPY_8Dyh.js";var i=class extends t{constructor(...e){super(...e),this.phases=[{ph:`propose`,role:`planner`,prov:`Copilot/LiteLLM`,does:`Propuesta: Why / What / Impact (lenguaje de dominio, sin nombres de framework).`,guard:`No avanza hasta que existe proposal.md.`},{ph:`spec`,role:`planner`,prov:`Copilot/LiteLLM`,does:`Spec OpenSpec: requisitos SHALL + escenarios GIVEN/WHEN/THEN, con id REQ-…`,guard:`No avanza sin spec.md con cabecera delta + ≥1 requisito con escenario.`},{ph:`apply`,role:`coder`,prov:`LiteLLM / Copilot`,does:`Implementa la spec a calidad de producción; comenta @conductor REQ-… en cada fichero.`,guard:`No avanza si el agente no escribió ningún fichero (reintenta).`},{ph:`test (opcional)`,role:`tester`,prov:`0 tokens`,does:`Ejecuta TUS pruebas reales (toggle «test» al lanzar, o checks de conductor.json) — determinista, sin LLM.`,guard:`Si fallan → ciclo fix → re-test; si no converge, escala a ti.`},{ph:`verify`,role:`reviewer`,prov:`Copilot/LiteLLM`,does:`Revisa por escenario (lentes paralelas: correctness/security/tests) + emite Verdict.`,guard:`GATE determinista (sin LLM) + el Verdict del reviewer: si FAIL → no cierra.`}]}render(){return e`
      <h1>Cómo conduce conductor</h1>
      <p class="muted">El <b>código</b> conduce las fases en orden; el modelo solo rellena el contenido de cada una.
        Ningún modelo puede saltarse una fase, no delegar, ni "freestylear": un modelo flojo da peor contenido,
        <b>no rompe la secuencia</b>. Esta página es 100% local — <b>0 tokens</b>.</p>

      <h2 class="sect">El pipeline (cambio típico — los grandes añaden explore/clarify/design/tasks)</h2>
      <div class="flow">
        ${this.phases.map((t,n)=>e`
          <div class="flow-step">
            <div class="fs-top"><span class="fs-n">${n+1}</span><span class="fs-ph">${t.ph}</span><span class="fs-role">${t.role}</span><span class="fs-prov">${t.prov}</span></div>
            <p class="fs-does">${t.does}</p>
            <p class="fs-guard"><span class="fs-lock">▣</span> ${t.guard}</p>
          </div>
          ${n<this.phases.length-1?e`<div class="flow-arrow" aria-hidden="true">↓</div>`:a()}
        `)}
        <div class="flow-arrow" aria-hidden="true">↓</div>
        <div class="flow-gate">
          <b>GATE determinista (sin LLM)</b>
          <p class="muted">Coherencia spec↔tareas↔apply-report + trazabilidad REQ↔código↔test (@conductor). PASA → <span class="g-ok">GREEN</span> (Verificado).
            FALLA o el reviewer marca <code>FAIL</code> → inserta <b>fix → verify</b>; si tras los ciclos no converge → <span class="g-no">BLOCKED</span> («Necesita tu decisión»): el run escala a ti en vez de iterar a ciegas, con el motivo a la vista.</p>
        </div>
        <div class="flow-arrow" aria-hidden="true">↓</div>
        <div class="flow-seal"><b>GREEN</b> → código + spec + informe + <b>sello de procedencia</b> firmado + entrada en el <i>ledger</i> (audit trail).</div>
      </div>

      <h2 class="sect">Lo que el driver garantiza</h2>
      <ul class="muted">
        <li><b>Secuencia</b>: el orden de fases lo impone el código (no el prompt). Probado en tests.</li>
        <li><b>Modelo por fase verificable</b>: cada fase loguea modelo+proveedor reales (OTel); badge ✓/⚠ si el proveedor reporta otro.</li>
        <li><b>Mezcla LiteLLM/Copilot</b>: el Coder (lo más caro en tokens) puede ir a un modelo económico vía LiteLLM y el Reviewer a un Copilot capaz — un clic con «Optimizar coste».</li>
        <li><b>Pausas de revisión</b>: el tech-lead aprueba, edita la spec, deja nota o cambia el modelo en caliente antes de implementar/verificar (salvo Auto-aprobar).</li>
      </ul>
      <p class="muted"><a class="lnk" href="/help">← Cómo empezar</a> · <a class="lnk" href="/">Dashboard</a></p>
    `}};i=r([n(`flow-screen`)],i);function a(){return e``}export{i as FlowScreen};