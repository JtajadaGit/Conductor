# 📖 Referencia de Comandos

[← Volver al README](../README.md)

Referencia completa de todos los comandos disponibles en Conductor.

---

## Delegación Directa (sin SDD)

Para tareas que no justifican el flujo SDD completo.

| Acción          | Ejemplo                                                   | Requests   |
| --------------- | --------------------------------------------------------- | ---------- |
| Pregunta        | "¿Cómo funciona el auth middleware?"                      | 0          |
| Fix puntual     | "Corrige el null check en utils.ts línea 42"              | 1          |
| Cambio mecánico | "Añade el campo phone al modelo Contact"                  | 1          |
| Refactor simple | "Renombra getUserById a findUserById en todo el proyecto" | 1          |

No necesitas ningún comando `/sdd-*`. Simplemente describe la tarea al agente.

---

## Tabla de referencia rápida

| Comando                  | Tipo   | Modelo   | Descripción                                   |
| ------------------------ | ------ | -------- | --------------------------------------------- |
| `/sdd-init`              | Skill  | sonnet   | Inicializa SDD en el proyecto                 |
| `/sdd-explore <tema>`    | Skill  | sonnet   | Explora e investiga antes de comprometerse    |
| `/sdd-new <cambio>`      | Meta   | —        | Inicia un cambio nuevo (explore + propose)    |
| `/sdd-propose [cambio]`  | Skill  | opus     | Genera propuesta de cambio                    |
| `/sdd-continue [cambio]` | Meta   | —        | Ejecuta la siguiente fase pendiente           |
| `/sdd-ff [cambio]`       | Meta   | —        | Fast-forward: propose → spec → design → tasks |
| `/sdd-spec [cambio]`     | Skill  | sonnet   | Escribe especificaciones                      |
| `/sdd-design [cambio]`   | Skill  | opus     | Crea diseño técnico                           |
| `/sdd-tasks [cambio]`    | Skill  | sonnet   | Desglosa en tareas implementables             |
| `/sdd-apply [cambio]`    | Skill  | sonnet   | Implementa tareas en batches                  |
| `/sdd-verify [cambio]`   | Skill  | sonnet   | Verifica implementación contra specs          |
| `/sdd-archive [cambio]`  | Skill  | haiku    | Archiva cambio completado                     |
| `/skill-registry`        | Skill  | sonnet   | Genera/actualiza registro de skills           |

> **Tipo Skill**: se ejecuta como sub-agente directo.
> **Tipo Meta**: el orquestador lo descompone en múltiples fases.

---

## Comandos SDD — Detalle completo

### `/sdd-init`

**Tipo**: Skill · **Modelo**: sonnet · **Costo**: 1 premium request

**Descripción**: Inicializa el contexto de Spec-Driven Development en el proyecto actual. Es el primer comando que debes ejecutar.

**¿Qué hace?**
1. Detecta el stack tecnológico (lenguaje, framework, herramientas de build)
2. Detecta el framework de testing y su configuración
3. Identifica convenciones de código y estructura del proyecto
4. Crea la configuración OpenSpec (si se solicita): `openspec/config.yaml`, directorios base
5. Genera o actualiza el skill registry (`.atl/skill-registry.md`)

**Sintaxis**:
```
/sdd-init
```

**¿Cuándo usarlo?**
- Al integrar Conductor por primera vez en un proyecto
- Después de cambios mayores en el stack (nuevo framework, nueva herramienta de testing)
- Si el skill registry está desactualizado o corrupto

**Ejemplo**:
```
Usuario: /sdd-init
Orquestador: ✅ SDD inicializado
   Stack: Python 3.11 + FastAPI
   Testing: pytest (detectado)
   Persistencia: openspec (habilitado)
```

---

### `/sdd-explore <tema>`

**Tipo**: Skill · **Modelo**: sonnet · **Costo**: 1 premium request

**Descripción**: Explora e investiga una idea, área del código o requisito antes de comprometerse con un enfoque. No crea código ni artefactos de planificación (excepto un opcional `exploration.md`).

**¿Qué hace?**
1. Lee el codebase para entender la situación actual
2. Investiga dependencias, patrones existentes y posibles enfoques
3. Compara alternativas de implementación
4. Devuelve un resumen con hallazgos y recomendaciones

**Sintaxis**:
```
/sdd-explore <tema o pregunta>
```

**¿Cuándo usarlo?**
- Cuando no conoces bien una zona del codebase
- Para evaluar opciones antes de proponer un cambio
- Para investigar dependencias o impacto de un cambio potencial

