# 📦 Catálogo de Skills

[← Volver al README](../README.md)

## ¿Qué es una Skill?

Una **Skill** es un conjunto de instrucciones autónomas para agentes de IA. Cada skill define:

- **Qué** debe hacer el agente (propósito)
- **Cuándo** debe activarse (triggers)
- **Cómo** debe ejecutar (reglas, formato de salida, presupuesto de tokens)
- **Qué estándares** seguir (compact rules inyectadas en sub-agentes)

Las skills son **agnósticas a la herramienta** — funcionan en Claude Code, GitHub Copilot, Cursor y cualquier agente compatible. El orquestador carga la skill apropiada según el trigger del usuario o la fase del flujo SDD.

> **Principio clave**: Las skills son instrucciones para agentes, no código ejecutable. Un agente lee la skill, entiende las reglas, y las aplica al trabajar.

---

## Estructura de una Skill

```
skills/{skill-name}/
├── SKILL.md              # Requerido — archivo principal de instrucciones
├── assets/               # Opcional — templates, schemas, ejemplos
│   ├── template.py
│   └── schema.json
└── references/           # Opcional — enlaces a docs locales
    └── docs.md           # Apunta a documentación existente
```

### Anatomía de `SKILL.md`

Cada archivo `SKILL.md` contiene:

1. **Frontmatter YAML** — Metadatos obligatorios:
   ```yaml
   ---
   name: skill-name           # Identificador único (lowercase, guiones)
   description: >
     Descripción de una línea.
     Trigger: Cuándo el agente debe cargar esta skill.
   ---
   ```

2. **Cuerpo Markdown** — Instrucciones estructuradas:
   - `## Purpose` — Qué hace esta skill
   - `## What to Do` — Pasos concretos
   - `## Rules` — Reglas obligatorias (lo que el agente DEBE y NO DEBE hacer)

---

## Tabla Resumen

| Skill            | Trigger                                                | Propósito                                      | Modelo   |
| ---------------- | ------------------------------------------------------ | ---------------------------------------------- | -------- |
| `sdd-init`       | `/sdd-init`, `sdd init`, `iniciar sdd`                 | Bootstrapear contexto SDD                      | sonnet   |
| `sdd-explore`    | Lanzado por orquestador                                | Investigar codebase antes de un cambio         | sonnet   |
| `sdd-propose`    | Lanzado por orquestador                                | Crear propuesta de cambio estructurada         | opus     |
| `sdd-spec`       | Lanzado por orquestador                                | Escribir especificaciones delta con escenarios | sonnet   |
| `sdd-design`     | Lanzado por orquestador                                | Diseño técnico: arquitectura y decisiones      | opus     |
| `sdd-tasks`      | Lanzado por orquestador                                | Desglose de tareas por fase                    | sonnet   |
| `sdd-apply`      | Lanzado por orquestador                                | Implementar código siguiendo specs y diseño    | sonnet   |
| `sdd-verify`     | Lanzado por orquestador                                | Quality gate con ejecución real                | sonnet   |
| `sdd-archive`    | Lanzado por orquestador                                | Sincronizar specs delta y archivar             | haiku    |
| `skill-registry` | `update skills`, `skill registry`, `actualizar skills` | Generar `.atl/skill-registry.md`               | sonnet   |
| `skill-creator`  | Solicitud de crear nueva skill                         | Guía para crear skills con estructura correcta | sonnet   |
| `judgment-day`   | `judgment day`, `juzgar`, `que lo juzguen`             | Revisión adversarial paralela con dos jueces   | opus     |

---

## Skills SDD

Las skills SDD conforman el flujo completo de **Spec-Driven Development**. Cada una representa una fase del ciclo:

```
proposal → specs ──→ tasks → apply → verify → archive
              ↑
            design
```

### sdd-init

| Campo         | Detalle                                                 |
| ------------- | ------------------------------------------------------- |
| **Trigger**   | `/sdd-init`, `sdd init`, `iniciar sdd`, `openspec init` |
| **Propósito** | Bootstrapear el contexto SDD en cualquier proyecto      |
| **Modelo**    | sonnet                                                  |

**Qué hace:**

