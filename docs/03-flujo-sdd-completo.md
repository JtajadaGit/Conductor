# 🔄 Flujo SDD Completo (Spec-Driven Development)

[← Volver al README](../README.md) | [← Arquitectura](./02-arquitectura.md)

---

## 1. ¿Qué es SDD?

**Spec-Driven Development** (Desarrollo Dirigido por Especificaciones) es la capa de planificación estructurada de Conductor. Su principio fundamental: **todo cambio sustancial se planifica antes de codificarse**.

En lugar de que un agente de IA reciba una instrucción vaga y escriba código directamente, SDD descompone el trabajo en fases secuenciales donde cada fase produce un artefacto que alimenta a las siguientes:

```
Idea del usuario
    → Exploración (entender el problema)
        → Propuesta (qué vamos a hacer)
            → Especificaciones (qué debe cumplir)
            → Diseño técnico (cómo se implementa)
                → Tareas (checklist detallado)
                    → Implementación (escribir código)
                        → Verificación (¿cumple las specs?)
                            → Archivo (cerrar y documentar)
```

Cada fase la ejecuta un **sub-agente especializado** con instrucciones optimizadas y el modelo de IA apropiado. El orquestador coordina la secuencia, pasa los artefactos entre fases y presenta los resultados al usuario.

---

## 2. Grafo de Dependencias

El pipeline SDD sigue un DAG (grafo acíclico dirigido) donde cada fase depende de las anteriores:

```
                      ┌─────────┐
                      │ explore │ (opcional)
                      └────┬────┘
                           │
                           ▼
                      ┌─────────┐
                      │ propose │
                      └────┬────┘
                           │
                ┌──────────┴──────────┐
                ▼                     ▼
           ┌─────────┐          ┌─────────┐
           │  spec   │          │ design  │    ← paralelos
           └────┬────┘          └────┬────┘
                │                    │
                └─────────┬──────────┘
                          ▼
                      ┌─────────┐
                      │  tasks  │
                      └────┬────┘
                           │
                           ▼
                      ┌─────────┐
                      │  apply  │ (puede correr en batches)
                      └────┬────┘
                           │
                           ▼
                      ┌─────────┐
                      │ verify  │
                      └────┬────┘
                           │
                           ▼
                      ┌─────────┐
                      │ archive │
                      └─────────┘
```

**Forma compacta:**

```
  proposal ──▶ spec ────┐
      │                 ├──▶ tasks ──▶ apply ──▶ verify ──▶ archive
      └────▶ design ────┘
```

---

## ¿Cuándo usar SDD vs Delegación Directa?

No toda tarea necesita el flujo SDD completo. Conductor soporta dos modos de trabajo:

### Delegación Directa (1 premium request)

Para tareas pequeñas y mecánicas que no requieren planificación:

- Corregir un bug puntual
- Añadir un campo a un modelo
- Actualizar una dependencia
- Refactorizar nombres de variables
- Responder una pregunta sobre el código

**Criterio**: Si el cambio toca ≤2 archivos y es mecánico (no requiere decisiones de diseño), usa delegación directa.

```
Tú: "Añade el campo email al modelo User en src/models/user.ts"
→ El orquestador delega a un sub-agente → 1 premium request
```

### Flujo SDD (2-15 premium requests)

Para cambios que requieren planificación, diseño o afectan múltiples componentes:

- Features nuevas
- Refactors que tocan múltiples módulos
- Cambios arquitectónicos
- Integraciones con servicios externos

**Criterio**: Si el cambio toca ≥3 archivos, requiere decisiones de diseño, o afecta la arquitectura, usa SDD.

```
Tú: "/sdd-new autenticación-jwt"
→ Flujo completo: explore → propose → spec → design → tasks → apply → verify
```

### Tabla de decisión rápida

| Señal                         | Acción                      | Coste          |
| ----------------------------- | --------------------------- | -------------- |
| Pregunta sobre el código      | Respuesta directa           | 0 requests     |
| Bug puntual, 1-2 archivos     | Delegación directa          | 1 request      |
| Feature pequeña, 3-5 archivos | `/sdd-ff` + apply           | 5-7 requests   |
| Feature mediana               | `/sdd-new` → ciclo completo | 10-15 requests |
| Cambio crítico                | SDD completo                | 10-15 requests |

