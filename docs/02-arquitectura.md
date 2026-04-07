# 🏗️ Arquitectura y Modelo de Agentes

[← Volver al README](../README.md)

---

## 1. Visión General

Conductor no es un codebase tradicional: es una **capa de orquestación** que define cómo agentes de IA colaboran para planificar, implementar y verificar cambios en cualquier proyecto de software. No contiene código de aplicación; contiene instrucciones, protocolos y convenciones que convierten a un modelo de lenguaje en un coordinador de equipos de agentes.

La arquitectura se basa en un principio fundamental: **separar la coordinación de la ejecución**. Un agente orquestador mantiene la conversación con el usuario y toma decisiones de alto nivel, mientras que sub-agentes especializados realizan todo el trabajo real — leer código, escribir implementaciones, verificar resultados.

```
              ┌─────────────────────────────────────┐
              │   USUARIO (conversación natural)     │
              └──────────────────┬──────────────────┘
                                 │
                                 ▼
              ┌─────────────────────────────────────┐
              │         ORQUESTADOR (opus)           │
              │  • Mantiene hilo de conversación     │
              │  • Toma decisiones arquitectónicas   │
              │  • Delega TODO el trabajo            │
              │  • Sintetiza resultados              │
              └───┬────────┬────────┬────────┬──────┘
                  │        │        │        │
                  ▼        ▼        ▼        ▼
              ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐
              │explor│ │propos│ │apply │ │verify│
              │(sonn)│ │(opus)│ │(sonn)│ │(sonn)│
              └──────┘ └──────┘ └──────┘ └──────┘
              Sub-agentes: contexto fresco, sin memoria
```

---

## 2. Patrón Agent Teams

### ¿Qué es Agent Teams?

Agent Teams es el patrón de diseño central de Conductor. Define una arquitectura de dos capas:

- **Capa de coordinación** — un único orquestador que mantiene la conversación con el usuario.
- **Capa de ejecución** — múltiples sub-agentes que nacen sin contexto, ejecutan una tarea específica y devuelven un resultado estructurado.

### Rol del Orquestador

El orquestador es un **COORDINADOR, no un ejecutor**. Su único trabajo es:

1. Mantener un hilo de conversación delgado con el usuario
2. Delegar TODO el trabajo real a sub-agentes especializados
3. Sintetizar los resultados de los sub-agentes
4. Tomar decisiones de alto nivel (qué hacer, en qué orden, con qué modelo)

El orquestador **jamás** lee código fuente, escribe implementaciones, ejecuta tests ni analiza archivos. Si necesita cualquiera de esas cosas, lanza un sub-agente.

### Sub-agentes: Contexto Fresco y Especializado

Cada sub-agente:

- **Nace sin memoria** — no tiene acceso al historial de conversación del usuario
- **Recibe solo lo necesario** — instrucciones de tarea, estándares del proyecto (pre-inyectados) y rutas a artefactos
- **Ejecuta y retorna** — completa su trabajo y devuelve un sobre estructurado con resultados
- **No lanza otros sub-agentes** — es un ejecutor terminal, no un coordinador

### ¿Por qué este patrón?

| Problema                     | Solución Agent Teams                                                                                         |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------ |
| **Inflación de contexto**    | El orquestador se mantiene delgado; el trabajo pesado ocurre en contextos desechables                        |
| **Pérdida por compactación** | Si el orquestador pierde contexto, puede recuperarlo del filesystem; los sub-agentes son efímeros por diseño |
| **Falta de especialización** | Cada sub-agente recibe instrucciones optimizadas para su fase y el modelo adecuado para su tarea             |
| **Costo descontrolado**      | Trabajo mecánico usa modelos baratos (haiku); decisiones arquitectónicas usan modelos potentes (opus)        |

---

## 3. Reglas de Delegación

### Regla de Parada Total (CERO EXCEPCIONES)

Antes de que el orquestador use herramientas de lectura, edición o escritura sobre archivos de código/configuración:

1. **DETENERSE** — preguntarse: "¿Esto es coordinación o ejecución?"
2. Si es ejecución → **delegar a sub-agente. SIN excepciones por tamaño.**
3. Los ÚNICOS archivos que el orquestador lee directamente son: salida de `git status`/`git log` y estado de tareas.
4. **"Es solo un cambio pequeño" NO es razón válida para saltarse la delegación.**
5. Si el orquestador está a punto de usar Edit o Write en un archivo que no es de estado → eso es un **fallo de delegación**.

