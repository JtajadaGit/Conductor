# 🎼 Conductor

**Core de orquestación de agentes IA para equipos**

---

## ¿Qué es Conductor?

Conductor es un framework de orquestación que convierte a los agentes de IA (Claude Code, GitHub Copilot) en equipos de ingeniería estructurados. En lugar de conversar libremente con un modelo, Conductor establece un **orquestador central** que delega trabajo a **sub-agentes especializados**, cada uno con un rol claro, un contexto limpio y reglas de calidad inyectadas automáticamente.

El problema que resuelve es concreto: cuando un agente IA trabaja en una conversación larga, el contexto crece sin control, las decisiones se vuelven inconsistentes y la calidad decae. Conductor elimina este problema separando la coordinación de la ejecución. El orquestador piensa y decide; los sub-agentes ejecutan con contexto fresco y reglas precisas.

Conductor está diseñado para **equipos reales** que usan IA como herramienta de desarrollo. Si trabajas solo o en equipo, con Claude Code o con GitHub Copilot, Conductor te da un flujo de trabajo reproducible, predecible y auditable para llevar ideas de la exploración a producción.

---

## ✨ Características principales

- **Flujo SDD completo** — Spec-Driven Development: de la idea al código verificado en fases estructuradas (explore → propose → spec → design → tasks → apply → verify → archive)
- **Skills agnósticos** — 12+ skills especializados que funcionan con cualquier stack tecnológico
- **Multi-plataforma** — Compatible con Claude Code, GitHub Copilot (VS Code) y Copilot CLI (terminal)
- **Modo TDD estricto** — Ciclo RED → GREEN → REFACTOR integrado opcionalmente en la fase de implementación
- **Judgment Day** — Protocolo de revisión adversarial paralela con dos jueces independientes
- **Persistencia OpenSpec** — Artefactos versionados en disco que sobreviven a reinicios de sesión y compactación de contexto
- **Optimización de modelos** — Asignación inteligente de modelos por fase (opus para decisiones, sonnet para ejecución, haiku para cierre)
- **Delegación segura** — Sub-agentes con contexto fresco y reglas pre-inyectadas; sin fugas de estado
- **Skill Registry** — Resolución automática de convenciones de proyecto e inyección en cada sub-agente
- **Recuperación ante compactación** — Estado persistido en `state.yaml` que permite retomar flujos interrumpidos

---

## 🏗️ Arquitectura

```
┌─────────────────────────────────────────────────────┐
│                     USUARIO                         │
│              (comandos / conversación)               │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│               🎼 ORQUESTADOR                        │
│  ┌───────────────────────────────────────────────┐  │
│  │ • Coordina, NO ejecuta                        │  │
│  │ • Mantiene conversación delgada               │  │
│  │ • Resuelve skills del registro                │  │
│  │ • Asigna modelo por fase                      │  │
│  │ • Persiste estado del DAG                     │  │
│  └───────────────────────────────────────────────┘  │
└───────┬─────────┬─────────┬─────────┬───────────────┘
        │         │         │         │
        ▼         ▼         ▼         ▼
   ┌────────┐┌────────┐┌────────┐┌────────┐
   │ explore ││ propose││  spec  ││ design │  ... sub-agentes
   │(sonnet) ││(opus)  ││(sonnet)││(opus)  │
   └────┬───┘└────┬───┘└────┬───┘└────┬───┘
        │         │         │         │
        ▼         ▼         ▼         ▼
   ┌─────────────────────────────────────────┐
   │          SKILLS (reglas compactas)       │
   │  testing · naming · patterns · tdd ...  │
   └─────────────────────────────────────────┘
```

Cada sub-agente arranca con **contexto fresco** (sin memoria de la conversación), recibe las reglas del proyecto pre-inyectadas y devuelve un resultado estructurado al orquestador.

---

## 🔄 Flujo SDD (vista rápida)

```
 ┌─────────┐   ┌─────────┐   ┌────────┐   ┌────────┐
 │ explore │──▶│ propose │──▶│  spec  │──▶│ design │
 │(opcional│   │         │   │        │   │        │
 └─────────┘   └─────────┘   └───┬────┘   └───┬────┘
                                  │            │
                                  ▼            │
                              ┌────────┐       │
                              │ tasks  │◀──────┘
                              └───┬────┘
                                  │
                                  ▼
                              ┌────────┐
                              │ apply  │ ← (batches)
                              └───┬────┘
                                  │
                                  ▼
                              ┌────────┐
                              │ verify │
                              └───┬────┘
                                  │
                                  ▼
                              ┌─────────┐
                              │ archive │
                              └─────────┘
```

**Grafo de dependencias:**

```
proposal ──▶ specs ──▶ tasks ──▶ apply ──▶ verify ──▶ archive
                ▲
                │
             design
```

---

## 🚀 Inicio Rápido

### 1. Clonar o copiar los archivos de Conductor

```bash
# Opción A: clonar el repo completo
git clone https://github.com/<tu-org>/Conductor.git

# Opción B: copiar los archivos de configuración a tu proyecto

# Para GitHub Copilot (Linux/Mac)
cp instructions/copilot-instructions.md tu-proyecto/.github/copilot-instructions.md
cp -r skills/ tu-proyecto/.github/skills/

# Para GitHub Copilot (Windows PowerShell)
Copy-Item instructions\copilot-instructions.md tu-proyecto\.github\copilot-instructions.md
Copy-Item -Recurse skills\ tu-proyecto\.github\skills\

# Para Claude Code (Linux/Mac)
cp instructions/CLAUDE.md tu-proyecto/.claude/CLAUDE.md
cp -r skills/ tu-proyecto/.claude/skills/

# Para Claude Code (Windows PowerShell)
Copy-Item instructions\CLAUDE.md tu-proyecto\.claude\CLAUDE.md
Copy-Item -Recurse skills\ tu-proyecto\.claude\skills\
```

