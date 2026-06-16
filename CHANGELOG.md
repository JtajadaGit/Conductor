# Changelog — conductor

## 3.12.0 (2026-06-15) — "Modelos de raíz + qué dice el LLM"

### Catálogo de modelos SIEMPRE real + qwen sin filtrar la key (feedback Jorge)
- **`conductor byok save` cifra la API key con DPAPI** (Windows, `lib/secret.mjs` vía .NET `ProtectedData`): `~/.conductor/byok.json` deja de tener la key en claro — el fichero es inútil copiado a otra cuenta/equipo. Retrocompat con el formato plano legacy. Fuera de Windows: plano + aviso.
- **Cache de NOMBRES de modelo** (`~/.conductor/models-cache.json`, solo ids + hash6 del baseUrl, NUNCA la key): `availableModels()` es cache-first → tras un `byok save` o un run, **qwen aparece siempre** en el picker, arranque con o sin env. Se siembra en `byok save` (fetch `/v1/models`) y en el fetch en vivo del panel.
- Investigación verificada en la máquina real: el proxy LiteLLM exige key en todos los endpoints de listado (401 anónimo); los cmdlets PowerShell `SecureString` FALLAN desde Node (se usa ProtectedData).

### "Qué pasa por debajo" v2 = LO QUE DICE EL MODELO (feedback Jorge)
- El driver **captura el crudo del modelo por fase** (antes se descartaba) → `.conductor/raw/<phase>.txt` (tope 40KB, opt-out `rawCapture:false`). Nuevo endpoint `/raw`.
- Panel reescrito: "Lo que dijo el modelo en \<fase\>" (lo que verías sin el plugin) con carga perezosa, + copy de valor SIN jerga (por qué conductor lo verifica y dónde ahorra tokens). Adiós a los 5 bullets técnicos.

### Modo micro afina (feedback Jorge)
- En `micro · sin SDD` (1 sola fase) el formulario **oculta los selectores de Planner y Reviewer** y relabela el de Coder a "Modelo (única fase)".

### Notas
- SDK estudiado: superior (modelo+proveedor por fase nativo, crudo estructurado, ~4×) pero el runner tiene gaps (stop/tokens/mcp) → **sigue opt-in**, no default todavía.
- Tests: 136 unit + e2e (escenario micro+auto y captura del crudo end-to-end) en verde.

## 3.4.0 (2026-06-12) — "Look&feel único" (las 4 pantallas = conductor)

### Sistema de diseño unificado (raíz de los glitches)
- **`lib/theme.mjs`**: tokens + modo oscuro + componentes (pills, cards, botones, tablas, barras) en UNA fuente de verdad. Panel, run, **dashboard y AI Act** comparten exactamente el mismo look&feel.
- **Dashboard**: adiós paleta rosa/cian que clashaba (tenía DOS paletas). Reescrito con el tema; pills de estado, ticks de cobertura, contraste AA, modo oscuro real.
- **AI Act**: reescrito con el tema (antes salía en blanco); cabecera con logo+pill, secciones explicadas, tabla de modelos, sello.

### Home / panel
- **La sidebar ya LISTA los runs** (faltaba `loadSidebar` en el panel — solo salía "…"). Bug cerrado.
- **Prompt = textarea auto-crece** (los devs pegan 100-200 líneas, no una frase). En el run, el prompt largo va en un desplegable con contador de caracteres.
- Botones de cada fila maquetados con el estilo único (📊 informe, 🇪🇺 AI Act, ⏯ Reanudar) — adiós a los links subrayados sueltos.
- **Tarjeta AIC con barra de progreso** visual y resaltada (violeta; roja al ≥80%), distinta del resto.
- Enlaces reales a Informe del run y AI Act al terminar (no rutas de texto).

### Seguridad (consultoría, ver task/consultoria-seguridad.md)
- **Anti-CSRF/DNS-rebinding** en la app local: todo POST exige Content-Type JSON + Host local → 403 a webs maliciosas.
- **Inyección de comandos**: todo `git` pasó a `execFileSync` sin shell. Sin fugas de secretos (verificado).

## 3.1.0 (2026-06-11) — "Con ojos" (calidad visual + doctrina de validación)

