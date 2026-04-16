# Pipeline SDD — Spec-Driven Development

---

## Grafo de Dependencias

```
init? → [explore?] → propose → clarify? → spec → design → tasks → apply ⟲ fix → verify → archive?
```

```
                  ┌─────────┐
                  │ explore │  (condicional)
                  └────┬────┘
                       │
                  ┌────▼────┐
                  │ propose │
                  └────┬────┘
                       │
                  ┌────▼────┐
                  │ clarify │  (auto-skip si 0 preguntas)
                  └────┬────┘
                       │
                  ┌────▼────┐
                  │  spec   │  ← SIEMPRE antes de design
                  └────┬────┘
                       │
                  ┌────▼────┐
                  │ design  │  (lee spec como input)
                  └────┬────┘
                       │
                  ┌────▼────┐
                  │  tasks  │  (smart task grouping)
                  └────┬────┘
                       │
                  ┌────▼────┐
                  │  apply  │  (batches · fix loop)
                  └────┬────┘
                       │
                  ┌────▼────┐
                  │ verify  │
                  └────┬────┘
                       │
                  ┌────▼────┐
                  │ archive │  (solo si PASS)
                  └─────────┘
```

---

## Modos de Pipeline

| Complejidad | Modo | Agent calls | Descripción |
|-------------|------|-------------|-------------|
| **Medium** (scope claro) | **Spec-light** | 3 | `sdd-planner` (fast-forward + SPEC_LIGHT) → `sdd-coder` → `sdd-reviewer`. Omite proposal. |
| **Medium** (necesita contexto) | **Condensado** | 3 | `sdd-planner` (fast-forward) → `sdd-coder` → `sdd-reviewer` |
| **Large** | **Completo** | Hasta 7 | Fases individuales secuenciales |

### Spec-light (para medium con scope claro)
Cuando el request del usuario tiene >50 palabras con scope, approach y criterios claros → el planner recibe `SPEC_LIGHT: true` y omite la proposal (iría a repetir el request). Produce directamente spec + design + tasks. Ahorra ~400 palabras de artefactos y tokens de planificación.

### Condensado (default para medium)
UNA sola llamada a `sdd-planner` con `PHASE: fast-forward` produce todos los artefactos de planificación (proposal + spec + design + tasks + state.yaml). El orquestador **no** crea directorios, no escribe state.yaml, no lee artefactos entre fases.

### Completo (para large/vago)
Fases individuales con agent calls separados. Permite gates (clarify, explore) y review interactivo.

## Fases — Tabla Resumen

| Fase | Agente | Model tier | Lee | Produce | Budget |
|------|--------|------------|-----|---------|--------|
| **fast-forward** | sdd-planner | high-capability | instruction files (auto) + codebase | todos los artefactos planning | — |
| explore | sdd-planner | standard | código fuente | `exploration.md` | <400 pal |
| propose | sdd-planner | high-capability | exploration (opcional) | `proposal.md` | <400 pal |
| clarify | sdd-planner | standard | proposal (req.) | `questions.md` (si >0) | <300 pal |
| spec | sdd-planner | standard | proposal + questions | `specs/{domain}/spec.md` | <650 pal |
| design | sdd-planner | high-capability | proposal + **spec** (req.) | `design.md` | <800 pal |
| tasks | sdd-planner | standard | spec + design (req.) | `tasks.md` | <530 pal |
| apply | sdd-coder | standard | tasks + spec + design | código + `tasks.md [x]` | — |
| verify | sdd-reviewer | standard | spec + tasks | `verify-report.md` | — |
| archive | (inline) | fast | todos artefactos | specs actualizadas | — |

---

## Hard Stop Rule

El orquestador evalúa complejidad ANTES de actuar:

| Complejidad | Señal | Acción |
|-------------|-------|--------|
| **Trivial** | ≤5 líneas, 1-2 archivos, intent claro | Delega directo. Sin SDD. |
| **Simple** | Scope claro, un solo concern | Delega directo. Sin SDD. |
| **Medio** | Multi-archivo, necesita diseño, testable | Pipeline condensado (1 planner call). |
| **Grande** | Vago, multi-dominio, necesita exploración | Pipeline completo (explore primero). |

`/sdd-new` decide automáticamente qué pipeline usar según la complejidad evaluada.

---

## Execution Mode

Configurado en `openspec/config.yaml` → `x-conductor.execution_mode`. El orquestador lo lee al inicio de cada pipeline — no pregunta al usuario.

| Modo | Comportamiento |
|------|---------------|
| **`auto`** | 0 pausas. Corre todo back-to-back. Solo para en errores (`blocked`, `verify: fail`, `requires_human_input`). |
| **`interactive`** | Pausa en 2 puntos de decisión: (1) tras planning (antes de apply), (2) tras apply (antes de verify). |

Default: `interactive`. Para cambiar: editar `execution_mode: auto` en config.yaml.

---

## Reglas de Skip

