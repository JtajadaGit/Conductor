# OpenSpec -- Persistencia y artefactos

## Qué es OpenSpec

OpenSpec es el estándar abierto de persistencia que Conductor usa para organizar especificaciones y artefactos en disco. Todos los artefactos del pipeline SDD se guardan en `openspec/`, lo que permite recuperación tras compactación, phase gates, `/sdd-continue` y trazabilidad completa.

Conductor extiende OpenSpec con `state.yaml` (control del DAG), artifact locks, verify phase e instruction files de plataforma. Los campos de extensión se agrupan bajo `x-conductor` en config.yaml.

## Estructura de directorios

```
openspec/
  config.yaml                     Config del proyecto (OpenSpec standard + extensiones Conductor)
  lessons-learned.md              (opcional) Registro append-only de lecciones
  specs/                          Fuente de verdad: specs principales
    {dominio}/
      spec.md
  changes/                        Cambios activos y archivados
    {nombre-del-cambio}/          Cambio activo
      state.yaml                  Estado del DAG (extensión Conductor)
      exploration.md              (opcional) Resultado de explore
      proposal.md                 Propuesta de alto nivel
      specs/{dominio}/spec.md     Delta spec (ADDED/MODIFIED/REMOVED)
      design.md                   Diseño técnico
      tasks.md                    Tareas descompuestas
      questions.md                (opcional) Preguntas de clarify
      verify-report.md            Resultado de verificación
    archive/
      YYYY-MM-DD-{nombre}/        Cambio completado (audit trail, nunca modificar)
```

## config.yaml

Generado por `/sdd-init`. Tiene dos partes: campos OpenSpec estándar y extensiones Conductor.

```yaml
schema: spec-driven

# --- OpenSpec standard ---
context: "Express, TypeScript strict, npm"       # 1 línea, inyectado en prompts
rules:
  specs:
    - Use Given/When/Then format
  tasks:
    - Size tasks for single-session completion

# --- Extensiones Conductor ---
x-conductor:
  stack:
    language: "typescript"
    runtime: "node"
    version: "20.x"
    framework: "express"
    package_manager: "npm"
  monorepo: false
  execution_mode: interactive      # auto | interactive
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
      post_hook_on_fail: retry     # retry | stop | warn
      post_hook_max_retries: 3
      checkpoint_every: 5
    verify:
      test_command: "npx vitest run"
      build_command: "npm run build"
      coverage_threshold: 80
```

### Quién consume qué en config.yaml

| Campo | Consumidor | Propósito |
|---|---|---|
| `context:` | sdd-planner | Inyectado en prompts de artefactos |
| `rules:` | sdd-planner | Restricciones por tipo de artefacto |
| `x-conductor.execution_mode` | Orquestador | Decide auto vs interactive |
| `x-conductor.strict_tdd` | sdd-coder, sdd-reviewer | Activa/desactiva modo TDD |
| `x-conductor.hooks` | sdd-coder, sdd-reviewer | Comandos pre/post apply y verify |
| `x-conductor.testing` | sdd-coder, sdd-reviewer | Test runner, coverage, quality tools |
| `x-conductor.stack` | `/sdd-init`, `/sdd-instructions` | Auto-detección y regeneración |

## state.yaml

Extensión Conductor (no existe en OpenSpec estándar). Controla el progreso del DAG y permite recuperación tras compactación. Cada agente actualiza su propia fase al completarla.

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
  spec: true       # frozen tras completar tasks
  design: true
```

**Artifact locks**: al completar `tasks`, se bloquean `spec` y `design`. Modificarlos requiere desbloqueo explícito y re-ejecución de tasks.

**Recuperación**: tras compactación el orquestador lee `state.yaml` -> reconstruye el DAG -> continúa desde `current_phase`.

## Artefactos del pipeline

| Artefacto | Fase | Contenido |
|---|---|---|
| `exploration.md` | explore | Análisis del codebase relevante |
| `proposal.md` | propose | Enfoque, riesgos, alternativas descartadas |
| `specs/{domain}/spec.md` | spec | Escenarios GIVEN/WHEN/THEN, requisitos, criterios de aceptación |
| `design.md` | design | Arquitectura, ficheros a crear/modificar, dependencias |
| `tasks.md` | tasks | Tareas atómicas marcadas [P]/[S] con ficheros target |
| `verify-report.md` | verify | Resultado PASS/FAIL, tests ejecutados, issues |

## Instruction files

Generados por `/sdd-instructions`. Son ficheros nativos de plataforma con contexto del proyecto (stack, testing, formatting). La plataforma los carga automáticamente según los archivos que el agente está tocando (vía `applyTo` en Copilot, `paths` en Claude Code).

| Ubicación por plataforma | Formato |
|---|---|
| Copilot CLI: `.github/instructions/*.instructions.md` | Markdown con `applyTo` header |
| Claude Code: `.claude/rules/*.md` | Markdown con `paths` frontmatter |

Contenido típico:

| Archivo | Contenido |
|---|---|
| `{framework}.instructions.md` | Stack, arquitectura, directorios, entry points |
| `testing.instructions.md` | Convenciones de testing, patrones de archivos |
| `formatting.instructions.md` | Formato, linting, TypeScript strict |

**Regla de no-duplicación**: instruction files contienen contexto del proyecto. `config.yaml` contiene config del pipeline. Sin duplicación entre ambos.

## Archivado (/sdd-archive)

Tras verify PASS, el orquestador sugiere `/sdd-archive`. Al ejecutarlo:

1. **Sync delta specs** -> `openspec/specs/{domain}/spec.md` (orden: REMOVED -> MODIFIED -> ADDED)
2. **Mover** `openspec/changes/{nombre}/` -> `openspec/changes/archive/YYYY-MM-DD-{nombre}/`
3. **Actualizar instruction files** si verify-report contiene sugerencias
4. El archive es audit trail: nunca eliminar ni modificar

Reglas:

- Nunca archivar con CRITICAL issues en verify-report
- Si merge sería destructivo (elimina secciones grandes) -> advertencia y confirmación
- `openspec/specs/` permanece vacío hasta el primer archive

## Reglas de frontera

| Actor | Puede leer | Puede escribir |
|---|---|---|
| Orquestador | `state.yaml`, git status | Solo lectura (recovery) |
| sdd-planner | Artefactos previos, código fuente | Artefacto de su fase + state.yaml |
| sdd-coder | tasks + spec + design + código | Código + tasks.md [x] + state.yaml |
| sdd-reviewer | spec + tasks + código | verify-report.md + state.yaml |

---

Siguiente: [Quick Start](./quick-start.md) | [Pipeline SDD](./sdd-pipeline.md) | [Avanzado](./advanced.md)