**¿Cuándo NO usarlo?**
- Si ya tienes claro qué quieres hacer — salta directo a `/sdd-propose` o `/sdd-new`

**Ejemplo**:
```
Usuario: /sdd-explore cómo funciona la autenticación actual y qué opciones hay para migrar a JWT
Orquestador: 🔍 Explorando...
   → Se detectó autenticación basada en sesiones en src/auth/
   → 3 rutas protegidas con middleware session-check
   → Opciones: jsonwebtoken, jose, passport-jwt
   → Recomendación: jsonwebtoken por simplicidad del stack actual
```

---

### `/sdd-new <cambio>`

**Tipo**: Meta-comando · **Costo**: 2 premium requests (explore + propose)

**Descripción**: Inicia un cambio nuevo desde cero. El orquestador ejecuta automáticamente exploración + propuesta en secuencia.

**¿Qué hace?**
1. Lanza `/sdd-explore` para investigar el codebase
2. Con los hallazgos, lanza `/sdd-propose` para generar una propuesta de cambio

**Sintaxis**:
```
/sdd-new <nombre-del-cambio>
```

El `<nombre-del-cambio>` se usa como identificador en todo el flujo y como nombre del directorio en OpenSpec.

**¿Cuándo usarlo?**
- Para iniciar cualquier cambio sustancial que justifique planificación
- Cuando quieres que el agente investigue antes de proponer

**Ejemplo**:
```
Usuario: /sdd-new api-paginación
Orquestador: 🔍 Explorando codebase para: api-paginación...
   ✅ Exploración completada
📋 Generando propuesta...
   ✅ Propuesta generada
   
   Alcance: Agregar paginación cursor-based a todos los endpoints GET /list
   Archivos afectados: 6 (controllers + middleware + tests)
   Siguiente paso: /sdd-continue api-paginación (→ spec)
```

> ⚠️ Este es un **meta-comando**: el orquestador lo maneja directamente, no es un skill invocable. No aparece en el autocompletado de skills.

---

### `/sdd-propose [cambio]`

**Tipo**: Skill · **Modelo**: opus · **Costo**: 1 premium request

**Descripción**: Genera una propuesta de cambio concisa con alcance, enfoque, riesgos y alternativas.

**¿Qué hace?**
1. Lee la exploración previa (si existe)
2. Genera una propuesta estructurada (< 400 palabras) con:
   - Intent (qué y por qué)
   - Alcance (qué archivos/módulos se tocan)
   - Enfoque (cómo se implementará)
   - Riesgos y mitigaciones
   - Alternativas consideradas

**Sintaxis**:
```
/sdd-propose [nombre-del-cambio]
```

**Dependencias**: Ninguna obligatoria (la exploración es opcional).

**Artefacto generado**: `proposal.md`

**¿Cuándo usarlo?**
- Después de `/sdd-explore` si quieres control paso a paso
- Directamente si ya sabes qué quieres y no necesitas exploración

**Ejemplo**:
```
Usuario: /sdd-propose cache-redis
Orquestador: 📋 Propuesta generada: cache-redis
   Intent: Agregar capa de cache con Redis para reducir latencia en queries frecuentes
   Archivos: 4 nuevos + 2 modificados
   Riesgo: medio (nueva dependencia de infraestructura)
   Siguiente: /sdd-continue cache-redis (→ spec)
```

---

### `/sdd-continue [cambio]`

**Tipo**: Meta-comando · **Costo**: 1 premium request

**Descripción**: Ejecuta la siguiente fase pendiente en el grafo de dependencias del cambio especificado.

**¿Qué hace?**
1. Lee el estado actual del cambio (desde `state.yaml` o contexto)
2. Identifica qué fases están completadas y cuál es la siguiente
3. Lanza el sub-agente correspondiente a esa fase

**Sintaxis**:
```
/sdd-continue [nombre-del-cambio]
```

**Orden de ejecución** (siguiendo el grafo de dependencias):
```
proposal → spec → design → tasks → apply → verify → archive
```

> `spec` y `design` se generan ambos desde `proposal`. `tasks` requiere ambos.

**¿Cuándo usarlo?**
- Cuando quieres avanzar el flujo paso a paso con revisión entre fases
- Para retomar un flujo interrumpido

**Ejemplo**:
```
Usuario: /sdd-continue api-paginación
Orquestador: 📊 Estado de api-paginación:
   ✅ proposal — completado
   ✅ spec — completado
   ⬜ design — pendiente ← SIGUIENTE
   ⬜ tasks
   ⬜ apply
   ⬜ verify
   ⬜ archive
   
   🏗️ Lanzando design...
```

