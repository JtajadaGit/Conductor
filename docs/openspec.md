# OpenSpec — Persistencia y Artefactos

OpenSpec es el sistema de persistencia de Conductor: artefactos SDD en disco, recuperación tras compactación, y auditoría de decisiones.

> **Conductor extiende OpenSpec** con phase gates (`state.yaml`), artifact locks, verify phase y platform instruction files. Los artefactos base (`specs/`, `changes/`, `config.yaml` con `schema`/`context`/`rules`, `proposal.md`, `design.md`, `tasks.md`) siguen la convención OpenSpec estándar — lo que Conductor añade son las capas de orquestación y control de flujo. Campos bajo `x-conductor` en config.yaml son extensiones. El contexto del proyecto (stack, arquitectura, convenciones) se genera como instruction files nativos de plataforma (`.github/instructions/` y `.claude/rules/`) en vez del antiguo `context.md`.

---

## Persistencia

Todos los artefactos SDD persisten en `openspec/` en el filesystem. Esto es obligatorio para el DAG recovery, phase gates, `/sdd-continue` y resiliencia ante compactación. Se inicializa con `/sdd-init`.

---

## Estructura de Directorios

```
openspec/
├── config.yaml                   ← OpenSpec standard (schema, context, rules) + Conductor ext. (x-conductor)
├── principles.md                 ← (Conductor ext., opcional) NON-NEGOTIABLE — solo humanos editan
├── lessons-learned.md            ← (Conductor ext., opcional) Append-only entre cambios
├── specs/                        ← OpenSpec standard — fuente de verdad (specs principales)
│   └── {dominio}/
│       └── spec.md
└── changes/                      ← OpenSpec standard
    ├── archive/
    │   └── YYYY-MM-DD-{nombre}/  ← Cambio completado (audit trail, nunca modificar)
    │       ├── state.yaml        ← (Conductor ext.)
    │       ├── proposal.md       ← OpenSpec standard
    │       ├── specs/            ← OpenSpec standard (delta specs)
    │       ├── design.md         ← OpenSpec standard
    │       ├── tasks.md          ← OpenSpec standard
    │       ├── verify-report.md  ← (Conductor ext.)
    └── {nombre-del-cambio}/      ← Cambio activo
        ├── state.yaml            ← (Conductor ext.) Estado del DAG
        ├── exploration.md        ← (Conductor ext., opcional)
        ├── proposal.md           ← OpenSpec standard
        ├── specs/{dominio}/spec.md  ← OpenSpec standard (delta spec)
        ├── design.md             ← OpenSpec standard
        ├── tasks.md              ← OpenSpec standard
        ├── questions.md          ← (Conductor ext., opcional)
        └── verify-report.md      ← (Conductor ext.)
```

---

## Quién usa qué — Mapa de consumo

Cada fichero OpenSpec tiene consumidores específicos. Esta tabla elimina ambigüedad sobre qué lee cada actor y para qué.

### config.yaml

| Campo | Quién lo lee | Cuándo | Para qué |
|-------|-------------|--------|----------|
| `context:` (1 línea) | **sdd-planner** | Cada fase de planificación | Se inyecta en prompts de artefactos — el planner sabe "Angular 20 standalone" al escribir specs |
| `rules:` | **sdd-planner** | spec, tasks | Restricciones por artefacto (p. ej., "Use Given/When/Then") |
| `x-conductor.execution_mode` | **Orquestador** | Inicio de cada pipeline | `auto` (0 pausas) o `interactive` (pausa antes de apply y verify) |
| `x-conductor.strict_tdd` | **sdd-coder** (Step 2) | Inicio de apply | Decide si carga addon TDD (RED→GREEN→REFACTOR) |
| `x-conductor.strict_tdd` | **sdd-reviewer** (Step 0) | Inicio de verify | Decide si carga addon de auditoría TDD |
| `x-conductor.hooks.apply` | **sdd-coder** (Steps 1, 4) | Pre/post implementación | Qué comandos ejecutar (`ng build`) y cómo manejar fallos |
| `x-conductor.hooks.verify` | **sdd-reviewer** (Steps 5, 6) | Verificación | Qué test/build commands ejecutar |
| `x-conductor.testing` | **sdd-coder** (TDD) | Ciclo TDD | Qué test runner usar, qué framework |
| `x-conductor.testing` | **sdd-reviewer** | Coverage check | Umbral de cobertura, comando de coverage |
| `x-conductor.stack` | **`/sdd-init`**, **`/instructions`** | Re-init, scan | Metadata estructurada para auto-detección |