1. **Detecta el stack técnico** — Lee `package.json`, `go.mod`, `pyproject.toml`, `Cargo.toml`, etc.
2. **Detecta capacidades de testing** — Test runner, capas disponibles (unit/integration/E2E), cobertura, herramientas de calidad (linter, type checker, formatter)
3. **Resuelve Strict TDD Mode** — Cadena de prioridad:
   - Config del agente (`strict-tdd-mode: enabled`) → más alta
   - `openspec/config.yaml` → `strict_tdd` field
   - Si hay test runner detectado → `true` por defecto
   - Sin test runner → `false` (no se puede hacer TDD)
4. **Inicializa persistencia** — Crea estructura `openspec/` con `config.yaml`
5. **Construye skill registry** — Escanea skills y convenciones, genera `.atl/skill-registry.md`

**Output:**

```
openspec/
├── config.yaml              ← Config con stack, testing, strict_tdd
├── specs/                   ← Fuente de verdad (vacío inicialmente)
└── changes/                 ← Cambios activos
    └── archive/             ← Cambios completados
```

---

### sdd-explore

| Campo         | Detalle                                                     |
| ------------- | ----------------------------------------------------------- |
| **Trigger**   | Lanzado por el orquestador                                  |
| **Propósito** | Investigar el codebase antes de comprometerse con un cambio |
| **Modelo**    | sonnet                                                      |

**Qué hace:**

Investiga el código existente, compara enfoques y retorna un análisis estructurado **sin modificar nada**.

**Formato de salida:**

```
Current State       → Cómo funciona el sistema hoy
Affected Areas      → Archivos/módulos impactados
Approaches          → Opciones con pros, contras, esfuerzo
Recommendation      → Enfoque recomendado y justificación
Risks               → Riesgos identificados
```

**Reglas clave:**
- ❌ **NO** modifica código ni archivos existentes
- ✅ **SIEMPRE** lee código real, nunca adivina
- ✅ Persiste como `exploration.md` solo si está vinculado a un cambio nombrado
- El único archivo que puede crear es `exploration.md` dentro de la carpeta del cambio

---

### sdd-propose

| Campo           | Detalle                                |
| --------------- | -------------------------------------- |
| **Trigger**     | Lanzado por el orquestador             |
| **Propósito**   | Crear propuesta de cambio estructurada |
| **Presupuesto** | < 400 palabras                         |
| **Modelo**      | opus                                   |

**Qué hace:**

Toma la exploración (o input directo) y produce un `proposal.md` estructurado.

**Formato de salida:**

| Sección          | Contenido                                                   |
| ---------------- | ----------------------------------------------------------- |
| Intent           | Qué problema resuelve y por qué                             |
| Scope            | In scope (entregables concretos) + Out of scope             |
| Approach         | Estrategia técnica de alto nivel                            |
| Affected Areas   | Tabla con ruta, impacto (New/Modified/Removed), descripción |
| Risks            | Tabla con riesgo, probabilidad, mitigación                  |
| Rollback Plan    | Cómo revertir si algo falla                                 |
| Success Criteria | Criterios medibles de éxito                                 |

**Reglas clave:**
- ✅ **SIEMPRE** incluye rollback plan
- ✅ **SIEMPRE** incluye criterios de éxito
- ✅ Usa rutas de archivo concretas en "Affected Areas"
- Si el proposal ya existe, lo lee y actualiza en lugar de reescribir

---

### sdd-spec

| Campo           | Detalle                                                        |
| --------------- | -------------------------------------------------------------- |
| **Trigger**     | Lanzado por el orquestador                                     |
| **Propósito**   | Escribir especificaciones delta con escenarios Given/When/Then |
| **Presupuesto** | < 650 palabras                                                 |
| **Modelo**      | sonnet                                                         |

**Qué hace:**

Produce **delta specs** — requisitos y escenarios que describen qué se AGREGA, MODIFICA o ELIMINA del comportamiento del sistema.

**Formato de escenarios:**

```markdown
### Requirement: {Nombre}

The system MUST {comportamiento específico}.

#### Scenario: {Happy path}

- GIVEN {precondición}
- WHEN {acción}
- THEN {resultado esperado}
- AND {resultado adicional}
```

