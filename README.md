# Conductor

**Spec-Driven Development verificado para GitHub Copilot — CLI y VS Code**

Conductor convierte la asistencia de IA en un **proceso de ingeniería auditable**: primero la spec, luego el código, y al final **un gate determinista comprueba que lo construido cumple lo especificado** — y lo firma. Funciona con **cualquier modelo** (incluido BYOK gratuito): la secuencia del pipeline la garantiza código, no la buena voluntad del LLM.

Una instalación. Cero dependencias. Cero servidores.

---

## Contenido

[Por qué Conductor](#por-qué-conductor) | [Cómo funciona](#cómo-funciona) | [Primeros pasos](#primeros-pasos) | [La app](#la-app-de-conductor) | [Coste y modelos](#coste-y-modelos) | [Seguridad](#seguridad) | [Documentación](#documentación)

---

## Por qué Conductor

| Sin Conductor | Con Conductor |
|---|---|
| La IA genera código al vuelo | Spec primero; el código se implementa contra ella |
| "Hecho" significa "el modelo dice que está hecho" | **Gate determinista** (sin LLM) verifica coherencia spec↔código↔tests y **rompe el build** si no cumple |
| Un modelo flojo se salta pasos | **El pipeline lo conduce código**: con cualquier modelo, las fases van en orden o no avanzan |
| Sin evidencia | Cada run GREEN queda **sellado (firma Ed25519)** y encadenado a un **ledger de auditoría** |
| El consumo de IA es una caja negra | **Tokens y coste por fase + tus AI Credits**, en vivo, en la app local |
| Un solo modelo para todo | **Modelo y proveedor POR FASE** (incluso cambiándolo en caliente desde la web): planifica gratis con BYOK, codea con tu licencia premium — en el mismo run |
| ¿Cumplimiento normativo? Suerte | **Informe AI Act por change** (modelos, aprobaciones humanas, verificación, firma) — la transparencia que la UE exige desde el 2-ago-2026, como subproducto del pipeline |

---

## Cómo funciona

Dos formas de uso, mismo motor, mismo gate:

### ⭐ `/sdd-run` — el pipeline garantizado (recomendado)
Pides una feature en una frase. Un **driver determinista** (código, no LLM) recorre las fases del plan — de `propose` y `spec` a `apply`, `test` (opcional, antes de verificar) y `verify` — lanzando al agente de Copilot en cada una, **pausando para tu revisión** antes de implementar y verificar, y validando con el gate. Al terminar: código + spec + informe + sello firmado.

```
/conductor:sdd-run añade un componente Counter con botones +/- y un test
```

- 🌐 **App local en vivo** (se abre sola): fases, progreso, archivos tocados, tokens, coste, botones **Aprobar** y **■ Detener**.
- ⏸ **Pausas de revisión** por defecto antes de `apply` y `verify` (quítalas con `autoApprove: true`).
- 🔁 **Resume**: si se corta (o lo detienes), relanzar el mismo comando continúa donde quedó **sin re-pagar** las fases hechas.
- 🔏 Al cerrar GREEN: `provenance.json` firmado + entrada en el ledger + `dashboard.html`.

### Atajos desde el chat
Los skills (`/sdd-init`, `/sdd-status`, `/sdd-explain`, `/sdd-archive`) existen como atajos conversacionales, pero todo lo que hacen está también en la app local — que es la superficie recomendada. La garantía dura la da `/sdd-run`.

---

## Primeros pasos

Conductor se instala como **un plugin de Copilot** — como cualquier otro que ya uses. Una instalación, un arranque:

### 1. Instala el plugin (una vez)

**Copilot CLI:**
```bash
/plugin install <URL del repo interno de conductor>
```

**VS Code:** activa `chat.plugins.enabled` y `chat.subagents.allowInvocationsFromSubagents` en settings, luego Command Palette → `Chat: Install Plugin from Source` → URL del repo.

> En Windows, si la des/instalación da `EBUSY`: cierra todas las sesiones de Copilot y reintenta (cada sesión mantiene vivo el MCP del plugin).

**Primera vez**: al abrir el panel, pega la URL de tu proxy y tu key en el formulario — queda **cifrada AES-256-GCM en tu máquina** (jamás en claro, jamás la ve un LLM) y la app te enseña **catálogo y precios reales**.

> 🔌 ¿Otro host de agentes, terminal puro o instalación por npm? Existen y están soportados — pero son la excepción, no el camino: **[docs/integraciones.md](docs/integraciones.md)**.

### 2. Inicializar el proyecto
```
/sdd-init
```
Detecta stack/testing/arquitectura y genera `openspec/conductor.json` (tu configuración ejecutable) + `config.yaml` (metadata del stack). También puedes inicializar desde la propia app (botón «Inicializar este proyecto»).

### 3. (Opcional) Instruction files
```
/sdd-instructions
```

### 4. Construir
```
/conductor:sdd-run <tu petición>
```
El chat te devuelve **una URL y termina**: todo (pausas, aprobaciones, edición de spec, diffs, stop/resume, informes) pasa en la app `http://127.0.0.1:4750`. Sin chat también: `conductor` abre el panel en el repo actual, y `conductor drive <change> --request "…" --src .` corre el pipeline con las **pausas en tu consola** (aprobar/nota/modelo/rehacer/stop). Al cerrar GREEN, `conductor receipt <change>` te da la descripción del PR lista para pegar.

### 5. Archivar
```
/sdd-archive
```
Promueve los specs a la fuente de verdad y encadena la provenance al ledger.

---

## La app de conductor

Todo vive en **una app local**: `http://127.0.0.1:4750` (127.0.0.1, solo tú, **0 tokens** — código leyendo estado, sin LLM). El panel lista todos los runs del proyecto; cada run es una ruta (`/run/<nombre>`). `/sdd-run` lanza el run en la app y el chat termina ahí — el modelo de sesión ya no espera, narra ni puede estorbar. Instalable como app de escritorio (PWA) desde Chrome.

**El developer manda** (en cada pausa de revisión):
- 📄 Lee la spec/proposal con un click — y **✏️ edítala inline**: se construye TU versión.
- 📣 **Nota para la fase** ("usa signals, no BehaviorSubject") — viaja al prompt del agente.
- 🎛 **Modelo en caliente** solo para esa fase (`byok:`/`copilot:`) — escala a premium solo cuando lo ves.
- ✓ Aprobar · **■ Detener** (se conserva todo; **⏯ Reanudar** desde el panel sin re-pagar fases) · **↩ Deshacer una fase** (restaura los archivos al estado previo; tu rama git no se toca).

**Visibilidad total**: archivos ±en vivo con **diff al click**, 📜 registro del run, modelo/tokens/duración por fase, reintentos con motivo, consumo LiteLLM real y **AIC de tu cuenta** (con `gh`).

**Review multi-lente**: el verify corre lentes en paralelo (corrección, seguridad, tests) y funde un informe por secciones.

Informes permanentes por change: `dashboard.html` (run) y **`🇪🇺 aiact-report.html`** — el informe de transparencia de contenido generado por IA (modelos usados, aprobaciones humanas, verificación, firma) alineado con las obligaciones del **EU AI Act (en vigor para contenido IA el 2-ago-2026)**. La fontanería JSON vive oculta en `.conductor/`.

---

## Coste y modelos

Conductor es **token-first**: prompts mínimos, sin narración del LLM (la web informa gratis), resume sin re-pagar, anti-bucle, y telemetría de consumo por fase.

**Configura modelos a tu gusto** en `openspec/conductor.json` (tuyo, en tu repo — sin secretos):
```json
{
  "models": {
    "planner":  "byok:qwen36-msc1",
    "coder":    "copilot:claude-haiku-4.5",
    "reviewer": "byok:qwen36-msc1"
  },
  "autoApprove": false
}
```
- `byok:<modelo>` → tu endpoint LiteLLM (≈ $0). Credenciales por env o en `~/.conductor/byok.json` (tu HOME).
- `copilot:<modelo>` → catálogo de tu licencia Copilot Business (consume AI Credits).
- Sin prefijo → el proveedor con el que lanzaste la sesión.

> La plataforma no permite cambiar de modelo en una sesión; **Conductor lo hace por fase**, mezclando incluso proveedores en el mismo run.

---

## Seguridad

- **Gate determinista sin LLM**: coherencia, estructura, trazabilidad spec→task→código→test, breaking-changes de contrato (OpenAPI/SQL/TS). No obedece prompts: o cumple, o FAIL.
- **Provenance Ed25519** + ledger hash-encadenado (manipular una entrada rompe la cadena) + firma del propio motor (`selfcheck --pub`).
- Agentes con scope estricto: **sin git, sin red, sin comandos destructivos**; reviewer read-only. El contenido del repo se trata como **datos**, no como instrucciones.
- El motor (0 dependencias, un solo fichero) viaja dentro del plugin como servidor MCP; confinamiento de rutas con `CONDUCTOR_ROOT`.
- Tests del proyecto: fase `test` **opcional** justo antes de `verify` (FAIL → ciclo `fix` → re-test → BLOCKED si no converge); apagada por defecto y solo ejecuta con tu consentimiento explícito. El resto va a tu CI.

---

## Estructura OpenSpec

```
openspec/
├── config.yaml                   Configuración del proyecto + pipeline
├── conductor.json                (opcional) tu configuración de modelos/web/pausas
├── specs/{dominio}/spec.md       Fuente de verdad
├── provenance.ledger.jsonl       Ledger de auditoría (hash-chain)
└── changes/{nombre}/
    ├── proposal.md · specs/ · design.md · tasks.md      Artefactos SDD (legibles)
    ├── apply-report.md · verify-report.md               Reportes del run
    ├── dashboard.html                                   📊 informe del run (ábrelo)
    ├── provenance.json                                  Sello firmado (CI/auditoría)
    └── .conductor/                                      Interno (estado/telemetría) — gitignoreado
```

---

## Documentación

| Documento | Contenido |
|---|---|
| [Cómo probar](docs/como-probar.md) | Guía única: prueba paso a paso, adopción por proyecto/stack, configuración (`openspec/conductor.json`), BYOK, review multi-lente, glosario y troubleshooting |

## Requisitos

- GitHub Copilot CLI (v1.0.60+) o VS Code con Copilot Chat, con licencia activa.
- Node.js ≥ 18 (el mismo que requiere Copilot CLI; el motor de Conductor no añade nada más).
- Opcional: API key de LiteLLM (BYOK ≈ coste cero) · `gh` CLI para ver tu uso de Copilot en la web.
