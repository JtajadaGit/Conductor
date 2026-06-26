import{f as e,l as t,m as n,t as r}from"./index-CoENq7WM.js";var i=class extends t{constructor(...e){super(...e),this.phases=[{ph:`propose`,role:`planner`,prov:`Copilot/qwen`,does:`Propuesta: Why / What / Impact (lenguaje de dominio, sin nombres de framework).`,guard:`No avanza hasta que existe proposal.md.`},{ph:`spec`,role:`planner`,prov:`Copilot/qwen`,does:`Spec OpenSpec: requisitos SHALL + escenarios GIVEN/WHEN/THEN, con id REQ-…`,guard:`No avanza sin spec.md con cabecera delta + ≥1 requisito con escenario.`},{ph:`apply`,role:`coder`,prov:`qwen / Copilot`,does:`Implementa la spec a calidad de producción; comenta @conductor REQ-… en cada fichero.`,guard:`No avanza si el agente no escribió ningún fichero (reintenta).`},{ph:`verify`,role:`reviewer`,prov:`Copilot/qwen`,does:`Revisa por escenario (lentes paralelas: correctness/security/tests) + emite Verdict.`,guard:`GATE determinista (sin LLM) + el Verdict del reviewer: si FAIL → no cierra.`}]}render(){return n`
      <h1>Cómo conduce conductor</h1>
      <p class="muted">El <b>código</b> conduce las fases en orden; el modelo solo rellena el contenido de cada una.
        Ningún modelo puede saltarse una fase, no delegar, ni "freestylear": un modelo flojo da peor contenido,
        <b>no rompe la secuencia</b>. Esta página es 100% local — <b>0 tokens</b>.</p>

      <h2 class="sect">El pipeline (complejidad <code>simple</code>)</h2>
      <div class="flow">
        ${this.phases.map((e,t)=>n`
          <div class="flow-step">
            <div class="fs-top"><span class="fs-n">${t+1}</span><span class="fs-ph">${e.ph}</span><span class="fs-role">${e.role}</span><span class="fs-prov">${e.prov}</span></div>
            <p class="fs-does">${e.does}</p>
            <p class="fs-guard"><span class="fs-lock">▣</span> ${e.guard}</p>
          </div>
          ${t<this.phases.length-1?n`<div class="flow-arrow" aria-hidden="true">↓</div>`:a()}
        `)}
        <div class="flow-arrow" aria-hidden="true">↓</div>
        <div class="flow-gate">
          <b>GATE determinista (sin LLM)</b>
          <p class="muted">Coherencia spec↔tareas↔apply-report + trazabilidad REQ↔código↔test (@conductor). PASA → <span class="g-ok">GREEN</span>.
            FALLA o el reviewer marca <code>FAIL</code> → inserta <b>fix → verify</b> (máx. 2 ciclos; si sigue fallando → <span class="g-no">NOT-GREEN</span>, escala a humano).
            Con <code>checks</code> declarados, exige además <b>build/test reales</b>.</p>
        </div>
        <div class="flow-arrow" aria-hidden="true">↓</div>
        <div class="flow-seal"><b>GREEN</b> → código + spec + informe + <b>sello de procedencia</b> firmado + entrada en el <i>ledger</i> (audit trail).</div>
      </div>

      <h2 class="sect">Lo que el driver garantiza</h2>
      <ul class="muted">
        <li><b>Secuencia</b>: el orden de fases lo impone el código (no el prompt). Probado en tests.</li>
        <li><b>Modelo por fase verificable</b>: cada fase loguea modelo+proveedor reales (OTel); badge ✓/⚠ si el proveedor reporta otro.</li>
        <li><b>Mezcla qwen/Copilot</b>: el Coder (lo más caro en tokens) puede ir a qwen vía LiteLLM (mucho más barato) y el Reviewer a un Copilot capaz — un clic con «Optimizar coste».</li>
        <li><b>Pausas de revisión</b>: el tech-lead aprueba, edita la spec, deja nota o cambia el modelo en caliente antes de implementar/verificar (salvo Auto-aprobar).</li>
      </ul>
      <p class="muted"><a class="lnk" href="/help">← Cómo empezar</a> · <a class="lnk" href="/">Dashboard</a></p>
    `}};i=r([e(`flow-screen`)],i);function a(){return n``}export{i as FlowScreen};