### Arreglos críticos (los del 4/10)
- **La página del run estaba MUERTA en navegador real** (`API is not defined`, tragado por un catch): el flujo corría perfecto por debajo pero la web no pintaba. Cazado por el nuevo harness de render y arreglado.
- **El navegador no se abría al lanzar** (`/sdd-run` corría "a ciegas"): ahora abre la URL del run automáticamente (opt-out `CONDUCTOR_SERVE_OPEN=0`).

### Nueva doctrina de validación (a fuego)
- **Harness de RENDER**: el JS de ambas páginas se EJECUTA en cada test con DOM simulado y estado rico; los `catch` silenciosos delatan su error. Nunca más un "cargando…" mudo.
- **Ruta `/demo`**: showcase visual permanente con todas las situaciones de UI a la vez — QA humana en un click.
- E2E del stack real (2 escenarios, 21 checks) en CI de 3 sistemas operativos.

### Rediseño visual completo (run + panel)
- Sistema de diseño con tokens, **modo oscuro automático**, sombras suaves, tipografía con números tabulares.
- Timeline de fases con raíl y estados (verde/pulso violeta/rojo), tarjetas con jerarquía label/valor, micro-transiciones.
- **"⏸ Decisión del revisor"**: la pausa rediseñada como el momento del tech-lead — leer/editar la spec, dirigir hallazgos, instruir (nota), elegir modelo, aprobar. El experto manda; nada de "te lo hacemos todo".
- Visor de artefactos con backdrop; panel con hero de lanzamiento, totales del proyecto (Σ runs/GREEN/tokens) y stop por fila.

## 3.0.0 (2026-06-11) — "La App Única"

### 🏛 Arquitectura nueva
- **Una sola app local** (`http://127.0.0.1:4750`, PWA instalable): panel del proyecto + cada run como ruta (`/run/<nombre>`). Se acabaron los servers efímeros, los puertos aleatorios y la explosión de pestañas.
- Los runs corren como **procesos hijo gestionados por la app vía IPC** — pausas, aprobaciones, stop, notas y cambios de modelo viajan por el canal, no por la suerte.
- **`/sdd-run` entrega el run a la app y termina al instante**: el modelo de sesión escribe 1 mensaje (la URL) y desaparece — cero tokens de espera, cero posibilidad de fabricación, duplicados o relanzamientos.

### 🧑‍💻 Developer FIRST (controles en cada pausa)
- ✏️ **Editar la spec/proposal inline** antes de aprobar — se construye TU versión.
- 📣 **Nota a la fase** ("usa signals, no BehaviorSubject") — viaja al prompt del agente.
- 🎛 **Modelo en caliente** solo para esa fase (`byok:`/`copilot:`).
- ↩ **Deshacer una fase** (checkpoints git por fase con índice propio): restaura archivos sin tocar tu rama/staging.

### 🔍 Review multi-lente
- El verify corre **lentes en paralelo** (corrección de spec, seguridad, cobertura de tests; configurable con `"lenses"`) y funde un informe por secciones.

### 🇪🇺 AI Act Pack
- **`conductor aiact <change>`** + botón en el panel: informe de transparencia de contenido generado por IA — spec gobernante (sha256), modelos por fase, **aprobaciones humanas registradas**, verificación y sello Ed25519. Alineado con las obligaciones del EU AI Act (en vigor 2-ago-2026; mapping basado en el draft Code of Practice).

### 🧪 Calidad
- **E2E offline completo en CI** (Linux/Windows/macOS): el stack real con agente simulado — launch→IPC→pausas→editar spec→nota→modelo caliente→lentes→GREEN→informe AI Act→rollback→stop→resume. La "prueba oficial", automatizada y gratis.
- 128 tests del motor. CI en matriz de 3 sistemas + Node 18.

### Antes de la 3.0.0 (resumen del ciclo 1.x)
Driver determinista Path X (ninguna fase se salta, con cualquier modelo) · mezcla `byok:`/`copilot:` por fase · resume sin re-pagar · lock anti-duplicado y guard anti-relanzamiento · gate determinista multi-dominio (OpenAPI/SQL/TS) · provenance Ed25519 + ledger encadenado · tarjeta AIC real (`gh`) y gasto LiteLLM en vivo · runner SDK empaquetado (293KB, opt-in) · demo brownfield offline · frugalidad: MCPs deshabilitados por fase, allowlist de tools por rol, límites de output.