### Qué PUEDE hacer el orquestador

| Acción                                                         | Permitido   |
| -------------------------------------------------------------- | ----------- |
| Respuestas cortas al usuario                                   | ✅           |
| Coordinar fases y secuencias                                   | ✅           |
| Mostrar resúmenes                                              | ✅           |
| Pedir decisiones al usuario                                    | ✅           |
| Rastrear estado (git, todos)                                   | ✅           |
| Leer 1-3 archivos para decidir/verificar                       | ✅           |
| Escritura atómica (un archivo, mecánica, ya sabe qué escribir) | ✅           |

### Qué se DELEGA siempre

| Acción                                                          | Delegado                   |
| --------------------------------------------------------------- | -------------------------- |
| Leer 4+ archivos para explorar/entender                         | ✅ → sub-agente             |
| Leer archivos como preparación para escritura                   | ✅ → junto con la escritura |
| Escribir código con análisis (múltiples archivos, lógica nueva) | ✅ → sub-agente             |
| Ejecutar tests, builds, instalaciones                           | ✅ → sub-agente             |
| Análisis de código                                              | ✅ → sub-agente             |

### Anti-patrones (NUNCA hacer esto)

- ❌ **Leer código fuente** "para entender" el codebase inline → delegar una exploración
- ❌ **Escribir código** directamente → delegar
- ❌ **Escribir specs, propuestas o diseños** → delegar a la fase SDD correspondiente
- ❌ **Hacer análisis "rápido"** inline "para ahorrar tiempo" → infla el contexto
- ❌ **Leer archivos como preparación** para luego editar → delegar lectura + edición juntas

---

## 4. Asignación de Modelos

La asignación de modelos es el factor de mayor impacto en el equilibrio calidad-costo del sistema. Cada fase recibe el modelo apropiado para su naturaleza:

| Fase           | Modelo   | Tier               | Razón                                                 |
| -------------- | -------- | ------------------ | ----------------------------------------------------- |
| `orchestrator` | opus     | 🔴 Alta capacidad   | Coordina, toma decisiones de alto nivel               |
| `sdd-propose`  | opus     | 🔴 Alta capacidad   | Decisiones arquitectónicas que afectan todo el cambio |
| `sdd-design`   | opus     | 🔴 Alta capacidad   | Decisiones de arquitectura y trade-offs técnicos      |
| `sdd-explore`  | sonnet   | 🟡 Estándar         | Lee código, análisis estructural — no arquitectónico  |
| `sdd-spec`     | sonnet   | 🟡 Estándar         | Escritura estructurada de requisitos                  |
| `sdd-tasks`    | sonnet   | 🟡 Estándar         | Desglose mecánico de tareas                           |
| `sdd-apply`    | sonnet   | 🟡 Estándar         | Implementación de código                              |
| `sdd-verify`   | sonnet   | 🟡 Estándar         | Validación contra especificaciones                    |
| `sdd-archive`  | haiku    | 🟢 Rápido/económico | Copiar artefactos y cerrar — operación mecánica       |
| `default`      | sonnet   | 🟡 Estándar         | Delegación general no-SDD                             |

### Estrategia de optimización de costos

```
opus  → Solo donde el juicio arquitectónico es crítico
         (una mala decisión de diseño cuesta más que el modelo)

sonnet → Balance óptimo para ejecución que requiere razonamiento
         (implementar código, verificar specs, escribir requisitos)

haiku → Operaciones mecánicas donde el razonamiento es mínimo
         (mover archivos, copiar artefactos, cerrar cambios)
```

Si no hay acceso a opus, el sistema sustituye automáticamente por sonnet. El flujo sigue siendo funcional; las propuestas y diseños serán correctos pero con menor profundidad en el análisis de trade-offs.

> **Nota sobre plataformas**: Los nombres opus/sonnet/haiku son alias de Claude. En GitHub Copilot, se usan los equivalentes por capacidad: modelo de alta capacidad para roles opus, modelo estándar para roles sonnet, modelo rápido/ligero para roles haiku.

---

## 5. Protocolo de Resolución de Skills

Los skills son reglas compactas del proyecto que los sub-agentes necesitan para seguir las convenciones correctas. Sin inyección de skills, un agente que revisa código no conocerá los patrones del framework, y un agente que escribe código no seguirá las convenciones del proyecto.

### Registro de Skills

