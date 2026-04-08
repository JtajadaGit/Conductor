# 🖥️ Plataformas Compatibles

[← Volver al README](../README.md)

## Visión General

Conductor está diseñado para funcionar con múltiples plataformas de agentes IA utilizando una estructura de skills idéntica. La arquitectura del orquestador, el flujo SDD y los skills son los mismos independientemente de la plataforma; lo que cambia es la configuración del punto de entrada, la ubicación de los archivos y el mecanismo de delegación.

### Estructura en Conductor (repositorio fuente)

En el repositorio de Conductor, los archivos se organizan sin duplicación:

```
Conductor/
├── instructions/
│   ├── copilot-instructions.md    ← Orquestador para Copilot
│   └── CLAUDE.md                  ← Orquestador para Claude Code
├── skills/                         ← UNA sola copia, compartida
│   ├── _shared/
│   ├── sdd-init/SKILL.md
│   ├── sdd-apply/SKILL.md
│   └── ...
└── docs/
```

**Ventaja**: una sola copia de skills sirve a ambas plataformas — sin duplicación.

### Estructura desplegada (tu proyecto)

Al copiar a tu proyecto, cada plataforma espera sus archivos en rutas específicas:

```
tu-proyecto/
├── .claude/                    ← Claude Code
│   ├── CLAUDE.md
│   └── skills/
│       ├── sdd-init/
│       ├── sdd-apply/
│       └── ...
├── .github/                    ← GitHub Copilot
│   ├── copilot-instructions.md
│   └── skills/
│       ├── sdd-init/
│       ├── sdd-apply/
│       └── ...
├── openspec/                   ← Artefactos SDD
└── .atl/
    └── skill-registry.md       ← Registro de skills
```

Las skills tienen contenido idéntico en ambas carpetas desplegadas. Solo el archivo de configuración del orquestador difiere entre plataformas. Al desplegar desde Conductor, se copia `instructions/{orquestador}` al directorio de la plataforma y `skills/` al directorio de skills que la plataforma espera.

---

## Claude Code

### Configuración

| Elemento                      | Ubicación                              |
| ----------------------------- | -------------------------------------- |
| Instrucciones del orquestador | `.claude/CLAUDE.md`                    |
| Skills                        | `.claude/skills/{skill-name}/SKILL.md` |
| Convenciones compartidas      | `.claude/skills/_shared/`              |

### Cómo funciona

Claude Code lee `.claude/CLAUDE.md` al inicio de cada sesión como instrucciones del sistema. Este archivo contiene la configuración completa del orquestador: reglas de delegación, flujo SDD, asignaciones de modelos y protocolo de sub-agentes.

Las skills se descubren automáticamente por su estructura de directorio. Cada carpeta dentro de `.claude/skills/` que contenga un archivo `SKILL.md` se reconoce como una skill disponible. El orquestador las resuelve a través del skill registry (`.atl/skill-registry.md`).

### Modelos

Claude Code utiliza los nombres nativos de los modelos de Anthropic:

| Alias    | Modelo        | Uso en Conductor                    |
| -------- | ------------- | ----------------------------------- |
| `opus`   | Claude Opus   | Orquestador, propose, design        |
| `sonnet` | Claude Sonnet | explore, spec, tasks, apply, verify |
| `haiku`  | Claude Haiku  | archive                             |

### Delegación

Claude Code utiliza el patrón `delegate (async)` como mecanismo de delegación principal. Cada sub-agente se lanza de forma asíncrona con un contexto fresco. El orquestador puede continuar procesando mientras el sub-agente trabaja, o esperar su resultado si lo necesita antes de continuar.

```
  Orquestador ── delegate(async) ──▶ Sub-agente (contexto fresco)
       │                                     │
       │           ◀── resultado ────────────┘
       ▼
  Siguiente acción
```

### Setup

