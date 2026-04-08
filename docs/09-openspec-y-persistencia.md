# 💾 OpenSpec y Persistencia

[← Volver al README](../README.md)

## ¿Qué es OpenSpec?

OpenSpec es el sistema de almacenamiento de artefactos basado en archivos que utiliza Conductor para persistir los resultados de cada fase del flujo SDD. Cada cambio (feature, bugfix, refactor) genera artefactos —propuesta, especificaciones, diseño, tareas, reporte de verificación— que se almacenan en el filesystem del proyecto bajo el directorio `openspec/`.

OpenSpec cumple tres funciones:

1. **Persistencia entre sesiones**: los artefactos sobreviven al cierre de la conversación. Un cambio iniciado hoy puede continuarse mañana.
2. **Recuperación tras compactación**: cuando el contexto del orquestador se compacta (conversación larga), `state.yaml` permite reconstruir el estado exacto del cambio.
3. **Auditoría**: los cambios completados se archivan con fecha, formando un historial de decisiones arquitectónicas y de implementación.

---

## Modos de Persistencia

Conductor opera en uno de dos modos de persistencia. El modo se resuelve al inicio de cada sesión.

| Modo       | Almacenamiento           | Archivos de proyecto         | Recuperable   |
| ---------- | ------------------------ | ---------------------------- | ------------- |
| `openspec` | Filesystem (`openspec/`) | Sí, crea y modifica archivos | ✅ Sí          |
| `none`     | Ninguno (inline)         | No, nunca modifica archivos  | ❌ No          |

### Modo `openspec`

- Los artefactos se escriben como archivos Markdown y YAML dentro de `openspec/`.
- El estado del DAG se persiste en `state.yaml` después de cada transición de fase.
- Los cambios completados se archivan en `openspec/changes/archive/`.
- Las especificaciones delta se fusionan con las specs principales al archivar.

### Modo `none`

- Los resultados se devuelven inline al orquestador.
- **No se crea ni modifica ningún archivo del proyecto.**
- Si la conversación termina, todos los artefactos se pierden.
- El orquestador recomienda habilitar `openspec` cuando detecta que se está usando `none`.

### Resolución del modo

```
1. ¿El orquestador pasó un modo explícito?
   ├── Sí → usar ese modo
   └── No → default: none

2. openspec NUNCA se activa por defecto
   └── Solo cuando el usuario lo solicita explícitamente
```

> **Por defecto: `none`**. Esto es por seguridad: Conductor no crea archivos en tu proyecto sin tu permiso explícito.

---

## Estructura de Directorios

```
openspec/
├── config.yaml                         ← Configuración SDD del proyecto
├── principles.md                       ← (opcional) Principios del proyecto — humano, inmutable
├── specs/                              ← Fuente de verdad (specs principales)
│   └── {dominio}/
│       └── spec.md                     ← Spec principal del dominio
└── changes/                            ← Cambios activos y archivados
    ├── archive/                        ← Cambios completados
    │   └── YYYY-MM-DD-{nombre}/        ← Carpeta archivada con fecha
    │       ├── state.yaml
    │       ├── proposal.md
    │       ├── specs/{dominio}/spec.md
    │       ├── design.md
    │       ├── tasks.md
    │       └── verify-report.md
    └── {nombre-del-cambio}/            ← Cambio activo
        ├── state.yaml                  ← Estado del DAG (sobrevive compactación)
        ├── exploration.md              ← (opcional) de sdd-explore
        ├── proposal.md                 ← de sdd-propose
        ├── specs/                      ← de sdd-spec
        │   └── {dominio}/
        │       └── spec.md             ← Spec delta (solo cambios)
        ├── design.md                   ← de sdd-design
        ├── tasks.md                    ← de sdd-tasks (actualizada por sdd-apply)
        └── verify-report.md            ← de sdd-verify
```

---

## config.yaml

El archivo `openspec/config.yaml` se genera durante `/sdd-init` y contiene la configuración del proyecto detectada automáticamente.

### Formato

