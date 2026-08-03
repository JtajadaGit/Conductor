import{f as e,g as t,h as n,t as r,v as i}from"./index-1EQYeSit.js";var a=class extends e{constructor(...e){super(...e),this.tecnicas=[{t:`No re-escanear: índice verificado`,d:`Al planificar, el modelo recibe un índice compacto de lo YA verificado (las capacidades de la spec viva y los cambios archivados) en vez de re-leer el código fuente. Lo que el pipeline validó ayer no se vuelve a pagar hoy.`,stat:`Estimación conservadora del propio motor: ~8.000 tokens de entrada evitados por fase de planificación (estimación declarada, no medición)`},{t:`Mapa del repo para orientarse`,d:`Stack, carpetas clave, entrypoints y el comando de test, resumidos en unas pocas líneas. La fase de exploración localiza las áreas relevantes del cambio sin escanear el repo entero.`},{t:`Mapa de relaciones (blast-radius)`,d:`Índice determinista de imports/exports y quién-usa-qué (hoy para JS/TS): el modelo sabe de qué depende un fichero y a quién rompe si lo toca, sin abrir N ficheros para descubrirlo.`,nuevo:!0},{t:`Contexto a dieta (.copilotignore)`,d:`El motor genera un .copilotignore con node_modules, builds, lockfiles, .env y claves; el CLI anfitrión lo honra para el contexto del modelo y el driver lo respeta al capturar cambios. Solo entra lo que un revisor humano querría leer.`},{t:`Estimar antes de gastar`,d:`Estimación de tokens por fase ANTES de lanzar el run, sin llamar a ninguna API. Presupuestar cuesta 0: decides con el coste delante, no después de la factura.`},{t:`Reanudar sin re-pagar`,d:`Tras un corte o un timeout, el run reanuda donde iba: las fases completadas no se vuelven a pagar. La verificación (verify) sí se re-ejecuta siempre — el gate no se hereda. Un fallo a mitad no significa empezar de cero.`},{t:`El modelo justo en cada fase`,d:`Mezcla de suscripciones en el MISMO run: Copilot Business + tu proveedor LiteLLM (0 AI Credits). El botón «Optimizar coste» del panel arma la mezcla con un clic; con "tiers" en conductor.json el reparto economy/premium por fase queda fijado para el equipo.`},{t:`Menos tools a la vista`,d:`Las fases que solo escriben su artefacto (planificación y revisión) no ven los tools de web, shell o parcheo: sus schemas dejan de viajar en el system prompt de cada turno. Automático; se desactiva con "toolFilter": false si una skill los necesita.`,nuevo:!0},{t:`Verificación reutilizable (opt-in)`,d:`Con "verifyCache": true, si TODOS los inputs del verify son bit-idénticos al último verify correcto (spec, informes, ficheros tocados, prompt, lentes y modelo), la opinión de las lentes se reutiliza en vez de re-pagarse. El gate determinista corre SIEMPRE, y el hit queda visible en el timeline — nada en silencio.`,nuevo:!0},{t:`Freno de presupuesto`,d:`Límite duro por run con "budget" en conductor.json ({ maxTokens, maxCostUsd, onExceed: "block"|"pause" }): al superarlo, el run pausa para tu revisión o corta. Se evalúa con los tokens REALES entre fases; sin datos de consumo, frena igual (fail-closed). Sin sustos a fin de mes.`},{t:`Artefactos a disco, no al chat`,d:`Cada fase deja su artefacto en fichero (el agente escribe specs y planes; el driver, los informes); el contexto de cada fase lleva solo lo necesario, no una conversación que crece sin freno con cada turno.`},{t:`Ahorro visible`,d:`Estadísticas reales por proveedor y modelo: cuántas fases salieron a 0 créditos y el ahorro estimado. Sin humo: si un dato no se conoce, se dice.`}]}render(){return i`
      <h1>Cómo ahorra tokens conductor</h1>
      <p class="muted">Cada fase del pipeline paga <b>solo el contexto que necesita</b> — nada de arrastrar el repo
        entero ni una conversación que engorda turno a turno. Estas son las técnicas — casi todas automáticas; las
        que piden un ajuste (mezcla de modelos, freno de presupuesto) lo dicen. Esta página es 100% local — <b>0 tokens</b>.</p>

      <h2 class="sect">Las técnicas</h2>
      <div class="ahorro-grid">
        ${this.tecnicas.map(e=>i`
          <div class="ahorro-card">
            <!-- sin círculo numerado (regla del sistema visual): las técnicas NO son una secuencia — el
                 número era decoración y repetía el acento ×10; el título mono es identidad suficiente -->
            <div class="ah-top">
              <span class="ah-t">${e.t}</span>
              ${e.nuevo?i`<span class="ah-new">Novedad</span>`:t}
            </div>
            <p class="ah-does">${e.d}</p>
            ${e.stat?i`<p class="ah-stat">${e.stat}</p>`:t}
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
    `}};a=r([n(`ahorro-screen`)],a);export{a as AhorroScreen};