1. Asegúrate de tener el directorio `.claude/` en la raíz del proyecto.
2. Coloca `CLAUDE.md` con las instrucciones del orquestador.
3. Copia las skills a `.claude/skills/`.
4. Copia las convenciones compartidas a `.claude/skills/_shared/`.
5. Ejecuta `/sdd-init` para detectar el stack y generar el skill registry.

---

## GitHub Copilot en VS Code

### Configuración

| Elemento                      | Ubicación                              |
| ----------------------------- | -------------------------------------- |
| Instrucciones del orquestador | `.github/copilot-instructions.md`      |
| Skills                        | `.github/skills/{skill-name}/SKILL.md` |
| Convenciones compartidas      | `~/.copilot/skills/_shared/`           |

### Cómo funciona

VS Code lee `.github/copilot-instructions.md` como instrucciones personalizadas para Copilot Chat. Este archivo contiene la configuración del orquestador adaptada al ecosistema de Copilot, incluyendo reglas de delegación más estrictas (Hard Stop Rule) y el protocolo de sub-agentes basado en la herramienta `task`.

Las skills se registran en el skill registry y se invocan a través de Copilot Chat. Los triggers definidos en el frontmatter de cada `SKILL.md` determinan cuándo se activa cada skill.

### Equivalencia de modelos

En Copilot, los modelos se mapean por nivel de capacidad:

| Nivel en Conductor      | Equivalente en Copilot   | Uso                                 |
| ----------------------- | ------------------------ | ----------------------------------- |
| `opus` (alta capacidad) | Modelo de alta capacidad | Orquestador, propose, design        |
| `sonnet` (estándar)     | Modelo estándar          | explore, spec, tasks, apply, verify |
| `haiku` (rápido)        | Modelo rápido/ligero     | archive                             |

> Nota: Las instrucciones del orquestador incluyen una nota explícita: "In Copilot, use the model equivalent in capability: high-capability model for opus roles, standard model for sonnet roles, and fast/lightweight model for haiku roles."

### Delegación con Task Tool

VS Code Copilot utiliza la herramienta `task` para lanzar sub-agentes. Existen cuatro tipos de agente:

| Tipo              | Modelo     | Descripción                                   | Uso típico en Conductor                |
| ----------------- | ---------- | --------------------------------------------- | -------------------------------------- |
| `explore`         | Haiku      | Búsqueda y análisis de código (solo lectura)  | sdd-explore, investigación de codebase |
| `task`            | Haiku      | Ejecución de comandos (tests, builds)         | sdd-archive, ejecución de tests        |
| `general-purpose` | Sonnet     | Agente completo con todas las herramientas    | sdd-apply, sdd-spec, sdd-design       |

> **Nota**: No hay un tipo de agente con modelo premium (Opus) por defecto en Copilot. Se puede forzar mediante el parámetro `model` en la herramienta `task`, pero la disponibilidad depende del runtime. El orquestador sí corre en el modelo principal de la sesión (puede ser Opus si el usuario lo seleccionó).

### Setup en VS Code

1. Crea el directorio `.github/` en la raíz del proyecto.
2. Coloca `copilot-instructions.md` con las instrucciones del orquestador.
3. Copia las skills a `.github/skills/` (o al directorio de usuario `~/.copilot/skills/`).
4. Abre VS Code con Copilot activado.
5. Abre Copilot Chat y ejecuta `/sdd-init` para inicializar el contexto.
6. Verifica que el skill registry se genera en `.atl/skill-registry.md`.

---

## GitHub Copilot CLI (Terminal)

### Configuración

Copilot CLI utiliza la misma configuración que Copilot en VS Code:

| Elemento                      | Ubicación                              |
| ----------------------------- | -------------------------------------- |
| Instrucciones del orquestador | `.github/copilot-instructions.md`      |
| Skills                        | `.github/skills/{skill-name}/SKILL.md` |
| Convenciones compartidas      | `~/.copilot/skills/_shared/`           |

### Cómo funciona

