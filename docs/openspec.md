# Referencia de persistencia OpenSpec

Referencia técnica de OpenSpec, el estándar de persistencia que Conductor utiliza para organizar especificaciones y artefactos en disco. Todos los artefactos del pipeline residen bajo `openspec/`, lo que permite recuperación tras context compaction, puertas entre fases, continuación del pipeline y trazabilidad completa.

Conductor extiende el estándar base de OpenSpec con `state.yaml` (control del DAG), locks de artefactos, la fase de verify e instruction files de plataforma. Los campos de extensión se agrupan bajo `x-conductor` en config.yaml.

## Estructura de directorios

```
openspec/
  config.yaml                          Configuración del proyecto (estándar + extensiones)
  specs/                               Fuente de verdad (promovida desde cambios completados)
    {domain}/
      spec.md
  changes/                             Cambios activos y archivados
    {change-name}/                     Directorio de cambio activo
      state.yaml                       Estado del pipeline (extensión Conductor)
      exploration.md                   Exploración del proyecto (extensión Conductor)
      proposal.md                      Propuesta de alto nivel
      specs/
        {domain}/
          spec.md                      Delta spec (ADDED / MODIFIED / REMOVED)
      design.md                        Diseño técnico
      tasks.md                         Descomposición de tareas
      apply-report.md                  Report de salida del coder (extensión Conductor)
      verify-report.md                 Report de salida del reviewer (extensión Conductor)
    archive/
      YYYY-MM-DD-{change-name}/        Cambio completado (registro de auditoría, no modificar)
```

`openspec/specs/` permanece vacío hasta que la primera operación de archive promueve delta specs en él.

## Reglas de nombrado

Solo ficheros `.md` para artefactos. Solo `state.yaml` para el estado del pipeline. Sin excepciones.

| Artefacto | Nombre de fichero | Ubicación relativa a la raíz del cambio |
|-----------|-------------------|----------------------------------------|
| Exploration | `exploration.md` | raíz del cambio |
| Proposal | `proposal.md` | raíz del cambio |
| Spec | `spec.md` | `specs/{domain}/` |
| Design | `design.md` | raíz del cambio |
| Tasks | `tasks.md` | raíz del cambio |
| State | `state.yaml` | raíz del cambio |
| Apply report | `apply-report.md` | raíz del cambio |
| Verify report | `verify-report.md` | raíz del cambio |

### Prohibido dentro de openspec/

| Prohibido | Usar en su lugar |
|-----------|------------------|
| Ficheros de spec `.yaml` | `spec.md` (Markdown) |
| Ficheros de tareas `.json` | `tasks.md` (Markdown) |
| `contract.api.yaml` | `spec.md` con GIVEN/WHEN/THEN |
| `README.md` | Nada. Sin READMEs dentro de changes. |
| Mock data, fixtures, ficheros de configuración | Mantener fuera de `openspec/` |
| Ficheros de código | Mantener fuera de `openspec/` |

## Schema de config.yaml

### Campos estándar

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `schema` | string | Siempre `spec-driven` |
| `context` | string | Contexto del proyecto en una línea, inyectado en los prompts de los agentes |
| `rules.specs` | list of strings | Restricciones aplicadas al generar specs |
| `rules.tasks` | list of strings | Restricciones aplicadas al generar tasks |

### Campos de extensión (x-conductor)

| Campo | Tipo | Valor por defecto | Descripción |
|-------|------|-------------------|-------------|
| `x-conductor.stack.language` | string | -- | Lenguaje principal |
| `x-conductor.stack.runtime` | string | -- | Entorno de ejecución |
| `x-conductor.stack.version` | string | -- | Versión del runtime |
| `x-conductor.stack.framework` | string | -- | Framework principal |
| `x-conductor.stack.package_manager` | string | -- | Gestor de paquetes |
| `x-conductor.monorepo` | boolean | `false` | Si el proyecto es un monorepo |
| `x-conductor.strict_tdd` | boolean | `false` | Activa el modo TDD strict para coder y reviewer |
| `x-conductor.testing.test_runner.command` | string | -- | Comando de ejecución de tests |
| `x-conductor.testing.test_runner.framework` | string | -- | Nombre del framework de test |
| `x-conductor.testing.layers.unit` | boolean | `true` | Tests unitarios habilitados |
| `x-conductor.testing.layers.integration` | boolean | `true` | Tests de integración habilitados |
| `x-conductor.testing.layers.e2e` | boolean | `false` | Tests end-to-end habilitados |
| `x-conductor.testing.coverage.available` | boolean | -- | Herramienta de coverage presente |
| `x-conductor.testing.coverage.command` | string | -- | Comando de ejecución de coverage |
| `x-conductor.testing.quality.linter` | string | -- | Herramienta de linter |
| `x-conductor.testing.quality.type_checker` | string | -- | Herramienta de type checker |
| `x-conductor.testing.quality.formatter` | string | -- | Herramienta de formatter |

