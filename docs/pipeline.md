# Referencia del Pipeline

Referencia técnica del pipeline de desarrollo dirigido por especificación (Spec-Driven Development). Cubre las fases del pipeline, la puerta de complejidad, el bucle de revisión, el modelo de despacho y el modo TDD.

## Vista general del pipeline

El orchestrator despacha tres subagentes especialistas en secuencia:

```
planner --> coder --> reviewer
```

El planner produce artefactos de especificación. El coder implementa a partir de esos artefactos. El reviewer valida la implementación contra la spec. El orchestrator nunca implementa nada directamente.

## Fases

| Fase | Agente | Lee | Escribe | Límite de palabras |
|------|--------|-----|---------|-------------------|
| explore | planner | entry points + ficheros relacionados con la petición | `exploration.md` | 400 |
| propose | planner | exploration (si existe) | `proposal.md` | 400 |
| clarify | planner | proposal | `questions.md` (si >0 preguntas) | 300 |
| spec | planner | proposal + questions | `specs/{domain}/spec.md` | 650/dominio |
| design | planner | proposal + spec | `design.md` | 800 |
| tasks | planner | spec + design | `tasks.md` | 530 |
| apply | coder | tasks + spec + design + instruction files + código fuente | código fuente + `apply-report.md` | -- |
| verify | reviewer | spec + apply-report + código fuente + config.yaml | `verify-report.md` | -- |
| archive | skill `/sdd-archive` (usuario) | todos los artefactos | specs promovidas, directorio de cambio archivado | -- |

## Detalle de cada fase

### explore

Solo se ejecuta en cambios de complejidad alta (complex). En complejidad simple y medium se omite. El planner lee únicamente los entry points y los ficheros relacionados con la petición — nunca recorre el repo completo; el stack ya está descrito en `.github/instructions/`.

### propose

Propuesta de alto nivel que cubre enfoque, riesgos y alternativas descartadas.

### clarify

El planner genera preguntas de clarificación si existen ambigüedades. Se omite automáticamente cuando se detectan 0 preguntas. No es un prompt visible para el usuario en modo auto.

### spec

Especificación formal con escenarios GIVEN/WHEN/THEN y palabras clave RFC 2119 (MUST, SHALL, SHOULD, MAY). Agnóstica de tecnología. Un `spec.md` por dominio. Las delta specs de dominios existentes usan secciones `## ADDED`, `## MODIFIED`, `## REMOVED`.

### design

Diseño técnico: responsabilidades lógicas de componentes, flujo de datos y decisiones arquitectónicas. Sin nombres de clase, sin rutas de fichero, sin términos de framework.

### tasks

Descomposición en tareas atómicas con numeración jerárquica. Cada tarea apunta a áreas lógicas concretas.

### apply

El coder lee la spec (obligatoria), tasks y design. Lee los instruction files para patrones específicos de la plataforma. Implementa código, ejecuta los `pre_hook`/`post_hook` configurados de la fase y escribe `apply-report.md`. Si `strict_tdd: true`, escribe tests antes que código.

### verify

El reviewer lee la spec y el apply-report, luego inspecciona los ficheros fuente listados en el report. Puntúa cada escenario: COMPLIANT, PARTIAL, FAILING o UNTESTED. Ejecuta el comando de test configurado en `config.yaml` con watch-mode desactivado. Escribe `verify-report.md`.

Restricciones del reviewer:

| Acción | Permitida |
|--------|-----------|
| Leer código fuente | Sí |
| Ejecutar comando de test de config.yaml | Sí |
| Editar código fuente | No |
| Crear o modificar ficheros de test | No |
| Instalar dependencias | No |
| Inventar comandos de test | No |

### archive

No es una fase del pipeline automático: es la skill `/sdd-archive`, que el usuario ejecuta tras un PASS. El orchestrator la recomienda al terminar pero no la ejecuta (no escribe ficheros). Promueve las delta specs a `openspec/specs/{domain}/spec.md` en orden: REMOVED, MODIFIED, ADDED, y mueve el directorio de cambio a `openspec/changes/archive/YYYY-MM-DD-{name}/`. El archive es un registro de auditoría y no debe modificarse jamás tras su creación.

## Puerta de complejidad

El orchestrator evalúa la complejidad a partir de la petición del usuario, antes de despachar las fases.

| Complejidad | Señal | Fases que se ejecutan |
|-------------|-------|-----------------------|
| Simple | Alcance claro, un solo concern, pocos ficheros | propose → spec → apply → verify |
| Medium | Multi-fichero, requiere diseño, testeable | propose → spec → design → tasks → apply → verify |
| Complex | Alcance amplio, multi-dominio, necesita exploración | explore → propose → clarify → spec → design → tasks → apply → verify |

## Modo de ejecución

El modo de ejecución se controla con el flag `--auto` en el prompt del usuario.

