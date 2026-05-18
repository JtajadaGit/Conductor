# Guía de integración — Adoptar Conductor en cualquier proyecto

Esta guía cubre la adopción de Conductor en proyectos reales: greenfield, en curso, legacy o monorepo. El proceso es el mismo independientemente del stack (Angular, React, Vue, Java, PHP, Salesforce, SAP Commerce, Magento o cualquier otro).

---

## Tabla de contenidos

1. [Qué se añade a tu proyecto](#1-qué-se-añade-a-tu-proyecto)
2. [Escenarios de adopción](#2-escenarios-de-adopción)
3. [Crear e iterar instruction files](#3-crear-e-iterar-instruction-files)
4. [Cuándo crear skills personalizados](#4-cuándo-crear-skills-personalizados)
5. [Ejemplos por stack](#5-ejemplos-por-stack)
6. [FAQ](#6-faq)

---

## 1. Qué se añade a tu proyecto

Instala como plugin o copia manualmente:

```
your-project/
└── .github/
    ├── plugin.json                      # Manifiesto del plugin
    ├── agents/                          # 4 agentes SDD
    │   ├── sdd-orchestrator.agent.md    # Dispatcher (punto de entrada)
    │   ├── sdd-planner.agent.md
    │   ├── sdd-coder.agent.md
    │   ├── sdd-reviewer.agent.md
    │   └── _shared/                     # Documentación compartida
    │       ├── openspec-format.md
    │       └── security-rules.md
    ├── skills/                          # 4 skills utilitarios
    │   ├── sdd-init/SKILL.md
    │   ├── sdd-instructions/SKILL.md
    │   ├── sdd-status/SKILL.md
    │   └── sdd-archive/SKILL.md
    └── hooks/                           # 3 hooks determinísticos
        ├── conductor.json
        ├── inject-state.sh/.ps1
        ├── inject-context.sh/.ps1
        └── guard-tools.sh/.ps1
```

**Tu código no se toca.** Conductor no modifica tu proyecto hasta que invocas `sdd-orchestrator`. Todo lo que genera va a `openspec/` (artefactos del pipeline) y `.github/instructions/` (reglas para la IA).

---

## 2. Escenarios de adopción

### A. Proyecto nuevo (desde cero)

El caso más sencillo. Sin deuda técnica, sin convenciones preexistentes.

| Paso | Comando / Acción | Qué ocurre |
|------|-------------------|------------|
| 1 | Instalar plugin o copiar archivos | Agentes y skills disponibles |
| 2 | `/sdd-init` | Detecta el stack, crea `openspec/config.yaml` |
| 3 | `/sdd-instructions` | Genera instruction files en `.github/instructions/` |
| 4 | `sdd-orchestrator --auto mi-primera-feature` | Primer cambio a través del pipeline SDD |

**Qué esperar:**
- `/sdd-init` detecta tu stack automáticamente leyendo ficheros de manifiesto (`package.json`, `pom.xml`, `composer.json`, `angular.json`, `sfdx-project.json`, etc.)
- `/sdd-instructions` genera instruction files básicos. En un proyecto nuevo hay poco que detectar — los ficheros serán mínimos
- A medida que el proyecto crece, vuelve a ejecutar `/sdd-instructions` para recoger nuevas convenciones

**Consejo:** En proyectos nuevos, los instruction files autogenerados serán escuetos. Es normal. Itéralos manualmente conforme el equipo defina convenciones (ver sección 3).

---

### B. Proyecto en curso (a mitad de desarrollo)

Tienes código, convenciones (quizá no documentadas) y tests. Es el escenario más habitual.

| Paso | Comando / Acción | Qué ocurre |
|------|-------------------|------------|
| 1 | Instalar plugin o copiar archivos | Agentes y skills disponibles |
| 2 | `/sdd-init` | Detecta stack, test runner, arquitectura existente |
| 3 | `/sdd-instructions` | Genera instruction files a partir de ficheros de configuración reales |
| 4 | Revisar los instruction files generados | Verificar exactitud |
| 5 | Añadir reglas manuales faltantes | Conocimiento del equipo que la IA no puede detectar |
| 6 | `sdd-orchestrator --auto mi-siguiente-feature` | Primer cambio con contexto completo |

**Qué esperar:**
- `/sdd-init` detecta tu stack, test runner, linter y formatter. Todo va a `openspec/config.yaml`
- `/sdd-instructions` lee tus ficheros de configuración reales (`tsconfig.json`, `.editorconfig`, `eslint.config.js`, etc.) y genera instrucciones que reflejan tu setup real
- Los agentes respetan la arquitectura existente porque la plataforma carga los instruction files automáticamente según los patrones `applyTo`

**Paso crítico: revisa los instruction files.** La IA detecta convenciones a partir de ficheros de configuración, pero no puede leer la mente del equipo. Revisa lo generado y añade lo que falte manualmente. Los ficheros manuales NUNCA se sobrescriben al re-ejecutar.

**Ejemplo:** `/sdd-instructions` genera un `angular.instructions.md` que dice "Standalone components, signals, OnPush". Pero tu equipo tiene la convención no escrita de que los servicios de API van en `core/api/` y usan un patrón de retry personalizado. Lo añades manualmente al instruction file o a uno nuevo.

---

### C. Proyecto legacy (código antiguo, baja cobertura de tests, convenciones mixtas)

El escenario más delicado. Conductor funciona, pero hay que ser estratégico.

| Paso | Comando / Acción | Qué ocurre |
|------|-------------------|------------|
| 1 | Instalar plugin o copiar archivos | Agentes y skills disponibles |
| 2 | `/sdd-init` | Detecta lo que puede |
| 3 | `/sdd-instructions` | Genera instruction files (serán mínimos) |
| 4 | Editar `config.yaml` | Poner `strict_tdd: false` |
| 5 | Crear instruction files manuales | Documentar convenciones legacy |
| 6 | `sdd-orchestrator refactor-modulo-X` | Empezar con refactors pequeños, modo interactivo (sin `--auto`) |

**Qué esperar:**
- La autodetección puede ser limitada si el proyecto no usa herramientas modernas
- `strict_tdd: false` es importante — no quieres que el pipeline falle por tests inexistentes en código legacy
- Modo interactivo (sin `--auto`) te da control total — revisas la spec antes de que el coder toque nada

**Estrategia recomendada para legacy:**

| Principio | Justificación |
|-----------|---------------|
| No migrar todo de golpe | Usa Conductor para cambios incrementales |
| Empezar con refactors pequeños | Alcance claro — la complexity gate los clasifica como trivial/medium |
| Crear instruction files manuales | Documenta reglas legacy que la IA debe respetar |
| Iterar instrucciones conforme modernizas | Cuando migres a PHP 8, actualiza el instruction file |
| No activar `strict_tdd` hasta configurar el test runner | Evita fallos en el pipeline |

**Ejemplo de instruction file manual para PHP legacy:**

```markdown
---
applyTo: "**/*.php"
---
# Legacy PHP

- PHP 7.4 — NO usar features de PHP 8+
- Sin autoloader PSR-4 — usar require_once
- Base de datos: queries directas con mysqli, sin ORM
- No modificar archivos en lib/ — dependencias vendorizadas
```

**Ojo:** Si el proyecto mezcla convenciones (p. ej., mitad jQuery + mitad React), crea instruction files separados con patrones `applyTo` distintos para cada zona del codebase.

---

### D. Monorepo (múltiples apps/servicios)

| Paso | Comando / Acción | Qué ocurre |
|------|-------------------|------------|
| 1 | Instalar plugin o copiar archivos | Agentes y skills disponibles |
| 2 | `/sdd-init` | Detecta el stack principal |
| 3 | Editar `config.yaml` | Poner `monorepo: true` |
| 4 | `/sdd-instructions` | Genera instruction files |
| 5 | Crear instruction files manuales por app | Delimitar cada fichero con `applyTo` |

**Estructura de instruction files para monorepos:**

| Fichero | applyTo | Propósito |
|---------|---------|-----------|
| `angular.instructions.md` | `apps/frontend/**/*.ts,**/*.html` | Reglas del framework frontend |
| `nestjs.instructions.md` | `apps/api/**/*.ts` | Reglas del framework backend |
| `testing-frontend.instructions.md` | `apps/frontend/**/*.spec.ts` | Convenciones de test del frontend |
| `testing-api.instructions.md` | `apps/api/**/*.spec.ts` | Convenciones de test del backend |
| `formatting.instructions.md` | `**/*.ts` | Reglas de formato compartidas |

La clave es `applyTo` — cada instruction file se carga solo cuando el agente trabaja con ficheros que coinciden con ese patrón. El agente de frontend nunca ve reglas del backend y viceversa.

Todos los instruction files van en `.github/instructions/`.

---

## 3. Crear e iterar instruction files

Los instruction files NO son "configura y olvida". Son **artefactos vivos del equipo** que evolucionan con el proyecto.

### Ciclo de iteración

```
/sdd-instructions              # autogenerar desde la configuración detectada
        +
edición manual                 # conocimiento del equipo que la IA no puede detectar
        +
feedback del pipeline          # cuando un agente genera algo mal, añade la regla
```

### Cuándo re-ejecutar `/sdd-instructions`

| Disparador | Ejemplo |
|------------|---------|
| Actualización de versión del framework | Angular 19 a 20 |
| Cambio de test runner | Karma a Vitest |
| Nuevo linter o formatter añadido | Añadir Biome |
| Cambio en la estructura del proyecto | Migración a monorepo |

`/sdd-instructions` solo actualiza ficheros autogenerados (marcados con `_Auto-updated by /sdd-instructions_`). Tus ediciones manuales se mantienen intactas.

### Cuándo editar instruction files manualmente

| Situación | Ejemplo |
|-----------|---------|
| Convención del equipo no detectable | "Servicios de API en `core/api/`, patrón de retry con backoff exponencial" |
| Anti-patrón recurrente de la IA | "La IA genera `*ngIf` pero usamos `@if`" — añadir tabla de anti-patrones |
| Zona frágil del codebase | "No tocar `auth/legacy-session.ts` — migración pendiente" |
| Arquitectura personalizada | "Hexagonal: adapters en `infra/`, ports en `domain/ports/`" |
| Dependencias internas | "Usar `@company/ui-kit` para componentes, nunca crear desde cero" |

### Formato recomendado para instruction files manuales

```markdown
---
applyTo: "**/*.ts,**/*.html"
---
# Convenciones del equipo — Frontend
<!-- No borrar: este fichero es manual, /sdd-instructions no lo sobrescribirá -->

## Arquitectura
- Feature modules en `features/{name}/`
- Componentes compartidos en `shared/components/`
- Servicios de API en `core/api/` con patrón de retry

## Anti-patrones
| La IA genera | Nosotros usamos |
|--------------|-----------------|
| `*ngIf` | `@if` (control flow) |
| `constructor(private svc)` | `inject(MyService)` |
| `any` | Tipo concreto o `unknown` |

## No tocar
- `auth/legacy-session.ts` — migración en curso
- `lib/` — dependencias vendorizadas, actualización manual
```

### Bucle de feedback con el pipeline

| Paso | Acción |
|------|--------|
| 1 | Un agente genera algo incorrecto durante un pipeline |
| 2 | Corriges el código o pides al agente que lo corrija |
| 3 | Identificas la regla que faltaba |
| 4 | La añades al instruction file correspondiente |
| 5 | El siguiente pipeline la respeta |

Este bucle es la forma más efectiva de "entrenar" a los agentes para tu proyecto.

---

## 4. Cuándo crear skills personalizados

Los skills son los comandos `/sdd-*`. Conductor incluye 4 de serie. **La mayoría de equipos NO necesita skills personalizados** — los instruction files cubren la personalización a nivel de proyecto.

### NO necesitas un skill personalizado si...

| Objetivo | Solución |
|----------|----------|
| Que la IA siga las convenciones de tu stack | Instruction files |
| Que la IA use un patrón de arquitectura concreto | Instruction files |
| Quieres añadir validaciones de tests | Hooks en `config.yaml` |
| Quieres cambiar el nivel de TDD | `strict_tdd` en `config.yaml` |

### SÍ necesitas un skill personalizado si...

Tienes un **workflow repetitivo y específico de tu equipo** que no encaja en el pipeline SDD estándar.

| Skill personalizado | Por qué |
|---------------------|---------|
| `/sdd-migration` | Migraciones de BD con un proceso concreto (generar fichero de migración, actualizar seeds, verificar rollback) |
| `/sdd-component` | Scaffolding de componentes con estructura del equipo (component + stories + test + barrel export) |
| `/sdd-api-endpoint` | Endpoint REST con todo el boilerplate (controller, service, DTO, test, doc Swagger) |
| `/sdd-release` | Proceso de release: changelog, bump de versión, tag, notas de deploy |
| `/sdd-impex` | (SAP Commerce Hybris) Generar ImpEx data con validaciones |
| `/sdd-lwc` | (Salesforce) Scaffolding de Lightning Web Component con handler + test |

### Cómo crear un skill

Un skill es un fichero `SKILL.md` dentro de una carpeta en `skills/`:

```
skills/
├── my-custom-skill/
│   └── SKILL.md
```

Formato mínimo:

```markdown
---
name: my-custom-skill
description: Qué hace este skill en una línea
---

## Propósito

Qué problema resuelve y cuándo usarlo.

## Orden

### 1. Primer paso
Qué hace el orchestrator.

### 2. Segundo paso
Qué delega y a quién.

## Reglas

- Regla 1
- Regla 2
```

**Regla de oro:** Un skill personalizado orquesta — NO ejecuta código directamente. Si necesita código, delega en `sdd-coder`. Si necesita análisis, delega en `sdd-planner`.

### Cuándo NO crear un skill

| Situación | Razón |
|-----------|-------|
| Tarea puntual | Usa `sdd-orchestrator` directamente |
| Cumplimiento de convenciones | Va en instruction files |
| Configuración del pipeline | Va en `config.yaml` |
| Solo lo usarías tú | Sin valor compartido para el equipo |

---

## 5. Ejemplos por stack

### Angular (19+)

| Fase | Detalles |
|------|----------|
| `/sdd-init` detecta | Angular 19, TypeScript strict, npm, Jest/Vitest |
| `config.yaml` | `strict_tdd: true` |
| `/sdd-instructions` genera | `angular.instructions.md` (applyTo: `**/*.ts,**/*.html,**/*.scss`), `testing.instructions.md` (applyTo: `**/*.spec.ts`), `formatting.instructions.md` (applyTo: `**/*.ts,**/*.html`) |
| Ediciones manuales recomendadas | Anti-patrones: `*ngIf` a `@if`, `BehaviorSubject` a `signal()`, DI por constructor a `inject()`. Arquitectura: `features/`, `shared/`, `core/`. Regla: "Standalone components, sin NgModules" |

### React + Next.js

| Fase | Detalles |
|------|----------|
| `/sdd-init` detecta | React 19, Next.js 15, TypeScript, npm, Vitest |
| `config.yaml` | `strict_tdd: true` |
| `/sdd-instructions` genera | `react.instructions.md` (applyTo: `**/*.tsx,**/*.jsx`), `testing.instructions.md` (applyTo: `**/*.test.tsx,**/*.spec.ts`), `formatting.instructions.md` (applyTo: `**/*.ts,**/*.tsx`) |
| Ediciones manuales recomendadas | "Server Components por defecto, `use client` solo cuando sea necesario". "Zustand para estado global, no Redux". Anti-patrones: class components a funcional, `useEffect` para estado derivado a `useMemo` |

### Java / Spring Boot

| Fase | Detalles |
|------|----------|
| `/sdd-init` detecta | Java 21, Spring Boot 3.x, Maven, JUnit 5 |
| `config.yaml` | `strict_tdd: true` |
| `/sdd-instructions` genera | `spring.instructions.md` (applyTo: `**/*.java`), `testing.instructions.md` (applyTo: `**/*Test.java,**/*IT.java`), `formatting.instructions.md` (applyTo: `**/*.java`) |
| Ediciones manuales recomendadas | "Inyección por constructor, nunca `@Autowired` en campo". "DTOs con Records, nunca exponer Entities en controllers". "Flyway para migraciones, nunca ddl-auto en producción" |

### PHP / Laravel

| Fase | Detalles |
|------|----------|
| `/sdd-init` detecta | PHP 8.3, Laravel 11, Composer, PHPUnit |
| `config.yaml` | `strict_tdd: true` |
| `/sdd-instructions` genera | `laravel.instructions.md` (applyTo: `**/*.php`), `testing.instructions.md` (applyTo: `tests/**/*.php`), `formatting.instructions.md` (applyTo: `**/*.php`) |
| Ediciones manuales recomendadas | "Controllers ligeros: Form Requests + clases Service". "Route model binding, nunca `Model::find()` en controllers". "Resource classes para respuestas JSON" |

### Salesforce CRM (Apex + LWC)

| Fase | Detalles |
|------|----------|
| `/sdd-init` detecta | Apex (`sfdx-project.json`), versión de API, LWC |
| `config.yaml` | `strict_tdd: true` (Salesforce exige 75%+ de cobertura, muchos equipos apuntan a 85%+) |
| `/sdd-instructions` genera | `salesforce.instructions.md` (applyTo: `**/*.cls,**/*.trigger,**/*.js`), `testing.instructions.md` (applyTo: `**/*Test.cls`) |
| Ediciones manuales **críticas** | "Trigger a Handler a Service a Selector (OBLIGATORIO)". "NUNCA SOQL/DML dentro de bucles — bulk siempre". "`lwc:if` en vez de `if:true`". "`USER_MODE` en todas las queries SOQL". Anti-patrones: SOQL en bucle, `if:true`, `var`, `document.querySelector` |

### Salesforce Commerce Cloud (B2C Commerce / SFCC)

| Fase | Detalles |
|------|----------|
| `/sdd-init` detecta | SFCC (`dw.json`, `package.json` con cartridges, `cartridge/` structure) |
| `config.yaml` | `strict_tdd: false` (la mayoría de proyectos SFCC no tienen cobertura alta de tests) |
| `/sdd-instructions` genera | `sfcc.instructions.md` (applyTo: `**/cartridge/**/*.js,**/*.isml,**/*.ds`), `testing.instructions.md` (applyTo: `**/*Test.js,**/*.test.js`) |
| Ediciones manuales **críticas** | "Arquitectura MVC por cartridge: controllers, models, scripts, templates ISML". "NUNCA modificar cartridges core (`app_storefront_base`) — extender con overlay en cartridge custom". "Usar `cartridge path` para override de templates y controllers". "CommonJS (`require`), no ES modules". "Pipeline vs Controller: preferir controllers SFRA". "Jobs y services: registrar en Business Manager, implementar en scripts". Anti-patrones: lógica de negocio en ISML, queries OCAPI sin paginación, `session.custom` para datos persistentes |

### SAP Commerce Cloud (Spartacus / Composable Storefront)

| Fase | Detalles |
|------|----------|
| `/sdd-init` detecta | Angular (`angular.json` + `@spartacus/` deps en `package.json`), TypeScript, npm |
| `config.yaml` | `strict_tdd: true` |
| `/sdd-instructions` genera | `spartacus.instructions.md` (applyTo: `**/*.ts,**/*.html,**/*.scss`), `testing.instructions.md` (applyTo: `**/*.spec.ts`), `formatting.instructions.md` (applyTo: `**/*.ts,**/*.html`) |
| Ediciones manuales **críticas** | "NUNCA modificar código de `@spartacus/*` — usar mecanismos de extensión: custom components, custom services con `provide` override". "Outlet-based composition: usar `cxOutletRef` para inyectar UI, no reemplazar templates completos". "Configuración vía `provideConfig()` — no modificar módulos Spartacus directamente". "CMS-driven: los componentes se mapean a CMS component types de SAP Commerce backend". "Usar `CommandService`/`QueryService` para llamadas a OCC API, no `HttpClient` directo". "Lazy loading por feature module". "i18n: claves en `assets/translations/`, extender chunks existentes". Anti-patrones: import directo de módulos internos de Spartacus (`/src/`), CSS sin encapsulación que rompe theming, `subscribe()` manual sin `takeUntil`/`async pipe` |

> **Nota sobre SAP Commerce Hybris (legacy):** Si tu proyecto aún usa el backend Hybris con storefront JSP/Accelerator (sin Spartacus), crea instruction files manuales para Java (`**/*.java,**/*.xml,**/*.impex`) con reglas de capas (Controller/Facade/Service/DAO), sufijos obligatorios, prefijo de proyecto, y la regla de nunca modificar clases core — extender + override en `spring.xml`. Configura `strict_tdd: false` si no hay cobertura de tests.

### Magento 2

| Fase | Detalles |
|------|----------|
| `/sdd-init` detecta | PHP (`composer.json` con `magento/framework`), PHPUnit |
| `config.yaml` | `strict_tdd: true` |
| `/sdd-instructions` genera | `magento.instructions.md` (applyTo: `**/*.php,**/*.xml,**/*.phtml`), `testing.instructions.md` (applyTo: `**/*Test.php`) |
| Ediciones manuales **críticas** | "DI vía `di.xml` + constructor, NUNCA `ObjectManager::getInstance()`". "Plugins (before/after/around) para extender, nunca modificar core". "Nada de SQL crudo — Resource Models + Collections". "Nada de superglobals (`$_GET`, `$_POST`) — usar objeto Request". "Escapado de output obligatorio en templates". "`ClassName::class`, nunca referencias por string" |

### Vue / Nuxt

| Fase | Detalles |
|------|----------|
| `/sdd-init` detecta | Vue 3, Nuxt 4, TypeScript, npm, Vitest |
| `config.yaml` | `strict_tdd: true` |
| `/sdd-instructions` genera | `vue.instructions.md` (applyTo: `**/*.vue,**/*.ts`), `testing.instructions.md` (applyTo: `**/*.spec.ts,**/*.test.ts`), `formatting.instructions.md` (applyTo: `**/*.vue,**/*.ts`) |
| Ediciones manuales recomendadas | "Composition API con `<script setup>`, nunca Options API". "Pinia para estado, no Vuex". "`defineProps<T>()` con generics de TypeScript". "`useFetch` para SSR, `$fetch` solo en cliente" |

---

## 6. FAQ

### ¿Puedo usar Conductor sin modificar mi código?

Sí. Conductor no modifica tu código hasta que ejecutas `sdd-orchestrator`. Ejecutar `/sdd-init` + `/sdd-instructions` solo genera ficheros de configuración (`openspec/`) e instruction files (`.github/instructions/`). Son artefactos de Conductor, no de tu aplicación.

### ¿Qué debería subir al repositorio?

| Ruta | ¿Commitear? | Razón |
|------|------------|-------|
| `openspec/config.yaml` | Sí | Configuración compartida del equipo |
| `openspec/changes/` | Opcional | Artefactos de cambios activos; útil para colaboración |
| `openspec/changes/archive/` | Opcional | Historial de cambios; útil para auditorías |
| `.github/instructions/` | Sí | Convenciones compartidas del equipo |
| `agents/` y `skills/` | Sí | Versionados con el proyecto |

### ¿Mi stack no se detecta automáticamente?

| Paso | Acción |
|------|--------|
| 1 | Verificar que el fichero de manifiesto está en la raíz del proyecto (`package.json`, `pom.xml`, `composer.json`, etc.) |
| 2 | Si el stack es exótico (p. ej., COBOL, SAP ABAP), `/sdd-init` crea un `config.yaml` genérico |
| 3 | Editar `config.yaml` manualmente con los detalles de tu stack |
| 4 | Crear instruction files manuales (no depender de la autogeneración) |

### ¿Puedo tener instruction files manuales y autogenerados a la vez?

Sí. Conviven sin problemas. `/sdd-instructions` marca los ficheros autogenerados con `_Auto-updated by /sdd-instructions_`. Los ficheros sin esa marca no se tocan nunca.

### ¿Cómo sabe la IA qué instruction files cargar?

La plataforma los carga automáticamente según el patrón `applyTo` del frontmatter. Si el agente está editando un fichero `.ts`, carga todos los instruction files cuyo patrón incluya `**/*.ts`. No tienes que hacer nada.

### ¿Cuánto esfuerzo supone mantener los instruction files?

Poco. La mayor inversión es la primera iteración (30-60 minutos revisando y añadiendo reglas manuales). Después, solo los tocas cuando:

| Disparador | Acción |
|------------|--------|
| La IA comete un error recurrente | Añadir la regla al instruction file |
| Cambio de versión del framework | Re-ejecutar `/sdd-instructions` |
| El equipo define una nueva convención | Añadirla manualmente |

### ¿Puedo usar Conductor para tareas puntuales sin el pipeline completo?

Sí. La Complexity Gate evalúa cada cambio. Si es trivial o simple, delega directamente al coder sin pasar por el pipeline SDD. No hace falta forzar el pipeline para todo.

### ¿Qué pasa si el pipeline genera algo incorrecto?

| Paso | Acción |
|------|--------|
| 1 | En modo interactivo (sin `--auto`), revisas antes de que se aplique |
| 2 | Si ya se aplicó, pides al agente que lo corrija o lo corriges manualmente |
| 3 | Identificas la regla que faltaba |
| 4 | La añades al instruction file |
| 5 | El siguiente pipeline la respeta |

Este bucle de feedback es la principal vía para mejorar los resultados con el tiempo.

---

Siguiente: [Primeros pasos](./getting-started.md) | [Pipeline SDD](./pipeline.md) | [OpenSpec](./openspec.md) | [Avanzado](./advanced.md)