**Secciones de delta:**
- `## ADDED Requirements` — Requisitos nuevos
- `## MODIFIED Requirements` — Requisitos existentes modificados (incluye "Previously: ...")
- `## REMOVED Requirements` — Requisitos eliminados (con razón)

**Keywords RFC 2119:**

| Keyword                  | Significado                                            |
| ------------------------ | ------------------------------------------------------ |
| **MUST / SHALL**         | Requisito absoluto                                     |
| **MUST NOT / SHALL NOT** | Prohibición absoluta                                   |
| **SHOULD**               | Recomendado (excepciones justificadas)                 |
| **SHOULD NOT**           | No recomendado (puede ser aceptable con justificación) |
| **MAY**                  | Opcional                                               |

**Reglas clave:**
- ✅ Cada requisito DEBE tener al menos UN escenario
- ✅ Incluir happy path Y edge cases
- ✅ Los escenarios deben ser **testeables** — se debe poder escribir un test automatizado desde cada uno
- ❌ NO incluir detalles de implementación — specs describen QUÉ, no CÓMO

---

### sdd-design

| Campo           | Detalle                                    |
| --------------- | ------------------------------------------ |
| **Trigger**     | Lanzado por el orquestador                 |
| **Propósito**   | Diseño técnico: CÓMO implementar el cambio |
| **Presupuesto** | < 800 palabras                             |
| **Modelo**      | opus                                       |

**Qué hace:**

Produce un `design.md` con decisiones de arquitectura, flujo de datos, cambios de archivos e interfaces.

**Formato de salida:**

| Sección                | Contenido                                                  |
| ---------------------- | ---------------------------------------------------------- |
| Technical Approach     | Estrategia técnica general                                 |
| Architecture Decisions | Decision, Choice, Alternatives, Rationale                  |
| Data Flow              | Diagramas ASCII del flujo de datos                         |
| File Changes           | Tabla: archivo, acción (Create/Modify/Delete), descripción |
| Interfaces / Contracts | Nuevas interfaces, APIs, tipos                             |
| Testing Strategy       | Qué testear por capa (Unit/Integration/E2E)                |
| Migration / Rollout    | Plan de migración si aplica                                |
| Open Questions         | Preguntas técnicas sin resolver                            |

**Reglas clave:**
- ✅ **SIEMPRE** lee el código real antes de diseñar — nunca adivina
- ✅ Cada decisión DEBE tener un rationale (el "por qué")
- ✅ Usa los patrones EXISTENTES del proyecto, no mejores prácticas genéricas
- ✅ Diagramas ASCII simples — claridad sobre estética
- Si encuentra open questions que BLOQUEAN el diseño, lo reporta claramente

---

### sdd-tasks

| Campo           | Detalle                              |
| --------------- | ------------------------------------ |
| **Trigger**     | Lanzado por el orquestador           |
| **Propósito**   | Desglose concreto de tareas por fase |
| **Presupuesto** | < 530 palabras                       |
| **Modelo**      | sonnet                               |

**Qué hace:**

Toma proposal, specs y design, y produce un `tasks.md` con tareas accionables organizadas por fase.

**Fases estándar:**

```
Phase 1: Foundation / Infrastructure
  └─ Tipos, interfaces, cambios de BD, config
  └─ Cosas de las que otras tareas dependen

Phase 2: Core Implementation
  └─ Lógica principal, reglas de negocio
  └─ El corazón del cambio

Phase 3: Integration / Wiring
  └─ Conectar componentes, rutas, UI

Phase 4: Testing
  └─ Unit tests, integration tests, E2E
  └─ Verificar contra escenarios de specs

Phase 5: Cleanup
  └─ Documentación, eliminar código muerto
```

**Criterios de cada tarea:**

| Criterio        | Ejemplo ✅                                                | Anti-ejemplo ❌           |
| --------------- | -------------------------------------------------------- | ------------------------ |
| **Específica**  | "Crear `internal/auth/middleware.go` con validación JWT" | "Agregar auth"           |
| **Accionable**  | "Agregar método `ValidateToken()` a `AuthService`"       | "Manejar tokens"         |
| **Verificable** | "Test: `POST /login` retorna 401 sin token"              | "Verificar que funcione" |
| **Pequeña**     | Un archivo o una unidad lógica                           | "Implementar la feature" |