| Modo | Comportamiento |
|------|----------------|
| `auto` | Sin pausas. Ejecuta todas las fases consecutivamente. Se detiene solo ante errores. |
| `interactive` | Pausa en dos puntos: (1) tras completar la planificación, antes de apply; (2) tras completar apply, antes de verify. |

Por defecto: `interactive`.

## Bucle de revisión

Cuando el reviewer devuelve un veredicto FAIL, el orchestrator despacha al coder en modo fix.

| Paso | Agente | Acción |
|------|--------|--------|
| 1 | reviewer | Escribe `verify-report.md` con veredicto FAIL y lista de issues críticos |
| 2 | orchestrator | Lee verify-report, despacha al coder con `PHASE: fix` |
| 3 | coder | Lee `verify-report.md`, aplica correcciones quirúrgicas a los issues críticos y añade `## Fix Cycle {N}` al `apply-report.md` existente |
| 4 | orchestrator | Despacha al reviewer de nuevo |

El máximo de ciclos de fix lo define `x-conductor.pipeline.max_review_cycles` en `config.yaml` (valor por defecto generado por `/sdd-init`: `2`). Cuando se agotan, el orchestrator se detiene y reporta el bloqueo al usuario.

### Veredictos

| Veredicto | Condición | Siguiente acción |
|-----------|-----------|------------------|
| PASS | 0 issues críticos, conforme a la spec, tests pasan | Recomendar `/sdd-archive` |
| PASS_WARNINGS | 0 issues críticos, warnings presentes | Recomendar `/sdd-archive` |
| FAIL | 1 o más issues críticos | Entrar en ciclo de fix |

## Modelo de despacho

El orchestrator es **secuencial y síncrono**. Cada fase se despacha con `wait: true`: la llamada al subagente bloquea hasta que termina y sus ficheros quedan visibles antes de pasar a la fase siguiente. No hay ejecución en paralelo, ni fan-out, ni background. El orchestrator nunca despacha dos agentes a la vez ni reintenta la misma fase.

## Modo TDD strict

Resolución de `strict_tdd` (la realiza `/sdd-init` al generar `config.yaml`):

1. Si ya existía `openspec/config.yaml` con `x-conductor.strict_tdd` → se preserva su valor.
2. Si se detecta un test runner en el proyecto → `true`.
3. Si no hay test runner → `false`.

Una vez fijado en `config.yaml`, coder y reviewer lo leen desde ahí.

Ciclo por tarea cuando `strict_tdd: true`:

```
RED (test fallido) --> GREEN (código mínimo) --> REFACTOR
```

El coder escribe primero los tests y luego la implementación; el reviewer comprueba en `apply-report.md` que hay evidencia TDD.

## Condiciones de omisión

| Fase | Se omite cuando |
|------|-----------------|
| explore | Complejidad simple o medium (solo corre en complex) |
| clarify | Complejidad simple o medium, o el planner detecta 0 preguntas |
| design | Complejidad simple |
| tasks | Complejidad simple |
| verify (fast-path) | No hay test runner ni build command configurados; solo se ejecutan comprobaciones estáticas |
| archive | El veredicto de verify no es PASS ni PASS_WARNINGS |

## Manejo de errores

| Señal | Acción del orchestrator |
|-------|------------------------|
| Artefacto requerido no aparece tras la fase | `❌ FAIL` y se detiene. Nunca reintenta ni redispatcha la misma fase |
| Artefacto opcional no aparece tras la fase | `⊘ {phase} (skipped)` y se continúa con la siguiente |
| Subagente devuelve `status: blocked` | Detener pipeline y reportar el bloqueo |
| Verify devuelve `FAIL` | Entrar en el bucle de fix (limitado por `max_review_cycles`) |

## Límites de I/O de los agentes

| Agente | Lee | Escribe | Herramientas (frontmatter `tools`) |
|--------|-----|---------|------------------------------------|
| Orchestrator | config.yaml, verify-report, state.yaml, artefactos del cambio | nada (solo lee y despacha) | `read`, `agent`, `search` |
| Planner | artefactos previos, código fuente, instruction files (para contexto) | artefactos de planificación + state.yaml | `read`, `search`, `edit`, `execute` |
| Coder | tasks + spec + design + instruction files + código fuente | código fuente + apply-report.md + state.yaml + checkboxes en tasks.md | `read`, `search`, `edit`, `execute` |
| Reviewer | spec + apply-report + código fuente + config.yaml | verify-report.md + state.yaml | `read`, `search`, `edit`, `execute` |

> El reviewer declara `edit` en `tools` porque necesita escribir `verify-report.md` y `state.yaml`. Su sección `Scope` le prohíbe editar código fuente o ficheros de test.

---

Siguiente lectura: [getting-started.md](getting-started.md) | [openspec.md](openspec.md) | [stacks.md](stacks.md) | [advanced.md](advanced.md)
