# OpenSpec — Persistencia y Artefactos

OpenSpec es el sistema de persistencia de Conductor: artefactos SDD en disco, recuperación tras compactación, y auditoría de decisiones.

> **Conductor extiende OpenSpec** con phase gates (`state.yaml`), artifact locks, execution logs y sub-agent context injection. Los artefactos base (`specs/`, `changes/`, `config.yaml`) siguen la convención OpenSpec estándar — lo que Conductor añade son las capas de orquestación y control de flujo.

---

## Modos de Persistencia

| Modo | Almacenamiento | Recuperable | Cuándo usar |
|------|---------------|-------------|-------------|
| `openspec` | Filesystem (`openspec/`) | ✅ Sí | Proyectos con múltiples sesiones, equipos, features sustanciales |
| `none` | Inline en conversación | ❌ No | Tareas rápidas, exploración sin compromiso |

`openspec` NO se activa por defecto — solo cuando el usuario lo solicita explícitamente (o durante `/sdd-init`).

---

## Estructura de Directorios

```
openspec/
├── config.yaml                   ← OpenSpec standard (schema, context) + Conductor extensions (x-conductor)
├── context.md                    ← Repo context (stack, arquitectura, entry points) — canónico
├── conventions.md                ← Skills, compact rules, convenciones — generado por skill-registry
├── principles.md                 ← (Conductor ext.) Principios NON-NEGOTIABLE — solo humanos editan
├── lessons-learned.md            ← (Conductor ext.) Lecciones acumulativas entre cambios (append-only)
├── specs/                        ← Fuente de verdad (specs principales)
│   └── {dominio}/
│       └── spec.md
└── changes/
    ├── archive/
    │   └── YYYY-MM-DD-{nombre}/  ← Cambio completado (audit trail, nunca modificar)
    │       ├── state.yaml
    │       ├── proposal.md
    │       ├── specs/
    │       ├── design.md
    │       ├── tasks.md
    │       ├── verify-report.md
    │       └── execution-log.md
    └── {nombre-del-cambio}/      ← Cambio activo
        ├── state.yaml            ← (Conductor ext.) Estado del DAG (sobrevive compactación)
        ├── execution-log.md      ← (Conductor ext.) Log cronológico de fases
        ├── exploration.md        ← (Conductor ext., opcional) de fase explore
        ├── proposal.md
        ├── specs/{dominio}/spec.md  ← Delta spec
        ├── design.md
        ├── tasks.md
        └── verify-report.md
```

---

## config.yaml

Generado por `/sdd-init`. Campos `schema` y `context` son estándar OpenSpec. Todo bajo `x-conductor` es extensión de Conductor.

```yaml
# OpenSpec standard fields
schema: spec-driven

context: |
  Tech stack: Node.js 20, TypeScript, Express
  Architecture: Clean Architecture
  Testing: Vitest + Testing Library

# Conductor extensions
x-conductor:
  strict_tdd: true
  testing:
    test_runner: { command: "npx vitest run", framework: vitest }
    layers:
      unit: { available: true }
      integration: { available: true, tool: "@testing-library/react" }
      e2e: { available: false }
    coverage: { available: true, command: "npx vitest run --coverage" }
    quality:
      linter: { available: true, command: "npx eslint ." }
      type_checker: { available: true, command: "npx tsc --noEmit" }
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

---

## state.yaml

El mecanismo de recuperación del DAG. El orquestador lo actualiza tras cada transición de fase.

```yaml
change: add-user-auth
created: 2026-04-01T10:30:00Z
updated: 2026-04-01T11:45:00Z
mode: openspec
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
| Orquestador | `state.yaml`, git status | `state.yaml` |
| sdd-planner | Artefactos de fases previas, código fuente | Su artefacto de fase |
| sdd-coder | tasks + spec + design + código | Código fuente + `tasks.md [x]` |
| sdd-reviewer | spec + tasks + código | `verify-report.md` |
| sdd-archive | Todos los artefactos | Main specs + archive/ |

Ningún sub-agente lee `state.yaml` — eso es responsabilidad exclusiva del orquestador.

---

## Archivado

Al ejecutar `/sdd-archive`:
1. **Sync delta specs** → `openspec/specs/{domain}/spec.md` (apply order: RENAMED → REMOVED → MODIFIED → ADDED)
2. **Mover** `openspec/changes/{nombre}/` → `openspec/changes/archive/YYYY-MM-DD-{nombre}/`
3. El archive es audit trail — **nunca eliminar ni modificar**

Reglas:
- NUNCA archivar con CRITICAL issues en verify-report
- Si merge sería destructivo (elimina secciones grandes) → WARN y pedir confirmación

---

→ [Quick Start](./quick-start.md) | [Pipeline SDD](./sdd-pipeline.md) | [Avanzado](./advanced.md)
