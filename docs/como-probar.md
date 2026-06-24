# Cómo probar conductor (v3 — la App Única)

> Guía oficial de prueba. Desde la v3, **todo vive en UNA app local**: `http://127.0.0.1:4750` —
> el panel del proyecto, cada run como ruta (`/run/<nombre>`), pausas, aprobaciones, diffs,
> informes y el informe AI Act. Una pestaña. Siempre la misma.

## Requisitos
- **Copilot CLI** autenticado (Business) y **Node ≥ 18**. Git recomendado.
- Opcional: BYOK LiteLLM por env (`COPILOT_PROVIDER_*`) → fases a $0. Opcional: `gh` autenticado → tarjeta "AIC (mi cuenta)".

## Instalación
```
copilot plugin install <repo GitLab de conductor>
```

## Camino A — desde Copilot (el normal)
1. En tu proyecto: `copilot` → `/sdd-init` (una vez por proyecto).
2. `/sdd-run añade un componente Header con título y un test`
3. El chat te da **una URL y termina ahí** (el modelo de sesión ya no espera ni narra — 0 tokens de niñera). Todo pasa en la app:
   - **⏸ Pausas de revisión** antes de implementar y verificar: lee la spec (click), **edítala inline** (✏️), añade una **📣 nota** ("usa signals, no BehaviorSubject"), cambia el **🎛 modelo solo para esa fase**, y **✓ Aprobar**.
   - **Archivos en vivo** con diff al click · **📜 registro** del run · consumo por modelo/fase · tarjetas LiteLLM/AIC.
   - **■ Detener** cuando quieras (lo hecho se conserva) · **⏯ Reanudar** desde el panel (sin re-pagar fases).
   - **↩ Deshacer una fase** (rollback): restaura los archivos al estado previo — tu rama git no se toca.
4. Final: 🏁 GREEN → **📊 informe** (dashboard) y **🇪🇺 informe AI Act** (transparencia para auditores) desde el panel.

## Camino B — la app directamente (sin tocar el chat)
```
node <ruta-plugin>/assets/conductor.mjs serve <tu-proyecto>
```
→ `http://127.0.0.1:4750` → formulario → **▶ Lanzar run** → igual que arriba. Cero coste de orquestación.
💡 En Chrome: menú → **"Instalar conductor"** → ventana propia con icono (PWA).

## Modo micro — "No SDD" (máximo ahorro)
Para tareas triviales ("sube la versión", "corrige este typo") lanzar el SDD completo es un derroche.
Elige **Complejidad: `micro · sin SDD`** en el formulario (o `--complexity micro` en CLI):
- **1 sola llamada LLM** (la implementación). Sin explore/propose/spec/verify.
- El pipeline sigue siendo seguro: captura determinista de cambios, apply-report sintetizado por el
  motor, **micro-gate** (¿escribió algo? ¿quedó "done"?), checkpoint git con ↩ rollback, registro y firma.
- Contrapartida honesta: **no queda spec** (sin trazabilidad REQ→código). Para todo lo demás, usa simple/medium/complex.
Combínalo con el switch **Modo auto** para cero pausas: lanzar y listo.

## Modelos BYOK (LiteLLM) — credenciales una sola vez
La app y los selectores de modelo leen tu catálogo **real**:
- `byok:` → se consulta a LiteLLM (`/v1/models`) con tus credenciales **y se cachean los NOMBRES** (no la key)
  en `~/.conductor/models-cache.json`. Así qwen aparece **siempre** en el picker, aunque luego arranques la app sin las variables.
- `copilot:` → modelos **observados** en runs reales de tu máquina (crece con el uso, nada inventado).

Para que la mezcla `byok:`/`copilot:` funcione arranque quien arranque la app, guarda las credenciales **una vez**
desde tu shell BYOK (con las `COPILOT_PROVIDER_*` exportadas):
```
node <ruta-plugin>/assets/conductor.mjs byok save
```
Esto: (1) en **Windows cifra la API key con DPAPI** (`~/.conductor/byok.json` queda inútil si se copia a otra
cuenta/equipo — la key NUNCA en claro ni en el repo); (2) **siembra el catálogo** de modelos en la cache. Si lanzas
la app directamente desde tu shell con las variables exportadas, no se persiste nada (la key vive solo en memoria).
Comprueba el estado con `… byok status`.

## La review multi-lente (v3)
El verify corre **3 lentes en paralelo** (corrección de spec, seguridad, cobertura de tests) con el modelo
del reviewer y funde un solo informe por secciones. Configurable en `openspec/conductor.json`:
`"lenses": ["correctness","security","tests","contract"]` o `"lenses": false`.

## `openspec/conductor.json` (TU configuración, con autocompletado)
```jsonc
{
  "$schema": "./conductor.schema.json",
  "models": { "planner": "byok:qwen36-msc1", "coder": "copilot:claude-haiku-4.5", "reviewer": "byok:qwen36-msc1" },
  "runner": "sdk",            // sesiones calientes (~4x más rápido); "spawn" = default
  "autoApprove": false,        // true = sin pausas
  "lenses": ["correctness", "security", "tests"]
}
```
Credenciales BYOK: por env o `~/.conductor/byok.json` — **nunca en el repo**.

