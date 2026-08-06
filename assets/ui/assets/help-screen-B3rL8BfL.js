import{f as e,h as t,u as n,v as r}from"./index-zeNCFpr4.js";var i=class extends e{render(){return r`
      <h1>Cómo funciona</h1>
      <p class="muted">Spec primero, código contra la spec, y un <b>gate determinista (sin LLM)</b> que decide si el resultado queda <b>Verificado</b>. La <b>secuencia</b> la garantiza el código: ningún modelo se salta fases. Funciona con cualquier modelo — incluidos los de tu LiteLLM a coste 0 de AI Credits.</p>

      <h2 class="sect">Empezar (todo desde esta app)</h2>
      <ol class="muted steps">
        <li><b>Arranca desde tu proyecto</b>: <code>conductor</code> en la carpeta del repo. La app abre enfocada en ESE proyecto — el repo desde el que la lanzas es el que se trabaja.</li>
        <li><b>Inicialízalo</b> si el panel lo pide (botón «Inicializar este proyecto»): crea <code>openspec/</code> con la config del pipeline y <code>.copilotignore</code> (ahorro de tokens). No toca tu código.</li>
        <li><b>Describe el cambio</b> en «Prompt». Señala ficheros con <code>@ruta</code> (su contenido se pre-inyecta al agente; máx. 8, con secretos filtrados) y skills del equipo con <code>/nombre</code>. El sistema propone el plan de fases y el coste estimado; tú mandas: ajusta fases, modelos por fase y el toggle <b>test</b>.</li>
        <li><b>Lanza el run</b> y atiende las <b>pausas de revisión</b>: leer/editar la spec, dejar una nota para la fase, cambiar el modelo en caliente, rehacer una fase de planificación con instrucciones, o detener. En el ciclo de corrección eliges qué hallazgos se arreglan.</li>
        <li>Con el run <b>Verificado</b> (GREEN): revisa el <b>Informe</b>, haz tu commit y pulsa <b>Archivar</b> — los requisitos nuevos de la spec se promueven a la fuente de verdad del repo (los modificados/eliminados quedan señalados para merge manual) y el cambio pasa al archivo.</li>
      </ol>
      <p class="muted">Desde el chat de tu agente (Copilot CLI, VS Code, OpenCode, Claude Code) solo necesitas <code>/conductor</code>: enciende esta app y abre el panel — y con una petición, corre la feature con pausas y progreso EN el chat. Todo lo demás (init, lanzar, revisar, archivar, informes) vive aquí.</p>
      <p class="muted"><b>Las dos vías no dan las mismas garantías.</b> Desde esta app no hay ningún LLM entre tu clic y el motor: el proceso es inviolable con cualquier modelo — uno débil da peor contenido (y el gate lo frena), pero jamás rompe la secuencia ni aprueba nada por ti. El chat añade un <b>mensajero</b> — el agente de TU chat — que transmite pausas y decisiones: su fiabilidad depende del modelo de esa conversación (su contrato le prohíbe construir por su cuenta, pero un contrato no es un candado). Con un modelo de chat flojo, lanza desde aquí y sigue el run donde quieras.</p>

      <h2 class="sect">Las tres ventanas de un run</h2>
      <p class="muted">Cada run deja evidencia consultable con tres botones. Ninguno gasta tokens: leen ficheros locales.</p>
      <ul class="muted fichas">
        <li><b>Ver sesión</b> — la <b>traza del agente</b>, paso a paso: tools ejecutadas, hooks, permisos pedidos, mensajes, subagentes y skills, con los modelos usados en el resumen. Es la respuesta a «¿qué hizo exactamente la IA en mi repo?» — filtrable y con búsqueda. Sale de la sesión del CLI (y si no hay, se reconstruye de la telemetría del run).</li>
        <li><b>Informe</b> — el <b>informe del run</b> en una página para compartir: la tabla de fases (modelo, tiempo, intentos, ficheros y tokens reales frente a estimados), el resultado del gate determinista y el linaje requisito→código→test. Es lo que adjuntas al PR o enseñas en la demo; se archiva junto al cambio. (El desglose de coste por modelo vive en el panel y en <code>conductor stats</code>.)</li>
        <li><b>AI Act</b> — el <b>«quién hizo qué»</b> del run, tal y como lo pide el Reglamento europeo de IA: (1) qué modelo intervino en cada fase y en qué <b>papel</b> — <i>planner</i> planifica (no toca código), <i>coder</i> implementa — solo sus fases (apply/fix) producen cambios de código —, <i>reviewer</i> verifica con lentes (sin shell ni red; solo escribe sus informes); la orquestación no es un LLM, es el driver determinista; (2) qué decisiones aprobó una persona — cada pausa, con hash de lo aprobado; (3) el inventario exacto de ficheros escritos por la IA; (4) cómo se verificó; (5) el sello que impide alterar la evidencia sin que se note. <b>No es el sello de calidad</b>: GREEN es el veredicto SDD del run y existe igual sin este documento.<br><b>Cuándo aplica</b>: si tu cliente o tu empresa quieren saber qué código escribió una IA y quién lo supervisó (contratos, auditorías, compliance) — este es el papel que enseñas, ya hecho. <b>Cuándo no</b>: programar con asistentes de IA, hoy, no te obliga a entregar nada — las obligaciones fuertes del reglamento son para quien fabrica y vende sistemas de IA, no para quien los usa al programar. Tenerlo gratis en cada run es la ventaja, no una carga.</li>
      </ul>
      <p class="muted">Toda la evidencia (recibos, timeline, sesión, informe y sello) vive en <code>.conductor/runs/&lt;cambio&gt;</code> en la raíz de tu proyecto — fuera de <code>openspec/</code>, sin ensuciar tu árbol de trabajo; la spec y los artefactos revisables quedan en <code>openspec/changes/&lt;cambio&gt;</code>.</p>

      <h2 class="sect">El pipeline</h2>
      <p class="muted">Según el alcance: <code>propose → spec → apply → verify</code> (y en cambios mayores <code>explore</code>, <code>clarify</code>, <code>design</code>, <code>tasks</code>). Con el toggle <b>test</b>, tus pruebas reales corren <b>antes</b> de <code>verify</code>: si fallan → ciclo <code>fix</code> → re-test. Un driver determinista lanza al agente en cada fase y valida con el gate; si el fix no converge, el run <b>escala a ti</b> en vez de iterar a ciegas. Al cerrar: código + spec + informe + sello de integridad (firma Ed25519 si configuras clave).</p>

      <h2 class="sect">Estados de un run</h2>
      <ul class="muted fichas">
        <li><b>Verificado</b> (GREEN) — el gate confirmó coherencia spec↔código↔tests. Listo para commit y Archivar.</li>
        <li><b>No verificado</b> (NOT-GREEN) — el gate encontró incumplimientos tras los ciclos de corrección. El informe dice cuáles.</li>
        <li><b>Necesita tu decisión</b> (BLOCKED) — el gobierno detuvo el run (preguntas sin responder, presupuesto, política de modelos, fix sin converger…). El motivo aparece bajo la cabecera.</li>
        <li><b>Detenido / Interrumpido</b> — lo paraste tú o se cortó el proceso. <b>Reanudar</b> continúa donde quedó sin re-pagar las fases completadas (la verificación sí se re-ejecuta: el gate no se hereda).</li>
        <li><b>Abortado</b> — una fase no produjo su artefacto; la secuencia no se salta. El motivo y el registro dicen por qué.</li>
        <li><b>Duplicado</b> (DUPLICATE) — se lanzó el mismo cambio con un run ya activo; el run vivo sigue y el duplicado no ejecuta nada.</li>
      </ul>

      <h2 class="sect">Qué garantiza «Verificado» (y qué no)</h2>
      <p class="muted"><b>Garantiza</b>: la secuencia SDD se respetó (el código conduce, no el modelo); spec, tareas y artefactos son <b>coherentes y trazables</b> (cada requisito ↔ código ↔ test, vía etiqueta <code>@conductor</code> — o <b>por referencia</b>: un test sin etiqueta que ejercita el código también cuenta); el reviewer no marcó FAIL; y —con el toggle <b>test</b> activo— <b>tus pruebas reales pasan</b>. Un requisito sin NINGÚN test es <b>aviso visible</b> por defecto y <b>bloquea</b> en los presets estrictos (feature/migración).<br>
      <b>NO garantiza</b> por sí solo la corrección lógica: el gate estructural no ejecuta tu código. Para máxima confianza activa <b>test</b> al lanzar — el toggle autoriza a ejecutar; <code>"checks"</code> en <code>openspec/conductor.json</code> define QUÉ comandos correr. Así Verificado = coherente <i>y</i> pasa tus pruebas.</p>

      <!-- dos MOMENTOS de la misma persona, no dos usuarios: la app es local y la usa un solo dev -->
      <h2 class="sect">Dos momentos, la misma persona</h2>
      <ul class="muted fichas">
        <li><b>Pedir</b> — describes el cambio; el sistema propone plan y coste. No hace falta clasificar nada.</li>
        <li><b>Revisar</b> — en cada pausa apruebas, editas la spec, dejas una nota, cambias el modelo en caliente o rehaces una fase; en el fix eliges qué hallazgos arreglar. <b>El experto manda</b> — el piloto automático no existe.</li>
      </ul>
      <p class="muted">El segundo par de ojos llega después y por git: quien revise tu PR tendrá el Informe, el expediente AI Act y el ledger delante — evidencia en vez de fe. Y la config del pipeline (<code>openspec/conductor.json</code>) viaja committeada, así que todo el equipo hereda las mismas reglas.</p>

      <h2 class="sect">Ahorro de tokens, visible</h2>
      <p class="muted">Tokens y coste <b>por fase</b> y acumulado, mezcla LiteLLM (0 AI Credits) / Copilot en el mismo run, y tus AI Credits — en vivo. El runtime no re-escanea el repo entre fases y el resume no re-paga lo hecho. El chip «LiteLLM · 0 AIC» del run enseña cuántas fases salieron gratis. <a class="lnk" href="/ahorro">Todas las técnicas de ahorro →</a></p>

      <h2 class="sect">La cadena de evidencia</h2>
      <p class="muted">Detrás de esos botones hay una cadena verificable: cada run GREEN produce su informe, un <b>sello de procedencia</b> (SHA-256 de integridad; firma <b>Ed25519</b> si configuras <code>CONDUCTOR_PRIV_KEY</code>) encadenado al <i>ledger</i> del proyecto (<code>openspec/provenance.ledger.jsonl</code>, una línea por run verificado — committeable a propósito: es el historial de verificaciones del equipo), y el expediente AI Act. <code>conductor verify</code> y <code>conductor ledger verify</code> comprueban después que nada se tocó.</p>
    `}};i=n([t(`help-screen`)],i);export{i as HelpScreen};