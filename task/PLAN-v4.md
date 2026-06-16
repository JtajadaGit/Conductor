# conductor — PLAN v4 (FINAL, 2026-06-12)

> Checkpoint tras la v3.5.0. Este es el plan vigente. Históricos (no reabrir, solo consulta):
> `PLAN.md` (ciclo v1, maestro), `PLAN-v2.md` (superseded por v3), `PLAN-v3.md` (app única, completado).
> Consultorías de apoyo: `consultoria-tokens.md`, `consultoria-seguridad.md`, `evaluacion-ingenieria.md`.
> Reglas duras siguen en `CLAUDE.md`.

## Estado a día de hoy (v3.5.0 · 133 tests + e2e en CI 3 SO)
**HECHO y validado:** app única `:4750` (panel + runs como rutas, drivers hijos por IPC, PWA) ·
4 controles dev (editar spec en pausa, nota a la fase, modelo en caliente, checkpoint/rollback) ·
review multi-lente paralela · AI Act pack (`conductor aiact`) · mezcla byok/copilot por fase ·
resume/stop/anti-duplicado/anti-relanzamiento · sistema de diseño único (`theme.mjs`) en las 4 pantallas ·
responsive + sidebar ocultable + textarea full-width · consultoría de seguridad (CSRF/inyección cerradas) ·
consultoría de tokens (no-rescan en fases derivadas) · evaluación de ingeniería (decisión: seguir en JS).

## Orden de ejecución v4 (prioridad de Jorge: maquetador → UX/UI/performance primero)

### 🔴 P0 — UI como ASSETS reales + performance (era V4-P5, sube a P0)
*El problema de fondo de TODOS los glitches visuales: HTML/CSS/JS embebido como strings en serve.mjs (1004 LOC).*
- Sacar la UI a **`lib/ui/`** como ficheros de verdad: `theme.css`, `app.css`, `panel.html`+`panel.js`, `run.html`+`run.js`, `dashboard.css`. El build los inyecta en el bundle (placeholders).
- Gana: resaltado de sintaxis, **lint de CSS/JS de cliente**, render-test sobre ficheros reales → se acaba la clase de bug "JS que no compila / paleta doble / regex roto en template".
- **Performance (lo tuyo)**: medir y bajar — un solo `<style>`/`<script>`, sin reflows por poll (ya hay render-on-change), `content-visibility`/`contain` en listas largas de fases, lazy del visor, `requestAnimationFrame` para el reloj, presupuesto de CSS. Lighthouse local como check.
- checkJs + JSDoc en módulos núcleo (drive/orchestrate/contract/provenance) + Prettier/ESLint en CI. Extraer `drive()` en funciones nombradas.
- NO TS (rompería 0-deps/single-file), NO frameworks (vanilla). Decisión cerrada en `evaluacion-ingenieria.md`.
- Aceptación: serve.mjs < 300 LOC (solo servidor), UI en `lib/ui/`, lint CSS/JS en CI verde, sin regresión visual.

### 🟠 P1 — App-shell SPA (router sin recargas) [#43]
Fusionar panel+run en un shell con `history.pushState`+`popstate`: navegar entre runs SIN recargar
(la sidebar ya es persistente; falta el swap de vista client-side). Un solo poll compartido. Transiciones.
Encaja de forma natural tras P0 (con la UI en ficheros, el router es JS limpio).

### 🟠 P2 — APP GLOBAL multi-proyecto [#46]
`:4750` deja de estar atado a un root. Registro de proyectos (auto-añadido al lanzar; `~/.conductor/projects.json`),
runs como `/run/<proj>/<change>`, sidebar agrupada por proyecto. Un solo conductor para TODA la máquina.
(Seguridad: allowlist de roots, no exponer FS arbitrario — ver consultoria-seguridad §7.)

### 🟡 P3 — Worktrees por run [#47]
apply/fix en git worktree propio (rama `conductor/<change>`): working tree del usuario intacto, varios
runs en paralelo sin pisarse, merge/PR al aprobar, descarte = borrar worktree. Fallback sin git = actual.

### 🟡 P4 — Control experto avanzado
- **Pipeline configurable por run** [#44]: editar fases/pausas antes de lanzar; breakpoints en cualquier fase.
- **Chat bidireccional con la fase** [#45]: hablar con el agente durante el run (necesita runner SDK = sesión
  caliente; doc de diseño antes de construir). Palanca para hacer el SDK default.

### 🟢 P5 — Datos y cierre (de v3 pendiente) [#42]
Pass-rates E1-E6 al README (lo corre Jorge) · guion congreso (escrito) · corte de versión.

## Backlog / aparcado (no ahora)
Tests reales en sandbox (opt-in, explicar antes) · score de calidad del gate · trazabilidad línea→requisito ·
políticas de equipo multi-usuario · vault/HSM (enterprise) · parsers pro (deps).

## Cómo trabajamos este ciclo (doctrina, de feedback-product-principles)
Validación con OJOS: render-test + e2e + (Jorge) navegador real con screenshots antes de "hecho".
Junior Y tech-lead: el experto manda, nada de "piloto automático". Listón visual Notion/Linear.
Token-first. Verificar antes de shippear. El usuario jamás edita el plugin.

## V4-UX2/UX3 — Ideas de Jorge (12-jun, tarde+noche) [#49 #50]
**Hecho (v3.11.0):** modo auto (switch en el form → `--auto`) · fix de raíz de modelos (`/api/models`:
byok REAL vía LiteLLM `/v1/models` + copilot OBSERVADOS de timelines, 0 hardcodeo; `conductor byok save|status`
persiste creds en `~/.conductor/byok.json`; aviso ruidoso si se pide `byok:` sin creds) · proyecto con
marca ✓/sin sdd-init en el form · consumo por modelo como metric-cards con barra · panel "⚙️ Qué pasa
por debajo" (avance por artefacto, gate, checkpoints, fases heredadas no re-pagadas, output capado) ·
**modo MICRO "No SDD"** (`complexity: micro` → 1 sola llamada LLM, fase apply directa con request en el
prompt, micro-gate determinista proporcional sin spec/trace; e2e escenario 3 micro+auto).
**Pendiente (#50):**
- *Instructions leídas*: v1 = listar las que el proyecto OFRECE al coder (log 📐). Raíz real ("leídas")
  exige introspección de la sesión del agente — investigar session logs de Copilot CLI antes de prometer.
- *Pre/post hooks*: conductor no tiene hooks propios; PREGUNTAR a Jorge qué entiende por hooks aquí
  (¿hooks de Copilot? ¿pre/post de fase = checkpoint/captura/gate? eso ya lo enseña "Qué pasa por debajo").
