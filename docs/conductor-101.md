# Conductor 101 -- Tus primeros 15 minutos

## Qué problema resuelve

Sin Conductor, pedirle a una IA que implemente un cambio genera código sin planificación, sin verificación y sin trazabilidad. Con Conductor, cada cambio sigue un pipeline estructurado.

| Sin Conductor | Con Conductor |
|---|---|
| prompt -> código directo | prompt -> spec -> diseño -> tareas -> código -> verificación -> archivo |
| Sin plan, sin tests, sin audit trail | Cada decisión documentada y verificable |

Esto es **Spec-Driven Development (SDD)**: escribir una especificación ANTES del código para que el diseño sea testable y el resultado auditable.

## SDD en un párrafo

SDD es una metodología donde cada cambio comienza con una especificación formal (spec) que define qué debe hacer el sistema. A partir de la spec se genera un diseño técnico, se descompone en tareas, se implementa el código, se verifica contra la spec original y se archiva. Conductor orquesta este pipeline automáticamente usando 3 agentes especializados y persiste todo en formato OpenSpec.

## Los 3 agentes

| Agente | Rol | Analogía |
|---|---|---|
| **sdd-planner** | Explora el código, propone spec, diseño y tareas | El arquitecto |
| **sdd-coder** | Implementa tareas, escribe tests, ejecuta hooks | El desarrollador |
| **sdd-reviewer** | Verifica que el código cumple la spec, ejecuta tests y build | El code reviewer |

El orquestador (Conductor + tú) coordina cuándo actúa cada agente.

## Los 5 comandos esenciales

| Comando | Qué hace |
|---|---|
| `/sdd-init` | Setup inicial: detecta stack, crea `openspec/config.yaml` |
| `/sdd-instructions` | Genera instruction files de testing y formatting para tu plataforma |
| `/sdd-new <nombre>` | Nuevo cambio: evalúa complejidad, elige pipeline automáticamente |
| `/sdd-continue` | Avanza a la siguiente fase pendiente del pipeline |
| `/sdd-archive` | Archiva cambio verificado, promueve delta specs a specs principales |

## Ejemplo completo de un flujo

### Trivial -- "Corrige el null check en utils.ts línea 42"

```
TU: "Corrige el null check en utils.ts línea 42"
ORQUESTADOR: Complejidad trivial -> delegación directa al coder. Sin pipeline SDD.
CODER: Corrige, ejecuta tests. Listo.
```

### Medium -- "Añadir validación de email al formulario de registro"

```
TU: /sdd-new validacion-email

ORQUESTADOR: Complejidad medium -> pipeline condensado (1 llamada al planner)

PLANNER (1 llamada, ~2 min):
  -> spec.md con escenarios GIVEN/WHEN/THEN
  -> design.md con ficheros a modificar
  -> tasks.md con tareas [P] source + [S] tests

CODER (~3 min):
  -> Implementa código + tests
  -> Marca tareas [x] completadas

REVIEWER (~1 min):
  -> Verifica spec vs código
  -> Ejecuta tests + build -> PASS

TU: /sdd-archive -> promueve specs, mueve a archive/
```

### Large -- "Migrar autenticación de sessions a JWT con refresh tokens"

```
TU: /sdd-new migracion-jwt

ORQUESTADOR: Complejidad large -> pipeline completo

PLANNER (explore):    Analiza codebase, genera exploration.md
PLANNER (propose):    Genera proposal.md con enfoque y riesgos
PLANNER (clarify):    Preguntas al usuario (si las hay)
PLANNER (spec):       spec.md formal con escenarios
PLANNER (design):     design.md con arquitectura y ficheros
PLANNER (tasks):      tasks.md con tareas agrupadas

CODER (apply):        Implementa por batches, ejecuta hooks
REVIEWER (verify):    Verifica todo contra spec -> PASS/FAIL

TU: /sdd-archive
```

## Glosario rápido

| Término | Significado |
|---|---|
| **SDD** | Spec-Driven Development -- especificación antes que código |
| **OpenSpec** | Estándar abierto de persistencia para specs en `openspec/` |
| **DAG** | Grafo de dependencias entre fases del pipeline |
| **Condensed** | Modo pipeline para cambios medium: toda la planificación en 1 llamada al planner |
| **Spec-light** | Variante que omite proposal cuando el scope ya está claro (>50 palabras) |
| **Delta spec** | Spec parcial con secciones ADDED/MODIFIED/REMOVED para cambios incrementales |
| **Artifact** | Fichero generado por el pipeline (proposal.md, spec.md, design.md, tasks.md) |
| **Phase gate** | Punto de control entre fases que bloquea si hay inconsistencias |
| **Execution mode** | `auto` (0 pausas) o `interactive` (pausa antes de apply/verify) |

## Siguiente paso

1. [Quick Start](./quick-start.md) -- Instalación y primer uso
2. [Pipeline SDD](./sdd-pipeline.md) -- Referencia detallada de cada fase
3. [OpenSpec](./openspec.md) -- Estructura de ficheros y persistencia
4. [Avanzado](./advanced.md) -- Optimización y troubleshooting
