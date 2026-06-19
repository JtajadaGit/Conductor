import{f as e,l as t,m as n,t as r}from"./index-DPp2yUbL.js";var i=class extends t{render(){return n`
      <h1>Cómo funciona</h1>
      <p class="muted">Spec primero, código contra la spec, y un <b>gate determinista (sin LLM)</b>. La <b>secuencia</b> la garantiza el código: ningún modelo se salta fases. Funciona con cualquier modelo.</p>

      <h2 class="sect">Instalar y empezar</h2>
      <ol class="muted steps">
        <li><b>Instala el plugin</b> <code>conductor</code> en GitHub Copilot desde el marketplace interno (<code>/plugin install</code>). Carga los agentes y las skills; <b>no copia nada</b> dentro de tu repositorio.</li>
        <li><b>Inicializa el proyecto</b>: <code>/sdd-init</code> detecta tu stack y crea <code>openspec/config.yaml</code>. Opcional: <code>/sdd-instructions</code> genera las reglas para la IA.</li>
        <li><b>Lanza tu primer run</b> — de dos formas, el mismo motor (abajo).</li>
      </ol>

      <h2 class="sect">Dos caras, un solo motor</h2>
      <ul class="muted">
        <li><b>Conversacional</b> (dentro de Copilot): usa la skill <code>/sdd-run</code> — enciende la app y abre el cockpit; el gobierno (pausas, aprobaciones) vive en la web. Para el día a día del dev.</li>
        <li><b>Cockpit visual</b> (esta app): <code>conductor serve</code> abre el panel en <code>127.0.0.1:4750</code>. Control total — multi-proyecto, modelo por fase, coste en vivo, pausas de revisión y dashboard. El motor y el gate son exactamente los mismos.</li>
      </ul>
      <p class="muted">Ciclo de vida y utilidades por CLI: <code>conductor serve · ping · stop</code> y <code>estimate · skills · stack · search</code>. Otras skills: <code>/sdd-status</code>, <code>/sdd-explain</code>, <code>/sdd-archive</code>.</p>

      <h2 class="sect">El pipeline</h2>
      <p class="muted"><code>propose → spec → apply → verify</code>. Un driver determinista lanza al agente en cada fase, pausa para tu revisión antes de implementar y verificar, y valida con el gate. Al cerrar: código + spec + informe + sello firmado.</p>

      <h2 class="sect">Qué garantiza GREEN (y qué no)</h2>
      <p class="muted"><b>GREEN garantiza</b>: la secuencia SDD se respetó (el código conduce, no el modelo); spec, tareas y artefactos son <b>coherentes y trazables</b> (cada requisito ↔ código ↔ test vía <code>@conductor</code>); el reviewer no marcó <code>Verdict: FAIL</code>; y —si declaras <code>checks</code> en <code>openspec/conductor.json</code>— <b>build/test reales pasan</b>.<br>
      <b>NO garantiza</b> por sí solo la corrección lógica: el gate estructural no ejecuta tu código salvo que declares <code>checks</code>. Para máxima confianza, declara <code>"checks": ["npm test","npm run build"]</code> (+ <code>"allowChecks": true</code>) — así GREEN = coherente <i>y</i> compila <i>y</i> pasa tests.</p>

      <h2 class="sect">Dos personas</h2>
      <ul class="muted">
        <li><b>Dev</b>: pide una feature, elige complejidad y (opcional) modelo por fase.</li>
        <li><b>Tech-lead (revisor)</b>: en cada pausa aprueba, edita la spec, deja una nota o cambia el modelo en caliente; en el fix elige qué hallazgos arreglar.</li>
      </ul>

      <h2 class="sect">Ahorro de tokens, visible</h2>
      <p class="muted">Tokens y coste <b>por fase</b> y acumulado, qwen (LiteLLM, más barato) vs Copilot, y tus AI Credits — en vivo. El runtime no re-escanea y el resume no re-paga las fases hechas.</p>

      <h2 class="sect">Transparencia (AI Act)</h2>
      <p class="muted">Cada run GREEN produce un informe con los modelos usados, las aprobaciones humanas, la verificación y la firma de procedencia.</p>
    `}};i=r([e(`help-screen`)],i);export{i as HelpScreen};