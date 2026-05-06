# Referencia del Pipeline

Referencia técnica del pipeline de desarrollo dirigido por especificación (Spec-Driven Development). Cubre las fases del pipeline, la puerta de complejidad, el bucle de revisión, el paralelismo y el modo TDD.

## Vista general del pipeline

El orchestrator despacha tres subagentes especialistas en secuencia:

```
planner --> coder --> reviewer
```

El planner produce artefactos de especificación. El coder implementa a partir de esos artefactos. El reviewer valida la implementación contra la spec. El orchestrator nunca implementa nada directamente.

## Fases

| Fase | Agente | Lee | Escribe | Límite de palabras |
|------|--------|-----|---------|-------------------|
| explore | planner | código fuente | `exploration.md` | 400 |
| propose | planner | exploration (si existe) | `proposal.md` | 400 |
| clarify | planner | proposal | `questions.md` (si >0 preguntas) | 300 |
| spec | planner | proposal + questions | `specs/{domain}/spec.md` | 650/dominio |
| design | planner | proposal + spec | `design.md` | 800 |
| tasks | planner | spec + design | `tasks.md` | 530 |
| apply | coder | tasks + spec + design + instruction files + código fuente | código fuente + `apply-report.md` | -- |
| verify | reviewer | spec + apply-report + código fuente + config.yaml | `verify-report.md` | -- |
| archive | orchestrator (inline) | todos los artefactos | specs promovidas, directorio de cambio archivado | -- |

## Detalle de cada fase

### explore

El planner recorre el codebase para comprender el contexto. Solo se ejecuta en cambios de complejidad alta (complex). Se omite cuando la petición del usuario supera las 100 palabras e incluye alcance, enfoque y restricciones.

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

El coder lee la spec (obligatoria), tasks y design. Lee los instruction files para patrones específicos de la plataforma. Implementa código, ejecuta los hooks configurados y escribe `apply-report.md`. Si `strict_tdd: true`, escribe tests antes que código.

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

Solo se ejecuta cuando el veredicto de verify es PASS o PASS_WARNINGS. Promueve las delta specs a `openspec/specs/{domain}/spec.md` en orden: REMOVED, MODIFIED, ADDED. Mueve el directorio de cambio a `openspec/changes/archive/YYYY-MM-DD-{name}/`. El archive es un registro de auditoría y no debe modificarse jamás tras su creación.

## Puerta de complejidad

El orchestrator evalúa la complejidad antes de despachar las fases.

| Complejidad | Señal | Fases que se ejecutan |
|-------------|-------|-----------------------|
| Simple | Alcance claro, un solo concern, pocos ficheros | spec → apply → verify (se omiten clarify, design y tasks) |
| Medium | Multi-fichero, requiere diseño, testeable | spec → design → tasks → apply → verify (se omite clarify) |
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
| 3 | coder | Lee `verify-report.md`, aplica correcciones quirúrgicas (máx 10 líneas por corrección), añade `## Fix Cycle {N}` a `apply-report.md` |
| 4 | orchestrator | Despacha al reviewer de nuevo |

Máximo: 3 ciclos de fix. Tras 3 veredictos FAIL consecutivos, el orchestrator se detiene y reporta el bloqueo al usuario.

### Veredictos

| Veredicto | Condición | Siguiente acción |
|-----------|-----------|------------------|
| PASS | 0 issues críticos, conforme a la spec, tests pasan | Proceder al archive |
| PASS_WARNINGS | 0 issues críticos, warnings presentes | Proceder al archive |
| FAIL | 1 o más issues críticos | Entrar en ciclo de fix |

## Paralelismo en apply

El orchestrator evalúa el paralelismo antes de cada fase de apply.

1. Agrupar tareas por dominio funcional (ficheros en el mismo directorio pertenecen al mismo dominio).
2. Si existen 2+ grupos con 2+ tareas cada uno y 0 ficheros compartidos, despachar instancias paralelas del coder.
3. Las tareas de integración y las de test siempre se ejecutan en Wave 2 (secuencial).

```
Wave 1 (paralelo):     grupo A        grupo B        grupo C
                        (aislado)      (aislado)      (aislado)
                             |              |              |
Merge:                  merge secuencial de resultados
                                    |
Wave 2 (secuencial):   tareas de integración + tests
```

Límites: máximo 4 instancias paralelas del coder por wave. No paralelizar cuando existen menos de 4 tareas o cuando hay ficheros compartidos entre grupos.

## Modo TDD strict

Prioridad de activación (de mayor a menor):

1. Configuración a nivel de agente
2. `x-conductor.strict_tdd: true` en config.yaml
3. Test runner detectado en config.yaml (por defecto activo)

Ciclo por tarea:

```
SAFETY NET --> RED (test fallido) --> GREEN (código mínimo) --> TRIANGULATE --> REFACTOR
```

Los módulos TDD (`strict-tdd.md`, `strict-tdd-verify.md`) se cargan solo cuando TDD está activo. Cuando está inactivo, consumen cero tokens.

## Condiciones de omisión

| Fase | Se omite cuando |
|------|-----------------|
| explore | Complejidad simple o medium |
| propose | Complejidad simple o medium |
| clarify | Complejidad simple o medium, o el planner detecta 0 preguntas |
| design | Complejidad simple |
| tasks | Complejidad simple |
| verify (fast-path) | No hay test runner ni build command configurados; solo se ejecutan comprobaciones estáticas |
| archive | El veredicto de verify no es PASS ni PASS_WARNINGS |

## Manejo de errores

| Señal | Acción del orchestrator |
|-------|------------------------|
| `requires_human_input: true` | Pausar pipeline, mostrar mensaje al usuario, esperar input |
| `status: blocked` | Detener pipeline, reportar bloqueo, sugerir resolución |
| `status: partial` | Preguntar al usuario: continuar o reintentar |
| Superados 2 reintentos por fase | Escalar al usuario |

## Límites de I/O de los agentes

| Agente | Lee | Escribe | Herramientas |
|--------|-----|---------|--------------|
| Orchestrator | config.yaml, verify-report, state.yaml | nada (solo lee y despacha) | read, agent, search |
| Planner | artefactos previos, código fuente, instruction files (para contexto) | artefactos de planificación + state.yaml | read, search, edit, execute, agent |
| Coder | tasks + spec + design + instruction files + código fuente | código fuente + apply-report.md | read, search, edit, execute |
| Reviewer | spec + apply-report + código fuente + config.yaml | verify-report.md | read, search, execute |

---

Siguiente lectura: [getting-started.md](getting-started.md) | [openspec.md](openspec.md) | [stacks.md](stacks.md) | [advanced.md](advanced.md)