**Reglas clave:**
- ✅ Numeración jerárquica: 1.1, 1.2, 2.1, 2.2
- ✅ Tareas de Phase 1 NO dependen de Phase 2
- ✅ Cada tarea completable en UNA sesión
- ❌ NUNCA tareas vagas como "implementar feature" o "agregar tests"
- Si el proyecto usa TDD, integra tareas RED → GREEN → REFACTOR

---

### sdd-apply

| Campo         | Detalle                                       |
| ------------- | --------------------------------------------- |
| **Trigger**   | Lanzado por el orquestador                    |
| **Propósito** | Escribir código real siguiendo specs y diseño |
| **Modelo**    | sonnet                                        |

**Qué hace:**

Recibe tareas específicas del `tasks.md` y las implementa escribiendo código. Sigue estrictamente las specs (QUÉ) y el design (CÓMO).

**Flujo de implementación (modo estándar):**

```
FOR EACH TASK:
├── Leer descripción de la tarea
├── Leer escenarios de spec relevantes (criterios de aceptación)
├── Leer decisiones de diseño (restricciones de enfoque)
├── Leer patrones de código existentes (match del estilo)
├── Escribir el código
├── Marcar tarea como completa [x] en tasks.md
└── Notar issues o desviaciones
```

**Integración TDD:**

Cuando `strict_tdd: true` y hay test runner disponible, sdd-apply carga automáticamente el módulo `strict-tdd.md` que **reemplaza** el flujo estándar con el ciclo TDD completo (ver [Modo TDD Estricto](./05-modo-tdd-estricto.md)).

**Carga condicional**: Si TDD no está activo, `strict-tdd.md` **nunca se lee ni se procesa** — cero costo de tokens.

**Reglas clave:**
- ✅ **SIEMPRE** lee specs antes de implementar
- ✅ **SIEMPRE** sigue las decisiones del design
- ✅ Marca tareas `[x]` a medida que avanza, no al final
- ❌ NUNCA implementa tareas que no le fueron asignadas
- Si descubre que el design está incorrecto, lo REPORTA — no desvía silenciosamente

---

### sdd-verify

| Campo         | Detalle                                                                         |
| ------------- | ------------------------------------------------------------------------------- |
| **Trigger**   | Lanzado por el orquestador                                                      |
| **Propósito** | Quality gate con ejecución real — probar que la implementación cumple las specs |
| **Modelo**    | sonnet                                                                          |

**Qué hace:**

Verifica completitud, corrección y coherencia de la implementación ejecutando tests reales.

**Pasos de verificación:**

| Paso                       | Qué verifica                                                      |
| -------------------------- | ----------------------------------------------------------------- |
| Completeness               | ¿Todas las tareas están [x]?                                      |
| Correctness (Estática)     | ¿Cada requisito de spec tiene evidencia estructural en el código? |
| Coherence                  | ¿Se siguieron las decisiones del design?                          |
| Tests Execution            | Ejecuta test runner, captura resultados                           |
| Build & Type Check         | Ejecuta build/type-checker                                        |
| Coverage                   | Ejecuta cobertura si la herramienta está disponible               |
| **Spec Compliance Matrix** | La verificación más importante (ver abajo)                        |

**Spec Compliance Matrix:**

Cruza CADA escenario de spec contra resultados reales de tests:

```
FOR EACH REQUIREMENT:
  FOR EACH SCENARIO:
  ├── Buscar tests que cubran este escenario
  ├── Verificar resultado de ese test en la ejecución
  └── Asignar status:
      ├── ✅ COMPLIANT   → test existe Y pasó
      ├── ❌ FAILING     → test existe PERO falló
      ├── ❌ UNTESTED    → no se encontró test para este escenario
      └── ⚠️ PARTIAL    → test existe y pasa, pero cubre solo parte
```

> Un escenario de spec solo es COMPLIANT cuando hay un test que PASÓ demostrando el comportamiento en runtime. Que el código exista NO es evidencia suficiente.