```yaml
schema: spec-driven

context: |
  Tech stack: Node.js 20, TypeScript 5.x, Express
  Architecture: Clean Architecture con módulos por dominio
  Testing: Vitest + Testing Library
  Style: ESLint + Prettier

strict_tdd: true

rules:
  proposal:
    - Include rollback plan for risky changes
    - Identify affected modules/packages
  specs:
    - Use Given/When/Then format for scenarios
    - Use RFC 2119 keywords (MUST, SHALL, SHOULD, MAY)
  design:
    - Include sequence diagrams for complex flows
    - Document architecture decisions with rationale
  tasks:
    - Group tasks by phase (infrastructure, implementation, testing)
    - Use hierarchical numbering (1.1, 1.2, etc.)
    - Keep tasks small enough to complete in one session
  apply:
    - Follow existing code patterns and conventions
    tdd: false
    test_command: "npm test"
  verify:
    test_command: "npm test"
    build_command: "npm run build"
    coverage_threshold: 80
  archive:
    - Warn before merging destructive deltas

testing:
  # Capacidades de testing detectadas (generadas por sdd-init)
  strict_tdd: true
  test_runner:
    command: "npx vitest run"
    framework: vitest
  layers:
    unit: { available: true, tool: vitest }
    integration: { available: true, tool: "@testing-library/react" }
    e2e: { available: false }
  coverage:
    available: true
    command: "npx vitest run --coverage"
  quality:
    linter: { available: true, command: "npx eslint ." }
    type_checker: { available: true, command: "npx tsc --noEmit" }
    formatter: { available: true, command: "npx prettier --check ." }
```

### Campos principales

| Campo        | Descripción                                    |
| ------------ | ---------------------------------------------- |
| `schema`     | Siempre `spec-driven`                          |
| `context`    | Resumen del stack técnico (máximo 10 líneas)   |
| `strict_tdd` | Si el modo TDD estricto está habilitado        |
| `rules`      | Reglas específicas por fase SDD                |
| `testing`    | Capacidades de testing detectadas por sdd-init |

Las `rules` de cada fase se inyectan en el sub-agente correspondiente, guiando cómo debe producir su artefacto.

---

## principles.md (Opcional)

El archivo `openspec/principles.md` es una **constitución lite** del proyecto: principios NON-NEGOTIABLE que todas las fases SDD deben respetar. Es creado y mantenido por humanos — la IA nunca lo modifica.

### Formato

```markdown
# Project Principles

1. **Spec-First**: No code without specifications. Every change MUST have specs before implementation.
2. **Simplicity**: Prefer the simplest solution. No over-engineering or premature abstractions.
3. **Test Coverage**: Every requirement MUST have at least one automated test.
4. **Existing Patterns**: Follow the project's existing patterns, not generic best practices.
5. **Explicit Dependencies**: No implicit dependencies. All imports and connections must be traceable.
```

### Cómo funciona

1. El orquestador lee `openspec/principles.md` una vez por sesión (junto al skill registry)
2. Cachea su contenido como líneas compactas (~30-50 tokens)
3. Inyecta los principios como `## Project Principles (auto-resolved)` en cada sub-agente, **antes** de las compact rules de skills
4. Si el archivo no existe, se omite silenciosamente — sin error, sin warning

### Cuándo crearlo

- Al integrar Conductor por primera vez en un proyecto con convenciones fuertes
- Cuando el equipo tiene reglas no negociables que la IA debe seguir siempre
- Para proyectos regulados (compliance, seguridad, accesibilidad)

### Reglas

- Máximo 5 principios (más de 5 diluye su efectividad)
- Cada principio en 1 línea (nombre en negrita + descripción)
- Nunca modificado por IA — solo humanos pueden editarlo
- Si un sub-agente detecta que una decisión viola un principio, debe reportarlo como `risk` en su envelope

---

## state.yaml

El archivo `state.yaml` es el mecanismo de recuperación del DAG. Lo escribe el orquestador después de cada transición de fase.

### Ejemplo