### Pipeline declarativo (x-conductor.pipeline)

El orchestrator lee la sección `pipeline` y despacha agentes en orden. Cada fase se define como un objeto con los siguientes campos:

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `name` | string | sí | Nombre de la fase (explore, propose, clarify, spec, design, tasks, apply, verify, archive) |
| `agent` | string | sí | Agente responsable (sdd-planner, sdd-coder, sdd-reviewer, orchestrator) |
| `optional` | boolean | sí | Si la fase puede omitirse según la complejidad |
| `artifact` | string | sí | Fichero de salida esperado |
| `max_words` | integer | no | Límite de palabras para el artefacto |
| `pre_hook` | string | no | Comando ejecutado antes de la fase |
| `post_hook` | string | no | Comando ejecutado después de la fase |
| `post_hook_on_fail` | string | no | `retry`, `stop` o `warn` |
| `post_hook_max_retries` | integer | no | Reintentos máximos para post_hook |
| `test_command` | string | no | Comando de test (solo fase verify) |
| `build_command` | string | no | Comando de build (solo fase verify) |
| `coverage_threshold` | integer | no | Porcentaje mínimo de coverage (solo fase verify) |

Campos adicionales a nivel de `pipeline`:

| Campo | Tipo | Valor por defecto | Descripción |
|-------|------|-------------------|-------------|
| `x-conductor.pipeline.max_review_cycles` | integer | `3` | Ciclos máximos de fix antes de marcar como bloqueado |
| `x-conductor.pipeline.agent_timeout_seconds` | integer | `300` | Timeout por agente en segundos |

### Mapa de consumo

| Campo | Leído por | Propósito |
|-------|-----------|-----------|
| `context` | planner | Inyectado en los prompts de artefactos |
| `rules` | planner | Restricciones por tipo de artefacto |
| `x-conductor.strict_tdd` | coder, reviewer | Activar ciclo TDD |
| `x-conductor.pipeline.phases` | orchestrator | Determinar orden, agentes y artefactos de cada fase |
| `x-conductor.pipeline.max_review_cycles` | orchestrator | Límite de ciclos de fix |
| `x-conductor.testing` | coder, reviewer | Test runner, coverage, herramientas de calidad |
| `x-conductor.stack` | init, generadores de instructions | Auto-detección y regeneración |

## Schema de state.yaml

Extensión de Conductor. No forma parte del estándar base de OpenSpec. Registra el progreso del pipeline y permite la recuperación tras context compaction. El **planner** crea y actualiza state.yaml durante las fases de planificación; el **coder** y el **reviewer** lo actualizan al completar sus fases. El **orchestrator nunca escribe ficheros** — solo lee state.yaml para determinar el estado actual.

### Formato (máximo 15 líneas)

```yaml
change: {kebab-name}
status: planning | implementing | reviewing | complete | blocked
complexity: simple | medium | complex
current_phase: {last-phase}
phases:
  explore: done
  propose: done
  clarify: done | skipped
  spec: done
  design: done | skipped
  tasks: done | skipped
  apply: done
  verify: pass | fail
```

Las fases omitidas por complejidad DEBEN marcarse como `skipped`, no eliminarse.
Sin resúmenes, sin métricas, sin hallazgos de exploración. Solo seguimiento de fases.

### Transiciones de estado

| Desde | Hacia | Disparador |
|-------|-------|------------|
| `planning` | `implementing` | El planner completa todos los artefactos de planificación |
| `implementing` | `reviewing` | El coder completa la fase apply |
| `reviewing` | `implementing` | El reviewer devuelve FAIL (ciclo de fix) |
| `reviewing` | `complete` | El reviewer devuelve PASS o PASS_WARNINGS |
| Cualquiera | `blocked` | 3 veredictos FAIL consecutivos, o error irrecuperable |

### Recuperación

Tras un context compaction, el orchestrator lee `state.yaml`, reconstruye el DAG y reanuda desde el estado actual. No se regeneran artefactos de fases ya completadas.

