# 🤖 Sub-Agentes y Delegación

[← Volver al README](../README.md) | [← Flujo SDD](./03-flujo-sdd-completo.md)

---

## 1. ¿Qué es un Sub-Agente?

Un sub-agente es un agente de IA independiente lanzado por el orquestador para ejecutar una tarea específica. Cada sub-agente:

- **Nace con contexto fresco** — no tiene acceso al historial de conversación del usuario
- **Es efímero** — existe solo durante la ejecución de su tarea
- **Es un ejecutor** — hace trabajo real (leer código, escribir implementaciones, ejecutar tests)
- **Retorna un sobre estructurado** — su único canal de comunicación con el orquestador
- **No lanza otros sub-agentes** — es un nodo terminal en la cadena de delegación

```
  ┌─ ORQUESTADOR ─────────────────────────────────┐
  │  (coordinador — NO ejecuta trabajo real)       │
  │                                                │
  │  ┌──────────┐  ┌──────────┐  ┌──────────┐     │
  │  │ Sub-agent│  │ Sub-agent│  │ Sub-agent│     │
  │  │ explore  │  │  apply   │  │  verify  │     │
  │  │(efímero) │  │(efímero) │  │(efímero) │     │
  │  └──────────┘  └──────────┘  └──────────┘     │
  │                                                │
  │  Cada uno: contexto fresco, tarea única,       │
  │  retorna resultado, desaparece.                │
  └────────────────────────────────────────────────┘
```

---

## 2. Contexto de un Sub-Agente

Un sub-agente recibe exactamente tres tipos de información al ser lanzado:

### A. Estándares del proyecto (skills inyectados)

```markdown
## Project Standards (auto-resolved)

{bloques de compact rules pre-digeridos del skill registry}
```

Esto le dice al sub-agente qué convenciones seguir: patrones del framework, estilo de código, reglas de testing, etc. Va ANTES de las instrucciones de tarea.

### B. Instrucciones específicas de la tarea

Qué debe hacer: la fase SDD a ejecutar, el nombre del cambio, el modo de persistencia, y cualquier contexto relevante para la tarea específica.

### C. Rutas a artefactos (para fases SDD)

Paths al filesystem donde leer artefactos de fases anteriores:
```
openspec/changes/{change-name}/proposal.md → leer propuesta
openspec/changes/{change-name}/design.md   → leer diseño
```

### Lo que NO recibe

- ❌ Historial de conversación del usuario
- ❌ Resultados de otros sub-agentes
- ❌ Instrucciones del orquestador (CLAUDE.md, copilot-instructions.md)
- ❌ Memoria de sesiones anteriores

---

## 3. Protocolo de Contexto

### Tareas No-SDD (delegación general)

Para tareas que no forman parte del pipeline SDD (correcciones de bugs, refactors puntuales, preguntas de código), el sub-agente recibe:

1. **Skills inyectados** como `## Project Standards (auto-resolved)` — convenciones del proyecto
2. **Instrucciones de tarea** — qué hacer específicamente
3. **Nada más** — sin artefactos, sin dependencias

### Fases SDD (lectura/escritura de artefactos)

Cada fase SDD tiene reglas explícitas de qué artefactos lee y qué artefacto produce:

| Fase          | Lee del backend                   | Escribe artefacto                             |
| ------------- | --------------------------------- | --------------------------------------------- |
| `sdd-explore` | Nada                              | `exploration.md`                              |
| `sdd-propose` | Exploración (si existe, opcional) | `proposal.md`                                 |
| `sdd-spec`    | Propuesta (requerido)             | `specs/{domain}/spec.md`                      |
| `sdd-design`  | Propuesta (requerido)             | `design.md`                                   |
| `sdd-tasks`   | Spec + Design (requeridos)        | `tasks.md`                                    |
| `sdd-apply`   | Tasks + Spec + Design             | Código + progreso en `tasks.md` (`[x]` marks) |
| `sdd-verify`  | Spec + Design + Tasks             | `verify-report.md`                            |
| `sdd-archive` | Todos los artefactos              | `archive-report` + specs actualizados         |

**Regla de acceso**: para fases con dependencias requeridas, el sub-agente lee los artefactos directamente del filesystem. El orquestador pasa las **rutas**, no el contenido — esto evita inflar el contexto del orquestador.

### Instrucciones de persistencia

El orquestador incluye instrucciones explícitas de persistencia en cada lanzamiento:

