# Conductor — Guía de inicio

Guía completa para entender, instalar y utilizar Conductor: el plugin de Spec-Driven Development para GitHub Copilot.

---

## Índice

1. [Qué es Conductor](#1-qué-es-conductor)
2. [Qué es OpenSpec](#2-qué-es-openspec)
3. [Los 4 agentes](#3-los-4-agentes)
4. [Instalación](#4-instalación)
5. [Primer uso paso a paso](#5-primer-uso-paso-a-paso)
6. [Ejemplo completo](#6-ejemplo-completo)
7. [Estructura de archivos](#7-estructura-de-archivos)
8. [Glosario](#8-glosario)
9. [Troubleshooting](#9-troubleshooting)
10. [Referencia de comandos](#10-referencia-de-comandos)

---

## 1. Qué es Conductor

Conductor es un plugin sin dependencias para GitHub Copilot (CLI y VS Code) que convierte la asistencia de IA en un proceso de ingeniería auditable.

En lugar de generar código al vuelo, impone un pipeline con tres fases obligatorias:

1. **Especificar** — Un agente especializado (planner) redacta una especificación formal que describe QUÉ hay que construir, usando lenguaje de negocio sin mencionar tecnologías.
2. **Implementar** — Otro agente (coder) implementa el código siguiendo esa spec y las convenciones del equipo definidas en instruction files.
3. **Verificar** — Un tercer agente (reviewer) valida que el código cumple la spec, ejecutando tests y build.

Todo queda trazado en disco bajo `openspec/`, versionable con git.

### Qué problema resuelve

| Sin Conductor | Con Conductor |
|---|---|
| La IA genera código de inmediato sin plan | La IA redacta un spec primero y luego implementa contra él |
| Sin trazabilidad: no sabes por qué se generó algo | Cada cambio tiene spec, report y audit trail en `openspec/` |
| Patrones inconsistentes entre ficheros | Los instruction files imponen las convenciones de tu equipo |
| La IA ejecuta cualquier comando de shell | El hook `guard-tools` bloquea git, curl, wget y comandos destructivos |
| Una conversación monolítica y frágil | El orchestrator despacha agentes especializados en segundo plano |

### Principio central

El pipeline separa el **QUÉ** (spec, technology-agnostic) del **CÓMO** (instruction files, stack-aware):

- Los **specs** describen comportamiento de negocio: "DADO que el usuario navega a la ruta de productos, CUANDO la página carga, ENTONCES se muestra un indicador de carga."
- Los **instruction files** describen cómo escribir código para tu stack: "Usar componentes standalone, TypeScript strict, fakeAsync en tests."
- El **coder** combina ambas capas para generar código que cumple la spec y sigue las convenciones.

---

## 2. Qué es OpenSpec

[OpenSpec](https://github.com/Fission-AI/OpenSpec) es un estándar de persistencia para desarrollo dirigido por especificación. Conductor lo usa como base y añade extensiones propias.

### Conceptos clave

| Concepto | Descripción |
|---|---|
| **Spec** | Especificación formal con escenarios GIVEN/WHEN/THEN. Usa palabras clave RFC 2119 (MUST, SHALL, SHOULD, MAY). Technology-agnostic. |
| **Delta spec** | Spec parcial que describe cambios sobre un dominio existente. Secciones: `## ADDED`, `## MODIFIED`, `## REMOVED`. |
| **Dominio** | Área funcional del sistema (productos, usuarios, pedidos). Cada dominio tiene su propio `spec.md` en `specs/{dominio}/`. |
| **Cambio** | Una unidad de trabajo con todos sus artefactos: spec, diseño, tareas, reportes. Vive en `openspec/changes/{nombre}/`. |
| **Source of truth** | Los specs promovidos viven en `openspec/specs/{dominio}/spec.md`. Se actualizan al archivar un cambio. |

### Qué añade Conductor a OpenSpec

| Extensión | Descripción |
|---|---|
| `x-conductor` en config.yaml | Pipeline declarativo: fases, hooks, agentes, comandos de test/build |
| `state.yaml` | Seguimiento del estado del pipeline por cambio |
| `exploration.md` | Artefacto de exploración (análisis del codebase existente) |
| `apply-report.md` | Reporte del coder (archivos creados/modificados, resultado del post-hook) |
| `verify-report.md` | Reporte del reviewer (veredicto, tests, compliance con spec) |

---

## 3. Los 4 agentes

Conductor opera con cuatro agentes. Cada uno tiene un rol estricto y un scope de escritura definido.

| Agente | Rol | Puede escribir | Invocable por el usuario |
|---|---|---|---|
| **sdd-orchestrator** | Coordinador. Evalúa complejidad, despacha subagentes, verifica artefactos. **Nunca** implementa código ni escribe archivos. | Nada | Sí: `sdd-orchestrator` |
| **sdd-planner** | Produce artefactos OpenSpec: exploración, propuesta, spec, diseño, tareas. Define QUÉ construir en lenguaje de negocio. **Technology-agnostic.** | Solo dentro de `openspec/changes/{cambio}/` | No (invocado por orchestrator) |
| **sdd-coder** | Implementa código desde spec + instruction files. Lee el QUÉ del planner y el CÓMO de los instruction files. | Código fuente + `apply-report.md` + `state.yaml` | No (invocado por orchestrator) |
| **sdd-reviewer** | Valida la implementación contra el spec. Ejecuta los tests y build configurados en `config.yaml`. **No edita código fuente.** | Solo `verify-report.md` + `state.yaml` | No (invocado por orchestrator) |

### Cómo se invocan los subagentes

Los subagentes tienen `disable-model-invocation: true` — Copilot NO los invoca automáticamente para tareas aleatorias. Solo el orchestrator puede invocarlos porque los tiene en su `agents:` allowlist.

En la interfaz aparecen como `Conductor:sdd-planner`, `Conductor:sdd-coder`, `Conductor:sdd-reviewer` — nunca como `General-purpose`.

---

## 4. Instalación

Conductor no requiere ningún runtime, ningún binario ni ningún package manager. Es un directorio de ficheros Markdown y JSON.

### 4.1 Instalación vía plugin (Copilot CLI)

```bash
copilot plugin add https://gitlabdes.hiberus.com/iasmartcommerce/conductor.git
```

### 4.2 Instalación en VS Code

1. Abre la Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`).
2. Ejecuta `Chat: Install Plugin From Source`.
3. Selecciona el directorio del repositorio de Conductor.

### 4.3 Settings de VS Code (obligatorios)

```json
{
  "chat.plugins.enabled": true,
  "chat.subagents.allowInvocationsFromSubagents": true
}
```

Sin estos settings el orchestrator no puede despachar subagentes.

### 4.4 Verificación

| Verificación | Cómo | Resultado esperado |
|---|---|---|
| Plugin registrado | Escribe `/sdd-` en el chat | Aparecen: `/sdd-init`, `/sdd-instructions`, `/sdd-status`, `/sdd-archive` |
| Agente accesible | Escribe `@sdd-` en el chat | Aparece `sdd-orchestrator` |
| Hooks activos | Inicia una sesión nueva | Se muestra `Environment loaded: N hooks` |

---

## 5. Primer uso paso a paso

### Paso 1: Inicializar el proyecto

```
/sdd-init
```

Escanea tu repositorio y detecta automáticamente:

- **Stack**: lenguaje, runtime, versión, framework, package manager
- **Testing**: test runner, framework, capas (unit, integration, e2e), cobertura
- **Arquitectura**: estilo, módulos clave, entry points

Resultado: `openspec/config.yaml` con la configuración ejecutable del pipeline.

### Paso 2: Generar instruction files

```
/sdd-instructions
```

Genera ficheros en `.github/instructions/` con las convenciones de tu stack. Cada fichero cubre una preocupación: testing, TypeScript, componentes, estilos, etc.

Los instruction files son el **contrato de equipo**: cada agente lee las mismas reglas al editar ficheros relevantes.

### Paso 3: Lanzar el primer cambio

```
sdd-orchestrator --auto "crear listado de productos con fake API"
```

| Flag | Efecto |
|---|---|
| `--auto` | Sin pausas. El pipeline ejecuta todas las fases sin intervención. |
| (sin flags) | Modo interactivo: pausa después de planificar y después de implementar para revisión humana. |
| `--continue` | Retoma un cambio existente desde `state.yaml`. |

> **`--auto` vs Autopilot de Copilot — no son lo mismo:**
>
> | Modo | Cómo se activa | Qué hace | Premium requests |
> |------|---------------|----------|-----------------|
> | `--auto` | En el prompt: `--auto mi petición` | El orchestrator **no pregunta** — salta los gates directamente | **Menos** — no hay mensaje extra de "y/n" |
> | Autopilot | Al iniciar sesión: `--yolo` o `/allow-all` | Copilot **responde "y" automáticamente** a las preguntas del orchestrator | **Más** — cada gate genera un mensaje "Proceed?" + Copilot responde "Continuing autonomously" = premium request extra |
>
> **Recomendación:** usa siempre `--auto` en el prompt cuando quieras ejecución sin parar. Es más barato que autopilot porque el orchestrator ni siquiera genera la pregunta.

### Paso 4: Monitorizar el progreso

```
/sdd-status        Progreso del cambio activo
/tasks             Subagentes en segundo plano (Copilot CLI)
```

### Paso 5: Revisar y archivar

Cuando el reviewer emite veredicto PASS:

```
/sdd-archive
```

Promueve los delta specs a `openspec/specs/{dominio}/spec.md` (fuente de verdad) y mueve el cambio a `openspec/changes/archive/`.

---

## 6. Ejemplo completo

**Petición:**

```
sdd-orchestrator --auto "crear listado de productos con fake API"
```

**Lo que ocurre:**

```
🚀 Pipeline: product-list-fake-api
📋 Complejidad: simple | Fases: explore, propose, spec, apply, verify
⏳ explore...
✅ explore
⏳ propose...
✅ propose
⊘ clarify (saltado — complejidad simple)
⊘ design (saltado — complejidad simple)
⊘ tasks (saltado — complejidad simple)
⏳ spec...
✅ spec
── 📐 planificación completa ──
── 🔨 implementación ──
⏳ apply...
✅ apply
── 🔍 verificación ──
⏳ verify...
✅ verify
✅ Pipeline completo: PASS 🎉
```

**Artefactos generados:**

```
openspec/changes/product-list-fake-api/
├── exploration.md                      Análisis del codebase existente
├── proposal.md                         Propuesta tech-agnostic
├── specs/products/spec.md              Spec GIVEN/WHEN/THEN
├── apply-report.md                     Archivos creados + resultado post-hook
├── verify-report.md                    Veredicto PASS + compliance por escenario
└── state.yaml                          Estado del pipeline
```

**Código generado** (ejemplo Angular):

```
src/app/products/
├── product.model.ts                    Interfaz del producto
├── product.service.ts                  Servicio con datos fake locales
├── product.service.spec.ts             Tests del servicio
├── product-list/
│   ├── product-list.component.ts       Componente contenedor
│   ├── product-list.component.html     Template con estados loading/loaded/empty
│   ├── product-list.component.css      Estilos responsivos
│   └── product-list.component.spec.ts  Tests del componente
└── product-card/
    ├── product-card.component.ts       Componente presentacional
    ├── product-card.component.html     Template de tarjeta
    ├── product-card.component.css      Estilos de tarjeta
    └── product-card.component.spec.ts  Tests del componente
```

---

## 7. Estructura de archivos

### Archivos del plugin (no se modifican)

```
agents/                     4 agentes (.agent.md)
skills/                     4 skills (sdd-init, sdd-instructions, sdd-status, sdd-archive)
hooks/                      3 hooks (inject-state, inject-context, guard-tools)
plugin.json                 Manifiesto
```

### Archivos generados en tu proyecto

```
openspec/
├── config.yaml             Generado por /sdd-init — configuración del proyecto y pipeline
├── specs/{dominio}/        Fuente de verdad — promovido por /sdd-archive
└── changes/{nombre}/       Cambio activo — generado por el pipeline

.github/instructions/       Generado por /sdd-instructions — convenciones del stack
```

---

## 8. Glosario

| Término | Definición |
|---|---|
| **SDD** | Spec-Driven Development. Metodología donde la IA especifica antes de implementar. |
| **OpenSpec** | Estándar de persistencia que Conductor usa para organizar specs y artefactos en disco. |
| **Spec** | Especificación formal con escenarios GIVEN/WHEN/THEN. Technology-agnostic. Usa RFC 2119. |
| **Delta spec** | Spec parcial con secciones `## ADDED`, `## MODIFIED`, `## REMOVED`. |
| **Instruction file** | Fichero en `.github/instructions/` que define CÓMO escribir código para un stack concreto. |
| **Agente** | Subagente especializado definido en un fichero `.agent.md`. Tiene tools y scope de escritura definidos. |
| **Skill** | Comando invocable por el usuario con `/nombre`. Definido en `SKILL.md`. |
| **Hook** | Script que se ejecuta automáticamente en eventos del ciclo de vida de Copilot. |
| **Plugin** | Paquete distribuible definido por `plugin.json` que agrupa agentes, skills y hooks. |
| **Complejidad** | Evaluada en la fase explore: simple, medium, complex. Determina qué fases se activan. |
| **Fix cycle** | Ciclo de corrección: reviewer detecta fallos → coder los corrige. Máximo 3 ciclos. |
| **Guard-tools** | Hook que bloquea git, curl, wget y `rm -rf` antes de la ejecución. |
| **Dominio** | Área funcional del sistema. Cada dominio tiene su propio `spec.md`. |
| **Veredicto** | Resultado del reviewer: `PASS`, `PASS_WARNINGS` o `FAIL`. |

---

## 9. Troubleshooting

### Instalación

| Síntoma | Causa probable | Solución |
|---|---|---|
| `/sdd-init` no aparece | Plugin no registrado | `copilot plugin add /ruta` o reinstalar desde VS Code |
| `sdd-orchestrator` no aparece | Settings de VS Code | Verificar `chat.plugins.enabled: true` |
| El orchestrator no despacha subagentes | Settings de VS Code | Verificar `chat.subagents.allowInvocationsFromSubagents: true` |
| Hooks no se ejecutan | `conductor.json` no encontrado | Verificar que `plugin.json` apunta a `"./hooks/conductor.json"` |

### Durante el pipeline

| Síntoma | Causa probable | Solución |
|---|---|---|
| El spec contiene código o nombres de clases | Fuga de términos técnicos | El planner debe usar solo lenguaje de negocio. Reportar como bug. |
| El reviewer entra en watch mode | Test command sin flags anti-watch | Añadir `--watch=false` al test command en `config.yaml` |
| 3 ciclos de fix y sigue en FAIL | Problema sistémico | Revisar `verify-report.md` manualmente, corregir, y usar `--continue` |
| El pipeline se interrumpe | Sesión demasiado larga | Usar `sdd-orchestrator --continue` para retomar |
| Subagentes aparecen como "General-purpose" | Plugin no recargado | Reiniciar sesión de Copilot CLI o VS Code |

### Seguridad

| Síntoma | Causa probable | Solución |
|---|---|---|
| Un agente ejecuta `git commit` | Hook `guard-tools` no activo | Verificar `conductor.json` y que los scripts tienen permisos de ejecución |
| El coder instala dependencias | Comportamiento prohibido | El coder no puede modificar manifests de dependencias. Instalar manualmente. |

---

## 10. Referencia de comandos

### Skills (invocables por el usuario)

| Comando | Propósito | Prerequisito |
|---|---|---|
| `/sdd-init` | Detecta stack, crea `openspec/config.yaml` | Ninguno |
| `/sdd-instructions` | Genera instruction files para tu stack | `/sdd-init` ejecutado |
| `/sdd-status` | Muestra progreso del cambio activo | Cambio activo en `openspec/changes/` |
| `/sdd-archive` | Promueve specs, archiva el cambio | Veredicto PASS o PASS_WARNINGS |

### Entry point del pipeline

| Comando | Descripción |
|---|---|
| `sdd-orchestrator --auto "petición"` | Pipeline completo sin pausas |
| `sdd-orchestrator "petición"` | Modo interactivo: pausa tras planificar y tras implementar |
| `sdd-orchestrator --continue` | Retoma un cambio existente |

### Hooks (automáticos)

| Hook | Evento | Función |
|---|---|---|
| `inject-state` | `sessionStart` | Carga el contexto del cambio activo |
| `inject-context` | `subagentStart` | Inyecta rutas del cambio e instruction files a subagentes |
| `guard-tools` | `preToolUse` | Bloquea git, curl, wget y `rm -rf` |

### Modelo recomendado

| Modelo | Uso recomendado |
|---|---|
| Claude Sonnet 4.6+ | Mínimo recomendado para orchestrator y coder |
| Claude Opus 4.6+ | Ideal para specs de alta complejidad |
| Claude Haiku 4.5 | Aceptable para planner en complejidad simple |