> ⚠️ Este es un **meta-comando**: el orquestador lo maneja directamente.

---

### `/sdd-ff [cambio]`

**Tipo**: Meta-comando · **Costo**: ~4 premium requests (propose + spec + design + tasks)

**Descripción**: Fast-forward de planificación. Ejecuta en secuencia: propose → spec → design → tasks. Al terminar, tienes un plan completo listo para implementar.

**¿Qué hace?**
1. Genera propuesta (si no existe)
2. Escribe especificaciones
3. Crea diseño técnico
4. Desglosa en tareas implementables

**Sintaxis**:
```
/sdd-ff [nombre-del-cambio]
```

**¿Cuándo usarlo?**
- Cuando quieres ir rápido de la idea al plan sin parar en cada fase
- Para cambios donde confías en que el agente tomará buenas decisiones de planificación
- Es la forma más eficiente de llegar al punto de implementación

**¿Cuándo NO usarlo?**
- Para cambios de alto riesgo donde necesitas revisar cada artefacto antes de continuar

**Ejemplo**:
```
Usuario: /sdd-ff migración-base-datos
Orquestador: ⚡ Fast-forward: migración-base-datos
   📋 Propose... ✅
   📐 Spec... ✅
   🏗️ Design... ✅
   📝 Tasks... ✅
   
   Plan completado. 8 tareas identificadas.
   Siguiente: /sdd-apply migración-base-datos
```

> ⚠️ Este es un **meta-comando**: el orquestador lo maneja directamente.

---

### `/sdd-spec [cambio]`

**Tipo**: Skill · **Modelo**: sonnet · **Costo**: 1 premium request

**Descripción**: Escribe especificaciones con requisitos y escenarios.

**¿Qué hace?**
1. Lee la propuesta (`proposal.md`) — **requerido**
2. Genera especificaciones (< 650 palabras) con:
   - Requisitos funcionales usando RFC 2119 (MUST, SHALL, SHOULD, MAY)
   - Escenarios Given/When/Then (3-5 líneas cada uno)
   - Límites y restricciones
   - Organización por dominio

**Sintaxis**:
```
/sdd-spec [nombre-del-cambio]
```

**Dependencias**: `proposal` (requerido)

**Artefacto generado**: `specs/{dominio}/spec.md` (delta spec)

---

### `/sdd-design [cambio]`

**Tipo**: Skill · **Modelo**: opus · **Costo**: 1 premium request

**Descripción**: Crea el documento de diseño técnico con decisiones de arquitectura.

**¿Qué hace?**
1. Lee la propuesta (`proposal.md`) — **requerido**
2. Genera diseño técnico (< 800 palabras) con:
   - Decisiones de arquitectura con justificación
   - Diagramas (ASCII/Mermaid) para flujos complejos
   - Interfaces y contratos
   - Trade-offs explícitos

**Sintaxis**:
```
/sdd-design [nombre-del-cambio]
```

**Dependencias**: `proposal` (requerido)

**Artefacto generado**: `design.md`

---

### `/sdd-tasks [cambio]`

**Tipo**: Skill · **Modelo**: sonnet · **Costo**: 1 premium request

**Descripción**: Desglosa el cambio en tareas implementables.

**¿Qué hace?**
1. Lee spec + design — **ambos requeridos**
2. Genera un checklist de tareas (< 530 palabras) con:
   - Tareas agrupadas por fase
   - Numeración jerárquica
   - 1-2 líneas por tarea
   - Cada tarea completable en una sesión

**Sintaxis**:
```
/sdd-tasks [nombre-del-cambio]
```

**Dependencias**: `spec` + `design` (ambos requeridos)

**Artefacto generado**: `tasks.md`

---

### `/sdd-apply [cambio]`

**Tipo**: Skill · **Modelo**: sonnet · **Costo**: 1 premium request por batch

**Descripción**: Implementa las tareas definidas, trabajando en batches.

**¿Qué hace?**
1. Lee tasks + spec + design
2. Implementa un batch de tareas
3. Marca tareas completadas como `[x]` en `tasks.md`
4. Si TDD estricto está habilitado, sigue el ciclo RED → GREEN → REFACTOR

**Sintaxis**:
```
/sdd-apply [nombre-del-cambio]
```

**Dependencias**: `tasks` + `spec` + `design`

**Batches**: El orquestador decide el tamaño del batch según la complejidad. Un feature típico requiere 2-4 batches de apply.

**¿Cuándo usarlo?**
- Después de que el plan esté completo (tasks generadas)
- Repetir hasta que todas las tareas estén marcadas como completadas