**Veredictos:**

| Veredicto              | Significado                          |
| ---------------------- | ------------------------------------ |
| **PASS**               | Todo correcto, listo para archivar   |
| **PASS WITH WARNINGS** | Funcional pero con observaciones     |
| **FAIL**               | Issues CRITICAL que deben resolverse |

**Reglas clave:**
- ✅ **SIEMPRE** ejecuta tests — análisis estático solo NO es verificación
- ✅ Compara contra SPECS primero (corrección conductual), DESIGN segundo (corrección estructural)
- ❌ **NO** corrige issues — solo reporta. El orquestador decide qué hacer.
- Cuando Strict TDD está activo, carga `strict-tdd-verify.md` con pasos adicionales obligatorios (ver [Modo TDD Estricto](./05-modo-tdd-estricto.md))

---

### sdd-archive

| Campo         | Detalle                                         |
| ------------- | ----------------------------------------------- |
| **Trigger**   | Lanzado por el orquestador                      |
| **Propósito** | Sincronizar delta specs a main specs y archivar |
| **Modelo**    | haiku                                           |

**Qué hace:**

Completa el ciclo SDD: fusiona las specs delta en la fuente de verdad y mueve el cambio al archivo.

**Proceso:**

1. **Sync delta specs** — Para cada delta spec:
   - Si existe spec principal → aplica delta (ADDED → append, MODIFIED → replace, REMOVED → delete)
   - Si NO existe spec principal → copia directamente como spec nueva
2. **Mover a archive** — `openspec/changes/{name}/ → openspec/changes/archive/YYYY-MM-DD-{name}/`
3. **Verificar** — Confirma que main specs se actualizaron y la carpeta del cambio se movió

**Reglas clave:**
- ❌ **NUNCA** archivar un cambio con issues CRITICAL en su verify-report
- ✅ **SIEMPRE** sincronizar delta specs ANTES de mover al archive
- ✅ PRESERVAR requisitos no mencionados en el delta al fusionar
- El archive es una pista de auditoría — NUNCA eliminar ni modificar cambios archivados
- Si la fusión sería destructiva (eliminando secciones grandes), ADVERTIR al orquestador

---

## Skills de Utilidad

Estas skills no forman parte del flujo SDD pero proveen funcionalidad esencial.

### skill-registry

| Campo         | Detalle                                                                   |
| ------------- | ------------------------------------------------------------------------- |
| **Trigger**   | `update skills`, `skill registry`, `actualizar skills`, `update registry` |
| **Propósito** | Generar `.atl/skill-registry.md` — catálogo de skills con compact rules   |
| **Modelo**    | sonnet                                                                    |

**Qué hace:**

1. **Escanea user skills** — Busca `*/SKILL.md` en directorios globales y de proyecto (skip `sdd-*`, `_shared`, `skill-registry`)
2. **Genera compact rules** — 5-15 líneas por skill con reglas accionables y concisas
3. **Escanea convenciones de proyecto** — `agents.md`, `CLAUDE.md`, `.cursorrules`, `copilot-instructions.md`
4. **Escribe `.atl/skill-registry.md`** — Tabla de skills + compact rules + convenciones

**Output:**

```markdown
# Skill Registry

## User Skills
| Trigger | Skill | Path |
|---------|-------|------|

## Compact Rules
### {skill-name}
- Rule 1
- Rule 2

## Project Conventions
| File | Path | Notes |
|------|------|-------|
```