```yaml
change: add-user-auth
created: 2025-01-15T10:30:00Z
current_phase: apply
phases:
  explore:
    status: done
    completed: 2025-01-15T10:32:00Z
  propose:
    status: done
    completed: 2025-01-15T10:35:00Z
  spec:
    status: done
    completed: 2025-01-15T10:40:00Z
  design:
    status: done
    completed: 2025-01-15T10:45:00Z
  tasks:
    status: done
    completed: 2025-01-15T10:50:00Z
  apply:
    status: in_progress
    batches_completed: 2
    batches_total: 3
  verify:
    status: pending
  archive:
    status: pending
```

### Campos

| Campo           | Descripción                                                       |
| --------------- | ----------------------------------------------------------------- |
| `change`        | Nombre del cambio                                                 |
| `created`       | Fecha de creación                                                 |
| `current_phase` | Fase actualmente en ejecución                                     |
| `phases`        | Estado de cada fase (`pending`, `in_progress`, `done`, `skipped`) |

### Función principal

Cuando el orquestador pierde contexto (compactación de la conversación), lee `state.yaml` para reconstruir exactamente dónde se quedó el flujo:

```
Orquestador pierde contexto
    │
    ▼
Lee openspec/changes/{cambio}/state.yaml
    │
    ▼
Determina: current_phase = apply, batch 2/3 completado
    │
    ▼
Continúa desde batch 3
```

---

## Ciclo de Vida de un Cambio

Un cambio sigue un ciclo predecible desde su creación hasta su archivado:

```
  Creado ──▶ Planificación ──▶ Implementación ──▶ Verificado ──▶ Archivado
```

### Detalle por etapa

1. **Creado** — Se crea la carpeta `openspec/changes/{nombre}/` y `state.yaml` inicial.
2. **Planificación** — Las fases `explore` → `propose` → `spec` → `design` → `tasks` generan artefactos progresivamente. Cada artefacto alimenta al siguiente según el grafo de dependencias.
3. **Implementación** — `apply` ejecuta las tareas en batches, marcando cada tarea completada con `[x]` en `tasks.md`.
4. **Verificación** — `verify` valida la implementación contra las specs y genera `verify-report.md`.
5. **Archivado** — `archive` fusiona las specs delta con las principales y mueve la carpeta del cambio al archivo.

---

## Archivado

El archivado es la fase final de un cambio. Ejecuta dos operaciones:

### 1. Fusión de specs delta

Las specs delta (en `openspec/changes/{cambio}/specs/{dominio}/spec.md`) se fusionan con las specs principales (en `openspec/specs/{dominio}/spec.md`). Las specs principales son la **fuente de verdad** del proyecto.

```
ANTES del archivado:
  openspec/specs/auth/spec.md           ← Spec principal (v1)
  openspec/changes/add-mfa/specs/auth/spec.md  ← Spec delta (MFA)

DESPUÉS del archivado:
  openspec/specs/auth/spec.md           ← Spec principal (v2, incluye MFA)
```

### 2. Movimiento al archivo

La carpeta completa del cambio se mueve al directorio de archivo con la fecha actual:

```
ANTES:
  openspec/changes/add-mfa/

DESPUÉS:
  openspec/changes/archive/2025-01-15-add-mfa/
```

El archivo es un **registro de auditoría**: nunca se elimina ni modifica. Contiene el historial completo de decisiones para cada cambio.

---

## Recuperación tras Compactación

La compactación de contexto es un evento inevitable en conversaciones largas. Todas las plataformas de IA reducen el contexto cuando la conversación supera cierto tamaño, lo que puede hacer que el orquestador pierda información sobre el estado actual.

### Mecanismo de recuperación

```
  Conversación larga (contexto se compacta)
          │
          ▼
  Orquestador detecta pérdida de contexto
          │
          ├── Modo openspec? ── SÍ ──▶ Lee state.yaml
          │                            Reconstruye estado
          │                            Continúa flujo
          │
          └── Modo none? ──────────▶ No recuperable
                                     Informa al usuario
```

### Qué se recupera