### Reglas del grafo

- **spec** y **design** pueden ejecutarse en paralelo (ambos dependen solo de proposal)
- **tasks** requiere que tanto spec como design estén completos
- **apply** se ejecuta en batches; cada batch es un sub-agente
- **verify** solo corre después de que apply haya completado las tareas asignadas
- **archive** solo corre si verify pasa (sin issues CRITICAL)

---

## 3. Fase por Fase

### 🔍 Explore

| Atributo               | Valor                                                                                                                |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **Propósito**          | Investigar el codebase, comparar enfoques, clarificar requisitos antes de comprometerse                              |
| **Lee**                | Nada (artefactos previos) — lee código fuente del proyecto directamente                                              |
| **Produce**            | `exploration.md` (solo si está ligado a un cambio nombrado)                                                          |
| **Budget de palabras** | Sin límite estricto (es investigación), pero conciso                                                                 |
| **Modelo**             | sonnet (lectura estructural, no arquitectónica)                                                                      |
| **Reglas clave**       | No modifica código existente. Lee código real, nunca adivina. Si la solicitud es demasiado vaga, pide clarificación. |

**Formato de salida**: Estado actual del sistema, áreas afectadas, enfoques comparados con pros/cons/esfuerzo, recomendación y riesgos.

---

### 📋 Propose

| Atributo               | Valor                                                                                                     |
| ---------------------- | --------------------------------------------------------------------------------------------------------- |
| **Propósito**          | Definir el cambio: intent, alcance, enfoque, riesgos y plan de rollback                                   |
| **Lee**                | Exploración (opcional, si existe)                                                                         |
| **Produce**            | `proposal.md`                                                                                             |
| **Budget de palabras** | < 400 palabras                                                                                            |
| **Modelo**             | opus (decisiones arquitectónicas)                                                                         |
| **Reglas clave**       | Toda propuesta DEBE tener plan de rollback y criterios de éxito. Usar bullet points y tablas sobre prosa. |

**Secciones del artefacto**: Intent, Scope (In/Out), Approach, Affected Areas, Risks, Rollback Plan, Dependencies, Success Criteria.

---

### 📝 Spec

| Atributo               | Valor                                                                                                                                                                |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Propósito**          | Definir QUÉ debe cumplir el código — requisitos y escenarios testables                                                                                               |
| **Lee**                | Propuesta (requerido)                                                                                                                                                |
| **Produce**            | `specs/{domain}/spec.md` (delta specs o spec completo para dominios nuevos)                                                                                          |
| **Budget de palabras** | < 650 palabras                                                                                                                                                       |
| **Modelo**             | sonnet (escritura estructurada)                                                                                                                                      |
| **Reglas clave**       | Formato Given/When/Then obligatorio. Keywords RFC 2119 (MUST, SHALL, SHOULD, MAY). Cada requisito DEBE tener al menos un escenario. Specs describen QUÉ, nunca CÓMO. |

**Tipos de delta**: ADDED Requirements, MODIFIED Requirements, REMOVED Requirements. Si no existe spec previo para el dominio, se crea una spec completa.

---

### 🏛️ Design

| Atributo               | Valor                                                                                                                                    |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Propósito**          | Definir CÓMO se implementará — arquitectura, decisiones técnicas, flujo de datos                                                         |
| **Lee**                | Propuesta (requerido)                                                                                                                    |
| **Produce**            | `design.md`                                                                                                                              |
| **Budget de palabras** | < 800 palabras                                                                                                                           |
| **Modelo**             | opus (decisiones de arquitectura)                                                                                                        |
| **Reglas clave**       | Leer código real antes de diseñar. Cada decisión DEBE tener rationale. Seguir patrones existentes del proyecto. Diagramas ASCII simples. |

**Secciones del artefacto**: Technical Approach, Architecture Decisions (con alternatives y rationale), Data Flow, File Changes (tabla), Interfaces/Contracts, Testing Strategy, Migration/Rollout, Open Questions.

---

### ✅ Tasks

