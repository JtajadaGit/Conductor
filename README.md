# Conductor

**Framework de orquestación SDD compacto y agnóstico -- Copilot CLI / Claude Code**

---

## Documentación

| Doc | Descripción |
|-----|-------------|
| [Conductor 101](docs/conductor-101.md) | Primeros 15 minutos con Conductor. |
| [Quick Start](docs/quick-start.md) | Instalación y primer uso detallado. |
| [Adopción por stack](docs/extending-stacks.md) | Cómo integrar Conductor en tu proyecto: nuevo, legacy, monorepo. Instruction files por stack. |
| [Pipeline SDD](docs/sdd-pipeline.md) | Fases, modos, paralelismo, TDD, hooks. |
| [OpenSpec](docs/openspec.md) | Persistencia, artefactos, config.yaml, recuperación. |
| [POC: Pipeline completo](docs/poc-pipeline.md) | Walkthrough práctico del pipeline en Copilot CLI y Claude Code. |
| [Avanzado](docs/advanced.md) | Tokens, mejores prácticas, troubleshooting. |

---

## Qué es Conductor?

Cuando pides a una IA que implemente un cambio complejo, suele generar código sin planificar, sin verificar y sin documentar. Conductor resuelve esto: un framework de orquestación que convierte peticiones en código verificado mediante **Spec-Driven Development (SDD)** -- escribir una especificación ANTES del código, para que el diseño sea testable y el resultado auditable.

Conductor orquesta 3 agentes especializados (planner, coder, reviewer) que colaboran a través de un pipeline de fases. Un orquestador central evalúa la complejidad de cada cambio y decide automáticamente cuánto pipeline aplicar: desde delegación directa para cambios triviales hasta el pipeline completo con exploración y clarificación para cambios grandes.