### Platform instruction files (reemplaza context.md)

El contexto del proyecto se genera como instruction files nativos en ambas plataformas:

| Archivo | applyTo (ejemplo Angular) | Generado por | Contenido |
|---------|---------|---|---|
| `{framework}.instructions.md` | `**/*.component.ts,**/*.service.ts,...` | `/sdd-init` | Stack, arquitectura, directorios, entry points |
| `testing.instructions.md` | `**/*.spec.ts` | `/instructions` | Convenciones de testing, patrones de archivos |
| `formatting.instructions.md` | `**/*.ts,**/*.html` | `/instructions` | Formato, linting, TypeScript strict |
| `principles.instructions.md` | `**/*.ts,**/*.py,...` (source) | `/instructions` | Principios del equipo (si existen) |

> Cada stack genera patrones distintos. Nunca `applyTo: "**"`. Ver `/sdd-init` y `/instructions` para la tabla completa de stacks.

Ubicaciones:
- **GitHub Copilot**: `.github/instructions/{topic}.instructions.md`
- **Claude Code**: `.claude/rules/{topic}.md`

La plataforma carga automáticamente las instrucciones relevantes según los archivos que el agente está tocando (via `applyTo`). No requiere inyección manual por el orquestador.

### Principio de no-duplicación

```
config.yaml context:       → resumen 1-línea OpenSpec estándar (inyectado en prompts de artefactos)
config.yaml x-conductor:   → config ejecutable del pipeline (hooks, tdd, testing commands)
instruction files:         → contexto del PROYECTO (stack, arquitectura, formatting, testing conventions)
                             NO repiten runner/coverage commands (están en x-conductor.testing)
                             NO repiten hooks (están en x-conductor.hooks)
```

> **Regla**: instruction files contienen contexto del proyecto. config.yaml contiene config del pipeline. Sin duplicación entre ambos.

---

## config.yaml

Generado por `/sdd-init`. Contiene campos OpenSpec estándar (`schema`, `context`, `rules`) y extensiones Conductor (`x-conductor`).

```yaml
schema: spec-driven

# --- OpenSpec standard ---
context: "Express, TypeScript strict, npm"    # 1-línea — inyectado en TODOS los prompts de artefactos
rules:                                        # Restricciones por artefacto (solo inyectadas en el artefacto correspondiente)
  specs:
    - Use Given/When/Then format
  tasks:
    - Size tasks for single-session completion

# --- Conductor extensions ---
x-conductor:
  stack:
    language: "typescript"
    runtime: "node"
    version: "20.x"
    framework: "express"
    package_manager: "npm"
  monorepo: false
  execution_mode: interactive  # auto | interactive
  strict_tdd: true
  testing:
    test_runner: { command: "npx vitest run", framework: "vitest" }
    layers: { unit: true, integration: true, e2e: false }
    coverage: { available: true, command: "npx vitest run --coverage" }
    quality: { linter: "eslint", type_checker: "tsc", formatter: "prettier" }
  hooks:
    apply:
      pre_hook: ""
      post_hook: "npm run build && npx tsc --noEmit"
      post_hook_on_fail: retry
      post_hook_max_retries: 3
      checkpoint_every: 5
    verify:
      test_command: "npx vitest run"
      build_command: "npm run build"
      coverage_threshold: 80
```

> **Nota**: `context:` (campo en config.yaml) es un resumen 1-línea estándar OpenSpec inyectado en prompts de artefactos. El contexto detallado del proyecto (arquitectura, directorios, convenciones) se genera como instruction files nativos de plataforma.

### Sincronización de Stack

Los datos de stack aparecen en dos formatos con propósitos distintos:

| Ubicación | Formato | Propósito | Actualizado por |
|-----------|---------|-----------|-----------------|
| `config.yaml` → `context:` | 1 línea | Inyección en prompts de artefactos (planner) | `/sdd-init` (auto) |
| `config.yaml` → `x-conductor.stack` | YAML estructurado | Lógica del pipeline, auto-detección | `/sdd-init` (auto) |
| `stack.instructions.md` / `stack.md` | Markdown con `applyTo: "**"` | Contexto auto-cargado por la plataforma (arquitectura, dirs, entry points) | `/sdd-init` (auto) |