**Por qué importa:** El registry es la base del [Skill Resolver Protocol](#protocolos-compartidos-_shared). Se construye UNA vez (costoso), y se lee barato en cada delegación.

---

### skill-creator

| Campo         | Detalle                                        |
| ------------- | ---------------------------------------------- |
| **Trigger**   | Cuando el usuario pide crear una nueva skill   |
| **Propósito** | Guía para crear skills con estructura correcta |
| **Modelo**    | sonnet                                         |

**Cuándo crear una skill:**
- ✅ Un patrón se usa repetidamente y la IA necesita guía
- ✅ Convenciones de proyecto difieren de mejores prácticas genéricas
- ✅ Workflows complejos necesitan instrucciones paso a paso
- ❌ La documentación ya existe (crear referencia en su lugar)
- ❌ El patrón es trivial
- ❌ Es una tarea de una sola vez

**Convenciones de nombres:**

| Tipo     | Patrón                       | Ejemplos                         |
| -------- | ---------------------------- | -------------------------------- |
| Genérica | `{technology}`               | `python`, `vitest`, `typescript` |
| Proyecto | `{project}-{component}`      | `myapp-api`, `myapp-ui`          |
| Testing  | `{project}-test-{component}` | `myapp-test-sdk`                 |
| Workflow | `{action}-{target}`          | `skill-creator`                  |

**Checklist:**
- [ ] Skill no existe previamente
- [ ] Patrón es reutilizable
- [ ] Nombre sigue convenciones
- [ ] Frontmatter completo (description incluye trigger)
- [ ] Patrones críticos claros
- [ ] Ejemplos de código mínimos
- [ ] Registrada en el sistema

---

### judgment-day

| Campo         | Detalle                                                                                                         |
| ------------- | --------------------------------------------------------------------------------------------------------------- |
| **Trigger**   | `judgment day`, `judgment-day`, `review adversarial`, `dual review`, `doble review`, `juzgar`, `que lo juzguen` |
| **Propósito** | Revisión adversarial paralela con dos jueces ciegos independientes                                              |
| **Modelo**    | opus (orquestación)                                                                                             |

Documentación completa en [⚖️ Judgment Day — Revisión Adversarial](./06-judgment-day.md).

---

## Protocolos Compartidos (`_shared/`)

Los archivos en `_shared/` son protocolos transversales que las skills SDD y de utilidad referencian.

### skill-resolver.md — Protocolo de Inyección de Skills

Define cómo cualquier agente que delega trabajo DEBE resolver e inyectar skills relevantes en sub-agentes:

1. **Obtener registry** — Leer `.atl/skill-registry.md` (cachear por sesión)
2. **Matchear skills** por dos dimensiones:
   - **Code Context** — extensiones de archivo, rutas → skills de lenguaje/framework
   - **Task Context** — acción del sub-agente → skills relevantes
3. **Inyectar compact rules** — Copiar bloques de compact rules como `## Project Standards (auto-resolved)` en el prompt del sub-agente
4. **Feedback loop** — Sub-agentes reportan `skill_resolution: injected|fallback-registry|fallback-path|none`

> **Budget de tokens:** ~50-150 tokens por skill. Para 3-4 skills típicas, ~400-600 tokens — negligible.

### sdd-phase-common.md — Contrato de Fase

Define las secciones comunes que TODAS las skills SDD siguen:

- **Section A** — Cómo cargar skills relevantes
- **Section B** — Cómo recuperar artefactos según el modo de persistencia
- **Section C** — Cómo persistir artefactos producidos
- **Section D** — Formato del sobre de retorno (`status`, `executive_summary`, `artifacts`, `next_recommended`, `risks`, `skill_resolution`)

### persistence-contract.md — Contrato de Persistencia

Define los modos de almacenamiento de artefactos:

| Modo       | Comportamiento                                    |
| ---------- | ------------------------------------------------- |
| `openspec` | Artefactos en archivos bajo `openspec/`           |
| `none`     | Retornar resultado inline, sin persistir archivos |

### openspec-convention.md — Estructura de Directorio

Define la estructura estándar del directorio `openspec/`:

```
openspec/
├── config.yaml
├── specs/
│   └── {domain}/
│       └── spec.md          ← Fuente de verdad
└── changes/
    ├── {change-name}/
    │   ├── proposal.md
    │   ├── specs/
    │   │   └── {domain}/
    │   │       └── spec.md  ← Delta spec
    │   ├── design.md
    │   ├── tasks.md
    │   └── verify-report.md
    └── archive/
        └── YYYY-MM-DD-{change-name}/
```

---

[← Anterior: Flujo SDD](./03-flujo-sdd-completo.md) | [Volver al README](../README.md) | [Siguiente: Modo TDD →](./05-modo-tdd-estricto.md)
