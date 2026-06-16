# CLAUDE.md — conductor

> Cerebro del repo para sesiones de IA. Terso a propósito. Estado: **v3.9.2 (2026-06-12)**.
> Lee esto y NO re-estudies el plugin: aquí está todo lo que cuesta caro re-aprender.

## Qué es
**conductor**: pipeline de **Spec-Driven Development VERIFICADO** para **GitHub Copilot Business** (~150 devs Hiberus; stacks Angular/React/Java/PHP/Magento/Salesforce/SAP). No es "otro generador": es **gobierno** — driver determinista (el código conduce las fases, ningún modelo puede saltárselas) + **gate sin LLM** (coherencia spec↔código↔tr

## MAPA v3.10 (volcado 2026-06-12 — leer ESTO antes que nada en sesiones nuevas)

### Qué es hoy (arquitectura real, no la histórica de arriba)
- **APP ÚNICA GLOBAL** `http://127.0.0.1:4750` (SPA pushState): `/` panel · `/run/<proj~hash>/<change>` · `/demo` (showcase). MULTI-PROYECTO: registro persistido `~/.conductor/projects.json` (override `CONDUCTOR_HOME` en tests); `/api/launch {project}` auto-registra. Drivers = HIJOS por IPC (pausa/continue/stop/nota/modelo por canal). PWA instalable. Formas 1-segmento = proyecto default (compat).
- **UI = FICHEROS REALES** en `engine/lib/ui/` (`shell.html/css/client.js` + `shared.css`): `build-ui.mjs` (codegen→`ui-assets.mjs`, valida que el JS cliente COMPILA) → `build.mjs` (bundle 32 módulos→`assets/conductor.mjs`) — SIEMPRE en ese orden y `cp dist→assets`. Anti-drift: el e2e comprueba que el bundle compila (ya NO hay CI .yml — se eliminó por no usarse; distribución = marketplace interno `.github/plugin/marketplace.json`). `theme.mjs` = tokens para dashboard/aiact (server-rendered).
- **Pipeline**: driver determinista + pausas (Decisión del revisor: editar spec ✏️/nota 📣/modelo 🎛/fix dirigido) + lentes paralelas en verify + checkpoints git (índice propio, `rollbackTo` selectivo) + AI Act (`aiact`) + dashboard re-render vivo. Prompts con BARRA DE CALIDAD (apply production-quality; verify crítico por escenario con file:line — se subió tras informes pobres con Sonnet).
- **Modelo por fase 100% VERIFICABLE**: env `COPILOT_MODEL` por proceso; registro loguea `🤖 fase: modelo=X proveedor=Y`; timeline guarda `modelRequested` vs `modelReported` (OTel) → badge ✓/⚠ en UI; e2e PRUEBA que el proceso recibe el modelo (CONDUCTOR_PROOF_FILE en fake-copilot). Launcher: selector modelo-por-fase (`b.models{planner,coder,reviewer}` → `CONDUCTOR_MODEL_*`).
- **Seguridad**: guard anti-CSRF/rebinding (POST exige JSON + Host local), git via `execFileSync` sin shell, confinamiento de rutas, shutdown 409 con runs vivos, auto-relevo de app por versión (`/api/shutdown`, ping lleva `version` leída de plugin.json — nunca constante).

### Comandos de trabajo (memoriza)
- Tests: `node engine/test/run.mjs` (134) · E2E REAL offline: `node engine/test/e2e-app.mjs` (agente fake, 2 escenarios+pruebas de modelo/stop/resume) — JAMÁS dos suites en paralelo (EBUSY en .tmp).
- Build completo: `node engine/build.mjs && cp engine/dist/conductor.mjs assets/` (build-ui corre dentro). SDK bundle: `node engine/build-sdk.mjs` (esbuild devDep; runtime externo→`forStdio` al copilot global).
- Deploy en caliente a la app viva: matar `node *conductor.mjs*serve*` (PowerShell Get-CimInstance) → relanzar `node assets/conductor.mjs serve <proyecto>` (NUNCA matar con runs activos — un relevo mío mató un run; el endpoint shutdown ya lo impide).
- Harness de render: `test/ui-render.test.mjs` ejecuta el JS de las páginas con DOM falso + fixtures ricos; los catch silenciosos DELATAN (instrumentación). Si añades globals al cliente (window/localStorage/rAF/performance) hay que añadirlos al harness.

### Trampas que YA me mordieron (no repetir)
- **Heredocs bash con backslash-n/comillas/acentos**: los patches python SIEMPRE por fichero (Write→python file.py), strings raw, y `rep()` idempotente (`if new in s: skip`) porque rep escribe POR PASO y un assert a mitad deja el patch a medias.
- **Template literals**: backslash-n y regex con barras dentro se comen los escapes (usar String.fromCharCode(10) o split por carácter); imports dinámicos relativos NO los reescribe el bundler (hay test anti-regresión).
- **Windows**: banderas emoji NO renderizan (🇪🇺→texto); `windowsHide:true` en TODO spawn/exec (ventanas fantasma); `GIT_INDEX_FILE` ABSOLUTO; `$HOME` reservado en PowerShell; cmd `&` en rutas.
- **DPAPI desde Node (cifrar la key BYOK)**: los cmdlets `ConvertTo/From-SecureString` FALLAN al lanzarse con `powershell` (WinPS 5.1) desde Node — el módulo `Microsoft.PowerShell.Security` no autocarga (conflicto TypeData). Usar `[System.Security.Cryptography.ProtectedData]` vía `Add-Type -AssemblyName System.Security` (funciona en 5.1 y pwsh 7). Secreto por STDIN al cifrar, blob por env al descifrar (NUNCA en argv). `try{}catch{}` DENTRO del script PS para no escupir stderr ante blob ajeno. Implementado en `lib/secret.mjs`. **Si añades un módulo lib nuevo, regístralo en el `ORDER` de build.mjs** (el bundler no sigue imports, usa lista explícita).
- **Catálogo de modelos sin filtrar la key**: el proxy LiteLLM exige key en TODOS los endpoints de listado (401 anónimo) y `/v1/models` filtra por el scope de la virtual key. Los NOMBRES no son secretos → se cachean en `~/.conductor/models-cache.json` (solo ids + hash6 del baseUrl, JAMÁS la key) en `byok save` y en el fetch en vivo del panel; `availableModels()` es cache-first → qwen sale SIEMPRE tras un save/run.
- **Caches globales de módulo** (= bugs multi-run): projectCtx y liveFiles ya son Map por clave; CUALQUIER cache nuevo en serve.mjs debe ser por-proyecto/por-run.
- **Parpadeos UI**: SIEMPRE render-on-change (claves SIN campos volátiles tipo mtime) y NADA de animaciones de entrada en nodos repintables.
- **ghUsage**: conservar último dato bueno ante fallo de gh (si no, la tarjeta AIC desaparece 5 min).

### Estado del PLAN-v4 (task/PLAN-v4.md) y tareas vivas
✅ P0 UI-assets+perf · ✅ P1 SPA · ✅ P2 app global · ⏳ P3 worktrees (#47) · ⏳ P4 pipeline-config (#44) + chat-fase (#45, diseño antes) · ⏳ #42 prueba oficial+pass-rates (humano) · ⏳ #49 ideas UX (modo auto switch, detectar proyectos sdd-init, consumo como metrics, panel "qué pasa por debajo/ahorro").
Consultorías en task/: tokens (no-rescan = -30/45% input), seguridad, evaluacion-ingenieria (NO TS; UI extraída).

### Decisiones de producto CERRADAS (no reabrir sin Jorge)
JS .mjs sin TS · vanilla sin frameworks · app única (jamás multi-página/multi-server) · doble usuario junior+tech-lead ("el experto manda", nada de piloto automático) · validación CON OJOS (render-harness+e2e+navegador real; capturas de Jorge = la verdad) · token-first en cada feature · lírica business en la UI · los 3 pilares innegociables: ahorro de tokens líder + qwen-class perfecto + mezcla qwen/Copilot en la misma pipeline (TODO construido y verificado).