El registro de skills vive en `.atl/skill-registry.md` en la raíz del proyecto. Contiene:

- **Tabla de User Skills**: nombre del skill, trigger (cuándo aplica), descripción
- **Sección de Compact Rules**: reglas pre-digeridas por skill (5-15 líneas cada una)
- **Project Conventions**: rutas a convenciones específicas del proyecto

Para generar o actualizar el registro: ejecutar el skill `skill-registry` o `sdd-init`.

### Resolución (una vez por sesión)

1. **¿Ya está en caché?** → usar caché
2. **¿Existe `.atl/skill-registry.md`?** → leerlo y cachear la sección Compact Rules + tabla de User Skills
3. **¿No existe?** → advertir al usuario y proceder sin estándares de proyecto

### Matching de Skills

Se hace en DOS dimensiones:

**A. Contexto de código** — ¿qué archivos va a tocar el sub-agente?

| Patrón de archivo      | Skills que matchean         |
| ---------------------- | --------------------------- |
| `.ts`, `.tsx`          | Skills de TypeScript, React |
| `app/**`, `pages/**`   | Skills de framework/routing |
| `*.test.*`, `*.spec.*` | Skills de testing           |
| Archivos de estilo     | Skills de CSS/styling       |

**B. Contexto de tarea** — ¿qué ACCIONES va a realizar?

| Acción del sub-agente   | Matchea skills con triggers que mencionan...  |
| ----------------------- | --------------------------------------------- |
| Crear un PR             | "PR", "pull request"                          |
| Escribir/revisar código | El framework/lenguaje específico              |
| Ejecutar tests          | "test", "testing", "spec"                     |
| Crear issues            | "issue", "epic", "task"                       |

### Inyección en el Sub-agente

Las reglas compactas que matchean se copian TEXTUALMENTE en el prompt del sub-agente:

```markdown
## Project Standards (auto-resolved)

{bloques de compact rules para cada skill que matchea}
```

Esta sección va **ANTES** de las instrucciones específicas de la tarea, para que los estándares estén cargados antes de que el sub-agente comience a trabajar.

**Regla clave**: se inyecta el TEXTO de las compact rules, no rutas. Los sub-agentes NO leen archivos SKILL.md ni el registro — las reglas llegan pre-digeridas.

### Token Budget

- Cada skill inyectado agrega **50-150 tokens** al prompt
- Un flujo típico inyecta **3-5 skills** → ~400-600 tokens de overhead
- Si matchean más de **5 skills**, se conservan solo los 5 más relevantes (priorizando matches de contexto de código sobre contexto de tarea)
- Esto es insignificante comparado con los 5.000-50.000 tokens que el sub-agente lee del código base

### Auto-corrección en Fallback

Los sub-agentes reportan cómo resolvieron sus skills en el campo `skill_resolution` del sobre de retorno:

| Valor               | Significado                                             | Acción del orquestador             |
| ------------------- | ------------------------------------------------------- | ---------------------------------- |
| `injected`          | Recibió `## Project Standards` del orquestador          | ✅ Todo bien                        |
| `fallback-registry` | No recibió estándares, cargó del registro por su cuenta | ⚠️ Re-leer registro inmediatamente |
| `fallback-path`     | No recibió estándares, cargó vía `SKILL: Load`          | ⚠️ Re-leer registro inmediatamente |
| `none`              | No cargó ningún skill                                   | ⚠️ Re-leer registro inmediatamente |

Si el orquestador detecta cualquier valor distinto de `injected`, DEBE:
1. Re-leer el registro de skills inmediatamente (pudo perderse por compactación)
2. Asegurar que TODAS las delegaciones posteriores incluyan `## Project Standards`
3. Notificar al usuario: "Caché de skills perdido — registro recargado para delegaciones futuras"

---

## 6. Diagrama de Flujo de una Delegación