| Atributo               | Valor                                                                                                                                                             |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Propósito**          | Desglosar el cambio en tareas concretas, accionables y verificables                                                                                               |
| **Lee**                | Spec + Design (requeridos)                                                                                                                                        |
| **Produce**            | `tasks.md`                                                                                                                                                        |
| **Budget de palabras** | < 530 palabras                                                                                                                                                    |
| **Modelo**             | sonnet (desglose mecánico)                                                                                                                                        |
| **Reglas clave**       | Cada tarea referencia rutas concretas de archivos. Formato checklist con 1-2 líneas por tarea. Orden por dependencia. Numeración jerárquica (1.1, 1.2, 2.1, ...). |

**Organización por fases**:

```
Phase 1: Foundation / Infrastructure
  └─ Tipos, interfaces, config, dependencias
Phase 2: Core Implementation
  └─ Lógica principal, reglas de negocio
Phase 3: Integration / Wiring
  └─ Conectar componentes, rutas, UI
Phase 4: Testing
  └─ Tests unitarios, integración, e2e
Phase 5: Cleanup (si aplica)
  └─ Documentación, limpiar código muerto
```

---

### 🔨 Apply

| Atributo               | Valor                                                                                                                                                                                  |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Propósito**          | Implementar las tareas escribiendo código real                                                                                                                                         |
| **Lee**                | Tasks + Spec + Design                                                                                                                                                                  |
| **Produce**            | Código implementado + progreso en `tasks.md` (marcas `[x]`)                                                                                                                            |
| **Budget de palabras** | N/A (produce código, no documentación)                                                                                                                                                 |
| **Modelo**             | sonnet (implementación)                                                                                                                                                                |
| **Reglas clave**       | Leer specs antes de implementar (son los criterios de aceptación). Seguir las decisiones del diseño. Marcar tareas como `[x]` conforme se completan. Reportar desviaciones del diseño. |

**Modos de implementación**:
- **Standard**: implementa tareas siguiendo spec y design
- **Strict TDD**: si `strict_tdd: true`, sigue ciclo RED → GREEN → REFACTOR (carga módulo `strict-tdd.md`)

Apply corre en **batches**: el orquestador decide cuántas tareas asignar por batch según el tamaño del feature.

---

### 🔬 Verify

| Atributo               | Valor                                                                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Propósito**          | Validar que la implementación cumple las specs, sigue el diseño y pasa los tests                                                           |
| **Lee**                | Spec + Tasks (+ código implementado)                                                                                                       |
| **Produce**            | `verify-report.md`                                                                                                                         |
| **Budget de palabras** | Sin límite (el reporte debe ser exhaustivo)                                                                                                |
| **Modelo**             | sonnet (validación contra spec)                                                                                                            |
| **Reglas clave**       | SIEMPRE ejecutar tests reales. Un escenario solo es COMPLIANT cuando un test que lo cubre ha PASADO. No corregir issues, solo reportarlos. |

**Checks que ejecuta**:

```
1. Completeness  → ¿Todas las tareas están marcadas [x]?
2. Correctness   → ¿Cada requisito de la spec tiene implementación?
3. Coherence     → ¿Se siguieron las decisiones del diseño?
4. Testing       → Build + Tests + Coverage (ejecución real)
5. Spec Matrix   → Cada escenario mapeado a test + resultado
```

**Severidades**: CRITICAL (debe corregirse antes de archivar), WARNING (debería corregirse), SUGGESTION (nice to have).

**Veredicto final**: PASS | PASS WITH WARNINGS | FAIL.

---

### 📦 Archive

| Atributo               | Valor                                                                                                                                                                         |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Propósito**          | Cerrar el ciclo: sincronizar delta specs a specs principales, mover a archivo                                                                                                 |
| **Lee**                | Todos los artefactos                                                                                                                                                          |
| **Produce**            | `archive-report` + specs principales actualizados                                                                                                                             |
| **Budget de palabras** | N/A (operación mecánica)                                                                                                                                                      |
| **Modelo**             | haiku (copiar y cerrar)                                                                                                                                                       |
| **Reglas clave**       | NUNCA archivar un cambio con issues CRITICAL en verificación. Sincronizar deltas ANTES de mover al archivo. El archivo es un audit trail: nunca modificar cambios archivados. |

**Operaciones**:
1. Merge de delta specs → main specs (`openspec/specs/{domain}/spec.md`)
2. Mover carpeta del cambio → `openspec/changes/archive/YYYY-MM-DD-{change-name}/`
3. Verificar integridad del archivo