**Ejemplo**:
```
Usuario: /sdd-apply api-paginación
Orquestador: 🔨 Aplicando batch 1/3: api-paginación
   ✅ Tarea 1.1: Crear middleware de paginación
   ✅ Tarea 1.2: Agregar tipos TypeScript
   ✅ Tarea 1.3: Tests unitarios del middleware
   
   Progreso: 3/8 tareas completadas
   Siguiente: /sdd-apply api-paginación (batch 2)
```

---

### `/sdd-verify [cambio]`

**Tipo**: Skill · **Modelo**: sonnet · **Costo**: 1 premium request

**Descripción**: Valida que la implementación cumple con las especificaciones.

**¿Qué hace?**
1. Lee spec + tasks
2. Ejecuta tests, build y verificaciones de cobertura
3. Compara la implementación contra las especificaciones
4. Genera un reporte clasificando hallazgos en:
   - **CRITICAL** — la implementación no cumple un requisito MUST/SHALL
   - **WARNING** — la implementación no cumple un SHOULD o tiene riesgos
   - **SUGGESTION** — mejoras opcionales

**Sintaxis**:
```
/sdd-verify [nombre-del-cambio]
```

**Dependencias**: `spec` + `tasks`

**Artefacto generado**: `verify-report.md`

**Si la verificación falla**: Ejecuta `/sdd-apply` para corregir y luego `/sdd-verify` de nuevo. Cada iteración de corrección cuesta ~2 premium requests.

---

### `/sdd-archive [cambio]`

**Tipo**: Skill · **Modelo**: haiku · **Costo**: 1 premium request

**Descripción**: Cierra un cambio completado y persiste su estado final.

**¿Qué hace?**
1. Lee todos los artefactos del cambio
2. Mueve la carpeta del cambio al archivo: `openspec/changes/archive/YYYY-MM-DD-{cambio}/`
3. Fusiona las delta specs en las specs principales: `openspec/specs/{dominio}/spec.md`
4. El archivo es un **audit trail** — nunca se modifica ni elimina

**Sintaxis**:
```
/sdd-archive [nombre-del-cambio]
```

**Dependencias**: Todas las fases anteriores completadas.

**¿Cuándo usarlo?**
- Después de que `/sdd-verify` pase sin hallazgos CRITICAL
- Como paso final del ciclo SDD

---

## Comandos de utilidad

### `/skill-registry`

**Tipo**: Skill · **Modelo**: sonnet · **Costo**: 1 premium request

**Descripción**: Genera o actualiza el registro de skills del proyecto.

**¿Qué hace?**
1. Escanea todos los skills disponibles
2. Genera `.atl/skill-registry.md` con reglas compactas
3. El orquestador usa este registro para inyectar convenciones en cada sub-agente

**Sintaxis**:
```
/skill-registry
```

**Frases de activación alternativas**:
- `update skills`
- `skill registry`
- `actualizar skills`
- `update registry`

---

## Meta-comandos vs. Skills

Es importante entender la diferencia:

| Característica       | Meta-comando                           | Skill                                    |
| -------------------- | -------------------------------------- | ---------------------------------------- |
| **Quién lo ejecuta** | El orquestador directamente            | Un sub-agente especializado              |
| **Autocompletado**   | No aparece                             | Sí aparece                               |
| **Costo**            | Suma de las fases que lanza            | 1 premium request                        |
| **Ejemplos**         | `/sdd-new`, `/sdd-continue`, `/sdd-ff` | `/sdd-init`, `/sdd-apply`, `/sdd-verify` |

Los **meta-comandos** son atajos de conveniencia que el orquestador descompone en múltiples skills. No tienen costo adicional más allá de las fases que lanzan internamente.

---

## Frases de activación (triggers)

Además de los comandos slash, puedes activar ciertas funciones con lenguaje natural:

| Frase                  | Acción                    |
| ---------------------- | ------------------------- |
| `"update skills"`      | Ejecuta `/skill-registry` |
| `"skill registry"`     | Ejecuta `/skill-registry` |
| `"actualizar skills"`  | Ejecuta `/skill-registry` |
| `"update registry"`    | Ejecuta `/skill-registry` |
| `"sdd init"`           | Ejecuta `/sdd-init`       |
| `"iniciar sdd"`        | Ejecuta `/sdd-init`       |
| `"openspec init"`      | Ejecuta `/sdd-init`       |

---

## Flujos de trabajo comunes

### 🆕 Feature nueva (completo)