## Adoptar conductor en un proyecto existente
El flujo es el mismo sea cual sea el stack:
1. **`/sdd-init`** (una vez): detecta stack, test runner y arquitectura leyendo los manifiestos (`package.json`, `pom.xml`, `composer.json`, `angular.json`, `sfdx-project.json`…) y deja la config base.
2. **`/sdd-instructions`**: genera `.github/instructions/*.instructions.md` (con `applyTo:`) a partir de tu configuración real. Revísalos y **añade a mano** lo que la IA no deduce (convenciones del equipo, zonas frágiles). Re-ejecutar solo actualiza los autogenerados; tus ediciones manuales se conservan.
3. Lanza features con **`/sdd-run …`**.

Por escenario: **greenfield** → los instruction files saldrán escuetos, itéralos al definir convenciones · **legacy** → empieza por refactors pequeños con pausas (sin auto-aprobar), documenta a mano las reglas legacy, no exijas checks de test si no hay cobertura · **monorepo** → un instruction file por app delimitado con `applyTo` (`apps/frontend/**`, `apps/api/**`).

Dos vías complementarias para fijar convenciones:
- **`.github/instructions/*.md`** (`applyTo`): las auto-aplica Copilot por glob.
- **`.conductor/skills/*.md`** (patrones de equipo): conductor los **inyecta en el prompt de la fase** → funcionan también con qwen/BYOK (sin auto-apply por glob). `conductor skills index` regenera el índice.

## Por stack — convenciones que conviene fijar
`/sdd-init` detecta el stack; estas son las reglas/anti-patrones de más valor como instruction file o patrón de equipo:

| Stack | Conviene fijar |
|---|---|
| **Angular 19+** | Standalone (sin NgModules), `@if`/`@for` (no `*ngIf`), `signal()` (no `BehaviorSubject`), `inject()` (no DI por constructor); capas `features/` · `shared/` · `core/`. |
| **React + Next.js** | Server Components por defecto (`use client` solo si hace falta); estado con Zustand; funcional (no class); `useMemo` para derivado (no `useEffect`). |
| **Java / Spring Boot** | Inyección por constructor (no `@Autowired` en campo); DTOs con Records (no exponer Entities en controllers); Flyway para migraciones (no `ddl-auto` en prod). |
| **PHP / Laravel** | Controllers ligeros (Form Requests + Services); route model binding; Resource classes para JSON. |
| **Salesforce (Apex + LWC)** | Trigger→Handler→Service→Selector; **nunca SOQL/DML en bucles** (bulkificar); `USER_MODE` en SOQL; `lwc:if` (no `if:true`); cobertura ≥75%. |
| **SFCC (B2C Commerce)** | MVC por cartridge; **nunca tocar `app_storefront_base`** (overlay en cartridge custom); CommonJS; controllers SFRA; sin lógica de negocio en ISML. |
| **SAP Spartacus** | **Nunca modificar `@spartacus/*`** (extender con custom components / `provideConfig()`); composición por outlets (`cxOutletRef`); `CommandService`/`QueryService` para OCC (no `HttpClient`); i18n en `assets/translations/`. |
| **Magento 2** | DI por `di.xml`+constructor (no `ObjectManager`); plugins before/after/around (no tocar core); Resource Models + Collections (no SQL crudo); escapado de output obligatorio. |
| **Vue / Nuxt** | Composition API `<script setup>` (no Options API); Pinia (no Vuex); `defineProps<T>()`; `useFetch` SSR / `$fetch` cliente. |
| **Hybris (legacy)** | Capas Controller/Facade/Service/DAO; nunca modificar clases core (extender + override en `spring.xml`). |

> Pega estas reglas como anti-patrones en el instruction file del stack (o como `.conductor/skills/<stack>.md`). El gate de conductor verifica coherencia/artefactos/traza **sin LLM**; la calidad del *contenido* la guían estas convenciones.

## Qué mirar si algo falla
- La app muestra el **motivo** en la fase (rojo) y el 📜 registro completo.
- `ABORTED` = una fase no produjo artefacto (modelo caído/timeout): ⏯ Reanudar repaga solo esa fase.
- La fontanería vive en `openspec/changes/<x>/.conductor/` (gitignored): no se edita a mano.
- Des/instalar el plugin con sesiones de Copilot abiertas puede dar `EBUSY`: ciérralas primero.

## Glosario de archivos del change
| Archivo | Qué es | ¿Lo editas? |
|---|---|---|
| `proposal.md`, `specs/*/spec.md`, `design.md`, `tasks.md` | Los artefactos SDD | Sí (mejor desde la app, en la pausa) |
| `apply-report.md`, `verify-report.md` | Evidencia del pipeline (el verify, por lentes) | No |
| `dashboard.html`, `aiact-report.html` | Informes para humanos/auditores | No (se generan) |
| `provenance.json` + ledger | Sello firmado + cadena auditable | No (verificables con `conductor verify`) |