Copilot CLI ejecuta en contexto de terminal, leyendo las mismas instrucciones de `.github/copilot-instructions.md`. La experiencia es no-interactiva: el agente trabaja de forma autónoma hasta completar la tarea sin detenerse a pedir confirmación.

### Herramientas disponibles

Copilot CLI tiene acceso a un conjunto amplio de herramientas nativas:

- **Archivos**: view, edit, create, glob, grep
- **Terminal**: powershell (sync/async), read/write/stop
- **GitHub**: issues, PRs, workflows, commits, code search
- **Agentes**: task (explore, task, general-purpose, code-review)
- **Base de datos**: SQL (SQLite por sesión)
- **Web**: web_fetch, web_search
- **IDE**: get_selection, get_diagnostics (cuando está conectado a VS Code)

### Diferencias con VS Code

| Aspecto          | VS Code                            | CLI                    |
| ---------------- | ---------------------------------- | ---------------------- |
| Interfaz         | Chat visual integrado              | Terminal de texto      |
| Interactividad   | Conversación bidireccional         | Ejecución autónoma     |
| Herramientas IDE | Completas (diagnostics, selection) | Limitadas (cached)     |
| Skill invocation | Chat interactivo                   | Automática por trigger |
| Sesiones         | Persistentes en VS Code            | Por ejecución          |

La principal diferencia operativa es que Copilot CLI ejecuta en modo no-interactivo. No se detiene a preguntar: toma decisiones razonables y avanza. Esto lo hace ideal para tareas de automatización, CI/CD y flujos batch.

---

## Tabla Comparativa

| Característica          | Claude Code              | Copilot VS Code                   | Copilot CLI                       |
| ----------------------- | ------------------------ | --------------------------------- | --------------------------------- |
| Archivo de config       | `.claude/CLAUDE.md`      | `.github/copilot-instructions.md` | `.github/copilot-instructions.md` |
| Ruta de skills          | `.claude/skills/`        | `.github/skills/`                 | `.github/skills/`                 |
| Skills de usuario       | `~/.claude/skills/`      | `~/.copilot/skills/`              | `~/.copilot/skills/`              |
| Mecanismo de delegación | `delegate (async)`       | `task` tool                       | `task` tool                       |
| Modelos (alto)          | opus                     | alta capacidad                    | alta capacidad                    |
| Modelos (estándar)      | sonnet                   | estándar                          | estándar                          |
| Modelos (rápido)        | haiku                    | rápido/ligero                     | rápido/ligero                     |
| Modo de ejecución       | Interactivo              | Interactivo                       | Autónomo                          |
| Skill registry          | `.atl/skill-registry.md` | `.atl/skill-registry.md`          | `.atl/skill-registry.md`          |
| OpenSpec                | Soportado                | Soportado                         | Soportado                         |

---

## Configuración Dual (Claude + Copilot)

Es posible —y recomendado— mantener ambas configuraciones en el mismo proyecto. Esto permite que cualquier miembro del equipo use la plataforma de su preferencia.

### Estructura de un proyecto dual

```
proyecto/
├── .claude/
│   ├── CLAUDE.md                    ← Orquestador para Claude Code
│   └── skills/
│       ├── _shared/
│       │   ├── sdd-protocol.md
│       │   ├── orchestrator-reference.md
│       │   └── skill-resolver.md
│       ├── sdd-init/SKILL.md
│       ├── sdd-apply/SKILL.md
│       └── ...
├── .github/
│   ├── copilot-instructions.md      ← Orquestador para Copilot
│   └── skills/
│       ├── sdd-init/SKILL.md        ← Mismas skills, misma estructura
│       ├── sdd-apply/SKILL.md
│       └── ...
├── .atl/
│   └── skill-registry.md            ← Compartido entre plataformas
└── openspec/                         ← Compartido entre plataformas
    ├── config.yaml
    ├── specs/
    └── changes/
```

### Puntos clave