| Fase | Condición para skip |
|------|---------------------|
| **explore** | Input >100 palabras con scope + approach + constraints claros → skip |
| **clarify** | 0 preguntas detectadas → auto-skip |
| **verify fast-path** | Sin test runner ni build command → solo checks estáticos |
| **archive** | Solo si verify = PASS (nunca con CRITICAL issues) |

---

## Delegación

### Inline vs Delegate

| Situación | Acción |
|-----------|--------|
| Read/write 1-3 archivos, intent claro | Puede ser inline |
| 4+ archivos, exploración, o lógica multi-step | Siempre delegar |

### Qué se inyecta en cada delegación

1. **Project Standards** — compact rules de `/instructions`
2. **Project Principles** — de `openspec/principles.md` (si existe)
3. **Phase** — instrucciones específicas de la fase
4. **Context** — nombre del cambio, paths de artefactos, modo de persistencia
5. **Return Envelope** — status, summary, artifacts, next, risks

Sub-agentes **no descubren** contexto — se les inyecta. No leen SKILL.md ni el conventions directamente.

---

## Comandos

| Comando | Qué hace |
|---------|----------|
| `/sdd-init` | Bootstrap: detecta stack, crea `openspec/config.yaml` |
| `/instructions` | Genera instruction files por stack: framework, testing, formatting |
| `/sdd-new <name>` | Evalúa complejidad → elige pipeline automáticamente |
| `/sdd-continue` | Siguiente fase pendiente en el DAG |
| `/sdd-status` | Muestra progreso (lee state.yaml) |
| `/sdd-archive` | Sync delta specs → main specs, mover a archive/ |

---

## Modo TDD Estricto

### Activación (cadena de prioridad)

1. Marcador `strict-tdd-mode: enabled` en config del agente → máxima prioridad
2. `x-conductor.strict_tdd: true` en `openspec/config.yaml`
3. Test runner detectado → `true` por defecto
4. Sin test runner → `false` (imposible sin runner)

### Las Tres Leyes

| Ley | Protege contra |
|-----|---------------|
| No escribir código hasta tener un test que falla | Código sin especificación |
| No escribir más test del necesario para que falle | Tests frágiles sobredimensionados |
| No escribir más código del necesario para pasar | Código especulativo innecesario |

### Ciclo por tarea

```
SAFETY NET → RED (test que falla) → GREEN (mínimo código) → TRIANGULATE → REFACTOR
```

Los módulos TDD (`strict-tdd.md`, `strict-tdd-verify.md`) se cargan **solo** cuando TDD está activo. Si no: **0 tokens** consumidos.

---

## Hooks de Validación

Configurados en `openspec/config.yaml` bajo `x-conductor.hooks.apply`:

```yaml
x-conductor:
  hooks:
    apply:
      pre_hook: "npm ci --dry-run"          # Antes de implementar → falla = blocked
      post_hook: "npm run build && tsc --noEmit"  # Después de cada batch
      post_hook_on_fail: retry              # retry | stop | warn
      post_hook_max_retries: 3
      checkpoint_every: 5                   # Cada N tasks (útil para builds lentos)
```

| `post_hook_on_fail` | Comportamiento |
|---------------------|----------------|
| `retry` | Lee error, intenta fix, re-ejecuta (max retries) |
| `stop` | Para, retorna `status: partial` |
| `warn` | Log warning, continúa |

---

## Lessons Learned

`openspec/lessons-learned.md` — registro append-only de lecciones entre cambios.

- `sdd-coder` lo lee **antes** de implementar (evita errores conocidos)
- `sdd-coder` append después de cada fix exitoso
- `sdd-planner` lo lee para informar decisiones de diseño

```markdown
## 2026-04-01 — add-user-auth
### Ecosystem Gotchas
- jsonwebtoken 9.x: async sign required → use promisify
### Design Insights
- Refresh token rotation adds complexity; use simple expiry for MVPs
```

---

## Paralelismo

### Wave-based Apply (parallel coders)

El orquestador evalúa paralelismo en CADA apply:
1. Agrupa tareas por **dominio funcional** (ficheros en mismo directorio/módulo = mismo dominio)
2. **Trigger**: ≥2 grupos con ≥2 tareas cada uno y 0 archivos compartidos → parallel apply
3. Tareas de integración (routing, app config) → siempre en Wave 2 (sequential)

Reglas de marcado `[P]`/`[S]`:
- `[P]`: ficheros source con targets disjuntos y sin dependencia de imports de otra tarea
- `[S]`: ficheros test (SIEMPRE), integración (routing, app config), ficheros que importan output de otra tarea

Cuando se activa paralelismo, el orquestador ejecuta apply en waves:

```
Wave 1 (parallel):   [P] grupo A ──┐    [P] grupo B ──┐    [P] grupo C ──┐
                     (worktree)    │    (worktree)    │    (worktree)    │
                                   ▼                   ▼                   ▼
Merge:               ─────────── merge branches secuencial ──────────────
                                         │
Wave 2 (sequential): ─── [S] tasks + reconciliación tasks.md + state.yaml
```