**Fase con dependencias** (ejemplo: sdd-spec):
```
Artifact store mode: openspec
Read these artifacts from the filesystem before starting:
  openspec/changes/user-auth/proposal.md → full content

PERSISTENCE (MANDATORY — do NOT skip):
After completing your work, write the artifact to the filesystem:
  openspec/changes/user-auth/specs/auth/spec.md
If you return without writing the artifact, the next phase CANNOT
find your output and the pipeline BREAKS.
```

**Fase sin dependencias** (ejemplo: sdd-explore):
```
Artifact store mode: openspec

PERSISTENCE (MANDATORY — do NOT skip):
After completing your work, write the artifact to the filesystem:
  openspec/changes/user-auth/exploration.md
```

---

## 4. Boundary Rules

Los sub-agentes operan bajo reglas de frontera estrictas:

### Son EJECUTORES, no orquestadores

- ✅ Leen código, escriben código, ejecutan comandos
- ✅ Analizan, comparan, investigan
- ✅ Producen artefactos y los persisten
- ❌ NO lanzan otros sub-agentes
- ❌ NO llaman a `delegate` o `task`
- ❌ NO toman decisiones de coordinación
- ❌ NO devuelven trabajo al orquestador diciendo "deberías hacer X"

### Solo reportan vía sobre de retorno

El **único canal de comunicación** sub-agente → orquestador es el sobre de retorno:

```markdown
**Status**: success | partial | blocked
**Summary**: Resumen de 1-3 oraciones
**Artifacts**: lista de artefactos escritos
**Next**: siguiente fase recomendada
**Risks**: riesgos descubiertos
**Skill Resolution**: injected | fallback-registry | fallback-path | none
```

Si un sub-agente encuentra un bloqueante que impide continuar, retorna `status: blocked` con descripción — el orquestador decide qué hacer.

### No se comunican entre sí

Los sub-agentes no tienen canal de comunicación directa. Toda coordinación pasa por el orquestador:

```
Sub-agente A ──resultado──► Orquestador ──instrucciones──► Sub-agente B
                                │
                        (el orquestador decide
                         qué información pasar)
```

---

## 5. Task Tool en GitHub Copilot

En GitHub Copilot (VS Code), la delegación se implementa mediante el **Task Tool**, que ofrece cuatro tipos de agentes:

### Tipos de agentes

| Tipo              | Modelo            | Herramientas                 | Cuándo usarlo                                                                             |
| ----------------- | ----------------- | ---------------------------- | ----------------------------------------------------------------------------------------- |
| `explore`         | Haiku (rápido)    | grep, glob, view, bash       | Buscar archivos, explorar codebase, responder preguntas de código                         |
| `task`            | Haiku (rápido)    | Todas las CLI                | Ejecutar comandos (tests, builds, lints); resumen breve si pasa, output completo si falla |
| `general-purpose` | Sonnet (estándar) | Todas las herramientas       | Tareas complejas multi-paso; capacidad completa de razonamiento                           |
| `code-review`     | —                 | Todas las CLI (solo lectura) | Revisión de cambios; solo reporta bugs/vulnerabilidades/errores lógicos serios            |

### Cuándo usar cada tipo

```
¿Necesito entender código?
  └── SÍ → explore (rápido, paralelizable)

¿Necesito ejecutar un comando y solo me importa si pasa o falla?
  └── SÍ → task (resumen en éxito, detalle en fallo)

¿Necesito hacer cambios complejos con razonamiento completo?
  └── SÍ → general-purpose (Sonnet, todas las herramientas)

¿Necesito revisar calidad de cambios?
  └── SÍ → code-review (no modifica código)
```

### Modos de ejecución

| Modo         | Comportamiento                  | Uso                                           |
| ------------ | ------------------------------- | --------------------------------------------- |
| `sync`       | Espera a que el agente complete | Default para la mayoría de tareas             |
| `background` | Lanza y continúa trabajando     | Para tareas que no bloquean el siguiente paso |

### Ejecución en paralelo

Los agentes `explore` son **seguros de paralelizar**: se pueden lanzar múltiples exploraciones independientes simultáneamente para maximizar eficiencia.

```
Orquestador necesita entender 3 aspectos del codebase:

  explore("¿Cómo funciona el auth?")     ─┐
  explore("¿Qué patrones usan los tests?") ├── en paralelo
  explore("¿Estructura del router?")      ─┘

  → Todos retornan resultados → Orquestador sintetiza
```

Los agentes `task` y `general-purpose` pueden tener efectos secundarios (escribir archivos, instalar dependencias), así que se ejecutan de forma secuencial por seguridad.

### Modelo override