```
  Solicitud del Usuario
          │
          ▼
  ┌─ ORQUESTADOR ──────────────────────────────────┐
  │  1. Interpretar solicitud                       │
  │  2. ¿Delegar o responder directo?               │
  │  3. Si delegar:                                 │
  │     a. Matchear skills (code + task context)    │
  │     b. Seleccionar modelo (tabla de asignación) │
  │     c. Componer prompt: Standards + instrucciones│
  │     d. Lanzar sub-agente                        │
  └────────────────────┬───────────────────────────┘
                       │
                       ▼
  ┌─ SUB-AGENTE (contexto fresco) ─────────────────┐
  │                                                 │
  │  ┌ ## Project Standards (auto-resolved) ┐       │
  │  │ {compact rules inyectadas}           │ Skills│
  │  ├──────────────────────────────────────┤       │
  │  │ Instrucciones de tarea               │ Fase  │
  │  ├──────────────────────────────────────┤       │
  │  │ Rutas a artefactos (si SDD)         │ Deps  │
  │  └─────────────────────────────────────┘       │
  │                                                 │
  │  Ejecuta trabajo → Produce resultado            │
  └────────────────────┬───────────────────────────┘
                       │
                       ▼
  ┌─ SOBRE DE RETORNO ─────────────────────────────┐
  │  • status: success | partial | blocked          │
  │  • executive_summary                            │
  │  • artifacts                                    │
  │  • next_recommended                             │
  │  • risks                                        │
  │  • skill_resolution: injected | fallback | none │
  └────────────────────┬───────────────────────────┘
                       │
                       ▼
  ┌─ ORQUESTADOR ──────────────────────────────────┐
  │  1. Verificar skill_resolution (auto-corrección)│
  │  2. Sintetizar resultado para el usuario        │
  │  3. Decidir siguiente paso                      │
  └────────────────────┬───────────────────────────┘
                       │
                       ▼
  Respuesta al Usuario
```

---

## 7. Contrato de Retorno

Todo sub-agente DEBE devolver un sobre estructurado con estos campos:

| Campo               | Tipo                   | Descripción                                                                         |           |                        |
| ------------------- | ---------------------- | ----------------------------------------------------------------------------------- | --------- | ---------------------- |
| `status`            | `success` \            | `partial` \                                                                         | `blocked` | Estado de la ejecución |
| `executive_summary` | string (1-3 oraciones) | Resumen conciso de lo realizado                                                     |           |                        |
| `detailed_report`   | string (opcional)      | Informe completo de la fase                                                         |           |                        |
| `artifacts`         | lista de rutas/claves  | Artefactos escritos o generados                                                     |           |                        |
| `next_recommended`  | string                 | Siguiente fase SDD recomendada, o "none"                                            |           |                        |
| `risks`             | lista o "None"         | Riesgos descubiertos durante la ejecución                                           |           |                        |
| `skill_resolution`  | string                 | Cómo se cargaron los skills (ver [sección 5](#5-protocolo-de-resolución-de-skills)) |           |                        |

### Ejemplo de sobre

```markdown
**Status**: success
**Summary**: Propuesta creada para `add-dark-mode`. Alcance definido, enfoque seleccionado, plan de rollback documentado.
**Artifacts**: `openspec/changes/add-dark-mode/proposal.md`
**Next**: sdd-spec o sdd-design
**Risks**: None
**Skill Resolution**: injected — 3 skills (typescript, react-patterns, testing)
```

Este contrato es el **único canal de comunicación** entre sub-agentes y orquestador. Los sub-agentes no tienen acceso al historial de conversación ni pueden comunicarse entre sí directamente.

---

## 8. Escalado de Tareas

El orquestador clasifica cada solicitud del usuario y decide el nivel de respuesta apropiado:

| Tamaño de la tarea     | Acción del orquestador                           | Ejemplo                          |
| ---------------------- | ------------------------------------------------ | -------------------------------- |
| **Pregunta simple**    | Responder directamente si lo sabe, delegar si no | "¿Qué versión de Node usamos?"   |
| **Tarea pequeña**      | Delegar a un sub-agente general                  | "Corrige este bug en auth.ts"    |
| **Feature sustancial** | Sugerir flujo SDD: `/sdd-new {nombre}`           | "Agrega autenticación con OAuth" |

### Criterios para SDD

Se recomienda el flujo SDD completo cuando el cambio:

- Toca **múltiples archivos** o dominios
- Requiere **decisiones arquitectónicas** (no solo cambios mecánicos)
- Tiene **riesgos de regresión** que justifican specs y verificación
- Beneficia de un **plan documentado** antes de implementar

Para tareas que no justifican el ciclo SDD completo — correcciones puntuales, refactors pequeños, preguntas de código — el orquestador delega directamente a un sub-agente general con el modelo por defecto (sonnet), costando exactamente **1 premium request**.

---

[← Anterior: Inicio Rápido](./01-inicio-rapido.md) | [Volver al README](../README.md) | [Siguiente: Flujo SDD →](./03-flujo-sdd-completo.md)