---

## 4. Meta-Comandos

Los meta-comandos son atajos que el **orquestador maneja directamente** (NO son skills). Descomponen la solicitud en fases individuales y las ejecutan secuencialmente.

### `/sdd-new <cambio>`

Inicia un cambio nuevo ejecutando exploración + propuesta:

```
/sdd-new add-dark-mode
  → Lanza sdd-explore (investigar codebase)
  → Lanza sdd-propose (crear propuesta)
  → Resultado: propuesta lista para spec/design
```

**Costo**: 2 premium requests.

### `/sdd-continue [cambio]`

Ejecuta la siguiente fase pendiente en la cadena de dependencias:

```
/sdd-continue add-dark-mode
  → Orquestador lee state.yaml
  → Identifica siguiente fase sin completar
  → Lanza esa fase
  → Resultado: una fase más completada
```

**Costo**: 1 premium request por invocación. Ideal para revisar cada artefacto antes de continuar.

### `/sdd-ff <cambio>`

Fast-forward: ejecuta toda la planificación de golpe.

```
/sdd-ff add-dark-mode
  → Lanza sdd-propose
  → Lanza sdd-spec
  → Lanza sdd-design
  → Lanza sdd-tasks
  → Resultado: plan completo listo para implementar
```

**Costo**: 4 premium requests. Es la forma más eficiente de pasar de una idea a un plan listo para `apply`.

> **Importante**: `/sdd-new`, `/sdd-continue` y `/sdd-ff` son meta-comandos que el orquestador resuelve internamente. **NO** se invocan como skills.

---

## 5. Ciclo Completo Walkthrough

Ejemplo paso a paso: "Agregar autenticación de usuarios con JWT".

### Paso 1: Iniciar el cambio

```
Usuario: /sdd-new user-auth
```

**Explore** (sonnet) → investiga el codebase:
- Encuentra la estructura actual de rutas y middleware
- Identifica que no existe sistema de auth
- Compara enfoques: JWT vs sesiones vs OAuth
- Recomienda JWT con refresh tokens

**Propose** (opus) → crea la propuesta:
- Intent: agregar autenticación JWT para proteger endpoints
- Scope: login, register, middleware de validación, refresh tokens
- Out of scope: OAuth, 2FA (futuro)
- Rollback: revertir middleware y eliminar tablas de usuarios

### Paso 2: Planificar (o usar `/sdd-ff`)

```
Usuario: /sdd-ff user-auth
```

**Spec** (sonnet) → escribe requisitos:
- REQ-01: El sistema MUST validar tokens JWT en cada request protegido
- Escenario: GIVEN un usuario autenticado, WHEN envía request con token válido, THEN accede al recurso
- Escenario: GIVEN un token expirado, WHEN envía request, THEN recibe 401

**Design** (opus) → decide la arquitectura:
- Decisión: bcrypt para hashing (vs argon2) — rationale: más portable
- Decisión: middleware Express (vs decoradores) — rationale: patrón existente del proyecto
- File changes: crear `src/auth/`, modificar `src/server.ts`

**Tasks** (sonnet) → desglosa en checklist:
- Phase 1: Crear `src/auth/types.ts`, `src/auth/jwt.ts`
- Phase 2: Implementar `src/auth/middleware.ts`, `src/auth/routes.ts`
- Phase 3: Tests unitarios y de integración
- Phase 4: Documentar endpoints

### Paso 3: Implementar

```
Usuario: /sdd-apply user-auth
```

**Apply** (sonnet) — batch 1: Phase 1 (foundation)
- Crea tipos y utilidades JWT
- Marca tareas 1.1-1.3 como `[x]`

**Apply** (sonnet) — batch 2: Phase 2 (core)
- Implementa middleware y rutas
- Marca tareas 2.1-2.4 como `[x]`

**Apply** (sonnet) — batch 3: Phase 3 (testing)
- Escribe tests unitarios y de integración
- Marca tareas 3.1-3.3 como `[x]`

### Paso 4: Verificar

```
Usuario: /sdd-verify user-auth
```

**Verify** (sonnet) → ejecuta validación completa:
- ✅ 12/12 tareas completas
- ✅ Build: exitoso
- ✅ Tests: 24 passed, 0 failed
- ✅ Spec matrix: 8/8 escenarios COMPLIANT
- **Veredicto: PASS**