## Formatos de artefactos

### exploration.md (máx 400 palabras)

Exploración del proyecto. Escanea la estructura del proyecto, identifica patrones, restricciones y código existente. Es la **única fase donde se permiten términos técnicos** (nombres de frameworks, rutas de ficheros). Termina con una sección `## Complexity` que clasifica el cambio como simple, medium o complex.

### proposal.md (máx 400 palabras)

Propuesta de alto nivel. Contiene intención, alcance, enfoque, riesgos y alternativas descartadas.

### spec.md (máx 650 palabras por dominio)

Especificación formal. Agnóstica de tecnología. Usa palabras clave RFC 2119.

```
# {Domain} Specification

## Purpose
{Un párrafo describiendo lo que hace este dominio}

## Requirements

### Requirement: {Name} (MUST | SHALL | SHOULD | MAY)

#### Scenario: {Descriptive Name}
- GIVEN {precondición}
- WHEN {acción}
- THEN {resultado}
- AND {resultado adicional}
```

Las delta specs de dominios existentes usan cabeceras de sección: `## ADDED`, `## MODIFIED`, `## REMOVED`.

### design.md (máx 800 palabras)

Diseño técnico. Describe las responsabilidades lógicas de los componentes, el flujo de datos y las decisiones arquitectónicas. Sin nombres de clase, sin rutas de fichero, sin términos específicos de framework.

```
# Design: {change-name}

## Components
{Responsabilidades lógicas}

## Data Flow
{Cómo fluyen los datos entre componentes}

## Decisions
| Decision | Rationale | Alternatives considered |
```

### tasks.md (máx 530 palabras)

Descomposición de tareas con numeración jerárquica. Cada tarea describe qué construir en lenguaje de dominio. Las tareas marcadas `[P]` pueden ejecutarse en paralelo; las marcadas `[S]` deben ejecutarse secuencialmente.

```
## Phase 1: Foundation
- [ ] 1.1 {qué construir}
- [ ] 1.2 {qué construir}

## Phase 2: Core
- [ ] 2.1 {qué construir}
```

### apply-report.md

Escrito por el coder tras implementar. Lista los ficheros creados o modificados, las tareas completadas y cualquier incidencia encontrada. Durante los ciclos de fix, el coder añade `## Fix Cycle {N}` al fichero existente en lugar de crear uno nuevo.

### verify-report.md

Escrito por el reviewer tras la validación. Contiene puntuaciones de conformidad por escenario, resultados de ejecución de tests y un veredicto final (PASS, PASS_WARNINGS o FAIL).

## Proceso de archive

El archive solo se ejecuta cuando el veredicto de verify es PASS o PASS_WARNINGS. Nunca archivar cuando existen issues críticos en verify-report.md.

### Pasos

| Paso | Acción |
|------|--------|
| 1 | Promover delta specs a `openspec/specs/{domain}/spec.md`. Aplicar en orden: REMOVED, luego MODIFIED, luego ADDED. |
| 2 | Mover `openspec/changes/{change-name}/` a `openspec/changes/archive/YYYY-MM-DD-{change-name}/`. |
| 3 | Actualizar instruction files si verify-report contiene sugerencias. |

### Reglas

| Regla | Detalle |
|-------|---------|
| Protección contra merge destructivo | Si la promoción eliminaría secciones grandes de la spec fuente de verdad, requerir confirmación explícita. |
| Archive inmutable | Nunca eliminar ni modificar el contenido de los directorios `archive/`. |
| Directorio specs vacío | `openspec/specs/` permanece vacío hasta que el primer archive promueve en él. |

## Límites de lectura/escritura de los agentes

| Agente | Puede leer | Puede escribir |
|--------|------------|----------------|
| Orchestrator | state.yaml, config.yaml, git status | **nada** — solo lee, nunca escribe ficheros |
| Planner | artefactos previos, código fuente, instruction files (solo contexto) | artefactos de planificación (exploration, proposal, spec, design, tasks) + state.yaml |
| Coder | tasks + spec + design + instruction files + código fuente | código fuente + apply-report.md + state.yaml |
| Reviewer | spec + apply-report + código fuente + config.yaml | verify-report.md + state.yaml |

---

Siguiente lectura: [getting-started.md](getting-started.md) | [pipeline.md](pipeline.md) | [stacks.md](stacks.md) | [advanced.md](advanced.md)