El orquestador puede sobrescribir el modelo default de cualquier agente usando el parámetro `model`. Esto se usa para aplicar la [tabla de asignación de modelos](./02-arquitectura.md#4-asignación-de-modelos):

```
// Fase sdd-propose necesita opus
task(agent_type: "general-purpose", model: "claude-opus-4.6", ...)

// Fase sdd-archive necesita haiku
task(agent_type: "task", model: "claude-haiku-4.5", ...)
```

---

## 6. Delegación en Claude Code

En Claude Code, la delegación se implementa mediante el patrón `delegate (async)`:

```
Orquestador
  │
  ├── delegate(async): sdd-explore
  │     └── Sub-agente ejecuta con skills pre-inyectados
  │     └── Retorna sobre con resultado
  │
  ├── delegate(sync): sdd-propose  ← cuando necesita el resultado antes de continuar
  │     └── Sub-agente ejecuta
  │     └── Retorna y orquestador continúa inmediatamente
  │
  └── ...
```

### `async` vs `sync`

- **`delegate (async)`** — default para trabajo delegado. El orquestador no espera activamente.
- **`task (sync)`** — cuando el orquestador necesita el resultado antes de su siguiente acción (ejemplo: leer resultado de verify para decidir si archivar).

### Reglas de delegación en Claude Code

Las reglas son más matizadas que en Copilot, con un enfoque basado en "¿esto infla mi contexto sin necesidad?":

| Acción                                                    | Inline   | Delegar                  |
| --------------------------------------------------------- | -------- | ------------------------ |
| Leer para decidir/verificar (1-3 archivos)                | ✅        | —                        |
| Leer para explorar/entender (4+ archivos)                 | —        | ✅                        |
| Leer como preparación para escritura                      | —        | ✅ junto con la escritura |
| Escritura atómica (un archivo, mecánica, ya sabe qué)     | ✅        | —                        |
| Escritura con análisis (múltiples archivos, lógica nueva) | —        | ✅                        |
| Bash para estado (git, gh)                                | ✅        | —                        |
| Bash para ejecución (test, build, install)                | —        | ✅                        |

---

## 7. Skill Loading en Sub-Agentes

Los sub-agentes siguen una cadena de resolución de 4 pasos para cargar los estándares del proyecto:

### Cadena de resolución (en orden de prioridad)

```
1. ¿Existe bloque "## Project Standards (auto-resolved)" en el prompt?
   │
   ├── SÍ → Seguir esas reglas. NO leer ningún SKILL.md.
   │         Reportar skill_resolution: "injected"
   │         (Este es el camino ideal)
   │
   └── NO → Paso 2
            │
            2. ¿Existen instrucciones "SKILL: Load" en el prompt?
               │
               ├── SÍ → Cargar esos archivos de skill específicos.
               │         Reportar skill_resolution: "fallback-path"
               │
               └── NO → Paso 3
                        │
                        3. ¿Existe .atl/skill-registry.md en la raíz?
                           │
                           ├── SÍ → Leer registry, aplicar compact rules
                           │         que matcheen la tarea actual.
                           │         Reportar skill_resolution: "fallback-registry"
                           │
                           └── NO → Paso 4
                                    │
                                    4. Proceder sin skills del proyecto.
                                       Reportar skill_resolution: "none"
```

### Prioridad importante

- Si `## Project Standards` está presente, IGNORAR cualquier instrucción `SKILL: Load` — son redundantes
- La búsqueda en el registry (paso 3) NO es delegación — es carga de skills dentro del propio sub-agente
- Los sub-agentes **NUNCA** leen archivos SKILL.md individuales directamente — las reglas llegan pre-digeridas

### Reporte de resolución

Todo sub-agente DEBE incluir en su sobre de retorno:

```markdown
**Skill Resolution**: injected — 3 skills (typescript, react-patterns, testing)
```

O en caso de fallback:

```markdown
**Skill Resolution**: fallback-registry — loaded 2 skills from .atl/skill-registry.md
```

El orquestador usa este reporte para su [mecanismo de auto-corrección](./02-arquitectura.md#5-protocolo-de-resolución-de-skills).

---

## 8. Modos de Trabajo

### Interactivo

El usuario dirige cada paso, revisando artefactos entre fases:

```
Usuario: /sdd-propose user-auth
Orquestador: [muestra propuesta]
Usuario: Modifica el alcance para incluir OAuth
Orquestador: [re-ejecuta propose]
Usuario: /sdd-continue user-auth
Orquestador: [ejecuta spec]
...
```

**Ventaja**: control total sobre cada artefacto antes de avanzar.
**Costo**: más turnos de orquestador, más tokens de conversación.

### Fast-Forward

El usuario delega toda la planificación al orquestador:

```
Usuario: /sdd-ff user-auth
Orquestador: [ejecuta propose → spec → design → tasks en secuencia]
              "Plan completo listo: 12 tareas en 4 fases"
```

**Ventaja**: de idea a plan ejecutable en una sola interacción.
**Costo**: 4 premium requests con overhead mínimo entre fases.

### Batch Apply

El orquestador decide el tamaño de los batches según el feature:

```
Feature simple (6 tareas):
  → 1-2 batches de apply

Feature medio (12 tareas):
  → 2-3 batches de apply

Feature complejo (20+ tareas):
  → 4-5 batches de apply
```

**Batches pequeños**: más requests pero mejor recuperación ante errores — si algo falla, solo se rehace un batch pequeño.

**Batches grandes**: menos requests pero mayor costo de rehacerlo si falla.

Para features de alta incertidumbre técnica, batches pequeños son más económicos a largo plazo.

### Judgment Day

Protocolo de revisión adversarial paralela para cambios de alto impacto:

```
  ┌─ JUDGMENT DAY ─────────────────────────────────┐
  │                                                 │
  │  Round 1:                                       │
  │  ┌──────────┐            ┌──────────┐          │
  │  │ Judge A  │  (ciego)   │ Judge B  │  (ciego) │
  │  │ (sonnet) │            │ (sonnet) │          │
  │  └────┬─────┘            └────┬─────┘          │
  │       └───────────┬───────────┘                │
  │                   ▼                             │
  │          ┌──────────────┐                       │
  │          │  Sintetizar  │                       │
  │          └──────┬───────┘                       │
  │                 ▼                               │
  │          ┌──────────────┐                       │
  │          │  Fix Agent   │                       │
  │          └──────┬───────┘                       │
  │                 ▼                               │
  │  Round 2:                                       │
  │  ┌──────────┐            ┌──────────┐          │
  │  │Re-Judge A│            │Re-Judge B│          │
  │  └──────────┘            └──────────┘          │
  │                                                 │
  │  Resultado: ambos aprueban O escala tras 2 iter │
  └─────────────────────────────────────────────────┘
```

- Los jueces son **ciegos** — no saben qué encontró el otro
- Solo se reportan issues que genuinamente importan: bugs, vulnerabilidades, errores lógicos
- **Costo**: 3-5 requests por round, hasta 8-10 si escala a 2 iteraciones
- **Cuándo usarlo**: cambios de alto impacto, antes de merges a producción

---

## 9. Diagrama de Comunicación

### Flujo completo de comunicación

```
  ┌──────────┐   conversación    ┌─────────────────────────┐
  │          │◄──  natural  ────▶│                         │
  │ USUARIO  │                   │  ORQUESTADOR (opus)     │
  │          │◄── resultados ────│                         │
  └──────────┘   sintetizados    │  • Interpretar intent   │
                                 │  • Resolver skills      │
                                 │  • Seleccionar modelo   │
                                 │  • Lanzar sub-agentes   │
                                 │  • Sintetizar resultados│
                                 └───────────┬─────────────┘
                                             │
               ┌─ CAPA DE EJECUCIÓN ─────────┼────────────────┐
               │                             │                │
               │  SDD (plan)    SDD (impl)   │   General      │
               │  • explore     • apply ×N   │   • bug fixes  │
               │  • propose     • verify     │   • refactors  │
               │  • spec        • archive    │   • preguntas  │
               │  • design                   │                │
               │  • tasks                    │                │
               └─────────────────┬───────────┘────────────────┘
                                 │
               ┌─ CAPA DE DATOS ─┴────────────────────────────┐
               │                                               │
               │  openspec/          .atl/          Código     │
               │  config · specs     skill-registry fuente del │
               │  changes · archive                 proyecto   │
               └───────────────────────────────────────────────┘
```

### Flujo de una delegación típica

```
  1. Usuario pide algo
          │
          ▼
  2. Orquestador interpreta
          │
          ├── ¿Coordinación? ──▶ Responder directo
          │
          └── ¿Ejecución? ──▶ Delegar:
                  │
                  ▼
  3. Resolver skills (caché → registry → fallback)
                  │
                  ▼
  4. Componer prompt: Standards + instrucciones + artefactos
                  │
                  ▼
  5. Lanzar sub-agente (contexto fresco)
                  │
                  ▼
  6. Procesar resultado:
          ├── skill_resolution ≠ "injected"? → re-leer registry
          ├── Sintetizar para el usuario
          └── Decidir siguiente paso
                  │
                  ▼
  7. Responder al usuario
```

---

[← Anterior: Judgment Day](./06-judgment-day.md) | [Volver al README](../README.md) | [Siguiente: Plataformas →](./08-plataformas-compatibles.md)