### Paso 5: Archivar

```
Usuario: /sdd-archive user-auth
```

**Archive** (haiku) → cierra el ciclo:
- Sincroniza delta specs → `openspec/specs/auth/spec.md`
- Mueve a `openspec/changes/archive/2025-07-14-user-auth/`
- Ciclo SDD completo ✅

---

## 6. Modos de Persistencia

Conductor soporta dos modos de persistencia que determinan dónde se almacenan los artefactos:

### Modo `openspec` (basado en archivos)

```
proyecto/
└── openspec/
    ├── config.yaml              ← Configuración del proyecto
    ├── specs/                   ← Specs principales (source of truth)
    │   └── {domain}/
    │       └── spec.md
    └── changes/                 ← Cambios activos y archivo
        ├── {change-name}/       ← Cambio en progreso
        │   ├── proposal.md
        │   ├── specs/
        │   │   └── {domain}/
        │   │       └── spec.md  ← Delta spec
        │   ├── design.md
        │   ├── tasks.md
        │   ├── verify-report.md
        │   └── state.yaml       ← Estado del DAG
        └── archive/             ← Cambios completados
            └── YYYY-MM-DD-{name}/
```

- Los sub-agentes leen y escriben artefactos directamente del filesystem
- El orquestador pasa rutas de archivos, NO contenido
- El estado se persiste en `state.yaml` para recuperación tras compactación
- Se activa **solo cuando el usuario lo solicita explícitamente**

### Modo `none` (inline)

- Los resultados se devuelven inline en la conversación
- No se crean archivos en el proyecto
- No es posible recuperar estado tras compactación
- Es el modo por defecto

| Aspecto               | `openspec`               | `none`                 |
| --------------------- | ------------------------ | ---------------------- |
| Artefactos            | Archivos en disco        | Inline en conversación |
| Recuperación          | ✅ Vía `state.yaml`       | ❌ Estado perdido       |
| Audit trail           | ✅ Carpeta de archivo     | ❌ No persistente       |
| Archivos del proyecto | Sí (carpeta `openspec/`) | No                     |
| Recomendado para      | Features sustanciales    | Tareas rápidas         |

---

## 7. Artefactos Generados

| Fase    | Artefacto                    | Ubicación (openspec)                                  | Formato                                            |
| ------- | ---------------------------- | ----------------------------------------------------- | -------------------------------------------------- |
| explore | `exploration.md`             | `openspec/changes/{name}/exploration.md`              | Markdown: estado actual, enfoques, recomendación   |
| propose | `proposal.md`                | `openspec/changes/{name}/proposal.md`                 | Markdown: intent, scope, approach, risks, rollback |
| spec    | `spec.md` (delta o completo) | `openspec/changes/{name}/specs/{domain}/spec.md`      | Markdown: requisitos RFC 2119 + escenarios GWT     |
| design  | `design.md`                  | `openspec/changes/{name}/design.md`                   | Markdown: decisiones, data flow, file changes      |
| tasks   | `tasks.md`                   | `openspec/changes/{name}/tasks.md`                    | Markdown: checklist jerárquico por fases           |
| apply   | código + progreso            | Archivos del proyecto + `tasks.md` actualizado        | Código + checklist con `[x]`                       |
| verify  | `verify-report.md`           | `openspec/changes/{name}/verify-report.md`            | Markdown: matrices de compliance, veredicto        |
| archive | specs actualizados           | `openspec/specs/{domain}/spec.md` + carpeta archivada | Specs mergeados + audit trail                      |

---

## 8. State YAML

El archivo `state.yaml` es el mecanismo de persistencia del progreso del DAG. El orquestador lo actualiza después de cada transición de fase.

### Ubicación

```
openspec/changes/{change-name}/state.yaml
```

### Contenido típico

```yaml
change: user-auth
phases:
  explore: done
  propose: done
  spec: done
  design: done
  tasks: done
  apply: in_progress
  verify: pending
  archive: pending
apply_progress:
  total_tasks: 12
  completed_tasks: 8
  current_batch: 3
  batches_completed: 2
last_updated: 2025-07-14T15:30:00Z
```

### Propósito