```
/sdd-new mi-feature              # Explorar + proponer
/sdd-ff mi-feature               # Spec + design + tasks
/sdd-apply mi-feature            # Implementar (repetir si hay más batches)
/sdd-verify mi-feature           # Verificar
/sdd-archive mi-feature          # Cerrar
```

**Costo estimado**: 10-15 premium requests

### 🆕 Feature nueva (rápido)

```
/sdd-ff mi-feature               # Proponer + spec + design + tasks (sin exploración)
/sdd-apply mi-feature            # Implementar
/sdd-verify mi-feature           # Verificar
/sdd-archive mi-feature          # Cerrar
```

**Costo estimado**: 8-12 premium requests

### 🐛 Bugfix

```
/sdd-explore el-bug              # Investigar la causa raíz
/sdd-propose el-bug              # Proponer el fix
/sdd-ff el-bug                   # Spec + design + tasks
/sdd-apply el-bug                # Aplicar fix
/sdd-verify el-bug               # Verificar
/sdd-archive el-bug              # Cerrar
```

**Tip**: Para bugs triviales, puedes simplemente pedir al orquestador que lo resuelva sin SDD. El orquestador delegará a un sub-agente general (1 premium request).

### ♻️ Refactor

```
/sdd-explore área-a-refactorizar  # Entender el código actual
/sdd-new refactor-módulo-x        # Propuesta + exploración
/sdd-continue refactor-módulo-x   # Paso a paso (más control sobre cada decisión)
```

**Tip**: Los refactors se benefician del modo paso a paso (`/sdd-continue`) porque cada decisión de diseño merece revisión.

### 🔍 Solo investigar

```
/sdd-explore cómo funciona el módulo de pagos
```

No genera propuesta ni planificación. Solo investiga y reporta. Costo: 1 premium request.

### ⚡ Tarea pequeña (sin SDD)

```
Usuario: Agrega validación al campo email del formulario de registro
Orquestador: [delega a sub-agente general → 1 premium request]
```

Para tareas que no justifican planificación formal, simplemente describe lo que necesitas. El orquestador delegará automáticamente.

### 🛡️ Feature con verificación exhaustiva

```
/sdd-ff feature-crítica
/sdd-apply feature-crítica
/sdd-verify feature-crítica
/sdd-archive feature-crítica
```

**Costo estimado**: 10-15 premium requests

---

## Grafo de dependencias completo

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
                      │  apply  │ (múltiples batches)
                      └────┬────┘
                           │
                           ▼
                      ┌─────────┐
                      │ verify  │ (si falla → apply → verify)
                      └────┬────┘
                           │
                           ▼
                      ┌─────────┐
                      │ archive │
                      └─────────┘
```

---

## Asignación de modelos por fase

| Fase          | Modelo                | Razón                                            |
| ------------- | --------------------- | ------------------------------------------------ |
| Orquestador   | opus (alta capacidad) | Coordinación y decisiones                        |
| `sdd-explore` | sonnet (estándar)     | Lectura de código, no decisiones arquitectónicas |
| `sdd-propose` | opus (alta capacidad) | Decisiones arquitectónicas                       |
| `sdd-spec`    | sonnet (estándar)     | Escritura estructurada                           |
| `sdd-design`  | opus (alta capacidad) | Decisiones de arquitectura                       |
| `sdd-tasks`   | sonnet (estándar)     | Desglose mecánico                                |
| `sdd-apply`   | sonnet (estándar)     | Implementación                                   |
| `sdd-verify`  | sonnet (estándar)     | Validación contra spec                           |
| `sdd-archive` | haiku (ligero)        | Copia y cierre mecánico                          |

> En plataformas que no usan nomenclatura Claude (opus/sonnet/haiku), se usa el equivalente en capacidad: modelo de alta capacidad para opus, estándar para sonnet, ligero para haiku.

---

## Tips de uso

1. **Usa `/sdd-ff` cuando tengas prisa** — ahorra overhead conversacional entre fases
2. **Salta `/sdd-explore` si ya sabes qué quieres** — ahorra 1 premium request
3. **Usa `/sdd-continue` para cambios de alto riesgo** — revisas cada artefacto antes de avanzar
4. **No re-ejecutes `/sdd-verify` sin cambios** — es la fase más costosa en tiempo de ejecución
5. **Para tareas pequeñas, no uses SDD** — describe lo que necesitas y el orquestador delegará directamente

---

[← Anterior: Crear Skills](./11-crear-skills-personalizados.md) | [Volver al README](../README.md) | [Siguiente: Mejores Prácticas →](./13-mejores-practicas.md)