| Elemento                     | ¿Recuperable?  | Cómo                                     |
| ---------------------------- | -------------- | ---------------------------------------- |
| Fase actual del cambio       | ✅              | `state.yaml` → `current_phase`           |
| Artefactos completados       | ✅              | Archivos en `openspec/changes/{cambio}/` |
| Progreso de batches en apply | ✅              | `state.yaml` → `batches_completed`       |
| Contexto de la conversación  | ❌              | Perdido tras compactación                |
| Skills cacheadas             | ⚠️             | Se re-leen del skill registry            |

### Recuperación del skill registry

Cuando el orquestador detecta pérdida de skills (vía `skill_resolution: fallback-registry` o `none` en el resultado de un sub-agente), re-lee `.atl/skill-registry.md` inmediatamente y re-inyecta las reglas compactas en todas las delegaciones subsiguientes.

---

## Reglas de Frontera (Boundary Rules)

Las reglas de frontera definen quién puede leer y escribir qué archivos. Son críticas para evitar conflictos y mantener la separación de responsabilidades.

### Orquestador

| Acción                      | Permitido   | Ejemplo                                  |
| --------------------------- | ----------- | ---------------------------------------- |
| Leer `state.yaml`           | ✅           | Para recuperación tras compactación      |
| Escribir `state.yaml`       | ✅           | Después de cada transición de fase       |
| Leer git status/log         | ✅           | Para decisiones de coordinación          |
| Leer artefactos SDD         | ❌           | Delega esta lectura al sub-agente        |
| Escribir artefactos SDD     | ❌           | Solo los sub-agentes escriben artefactos |
| Leer/escribir código fuente | ❌           | Siempre delega                           |

### Sub-agentes

| Acción                        | Permitido   | Ejemplo                                |
| ----------------------------- | ----------- | -------------------------------------- |
| Leer artefactos SDD           | ✅           | Según tabla de dependencias de fase    |
| Escribir su artefacto         | ✅           | `proposal.md`, `spec.md`, etc.         |
| Leer código fuente            | ✅           | Para análisis e implementación         |
| Escribir código fuente        | ✅           | Solo en fase `apply`                   |
| Leer `state.yaml`             | ❌           | Solo el orquestador gestiona el estado |
| Escribir fuera de `openspec/` | ❌           | Excepto código fuente en `apply`       |

### Tabla de dependencias de lectura por fase

| Fase          | Lee artefactos              |
| ------------- | --------------------------- |
| `sdd-explore` | Nada                        |
| `sdd-propose` | Exploración (opcional)      |
| `sdd-spec`    | Propuesta (obligatorio)     |
| `sdd-design`  | Propuesta (obligatorio)     |
| `sdd-tasks`   | Spec + Design (obligatorio) |
| `sdd-apply`   | Tasks + Spec + Design       |
| `sdd-verify`  | Spec + Tasks                |
| `sdd-archive` | Todos los artefactos        |

---

## Cuándo Usar Cada Modo

### Usa `openspec` cuando:

- Trabajas en un proyecto a largo plazo con múltiples cambios.
- Necesitas que los artefactos persistan entre sesiones.
- Varios miembros del equipo comparten el contexto SDD.
- Quieres un registro de auditoría de las decisiones arquitectónicas.
- Las conversaciones son largas y la compactación es un riesgo.
- Ejecutas flujos SDD completos (propose → spec → design → tasks → apply → verify → archive).

### Usa `none` cuando:

- Haces tareas rápidas que no justifican el overhead de archivos.
- Estás explorando ideas sin compromiso.
- No quieres que se creen archivos en tu proyecto.
- Usas Conductor para delegación general (no SDD).
- La tarea se completa en una sola sesión corta.

### Migración de `none` a `openspec`

Si empezaste con `none` y decides que necesitas persistencia:

1. Ejecuta `/sdd-init` con modo `openspec`.
2. Se creará la estructura de directorios.
3. Los artefactos de la sesión actual deberán recrearse (no son recuperables desde `none`).

---

[← Anterior: Plataformas](./08-plataformas-compatibles.md) | [Volver al README](../README.md) | [Siguiente: Consumo de Tokens →](./10-consumo-tokens.md)