- **Tracking del DAG**: saber qué fases se han completado y cuáles faltan
- **Recuperación tras compactación**: si el orquestador pierde contexto (por compactación del modelo), puede leer `state.yaml` para saber exactamente dónde quedó el pipeline
- **Progreso de apply**: rastrear batches y tareas completadas dentro de la fase de implementación

---

## 9. Recuperación tras Compactación

La compactación ocurre cuando el contexto de la conversación del orquestador crece demasiado y el modelo lo comprime, potencialmente perdiendo detalles.

### ¿Qué se puede perder?

- Caché de skills del skill registry
- Estado en memoria del progreso del DAG
- Detalles de artefactos previamente leídos

### ¿Qué NO se pierde?

- Artefactos en disco (modo openspec)
- El archivo `state.yaml`
- El skill registry (`.atl/skill-registry.md`)

### Protocolo de recuperación

```
Orquestador detecta pérdida de contexto
    │
    ├── Modo openspec:
    │   ├── Leer openspec/changes/*/state.yaml
    │   ├── Reconstruir estado del DAG
    │   ├── Re-leer skill registry
    │   └── Continuar desde la última fase completada
    │
    └── Modo none:
        ├── No hay estado persistido
        ├── Explicar al usuario que se perdió el contexto
        └── Pedir al usuario que describa dónde estaba
```

### Auto-corrección de skills

Si un sub-agente reporta `skill_resolution` distinto de `injected`, el orquestador detecta que perdió la caché de skills y:

1. Re-lee `.atl/skill-registry.md` inmediatamente
2. Recachea las compact rules
3. Inyecta skills correctamente en todas las delegaciones posteriores

---

## 10. Diagrama del Ciclo Completo

```
Tiempo ──────────────────────────────────────────────────────────────────►

 Usuario    Orquestador    Sub-agentes          Artefactos
 ──────     ───────────    ───────────          ──────────
   │
   │ /sdd-new user-auth
   │──────────►│
   │           │── explore (sonnet) ─────►│
   │           │                          │── lee código
   │           │                          │── compara enfoques
   │           │◄─── exploration.md ──────│     → exploration.md
   │           │
   │           │── propose (opus) ────────►│
   │           │                           │── define scope
   │           │                           │── identifica riesgos
   │           │◄─── proposal.md ──────────│   → proposal.md
   │           │
   │◄──────────│ "Propuesta creada. ¿Continuar?"
   │
   │ /sdd-ff user-auth
   │──────────►│
   │           │── spec (sonnet) ─────────►│
   │           │◄─── specs/auth/spec.md ───│   → spec.md
   │           │
   │           │── design (opus) ─────────►│
   │           │◄─── design.md ────────────│   → design.md
   │           │
   │           │── tasks (sonnet) ─────────►│
   │           │◄─── tasks.md ─────────────│   → tasks.md
   │           │
   │◄──────────│ "Plan completo: 12 tareas en 4 fases"
   │
   │ /sdd-apply user-auth
   │──────────►│
   │           │── apply batch 1 (sonnet) ─►│
   │           │◄─── progreso ──────────────│   → código + [x]
   │           │── apply batch 2 (sonnet) ─►│
   │           │◄─── progreso ──────────────│   → código + [x]
   │           │── apply batch 3 (sonnet) ─►│
   │           │◄─── progreso ──────────────│   → código + [x]
   │           │
   │◄──────────│ "12/12 tareas implementadas"
   │
   │ /sdd-verify user-auth
   │──────────►│
   │           │── verify (sonnet) ────────►│
   │           │                            │── ejecuta tests
   │           │                            │── valida specs
   │           │◄─── verify-report.md ──────│   → verify-report.md
   │           │
   │◄──────────│ "PASS — 8/8 escenarios compliant"
   │
   │ /sdd-archive user-auth
   │──────────►│
   │           │── archive (haiku) ────────►│
   │           │                            │── sync deltas
   │           │                            │── mover a archive/
   │           │◄─── archive-report ────────│   → specs actualizados
   │           │
   │◄──────────│ "Ciclo SDD completo ✅"
   │
```

---

[← Anterior: Arquitectura](./02-arquitectura.md) | [Volver al README](../README.md) | [Siguiente: Catálogo de Skills →](./04-catalogo-skills.md)
