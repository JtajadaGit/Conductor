# Pipeline SDD -- El pipeline Spec-Driven Development

## DAG completo

```
init? -> [explore?] -> propose -> clarify? -> spec -> design -> tasks -> apply -> verify -> archive?
```

```
              explore  (condicional)
                 |
              propose
                 |
              clarify  (auto-skip si 0 preguntas)
                 |
               spec    (SIEMPRE antes de design)
                 |
              design
                 |
               tasks
                 |
               apply   (batches + fix loop)
                 |
              verify
                 |
              archive  (solo si PASS)
```

## Tabla de fases

| Fase | Agente | Lee | Produce | Budget |
|---|---|---|---|---|
| explore | sdd-planner | código fuente | `exploration.md` | <400 pal |
| propose | sdd-planner | exploration (opcional) | `proposal.md` | <400 pal |
| clarify | sdd-planner | proposal | `questions.md` (si >0) | <300 pal |
| spec | sdd-planner | proposal + questions | `specs/{domain}/spec.md` | <650 pal |
| design | sdd-planner | proposal + spec | `design.md` | <800 pal |
| tasks | sdd-planner | spec + design | `tasks.md` | <530 pal |
| apply | sdd-coder | tasks + spec + design | código + `tasks.md [x]` | -- |
| verify | sdd-reviewer | spec + tasks + código | `verify-report.md` | -- |
| archive | (inline) | todos los artefactos | specs actualizadas | -- |

## Modos de pipeline

| Complejidad | Modo | Agent calls | Descripción |
|---|---|---|---|
| **Trivial/Simple** | Delegación directa | 1 | Directo al coder, sin pipeline SDD |
| **Medium** (scope claro) | Spec-light | 3 | Planner omite proposal -> spec + design + tasks en 1 llamada |
| **Medium** (necesita contexto) | Condensado | 3 | Planner genera proposal + spec + design + tasks en 1 llamada |
| **Large** | Completo | Hasta 7 | Fases individuales secuenciales con gates |

### Spec-light

Request del usuario con >50 palabras, scope, approach y criterios claros. El planner recibe `SPEC_LIGHT: true`, omite proposal y produce directamente spec + design + tasks.

### Condensado (default para medium)

Una sola llamada al planner con `PHASE: fast-forward`. Produce todos los artefactos de planificación. El orquestador no interviene entre fases.

### Completo (para large)

Fases individuales con agent calls separados. Permite gates (clarify, explore) y revisión interactiva entre fases.

## Complexity Gate

El orquestador evalúa complejidad ANTES de actuar:

| Complejidad | Señal | Acción |
|---|---|---|
| **Trivial** | 1-5 líneas, 1-2 archivos, intent claro | Delegación directa. Sin SDD. |
| **Simple** | Scope claro, un solo concern | Delegación directa. Sin SDD. |
| **Medium** | Multi-archivo, necesita diseño, testable | Pipeline condensado (1 planner call) |
| **Large** | Vago, multi-dominio, necesita exploración | Pipeline completo (explore primero) |

## Execution mode

Configurado en `openspec/config.yaml` -> `x-conductor.execution_mode`:

| Modo | Comportamiento |
|---|---|
| **auto** | 0 pausas. Corre todo back-to-back. Solo para en errores. |
| **interactive** | Pausa en 2 puntos: (1) tras planning, antes de apply. (2) tras apply, antes de verify. |

Default: `interactive`.

## Fases detalladas

| Fase | Agente | Qué hace | Input | Output |
|---|---|---|---|---|
| **explore** | planner | Analiza codebase para entender contexto. Solo en large. Skip si input >100 palabras con scope claro. | código fuente | `exploration.md` |
| **propose** | planner | Propuesta de alto nivel: enfoque, riesgos, alternativas descartadas. | exploration (opcional), request | `proposal.md` |
| **clarify** | planner | Preguntas al usuario si hay ambigüedades. Auto-skip si 0 preguntas. | proposal | `questions.md` |
| **spec** | planner | Especificación formal con escenarios GIVEN/WHEN/THEN. SIEMPRE antes de design. | proposal + questions | `specs/{domain}/spec.md` |
| **design** | planner | Diseño técnico: arquitectura, ficheros a crear/modificar, dependencias. | proposal + spec | `design.md` |
| **tasks** | planner | Descomposición en tareas atómicas marcadas [P] (paralelo) o [S] (secuencial). | spec + design | `tasks.md` |
| **apply** | coder | Implementa código por batches, ejecuta hooks, marca tareas [x]. | tasks + spec + design | código + tasks.md [x] |
| **verify** | reviewer | Verifica código contra spec, ejecuta tests y build. | spec + tasks + código | `verify-report.md` |
| **archive** | inline | Promueve delta specs a `openspec/specs/`, mueve a `archive/`. Solo si verify = PASS. | todos los artefactos | specs actualizadas |

La secuencia spec -> design -> tasks es obligatoria (no se puede saltar). En pipeline condensado, el planner las genera en una sola llamada pero mantiene la secuencia lógica.

## Paralelismo en apply

El orquestador evalúa paralelismo en cada apply:

1. Agrupa tareas por dominio funcional (ficheros en mismo directorio = mismo dominio)
2. Si hay 2+ grupos con 2+ tareas y 0 archivos compartidos -> apply paralelo
3. Tareas de integración y tests -> siempre Wave 2 (secuencial)

```
Wave 1 (paralelo):    [P] grupo A    [P] grupo B    [P] grupo C
                      (aislado)      (aislado)      (aislado)
                           |              |              |
Merge:                 merge secuencial de resultados
                                  |
Wave 2 (secuencial):  [S] tasks de integración + tests
```

Máximo recomendado: 4 coders paralelos por wave. No paralelizar si <4 tareas [P] o si hay solapamiento de archivos.

## TDD strict mode

Activación por prioridad: (1) config del agente, (2) `x-conductor.strict_tdd: true` en config.yaml, (3) test runner detectado -> true por defecto.

Ciclo por tarea:

```
SAFETY NET -> RED (test que falla) -> GREEN (mínimo código) -> TRIANGULATE -> REFACTOR
```

Los módulos TDD (`strict-tdd.md`, `strict-tdd-verify.md`) se cargan solo cuando TDD está activo. Si no: 0 tokens consumidos.

## Reglas de skip

| Fase | Condición para skip |
|---|---|
| explore | Input >100 palabras con scope + approach + constraints claros |
| clarify | 0 preguntas detectadas |
| verify fast-path | Sin test runner ni build command -> solo checks estáticos |
| archive | Solo si verify = PASS |

## Error handling

| Señal | Acción del orquestador |
|---|---|
| `requires_human_input: true` | Pausa, muestra al usuario, espera input |
| `status: blocked` | Stop, reporta blocker, sugiere solución |
| `status: partial` | Pregunta: continuar o reintentar |
| Max 2 retries por fase | Escalar al usuario |

---

Siguiente: [Quick Start](./quick-start.md) | [OpenSpec](./openspec.md) | [Avanzado](./advanced.md)