- **Las skills son idénticas** entre `.claude/skills/` y `.github/skills/`. Puedes copiarlas o usar symlinks.
- **Los archivos de orquestador son diferentes** porque cada plataforma tiene su propio formato de instrucciones y mecanismo de delegación.
- **OpenSpec y el skill registry son compartidos**: ambas plataformas leen y escriben en los mismos directorios `openspec/` y `.atl/`.
- **Los artefactos SDD son compatibles** entre plataformas. Un cambio iniciado en Claude Code puede continuarse en Copilot y viceversa, porque los artefactos viven en `openspec/`.

### Sincronización de skills

Si despliegas desde Conductor, la sincronización es automática: ambas carpetas se copian desde la misma fuente (`skills/`). No hay riesgo de divergencia porque el origen es único.

```bash
# Desplegar skills desde Conductor a ambas plataformas
cp -r Conductor/skills/ tu-proyecto/.github/skills/
cp -r Conductor/skills/ tu-proyecto/.claude/skills/
```

Si modificas skills directamente en el proyecto desplegado, puedes sincronizar entre carpetas:

```bash
# Copiar skills de Claude a Copilot (excluyendo _shared y archivos específicos de Claude)
rsync -av --exclude='_shared' .claude/skills/ .github/skills/

# O usar symlinks (Linux/macOS)
ln -s ../../.claude/skills/sdd-init .github/skills/sdd-init
```

En Windows, puedes usar junctions o copiar manualmente. Lo importante es que el contenido de `SKILL.md` sea idéntico en ambas ubicaciones.

> **Recomendación**: La forma más limpia de mantener sincronización es usar Conductor como fuente de verdad y re-desplegar cuando se actualicen skills.

---

## Limitaciones por Plataforma

### Claude Code

- **Modelos**: requiere acceso a los modelos de Anthropic. Si opus no está disponible, el sistema sustituye por sonnet automáticamente.
- **Skills de usuario**: solo busca en `~/.claude/skills/`.
- **Convenciones compartidas**: requiere `.claude/skills/_shared/` en el proyecto.
- **Sin herramientas IDE nativas**: no tiene acceso a diagnósticos de VS Code ni selección de editor.

### GitHub Copilot en VS Code

- **Delegación estricta**: el orquestador en Copilot tiene reglas de delegación más estrictas (Hard Stop Rule) que prohíben absolutamente leer o escribir archivos fuente inline.
- **Modelos**: la disponibilidad de modelos depende de la suscripción de Copilot. No todos los niveles tienen acceso a modelos de alta capacidad.
- **Tipos de agente limitados**: solo cuatro tipos (`explore`, `task`, `general-purpose`, `code-review`) frente al patrón `delegate` más flexible de Claude.
- **Context window**: puede variar según el modelo asignado por Copilot.

### GitHub Copilot CLI

- **No interactivo**: no puede detenerse a pedir confirmación. Todas las decisiones se toman automáticamente.
- **Herramientas IDE limitadas**: `get_selection` y `get_diagnostics` solo funcionan cuando está conectado a VS Code.
- **Sesiones efímeras**: cada ejecución es una sesión nueva. No hay persistencia de conversación entre ejecuciones (pero OpenSpec persiste los artefactos).
- **Sin paginación visual**: toda la salida es texto plano en terminal.

### Comunes a todas las plataformas

- **Compactación de contexto**: todas las plataformas pueden perder contexto en conversaciones largas. El mecanismo de recuperación vía `state.yaml` mitiga este riesgo cuando se usa el modo `openspec`.
- **Skill registry**: debe regenerarse al agregar o modificar skills (`/skill-registry` o "update skills").
- **OpenSpec**: el modo `openspec` es el **default**. Usa `none` solo si necesitas modo efímero explícitamente.

---

[← Anterior: Sub-agentes](./07-subagentes-y-delegacion.md) | [Volver al README](../README.md) | [Siguiente: OpenSpec →](./09-openspec-y-persistencia.md)
