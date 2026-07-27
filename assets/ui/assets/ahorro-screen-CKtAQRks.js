import{_ as e,d as t,h as n,m as r,t as i}from"./index-DPcEAy5o.js";var a=class extends t{constructor(...e){super(...e),this.tecnicas=[{t:`No re-escanear: índice verificado`,d:`Al planificar, el modelo recibe un índice compacto de lo YA verificado (las capacidades de la spec viva y los cambios archivados) en vez de re-leer el código fuente. Lo que el pipeline validó ayer no se vuelve a pagar hoy.`,stat:`Ahorro medido: 30–45% del input en fases de planificación`},{t:`Mapa del repo para orientarse`,d:`Stack, carpetas clave, entrypoints y el comando de test, resumidos en unas pocas líneas. La fase de exploración localiza las áreas relevantes del cambio sin escanear el repo entero.`},{t:`Mapa de relaciones (blast-radius)`,d:`Índice determinista de imports/exports y quién-usa-qué: el modelo sabe de qué depende un fichero y a quién rompe si lo toca, sin abrir N ficheros para descubrirlo.`,nuevo:!0},{t:`Contexto a dieta (.copilotignore)`,d:`node_modules, lockfiles, binarios y builds jamás viajan al modelo. Solo entra lo que un revisor humano querría leer.`},{t:`Estimar antes de gastar`,d:`Estimación de tokens por fase ANTES de lanzar el run, sin llamar a ninguna API. Presupuestar cuesta 0: decides con el coste delante, no después de la factura.`},{t:`Reanudar sin re-pagar`,d:`Tras un corte o un timeout, el run reanuda donde iba: las fases con su artefacto ya escrito no se vuelven a pagar. Un fallo a mitad no significa empezar (ni pagar) de cero.`},{t:`El modelo justo en cada fase`,d:`Las fases baratas (explorar, tareas) van a modelos económicos vía tu LiteLLM (0 AI Credits); el premium se reserva para donde decide (verify). Mezcla de suscripciones en el MISMO run: Copilot Business + tu proveedor BYOK.`},{t:`Freno de presupuesto`,d:`Límite duro de tokens por run: al superarlo, el run pausa para tu revisión o corta. Sin sustos a fin de mes.`},{t:`Artefactos a disco, no al chat`,d:`El driver escribe specs, planes e informes en ficheros; el contexto de cada fase lleva solo lo necesario, no una conversación que crece sin freno con cada turno.`},{t:`Ahorro visible`,d:`Estadísticas reales por proveedor y modelo: cuántas fases salieron a 0 créditos y el ahorro estimado. Sin humo: si un dato no se conoce, se dice.`}]}render(){return e`
      <h1>Cómo ahorra tokens conductor</h1>
      <p class="muted">Cada fase del pipeline paga <b>solo el contexto que necesita</b> — nada de arrastrar el repo
        entero ni una conversación que engorda turno a turno. Estas son las técnicas, todas automáticas: no hay que
        configurar nada para beneficiarse. Esta página es 100% local — <b>0 tokens</b>.</p>

      <h2 class="sect">Las técnicas</h2>
      <div class="ahorro-grid">
        ${this.tecnicas.map((t,r)=>e`
          <div class="ahorro-card">
            <div class="ah-top">
              <span class="ah-n">${r+1}</span>
              <span class="ah-t">${t.t}</span>
              ${t.nuevo?e`<span class="ah-new">Novedad</span>`:n}
            </div>
            <p class="ah-does">${t.d}</p>
            ${t.stat?e`<p class="ah-stat">${t.stat}</p>`:n}
          </div>
        `)}
      </div>

      <div class="ahorro-note">
        <b>Tu clave, tu máquina.</b> Tu clave BYOK se guarda cifrada (AES-256-GCM) en tu máquina y nunca viaja al
        modelo. El catálogo de modelos sale <b>EN VIVO</b> de tu LiteLLM y del CLI de Copilot — nunca de listas
        inventadas.
      </div>

      <p class="muted"><a class="lnk" href="/help">← Cómo empezar</a> · <a class="lnk" href="/flow">Cómo conduce conductor</a> · <a class="lnk" href="/">Dashboard</a></p>
    `}};a=i([r(`ahorro-screen`)],a);export{a as AhorroScreen};