- **Claude Code**: `run_in_background: true` + `isolation: "worktree"` por coder
- **Copilot CLI**: `/fleet` con wave-based DAG dispatch
- Coders paralelos reciben `PARALLEL_MODE: true` + `TASK_SUBSET: [ids]` — escriben SOLO código
- El coder de Wave 2 reconcilia `tasks.md` (`[x]`) y `state.yaml` (`apply: done`)

### Worktree Lifecycle

| Paso | Responsable | Acción |
|------|-------------|--------|
| Creación | Orquestador | `isolation: "worktree"` en la delegación del coder → la plataforma crea worktree automáticamente |
| Ejecución | sdd-coder | Implementa `TASK_SUBSET` en el worktree aislado; escribe solo ficheros de código |
| Merge | Orquestador | Merge secuencial de branches de worktree a la rama principal |
| Conflictos | Orquestador | Si merge conflict → PAUSA, escalar al usuario |
| Cleanup | Plataforma | Worktrees se limpian automáticamente tras merge exitoso o si el agente no hizo cambios |
| Error | Orquestador | Si coder falla → worktree se preserva para diagnóstico; usuario decide: reintentar o descartar |

**Límites**: máximo recomendado de **4 coders paralelos** por wave. Más allá, el overhead de merge supera el beneficio de velocidad.

**Pre-validación**: antes de lanzar Wave 1, el orquestador DEBE verificar que los `[P]` tasks tienen file sets disjuntos (cruzando con la tabla File Changes de `design.md`). Si hay solapamiento → degradar a ejecución secuencial.

### Otras oportunidades

| Oportunidad | Cómo |
|-------------|------|
| Explore en background | Lanzar explore en background mientras se prepara contexto |
| Cambios independientes | Pipelines separados en paralelo si tocan archivos distintos |

### Cuándo NO paralelizar

- <4 tareas `[P]` (overhead de worktree + merge > ahorro)
- Archivos target se solapan entre grupos
- Usuario eligió modo Interactive (quiere ver cada paso)

**Reglas**:
- Fases de planning (propose → spec → design → tasks): SIEMPRE secuenciales
- verify espera a TODO el apply (parallel + sequential)
- archive espera a verify PASS

---

## Compaction Awareness

Cuando el contexto crece largo, el orquestador guarda estado proactivamente:
1. `state.yaml` actualizado antes de delegaciones grandes
2. Decisiones clave (nombre del cambio, fase actual) recuperables desde artefactos en `openspec/`
3. Tras compactación: relee `state.yaml` y `config.yaml`. Instruction files se auto-cargan por la plataforma.

---

## Trivial Tracking

Incluso cambios triviales/simples (sin pipeline SDD) crean un `state.yaml` mínimo:

```yaml
change: {name}
created: {ISO-8601}
updated: {ISO-8601}
current_phase: done
phases:
  explore: skipped
  propose: skipped
  clarify: skipped
  spec: skipped
  design: skipped
  tasks: skipped
  apply: done
  verify: skipped
  archive: skipped
last_completed_task: ""
locks:
  spec: false
  design: false
```

Esto permite que `/sdd-status` muestre historial de **todos** los cambios, no solo los que pasaron por SDD.

---

## Post-Delegation Validation

Tras CADA delegación de agente, el orquestador valida:

1. **Artefactos esperados** existen en disco (spec, design, tasks, etc.)
2. **state.yaml** tiene campos obligatorios y valores válidos
3. Si faltan artefactos → re-lanza el agente (nunca los escribe inline)
4. Max 2 re-lanzamientos → `status: blocked`, escalar al usuario

---

## Spec Amendments

Mecanismo ligero para ajustes de spec descubiertos durante apply:

1. El coder añade `## Amendments` a `specs/{domain}/spec.md` con formato AMD-001, AMD-002...
2. Impacto `none`/`minor` → coder continúa. Impacto `major` → coder para, orquestador escala.
3. Max 3 amendments minor por apply. Más → indica spec mal hecha, re-planear.
4. El reviewer valida que los amendments estén justificados.
5. Los amendments se preservan en archive para trazabilidad.

---

## Error Handling y Recovery

| Señal | Acción del orquestador |
|-------|------------------------|
| `requires_human_input: true` | PAUSE, mostrar al usuario, esperar input |
| `status: blocked` | STOP, reportar blocker, sugerir path |
| `status: partial` | Preguntar: continuar o reintentar |
| `consistency_block: true` | Bloquear apply, mostrar issues |
| `skill_resolution: none` | Instruction files no encontrados — ejecutar `/sdd-init` + `/instructions` |
| Max 2 retries | Escalar al usuario |

---

→ [Quick Start](./quick-start.md) | [OpenSpec](./openspec.md) | [Avanzado](./advanced.md)
