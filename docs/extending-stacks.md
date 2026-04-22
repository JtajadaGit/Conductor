# Guía de Adopción -- Cómo integrar Conductor en tu proyecto

Esta guía es para equipos que quieren adoptar Conductor en proyectos reales: nuevos, en curso o legacy. Cubre el proceso completo desde la instalación hasta la iteración continua, independientemente del stack (Angular, React, Vue, Java, PHP, Salesforce, SAP Commerce, Magento, o cualquier otro).

---

## Índice

1. [Qué se añade al proyecto](#1-qué-se-añade-al-proyecto)
2. [Escenarios de adopción](#2-escenarios-de-adopción)
3. [Después del setup: iterar las instructions](#3-después-del-setup-iterar-las-instructions)
4. [Cuándo crear skills propias](#4-cuándo-crear-skills-propias)
5. [Ejemplo real por stacks](#5-ejemplo-real-por-stacks)
6. [Preguntas frecuentes](#6-preguntas-frecuentes)

---

## 1. Qué se añade al proyecto

Conductor se compone de dos carpetas que se copian al proyecto:

```
tu-proyecto/
├── agents/                          ← Los 3 agentes SDD (planner, coder, reviewer)
│   ├── sdd-planner.agent.md
│   ├── sdd-coder.agent.md
│   ├── sdd-reviewer.agent.md
│   └── _shared/                     ← Protocolos compartidos entre agentes
│       ├── sdd-protocol.md
│       ├── strict-tdd.md
│       └── strict-tdd-verify.md
│
├── skills/                          ← Las 6 skills (/sdd-init, /sdd-new, etc.)
│   ├── sdd-init/SKILL.md
│   ├── sdd-instructions/SKILL.md
│   ├── sdd-new/SKILL.md
│   ├── sdd-continue/SKILL.md
│   ├── sdd-status/SKILL.md
│   ├── sdd-archive/SKILL.md
│   └── _shared/
│       └── orchestration-protocol.md
│
└── (tu código)
```

Estas dos carpetas van al directorio de tu plataforma:

| Plataforma | Dónde va |
|------------|----------|
| **Copilot CLI** | `.github/` (agents en `.github/agents/`, skills en `.github/skills/`) |
| **Claude Code** | `.claude/` (agents en `.claude/agents/`, skills en `.claude/skills/`) |

**No tocas tu código.** Conductor no modifica tu proyecto hasta que ejecutas un comando. Todo lo que genera va a `openspec/` (artifacts del pipeline) y a los instruction files (reglas para la IA).

---

## 2. Escenarios de adopción

### A. Proyecto nuevo (empezando de cero)

El caso más simple. No hay deuda técnica, no hay convenciones preexistentes.

```
1. Copiar agents/ y skills/ al proyecto
2. /sdd-init                    ← detecta stack, crea openspec/config.yaml
3. /sdd-instructions            ← genera instruction files (testing, formatting, framework)
4. /sdd-new mi-primera-feature  ← primer cambio con pipeline SDD
```

**Qué esperar:**
- `/sdd-init` detectará tu stack automáticamente (lee `package.json`, `pom.xml`, `composer.json`, `angular.json`, `sfdx-project.json`, etc.)
- `/sdd-instructions` generará instruction files básicos. Como el proyecto es nuevo, habrá poco que detectar -- los archivos serán mínimos
- A medida que el proyecto crece, re-ejecuta `/sdd-instructions` para que detecte nuevas convenciones

**Consejo:** En proyectos nuevos, las instruction files auto-generadas serán escuetas. Eso está bien. Itéralas manualmente a medida que el equipo define convenciones (ver sección 3).

---

### B. Proyecto en curso (a mitad de desarrollo)

Tienes código, tienes convenciones (quizá no documentadas), tienes tests. Es el escenario más común.

```
1. Copiar agents/ y skills/ al proyecto
2. /sdd-init                    ← detecta stack + test runner + arquitectura existente
3. /sdd-instructions            ← genera instruction files leyendo tu config real
4. Revisar los instruction files generados
5. Añadir reglas manuales que falten
6. /sdd-new mi-siguiente-feature
```

**Qué esperar:**
- `/sdd-init` detectará tu stack, tu test runner, tu linter, tu formatter. Todo queda en `openspec/config.yaml`
- `/sdd-instructions` leerá tus archivos de config reales (`tsconfig.json`, `.editorconfig`, `eslint.config.js`, etc.) y generará instrucciones que reflejan tu setup actual
- Los agentes respetarán la arquitectura existente porque la plataforma carga los instruction files automáticamente

**Paso crítico: revisar los instruction files.** La IA detecta convenciones desde archivos de config, pero no puede leer la mente del equipo. Revisa lo generado y añade lo que falte manualmente. Los archivos manuales NUNCA se sobreescriben en re-ejecuciones.

**Ejemplo:** `/sdd-instructions` genera un `angular.instructions.md` que dice "Standalone components, signals, OnPush". Pero tu equipo tiene una convención no escrita de que los servicios de API van en `core/api/` y usan un patrón custom de retry. Eso lo añades tú a mano en el instruction file o en uno nuevo.

---

### C. Proyecto legacy (código antiguo, poca cobertura de tests, convenciones mixtas)

El escenario más delicado. Conductor funciona, pero hay que ser estratégico.

```
1. Copiar agents/ y skills/ al proyecto
2. /sdd-init                    ← detecta lo que haya
3. /sdd-instructions            ← genera instruction files (serán mínimos)
4. EDITAR config.yaml:
   - strict_tdd: false          ← probablemente no tienes test runner o cobertura
   - execution_mode: interactive ← revisas cada fase antes de continuar
5. Crear instruction files MANUALES con las convenciones legacy
6. /sdd-new refactor-modulo-X   ← empezar por refactors pequeños
```

**Qué esperar:**
- La detección automática puede ser limitada si el proyecto no usa herramientas modernas
- `strict_tdd: false` es importante -- no quieres que el pipeline falle por falta de tests en código legacy
- `execution_mode: interactive` te da control total -- revisas la spec antes de que el coder toque nada

**Estrategia recomendada para legacy:**

1. **No intentes migrar todo de golpe.** Usa Conductor para cambios incrementales
2. **Empieza con refactors pequeños** que tengan scope claro -- el complexity gate los clasificará como trivial/medium
3. **Crea instruction files manuales** con las reglas legacy que la IA debe respetar:
   ```markdown
   ---
   applyTo: "**/*.php"                    # Copilot
   # paths: "**/*.php"                     # Claude Code
   ---
   # Legacy PHP
   - PHP 7.4 -- NO usar features de PHP 8+
   - No hay autoloader PSR-4 -- usar require_once
   - Base de datos: queries directas con mysqli, no ORM
   - No modificar archivos en lib/ -- son dependencias vendored
   ```
4. **Itera las instructions** a medida que modernizas -- cuando migres a PHP 8, actualiza el instruction file
5. **No actives `strict_tdd` hasta que tengas test runner configurado**

**Gotcha legacy:** Si el proyecto mezcla convenciones (ej: mitad jQuery + mitad React), crea instruction files separados con `applyTo` diferentes para cada zona del codebase.

---

### D. Monorepo (múltiples apps/servicios)

```
1. Copiar agents/ y skills/ al proyecto
2. /sdd-init                    ← detecta el stack principal
3. EDITAR config.yaml:
   - monorepo: true
4. /sdd-instructions            ← genera instruction files
5. Crear instruction files MANUALES por app si difieren:
```

**Estructura de instruction files en monorepo:**
```
.github/instructions/
├── angular.instructions.md              applyTo: "apps/frontend/**/*.ts,**/*.html"
├── nestjs.instructions.md               applyTo: "apps/api/**/*.ts"
├── testing-frontend.instructions.md     applyTo: "apps/frontend/**/*.spec.ts"
├── testing-api.instructions.md          applyTo: "apps/api/**/*.spec.ts"
└── formatting.instructions.md           applyTo: "**/*.ts"
```

La clave es el `applyTo` -- cada instruction file solo se carga cuando el agente trabaja en archivos que matchean ese patrón. Así el agente de frontend no ve reglas de backend y viceversa.

---

## 3. Después del setup: iterar las instructions

Los instruction files NO son "set and forget". Son **artefactos vivos del equipo** que evolucionan con el proyecto.

### Ciclo de iteración

```
/sdd-instructions          ← genera/actualiza automático (lo detectado del config)
       +
edición manual             ← lo que el equipo sabe y la IA no puede detectar
       +
feedback del pipeline      ← cuando un agente genera algo incorrecto, añades la regla
```

### Cuándo re-ejecutar `/sdd-instructions`

- Actualizas versión del framework (ej: Angular 19 → 20)
- Cambias test runner (ej: Karma → Vitest)
- Añades un linter o formatter nuevo
- Cambia la estructura del proyecto

`/sdd-instructions` solo actualiza archivos auto-generados (marcados con `_Auto-updated by /sdd-instructions_`). Tus ediciones manuales quedan intactas.

### Cuándo editar instruction files manualmente

| Situación | Ejemplo |
|-----------|---------|
| Convención de equipo no detectable | "Servicios de API en `core/api/`, pattern retry con exponential backoff" |
| Anti-patrón recurrente de la IA | "La IA genera `*ngIf` pero usamos `@if`" → añadir tabla de anti-patrones |
| Zona frágil del codebase | "No tocar `auth/legacy-session.ts` -- migración pendiente" |
| Arquitectura custom | "Hexagonal: adapters en `infra/`, puertos en `domain/ports/`" |
| Dependencias internas | "Usar `@company/ui-kit` para componentes, nunca crear desde cero" |

### Formato recomendado para ediciones manuales

```markdown
---
applyTo: "**/*.ts,**/*.html"
---
# Convenciones de equipo -- Frontend
<!-- No borrar: este archivo es manual, /sdd-instructions no lo sobreescribe -->

## Arquitectura
- Feature modules en `features/{nombre}/`
- Shared components en `shared/components/`
- Servicios API en `core/api/` con pattern retry

## Anti-patrones
| AI genera | Nosotros usamos |
|-----------|----------------|
| `*ngIf` | `@if` (control flow) |
| `constructor(private svc)` | `inject(MyService)` |
| `any` | Tipo concreto o `unknown` |

## No tocar
- `auth/legacy-session.ts` -- migración en curso, no modificar
- `lib/` -- dependencias vendored, solo actualización manual
```

### Tip: feedback loop con el pipeline

Cuando un agente genera algo incorrecto durante un pipeline:

1. Corriges el código manualmente o pides al agente que lo corrija
2. Identificas la regla que faltaba
3. La añades al instruction file correspondiente
4. El próximo pipeline ya la respetará

Este loop es la forma más efectiva de "entrenar" a los agentes para tu proyecto.

---

## 4. Cuándo crear skills propias

Las skills son los comandos `/sdd-*`. Conductor trae 6 de serie. **La mayoría de equipos NO necesitan crear skills propias** -- las instruction files cubren la personalización por proyecto.

### NO necesitas una skill propia si...

- Quieres que la IA siga convenciones de tu stack → **instruction files**
- Quieres que la IA use un patrón de arquitectura específico → **instruction files**
- Quieres añadir validaciones de testing → **`config.yaml` hooks**
- Quieres cambiar el nivel de TDD → **`config.yaml` strict_tdd**

### SÍ necesitas una skill propia si...

Tienes un **workflow repetitivo específico de tu equipo** que no encaja en el pipeline SDD estándar.

**Ejemplos reales donde tendría sentido:**

| Skill custom | Por qué |
|--------------|---------|
| `/sdd-migration` | Tu equipo hace migraciones de BD con un proceso específico (generar migration file, actualizar seeds, verificar rollback) |
| `/sdd-component` | Scaffolding de componente con estructura específica del equipo (component + stories + test + barrel export) |
| `/sdd-api-endpoint` | Crear endpoint REST con todo el boilerplate (controller, service, DTO, test, swagger doc) |
| `/sdd-release` | Proceso de release: changelog, bump version, tag, deploy notes |
| `/sdd-impex` | (SAP Commerce) Generar ImpEx de datos con validaciones |
| `/sdd-lwc` | (Salesforce) Scaffold de Lightning Web Component con handler + test |

### Cómo crear una skill

Una skill es un archivo `SKILL.md` en una carpeta dentro de `skills/`:

```
skills/
├── mi-skill-custom/
│   └── SKILL.md
```

Formato mínimo:

```markdown
---
name: mi-skill-custom
description: Qué hace esta skill en una línea
---

## Purpose

Qué problema resuelve y cuándo usarla.

## Order

### 1. Primer paso
Qué hace el orquestador.

### 2. Segundo paso
Qué delega y a quién.

## Rules

- Regla 1
- Regla 2
```

**Regla de oro:** Una skill custom orquesta -- NO ejecuta código directamente. Si necesita código, delega a `sdd-coder`. Si necesita análisis, delega a `sdd-planner`.

### Cuándo NO crear una skill

- Si es un one-off (hazlo con `/sdd-new` y ya)
- Si es una convención (va en instruction files)
- Si es config del pipeline (va en `config.yaml`)
- Si solo la usarías tú y no el equipo (no aporta valor compartido)

---

## 5. Ejemplo real por stacks

### Angular (19+)

```
/sdd-init
  → Detecta: Angular 19, TypeScript strict, npm, Jest/Vitest
  → config.yaml: strict_tdd: true

/sdd-instructions
  → angular.instructions.md     (applyTo: "**/*.ts,**/*.html,**/*.scss")
  → testing.instructions.md     (applyTo: "**/*.spec.ts")
  → formatting.instructions.md  (applyTo: "**/*.ts,**/*.html")

Edición manual recomendada:
  → Añadir anti-patrones: *ngIf → @if, BehaviorSubject → signal(), constructor DI → inject()
  → Añadir arquitectura: features/, shared/, core/
  → Añadir: "Standalone components, no NgModules"
```

### React + Next.js

```
/sdd-init
  → Detecta: React 19, Next.js 15, TypeScript, npm, Vitest
  → config.yaml: strict_tdd: true

/sdd-instructions
  → react.instructions.md       (applyTo: "**/*.tsx,**/*.jsx")
  → testing.instructions.md     (applyTo: "**/*.test.tsx,**/*.spec.ts")
  → formatting.instructions.md  (applyTo: "**/*.ts,**/*.tsx")

Edición manual recomendada:
  → Añadir: "Server Components por defecto, 'use client' solo cuando sea necesario"
  → Añadir: "Zustand para estado global, no Redux"
  → Añadir anti-patrones: class components → functional, useEffect para derivar → useMemo
```

### Java / Spring Boot

```
/sdd-init
  → Detecta: Java 21, Spring Boot 3.x, Maven, JUnit 5
  → config.yaml: strict_tdd: true

/sdd-instructions
  → spring.instructions.md      (applyTo: "**/*.java")
  → testing.instructions.md     (applyTo: "**/*Test.java,**/*IT.java")
  → formatting.instructions.md  (applyTo: "**/*.java")

Edición manual recomendada:
  → Añadir: "Constructor injection, nunca @Autowired en campo"
  → Añadir: "DTOs con Records, nunca exponer Entities en controllers"
  → Añadir: "Flyway para migraciones, nunca ddl-auto en prod"
```

### PHP / Laravel

```
/sdd-init
  → Detecta: PHP 8.3, Laravel 11, Composer, PHPUnit
  → config.yaml: strict_tdd: true

/sdd-instructions
  → laravel.instructions.md     (applyTo: "**/*.php")
  → testing.instructions.md     (applyTo: "tests/**/*.php")
  → formatting.instructions.md  (applyTo: "**/*.php")

Edición manual recomendada:
  → Añadir: "Controllers finos: Form Requests + Service classes"
  → Añadir: "Route model binding, nunca Model::find() en controllers"
  → Añadir: "Resource classes para respuestas JSON"
```

### Salesforce (Apex + LWC)

```
/sdd-init
  → Detecta: Apex (sfdx-project.json), API version, LWC
  → config.yaml: strict_tdd: true (95%+ coverage requerido por Salesforce)

/sdd-instructions
  → salesforce.instructions.md  (applyTo: "**/*.cls,**/*.trigger,**/*.js")
  → testing.instructions.md     (applyTo: "**/*Test.cls")

Edición manual CRÍTICA:
  → "Trigger → Handler → Service → Selector (OBLIGATORIO)"
  → "NUNCA SOQL/DML dentro de loops -- bulk siempre"
  → "lwc:if en vez de if:true"
  → "USER_MODE en todas las queries SOQL"
  → Anti-patrones: SOQL en loop, if:true, var, document.querySelector
```

### SAP Commerce (Hybris)

```
/sdd-init
  → Detecta: Java (extensioninfo.xml identifica Hybris), Maven/Ant
  → config.yaml: strict_tdd: false (muchos proyectos Hybris no tienen tests unitarios)

/sdd-instructions
  → hybris.instructions.md      (applyTo: "**/*.java,**/*.xml,**/*.impex")

Edición manual CRÍTICA:
  → "Capas: Controller/Facade → Service → DAO"
  → "Sufijos obligatorios: Service, Facade, Controller, Dao, Converter, Populator"
  → "Prefijo de proyecto en clases custom"
  → "Nunca modificar clases core de SAP -- extend + override en spring.xml"
  → "ImpEx: respetar formato y tipos estrictamente"
  → "Cronjobs sobre Business Process para async"
  → strict_tdd: false hasta que configures test runner
  → execution_mode: interactive (Hybris es frágil, revisar antes de apply)
```

### Magento 2

```
/sdd-init
  → Detecta: PHP (composer.json → magento/framework), PHPUnit
  → config.yaml: strict_tdd: true

/sdd-instructions
  → magento.instructions.md     (applyTo: "**/*.php,**/*.xml,**/*.phtml")
  → testing.instructions.md     (applyTo: "**/*Test.php")

Edición manual CRÍTICA:
  → "DI vía di.xml + constructor, NUNCA ObjectManager::getInstance()"
  → "Plugins (before/after/around) para extender, no modificar core"
  → "No raw SQL -- Resource Models + Collections"
  → "No superglobals ($_GET, $_POST) -- usar Request object"
  → "Output escaping obligatorio en templates"
  → "ClassName::class, nunca string references"
```

### Vue / Nuxt

```
/sdd-init
  → Detecta: Vue 3, Nuxt 4, TypeScript, npm, Vitest
  → config.yaml: strict_tdd: true

/sdd-instructions
  → vue.instructions.md         (applyTo: "**/*.vue,**/*.ts")
  → testing.instructions.md     (applyTo: "**/*.spec.ts,**/*.test.ts")
  → formatting.instructions.md  (applyTo: "**/*.vue,**/*.ts")

Edición manual recomendada:
  → "Composition API con <script setup>, nunca Options API"
  → "Pinia para estado, no Vuex"
  → "defineProps<T>() con TypeScript generics"
  → "useFetch para SSR, $fetch para client-only"
```

---

## 6. Preguntas frecuentes

### ¿Puedo usar Conductor sin cambiar nada en mi código?

Sí. Conductor no modifica tu código hasta que ejecutas `/sdd-new`. Ejecutar `/sdd-init` + `/sdd-instructions` solo genera archivos de configuración (`openspec/`) e instruction files. Son artifacts de Conductor, no de tu app.

### ¿Qué commiteo al repo?

- `openspec/config.yaml` → **SÍ** (configuración del equipo)
- `openspec/changes/` → **OPCIONAL** (artifacts de cambios en curso; útil para colaboración)
- `openspec/changes/archive/` → **OPCIONAL** (historial de cambios; útil para auditoría)
- Instruction files → **SÍ** (convenciones compartidas del equipo)
- `agents/` y `skills/` → **SÍ** (son parte del repo, versionados con el proyecto)

### ¿Mi stack no se detecta automáticamente?

`/sdd-init` detecta stacks leyendo archivos manifesto en la raíz del proyecto. Si no lo detecta:

1. Verifica que el archivo manifesto está en la raíz (`package.json`, `pom.xml`, `composer.json`, etc.)
2. Si el stack es exótico (ej: COBOL, SAP ABAP), `/sdd-init` creará un config.yaml genérico
3. Edita `config.yaml` manualmente con tu stack
4. Crea instruction files manuales (no dependas del auto-generado)

### ¿Puedo tener instruction files manuales Y auto-generados?

Sí. Conviven perfectamente. `/sdd-instructions` marca los auto-generados con `_Auto-updated by /sdd-instructions_`. Los que no tienen esa marca nunca se tocan.

### ¿Cómo sabe la IA qué instruction files cargar?

La plataforma los carga automáticamente basándose en el `applyTo` (Copilot) o `paths` (Claude Code). Si el agente está editando un `.ts`, carga todos los instruction files cuyo patrón incluya `**/*.ts`. Tú no tienes que hacer nada.

### ¿Qué pasa si dos personas del equipo usan plataformas diferentes?

`/sdd-instructions` detecta ambas plataformas y genera en ambas ubicaciones. Los instruction files de Copilot van a `.github/instructions/` y los de Claude Code a `.claude/rules/`. Ambos sets se commitean al repo. Cada persona usa los de su plataforma.

### ¿Cuánto esfuerzo es mantener las instruction files?

Poco. La mayor inversión es la primera iteración (30-60 min revisando y añadiendo reglas manuales). Después, solo las tocas cuando:
- La IA comete un error recurrente → añades la regla
- Cambias de versión/framework → re-ejecutas `/sdd-instructions`
- El equipo define una convención nueva → la añades manualmente

### ¿Puedo usar Conductor solo para tareas puntuales sin el pipeline completo?

Sí. El Complexity Gate evalúa cada cambio. Si es trivial o simple, delega directamente al coder sin pipeline SDD. No tienes que forzar el pipeline para todo.

### ¿Qué hago si el pipeline genera algo incorrecto?

1. En `execution_mode: interactive`, revisas antes de que se aplique
2. Si ya se aplicó, pides al agente que corrija o corriges manualmente
3. Identificas la regla que faltaba y la añades al instruction file
4. El próximo pipeline ya la respetará

Este feedback loop es la forma principal de mejorar los resultados con el tiempo.

---

Siguiente: [Quick Start](./quick-start.md) | [Conductor 101](./conductor-101.md) | [Pipeline SDD](./sdd-pipeline.md) | [Avanzado](./advanced.md)