Los artefactos SDD se persisten en `openspec/` siguiendo el estándar [OpenSpec](https://openspec.dev/), lo que permite recuperación entre sesiones, auditoría completa y portabilidad entre plataformas.

---

## Arquitectura

```
                     /sdd-new "mi cambio"
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  ORQUESTADOR                                                    │
│                                                                 │
│  ① Evalúa complejidad ─── trivial? ──→ directo al coder         │
│  ② Elige pipeline ─────── medium?  ──→ condensado (1 llamada)   │
│  ③ Delega a agentes ───── large?   ──→ completo (fase a fase)   │
│  ④ Valida resultados                                            │
└──────────┬──────────────────┬───────────────────┬───────────────┘
           │                  │                   │
           ▼                  ▼                   ▼
┌─────────────────┐ ┌─────────────────┐ ┌──────────────────┐
│   PLANNER       │ │     CODER       │ │    REVIEWER      │
│                 │ │                 │ │                  │
│  explore        │ │  apply          │ │  verify          │
│  propose        │ │  fix            │ │                  │
│  clarify        │ │                 │ │                  │
│  spec · design  │ │                 │ │                  │
│  tasks          │ │                 │ │                  │
└────────┬────────┘ └────────┬────────┘ └────────┬─────────┘
         │                   │                   │
         └───────────────────┼───────────────────┘
                             ▼
              ┌──────────────────────────────┐
              │         openspec/            │
              │                              │
              │  config.yaml                 │
              │  specs/                      │
              │  changes/{nombre}/           │
              │    state · spec · design     │
              │    tasks · apply-report      │
              │  changes/archive/            │
              └──────────────────────────────┘

              ┌──────────────────────────────┐
              │     Instruction Files        │
              │  (cargadas por plataforma)   │
              │                              │
              │  .github/instructions/       │
              │  .claude/rules/              │
              └──────────────────────────────┘
```

### Agentes

| | Agente | Fases | Qué hace |
|--|--------|-------|----------|
| 🏗 | **sdd-planner** | explore, propose, clarify, spec, design, tasks | Analiza el cambio, genera especificación, diseño técnico y lista de tareas |
| ⚡ | **sdd-coder** | apply, fix | Implementa las tareas, escribe código y tests. Soporta ejecución paralela con aislamiento por plataforma |
| ✓ | **sdd-reviewer** | verify | Valida que el código cumple la spec, ejecuta tests y build |

### Skills

| Skill | Qué hace |
|-------|----------|
| `/sdd-init` | Detecta stack, crea `openspec/config.yaml` |
| `/sdd-instructions` | Genera instruction files por stack (framework, testing, formatting) |
| `/sdd-new <cambio>` | Inicia un cambio: evalúa complejidad y elige pipeline |
| `/sdd-continue` | Continúa la siguiente fase pendiente |
| `/sdd-status` | Muestra progreso del cambio activo |
| `/sdd-archive` | Archiva cambio completado a `changes/archive/` |

### Persistencia -- OpenSpec

Todo se persiste en `openspec/` siguiendo el estándar [OpenSpec](https://openspec.dev/):

```
openspec/
├── config.yaml              ← Configuración del pipeline (ejecución, TDD, hooks)
├── specs/                   ← Especificaciones principales del proyecto
└── changes/
    ├── {nombre}/            ← Cambio activo (state, spec, design, tasks, reports)
    └── archive/             ← Cambios completados
```

Los agentes leen y escriben artefactos directamente. El orquestador valida pero no escribe por cuenta de los agentes.

### Instruction Files

Archivos generados por `/sdd-instructions` que proveen contexto del stack a personas y agentes por igual. La plataforma las carga automáticamente cuando se tocan archivos relevantes (vía `applyTo` en Copilot, `paths` en Claude Code).

No forman parte del core de Conductor -- son el único punto de extensión por proyecto. Conductor no sobrescribe instrucciones existentes.

---

## Pipeline SDD

```
explore? -> propose -> clarify? -> spec -> design? -> tasks? -> apply -> verify -> archive?
```

| Complejidad | Pipeline | Agentes | Comportamiento |
|-------------|----------|---------|----------------|
| **Trivial / Simple** | Directo | 1 (coder) | Sin pipeline SDD. Delegación directa al coder. |
| **Medium** | Condensado | 3 | Una sola llamada al planner produce todos los artefactos. Luego apply + verify. |
| **Large** | Completo | 3 | Fase por fase con validación entre cada una. Soporta modo interactivo con pausas. |

El modo de ejecución (`auto` o `interactive`) se configura en `config.yaml` y es persistente. En modo `auto`, el pipeline corre sin pausas. En modo `interactive`, pausa antes de apply y antes de verify.

---

## Primer uso

```
1. Copiar agents/ y skills/ al proyecto
2. /sdd-init               # detecta stack, crea openspec/config.yaml
3. /sdd-instructions        # genera instruction files por stack
4. /sdd-new <cambio>        # primer cambio SDD
```

> **Vienes de Angular, React, Java, Salesforce, SAP Commerce, Magento u otro stack?** Lee la [Guía de Adopción](docs/extending-stacks.md) para saber cómo integrar Conductor en tu proyecto (nuevo, legacy o en curso), cómo iterar las instruction files y cuándo crear skills propias.

---

## Plataformas

| | Copilot CLI | Claude Code |
|--|-------------|-------------|
| **Skills** | `.github/skills/` | `.claude/skills/` |
| **Agents** | `.github/agents/` (`.agent.md`) | `.claude/agents/` |
| **Instruction files** | `.github/instructions/*.instructions.md` | `.claude/rules/*.md` |
| **Delegación** | Sub-agents nativos + `/delegate` | `Agent` tool |
| **Apply paralelo** | `/fleet` (paralelismo por context-window isolation) | `Agent` tool + `isolation: "worktree"` |
| **Model routing** | `model` frontmatter, `/model`, BYOK | `model` frontmatter, `/model`, env vars |

Ambas plataformas comparten los mismos artefactos en `openspec/`, la misma lógica de skills y agents, y los mismos protocolos. `/sdd-instructions` detecta la plataforma y genera instruction files en el formato correcto.