**Regla de sincronización**: cuando el stack cambia, re-ejecuta `/sdd-init` — regenera config.yaml y instruction files preservando `rules:` personalizadas y secciones manuales.

---

## state.yaml (Conductor extension)

No existe en OpenSpec estándar (OpenSpec trackea progreso via checkboxes en `tasks.md`). Conductor añade `state.yaml` como mecanismo de recuperación del DAG y phase gates. Cada agente actualiza su propia fase al completarla (el orquestador NO escribe state.yaml).

```yaml
change: add-user-auth
created: 2026-04-01T10:30:00Z
updated: 2026-04-01T11:45:00Z
current_phase: apply
phases:
  explore: done
  propose: done
  clarify: skipped
  spec: done
  design: done
  tasks: done
  apply: in_progress
  verify: pending
  archive: pending
locks:
  spec: true      # frozen tras completar tasks (previene spec-drift)
  design: true
```

**Artifact Locks**: Al completar `tasks`, se bloquean `spec` y `design`. Si el usuario quiere modificarlos: el orquestador advierte → desbloquea → re-ejecuta tasks.

**Recuperación tras compactación**:
```
Orquestador pierde contexto → lee state.yaml → reconstruye DAG → continúa desde current_phase
```

---

## principles.md (Opcional)

Constitución del proyecto — principios NON-NEGOTIABLE que todas las fases respetan. **Nunca modificado por IA.**

```markdown
# Project Principles

1. **Spec-First**: No code without specifications.
2. **Simplicity**: Prefer the simplest solution. No over-engineering.
3. **Test Coverage**: Every requirement MUST have at least one automated test.
4. **Existing Patterns**: Follow project patterns, not generic best practices.
```

- Máximo 5 principios (más diluye la efectividad)
- El orquestador lo lee una vez por sesión, lo inyecta como `## Project Principles` en cada sub-agente
- Si no existe → se omite silenciosamente

---

## lessons-learned.md

Registro append-only de lecciones entre cambios. Crece con cada `sdd-coder` fix exitoso.

```markdown
# Lessons Learned

## 2026-04-01 — add-user-auth
### Ecosystem Gotchas
- jsonwebtoken 9.x: async sign required → use promisify
### Design Insights
- Refresh token rotation adds complexity; use simple expiry for MVPs
```

---

## Reglas de Frontera

| Actor | Puede leer | Puede escribir |
|-------|------------|----------------|
| Orquestador | `state.yaml`, git status | Lectura para recovery (NO escribe state.yaml) |
| sdd-planner | Artefactos de fases previas, código fuente | Su artefacto de fase + `state.yaml` (inicial) |
| sdd-coder | tasks + spec + design + código + `state.yaml` | Código fuente + `tasks.md [x]` + `state.yaml` (apply: done) |
| sdd-reviewer | spec + tasks + código + `state.yaml` | `verify-report.md` + `state.yaml` (verify: pass/fail) |
| sdd-archive | Todos los artefactos | Main specs + archive/ |

Cada agente es responsable de actualizar `state.yaml` para su fase. El orquestador lo lee para recovery/compactación, pero **nunca** lo escribe.

---

## Archivado

Tras verify PASS, el orquestador sugiere automáticamente `/sdd-archive`. Al ejecutarlo:
1. **Sync delta specs** → `openspec/specs/{domain}/spec.md` (apply order: REMOVED → MODIFIED → ADDED; si existe sección RENAMED, se aplica primero)
2. **Mover** `openspec/changes/{nombre}/` → `openspec/changes/archive/YYYY-MM-DD-{nombre}/`
3. **Update instruction files** — si `verify-report.md` contiene sugerencias de actualización
4. El archive es audit trail — **nunca eliminar ni modificar**

> **Nota**: `openspec/specs/` permanece vacío hasta el primer archive. Es el archive quien promueve las delta specs a specs principales.

Reglas:
- NUNCA archivar con CRITICAL issues en verify-report
- Si merge sería destructivo (elimina secciones grandes) → WARN y pedir confirmación

---

→ [Quick Start](./quick-start.md) | [Pipeline SDD](./sdd-pipeline.md) | [Avanzado](./advanced.md)
