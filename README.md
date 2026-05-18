# Conductor

**Spec-Driven Development para GitHub Copilot — CLI y VS Code**

Plugin sin dependencias que convierte la asistencia de IA en un proceso de ingeniería auditable. En lugar de generar código al vuelo, impone un pipeline: **especificar → implementar → verificar**. Cada decisión queda trazada, cada artefacto versionado en git, cada agente opera dentro de límites estrictos.

Sin instalación. Sin binario. Sin runtime. Copia el plugin a tu proyecto y listo.

---

## Contenido

[Migración](docs/migration.md) | [Por qué Conductor](#por-qué-conductor) | [Arquitectura](#arquitectura) | [Primeros pasos](#primeros-pasos) | [Documentación](docs/)

---

## Por qué Conductor

| Sin Conductor | Con Conductor |
|---|---|
| La IA genera código de inmediato | Redacta un spec primero, implementa después |
| Sin trazabilidad | Cada cambio tiene spec, report y audit trail en `openspec/` |
| Patrones inconsistentes | Los instruction files imponen las convenciones del equipo |
| La IA ejecuta cualquier comando | `guard-tools` bloquea git, curl, wget y comandos destructivos |
| Una conversación monolítica | El orchestrator despacha agentes especializados |

---

## Arquitectura

```
plugin.json                         Manifiesto del plugin
agents/
  sdd-orchestrator.agent.md         Punto de entrada (sdd-orchestrator)
  sdd-planner.agent.md              Subagente — crea artefactos OpenSpec
  sdd-coder.agent.md                Subagente — implementa código
  sdd-reviewer.agent.md             Subagente — valida y ejecuta tests
  _shared/
    openspec-format.md              Referencia del formato OpenSpec
    security-rules.md               Reglas de seguridad compartidas
skills/
  sdd-init/                         /sdd-init — inicializa openspec/
  sdd-instructions/                 /sdd-instructions — genera instruction files
  sdd-status/                       /sdd-status — muestra progreso del pipeline
  sdd-archive/                      /sdd-archive — archiva cambios completados
hooks/
  conductor.json                    Registro de 3 hooks
  inject-state.sh/.ps1              sessionStart — carga estado del cambio activo
  inject-context.sh/.ps1            subagentStart — inyecta contexto a subagentes
  guard-tools.sh/.ps1               preToolUse — bloquea git/curl/wget/rm-rf
```

---

## Cómo funciona

```
sdd-orchestrator "mi feature"
        │
        ▼
  ┌───────────┐
  │  PLANNER  │  →  exploration.md, proposal.md, specs/{dominio}/spec.md
  └───────────┘
        │
        ▼
  ┌───────────┐
  │   CODER   │  →  código fuente + apply-report.md
  └───────────┘
        │
        ▼
  ┌───────────┐
  │ REVIEWER  │  →  verify-report.md (PASS / FAIL)
  └───────────┘
        │
    ¿FAIL? → coder en modo fix (máx 3 ciclos)
    ¿PASS? → /sdd-archive
```

El pipeline separa el **QUÉ** (specs, technology-agnostic) del **CÓMO** (instruction files, stack-aware). Los specs describen comportamiento de negocio sin mencionar frameworks. Los instruction files describen cómo escribir código para tu stack concreto.

---

## Los 4 agentes

| Agente | Rol | Puede escribir | Invocable |
|---|---|---|---|
| **sdd-orchestrator** | Coordinador. Evalúa complejidad, despacha subagentes, verifica artefactos. Nunca implementa. | Nada | Sí: `sdd-orchestrator` |
| **sdd-planner** | Produce artefactos OpenSpec. Define QUÉ construir en lenguaje de negocio. | Solo `openspec/changes/` | No (solo vía orchestrator) |
| **sdd-coder** | Implementa código desde spec + instruction files. | Código fuente + `apply-report.md` | No (solo vía orchestrator) |
| **sdd-reviewer** | Valida contra spec. Ejecuta tests y build. No edita código. | Solo `verify-report.md` | No (solo vía orchestrator) |

---

## Primeros pasos

> **¿Vienes de la versión anterior?** Consulta la [guía de migración](docs/migration.md).

### 1. Instalar el plugin

**Opción A — Copilot CLI:**
```bash
/plugin add https://gitlabdes.hiberus.com/iasmartcommerce/conductor
```

**Opción B — VS Code:**

**Paso 1 — Habilitar settings requeridos:**

Activa estos dos settings. Puedes hacerlo de forma global (para todos los proyectos) o por repositorio:

- **Global:** abre VS Code Settings, busca `chat.plugins.enabled` y actívalo. Repite con `chat.subagents.allowInvocationsFromSubagents`.
- **Por repositorio:** añade en `.vscode/settings.json` del proyecto:
  ```json
  {
    "chat.plugins.enabled": true,
    "chat.subagents.allowInvocationsFromSubagents": true
  }
  ```

**Paso 2 — Instalar el plugin:**

1. Abre la Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
2. Ejecuta `Chat: Install Plugin from Source`
3. Introduce `https://gitlabdes.hiberus.com/iasmartcommerce/conductor`

**Opción C — Instalación manual (sin plugin system):**

Si no tienes acceso al sistema de plugins, copia los ficheros directamente a tu proyecto:

```bash
# Copiar agentes, skills y hooks a .github/ de tu proyecto
cp -r conductor/agents/    tu-proyecto/.github/agents/
cp -r conductor/skills/    tu-proyecto/.github/skills/
cp -r conductor/hooks/     tu-proyecto/.github/hooks/
```

**Verificación** — en Copilot CLI o VS Code, escribe `/sdd-` y comprueba que aparecen los skills: `/sdd-init`, `/sdd-instructions`, `/sdd-status`, `/sdd-archive`. Escribe `/agent` y comprueba que aparece `sdd-orchestrator`.

> **Nota:** Al cargar el plugin por primera vez, VS Code puede mostrar el aviso "La llamada de herramienta recibió una advertencia". Es comportamiento estándar de seguridad para plugins externos — dale a permitir y marca **"Always allow"** para el workspace.

**Actualización** — el plugin se versiona en `plugin.json` (campo `version`). Para que se detecte una nueva versión, hay que bumpar ese campo antes de hacer push.

- **VS Code:** actualiza automáticamente cada 24h. Para forzar: Command Palette → `Extensions: Check for Extension Updates`.
- **CLI:** no actualiza automáticamente. Ejecuta:
  ```bash
  /plugin update conductor
  ```

### 2. Inicializar el proyecto

```
/sdd-init
```

Detecta stack, testing, arquitectura. Genera `openspec/config.yaml`.

### 3. Generar instruction files

```
/sdd-instructions
```

Genera ficheros en `.github/instructions/` con las convenciones de tu stack.

### 4. Seleccionar el agente orchestrator

Todo pasa por `sdd-orchestrator`. Es el punto de entrada único al pipeline.

**En Copilot CLI:** escribe `/agent` y selecciona `sdd-orchestrator` de la lista. Una vez seleccionado, tu prompt va directamente al orchestrator.

**En VS Code:** en el selector de agentes del chat de Copilot, elige `sdd-orchestrator`.

### 5. Lanzar el pipeline

Una vez seleccionado el agente, escribe tu petición:

```
--auto crear listado de productos con fake API
```

O sin `--auto` para modo interactivo (pausa entre fases para revisión humana):

```
crear listado de productos con fake API
```

| Flag | Efecto |
|---|---|
| `--auto` | Sin pausas. El pipeline se ejecuta completo. |
| (sin flag) | Pausa después de planificar y después de implementar para revisión humana. |
| `--continue` | Retoma un cambio existente desde `state.yaml`. |

### 6. Monitorizar

```
/sdd-status     Ver progreso del cambio activo
/tasks          Ver subagentes en segundo plano (Copilot CLI)
```

### 7. Archivar

```
/sdd-archive
```

Promueve los delta specs a `openspec/specs/` (fuente de verdad) y archiva el cambio.

---

## Selección de fases por complejidad

El planner evalúa la complejidad en la fase de exploración:

| Complejidad | Fases activas |
|---|---|
| **simple** | explore → propose → spec → apply → verify |
| **medium** | explore → propose → spec → tasks → apply → verify |
| **complex** | explore → propose → clarify → spec → design → tasks → apply → verify |

---

## OpenSpec

Conductor sigue el estándar [OpenSpec](https://github.com/Fission-AI/OpenSpec). Nuestra extensión `x-conductor` en `config.yaml` añade: pipeline declarativo, hooks, agentes, y comandos de test/build.

```
openspec/
├── config.yaml                        Configuración del proyecto + pipeline
├── specs/{dominio}/spec.md            Fuente de verdad (promovida desde changes)
├── changes/{nombre}/                  Cambio activo
│   ├── exploration.md                 Exploración del codebase
│   ├── proposal.md                    Propuesta tech-agnostic
│   ├── specs/{dominio}/spec.md        Delta spec (ADDED/MODIFIED/REMOVED)
│   ├── design.md                      Diseño técnico (complejidad media+)
│   ├── tasks.md                       Desglose de tareas (complejidad media+)
│   ├── apply-report.md                Reporte del coder
│   ├── verify-report.md               Reporte del reviewer
│   └── state.yaml                     Estado del pipeline
└── changes/archive/                   Cambios completados (audit trail)
```

---

## Seguridad

El hook `guard-tools` bloquea a nivel `preToolUse` (determinístico, no evitable):

- **Todas** las operaciones git (commit, push, pull, merge, checkout)
- **Todas** las llamadas de red (curl, wget, Invoke-WebRequest)
- **Todas** las operaciones destructivas (rm -rf, rmdir)

Los agentes pueden **recomendar** acciones git pero **nunca** ejecutarlas.

---

## Documentación

| Documento | Contenido |
|---|---|
| [Guía de inicio](docs/getting-started.md) | Tutorial completo, primer uso, ejemplos |
| [Migración](docs/migration.md) | Migrar desde la versión anterior (archivos en `.github/`) al plugin |
| [Pipeline](docs/pipeline.md) | Referencia de fases, complejidad, fix loop |
| [OpenSpec](docs/openspec.md) | Formato de artefactos, config.yaml, estructura |
| [Integración de stacks](docs/stacks.md) | Cómo adoptar Conductor en cualquier proyecto |
| [Avanzado](docs/advanced.md) | Optimización, buenas prácticas, troubleshooting |

---

## Requisitos

- GitHub Copilot (CLI v1.0.40+ o VS Code con Copilot Chat)
- Licencia GitHub Copilot activa
- Modelo recomendado: Claude Sonnet 4.6 o superior

No requiere Node.js, Python, Docker, ni ningún runtime adicional.