### 2. Inicializar SDD en tu proyecto

```
/sdd-init
```

El orquestador detectará tu stack tecnológico, framework de testing, convenciones y creará la configuración base.

### 3. Crear tu primer feature

```
/sdd-new autenticación-jwt
```

Esto lanza automáticamente una exploración del codebase seguida de una propuesta de cambio. A partir de ahí, usa `/sdd-continue` para avanzar fase por fase o `/sdd-ff` para avanzar rápido hasta tener el plan completo.

> 📖 Guía completa: [Inicio Rápido](./docs/01-inicio-rapido.md)

---

## 💻 Plataformas Compatibles

| Plataforma | Instrucciones (source) | Skills (source) | Destino en proyecto | Estado |
|------------|------------------------|-----------------|---------------------|--------|
| **Claude Code** | `instructions/CLAUDE.md` | `skills/` | `.claude/` | ✅ Completo |
| **GitHub Copilot (VS Code)** | `instructions/copilot-instructions.md` | `skills/` | `.github/` | ✅ Completo |
| **Copilot CLI (Terminal)** | `instructions/copilot-instructions.md` | `skills/` | `.github/` | ✅ Completo |

Los skills son idénticos para todas las plataformas. Solo cambia el archivo de instrucciones del orquestador y la ruta de destino en el proyecto.

> 📖 Detalle completo: [Plataformas Compatibles](./docs/08-plataformas-compatibles.md)

---

## 📚 Documentación

| # | Documento | Descripción |
|---|-----------|-------------|
| 01 | [Inicio Rápido](./docs/01-inicio-rapido.md) | Guía de inicio rápido |
| 02 | [Arquitectura](./docs/02-arquitectura.md) | Arquitectura y modelo de agentes |
| 03 | [Flujo SDD Completo](./docs/03-flujo-sdd-completo.md) | Flujo SDD completo paso a paso |
| 04 | [Catálogo de Skills](./docs/04-catalogo-skills.md) | Catálogo de todos los skills disponibles |
| 05 | [Modo TDD Estricto](./docs/05-modo-tdd-estricto.md) | Modo TDD estricto (RED → GREEN → REFACTOR) |
| 06 | [Judgment Day](./docs/06-judgment-day.md) | Revisión adversarial (Judgment Day) |
| 07 | [Sub-agentes y Delegación](./docs/07-subagentes-y-delegacion.md) | Sub-agentes y delegación |
| 08 | [Plataformas Compatibles](./docs/08-plataformas-compatibles.md) | Plataformas compatibles |
| 09 | [OpenSpec y Persistencia](./docs/09-openspec-y-persistencia.md) | OpenSpec y persistencia de artefactos |
| 10 | [Consumo de Tokens](./docs/10-consumo-tokens.md) | Consumo de tokens y requests |
| 11 | [Crear Skills Personalizados](./docs/11-crear-skills-personalizados.md) | Crear skills personalizados |
| 12 | [Referencia de Comandos](./docs/12-comandos-referencia.md) | Referencia completa de comandos |
| 13 | [Mejores Prácticas](./docs/13-mejores-practicas.md) | Mejores prácticas y patrones |

---

## 📁 Estructura del Proyecto

```
Conductor/
├── README.md                              ← Este archivo
├── instructions/
│   ├── CLAUDE.md                          ← Instrucciones del orquestador (Claude Code)
│   └── copilot-instructions.md            ← Instrucciones del orquestador (GitHub Copilot)
├── skills/
│   ├── _shared/                           ← Protocolos compartidos entre skills
│   │   ├── skill-resolver.md              ← Protocolo de resolución de skills
│   │   ├── sdd-phase-common.md            ← Convenciones comunes de fases SDD
│   │   ├── persistence-contract.md        ← Contrato de persistencia
│   │   └── openspec-convention.md         ← Convención de archivos OpenSpec
│   ├── skill-registry/SKILL.md            ← Genera/actualiza el registro de skills
│   ├── skill-creator/SKILL.md             ← Crea nuevos skills personalizados
│   ├── sdd-init/SKILL.md                  ← Inicialización de SDD
│   ├── sdd-explore/SKILL.md               ← Exploración e investigación
│   ├── sdd-propose/SKILL.md               ← Generación de propuestas
│   ├── sdd-spec/SKILL.md                  ← Escritura de especificaciones
│   ├── sdd-design/SKILL.md                ← Diseño técnico
│   ├── sdd-tasks/SKILL.md                 ← Desglose de tareas
│   ├── sdd-apply/SKILL.md                 ← Implementación (+ strict-tdd.md)
│   ├── sdd-verify/SKILL.md                ← Verificación (+ strict-tdd-verify.md)
│   ├── sdd-archive/SKILL.md               ← Archivado y cierre
│   └── judgment-day/SKILL.md              ← Revisión adversarial paralela
└── docs/
    └── *.md                               ← Documentación completa
```

> **Modelo de despliegue:** Este repo es un template. Los skills se mantienen en una sola copia (`skills/`) y se copian al directorio de la plataforma destino (`.github/skills/` o `.claude/skills/`) en cada proyecto.


