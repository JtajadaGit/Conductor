# Conductor

**Framework SDD compacto, agnóstico de stack, multi-platform (Claude Code · GitHub Copilot)**

---

## Documentación

| Doc | Descripción |
|-----|-------------|
| [Conductor 101](docs/conductor-101.md) | **Empieza aquí** — Tus primeros 15 minutos |
| [Quick Start](docs/quick-start.md) | Instalación y primer uso |
| [Pipeline SDD](docs/sdd-pipeline.md) | Fases, modos, paralelismo, TDD, hooks |
| [OpenSpec](docs/openspec.md) | Persistencia, artefactos, config.yaml, recuperación |
| [Avanzado](docs/advanced.md) | Tokens, mejores prácticas, troubleshooting |

---

## ¿Qué es Conductor?

Cuando pides a una IA que implemente un cambio complejo, suele generar código sin planificar, sin verificar y sin documentar. Conductor cambia eso: un **orquestador central** delega trabajo a **3 agentes especializados** (planificador, implementador, verificador) con contexto fresco y convenciones del proyecto inyectadas automáticamente.

Conductor usa **Spec-Driven Development (SDD)** — escribir una especificación ANTES del código, para que el diseño sea testable y el resultado auditable: las especificaciones dirigen el diseño, el diseño dirige la implementación. Compatible con [OpenSpec](https://openspec.dev/) — ver también [Claude Code docs](https://docs.anthropic.com/en/docs/claude-code) y [GitHub Copilot docs](https://docs.github.com/en/copilot) — los artefactos base (`specs/`, `changes/`, `config.yaml`) siguen la convención estándar; Conductor extiende con phase gates, artifact locks y sub-agent context injection bajo el namespace `x-conductor`.

---

## Arquitectura

```
                 ┌─────────────────────────────────┐
                 │           USUARIO               │
                 └───────────────┬─────────────────┘
                                 ▼
                 ┌─────────────────────────────────┐
                 │        ORQUESTADOR               │
                 │  Coordina · NO ejecuta           │
                 │  skills/ (on-demand entry point) │
                 └───────────────┬─────────────────┘
              ┌──────────────────┼──────────────────┐
              ▼                  ▼                   ▼
      ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
      │ sdd-planner  │  │  sdd-coder   │  │ sdd-reviewer │
      │ explore      │  │ apply        │  │ verify       │
      │ propose      │  │ fix          │  │              │
      │ clarify      │  │              │  │              │
      │ spec         │  │  ┌─ parallel ─┐│              │
      │ design       │  │  │ worktree A ││              │
      │ tasks        │  │  │ worktree B ││              │
      │              │  │  │ worktree N ││              │
      │              │  │  └────────────┘│              │
      └──────────────┘  └──────────────┘  └──────────────┘
```

### Capas

| Capa | Archivos | Función |
|------|----------|---------|
| **Skills** | `skills/sdd-*/` + `instructions/` | Entry point del orquestador. Flujos invocables on-demand (0 tokens hasta uso) |
| **Agents** | `agents/sdd-planner/`, `sdd-coder/`, `sdd-reviewer/` | Ejecutores de fases SDD (contexto aislado) |
| **Shared** | `agents/_shared/`, `skills/_shared/` | Protocolos compartidos (cargados on-demand por agentes y skills) |

> **Plugin architecture**: Conductor no sobrescribe instrucciones del proyecto (`CLAUDE.md`, `.github/copilot-instructions.md`). Los skills son el entry point — cada `/sdd-*` define su propia lógica de orquestación.

### Características principales

| Feature | Descripción |
|---------|-------------|
| **Hard Stop Rule** | Evalúa complejidad antes de actuar: trivial/simple → delega directo, medio/grande → sugiere SDD |
| **Spec-light Mode** | Cambios medium con scope claro → omite proposal, produce spec+design+tasks directamente. Menos tokens, misma calidad |
| **Condensed Pipeline** | Cambios medium → 1 sola llamada al planner produce todos los artefactos. 3 agents total |
| **Execution Mode** | `auto` (0 pausas) o `interactive` (pausa antes de apply y verify). Persistente en `config.yaml` — se configura una vez |
| **Model Routing** | Asigna tier de modelo por fase: high-capability para propose/design, standard para el resto, fast para inline |
| **Post-Delegation Validation** | Tras cada agente, el orquestador verifica artefactos y state.yaml. Si faltan → re-lanza (nunca escribe inline) |
| **Spec Amendments** | Si el coder descubre un gap en la spec durante apply → lo documenta como amendment sin romper el pipeline |
| **Parallel Apply** | ≥2 grupos por dominio con ≥2 tasks cada uno y 0 archivos compartidos → coders paralelos en worktrees. Wave 1 (parallel) → merge → Wave 2 (sequential + reconciliación) |
| **`[P]`/`[S]` Marking** | Source files disjuntos → `[P]`. Tests, integración, imports cruzados → siempre `[S]` |
| **Artifact Locks** | Spec y design se bloquean tras completar tasks (previene spec-drift) |
| **Lessons Learned** | Registro append-only de errores y soluciones entre sesiones |
| **OpenSpec Compatible** | `config.yaml` usa schema estándar + extensiones bajo `x-conductor` |
| **Visual Output** | Delegation boxes (`┌─ ... ─┐`), pipeline progress bar (`● ◉ ○ ⊘`), gate warnings — todo visible |
| **Agent State Updates** | Cada agente actualiza state.yaml al completar su fase (no depende del orquestador) |
| **Compaction Awareness** | Estado en artefactos para recovery sin pérdida tras compactación |
| **Trivial Tracking** | Incluso cambios triviales/simples crean `state.yaml` mínimo para historial completo |
| **Team Conventions** | `/instructions` genera instruction files nativos de plataforma — contrato entre personas e IAs del equipo |

### Contexto persistente (sin re-explorar en cada sesión)

| Artefacto | Generado por | Lo lee |
|-----------|-------------|--------|
| `.github/instructions/` + `.claude/rules/` | `/instructions` | Auto-cargados por la plataforma. Stack, arquitectura, testing, formatting |
| `openspec/changes/*/state.yaml` | Cada fase | Orquestador en compactación/recovery |

---

## Pipeline SDD

```
init? → [explore?] → propose → clarify? → spec → design → tasks → apply ⟲ fix → verify → archive?
```

---

## Comandos

| Comando | Descripción | Coste |
|---------|-------------|-------|
| `/sdd-init` | Detecta stack, crea `openspec/config.yaml` | 1 req |
| `/sdd-new <name>` | Nuevo cambio: [explore?] → propose → clarify | 2-3 req |
| `/sdd-ff <name>` | Fast-forward: condensado (1 planner) o completo según complejidad | 1-3 req |
| `/sdd-continue` | Continuar siguiente fase pendiente | 1 req |
| `/sdd-status` | Mostrar progreso del cambio activo | 0 req |
| `/sdd-archive` | Archivar cambio completado | 1 req |
| `/instructions` | Genera instruction files por stack: framework, testing, formatting | 1 req |

---

## Estructura del Plugin

```
Conductor/
├── .claude-plugin/
│   └── marketplace.json             ← Registro de plugins disponibles
├── plugins/
│   └── conductor/
│       ├── .claude-plugin/
│       │   └── plugin.json          ← Manifest del plugin (Claude Code)
│       ├── agents/
│       │   ├── _shared/
│       │   │   ├── sdd-protocol.md          ← Protocolo SDD para agentes (on-demand)
│       │   │   └── orchestrator-reference.md ← Referencia orquestador (on-demand)
│       │   ├── sdd-planner/AGENT.md
│       │   ├── sdd-coder/
│       │   │   ├── AGENT.md
│       │   │   └── strict-tdd.md
│       │   └── sdd-reviewer/
│       │       ├── AGENT.md
│       │       └── strict-tdd-verify.md
│       └── skills/
│           ├── _shared/
│           │   └── orchestration-protocol.md ← Protocolo de orquestación (on-demand)
│           ├── sdd-init/SKILL.md
│           ├── sdd-new/SKILL.md
│           ├── sdd-ff/SKILL.md
│           ├── sdd-continue/SKILL.md
│           ├── sdd-status/SKILL.md
│           ├── sdd-archive/SKILL.md
│           └── instructions/SKILL.md
└── docs/
```

---

## Instalación

### Claude Code

```bash
# Desde tu proyecto, instalar el plugin
/plugin add <ruta-a-Conductor>
```

El plugin registra automáticamente los skills (`/sdd-init`, `/sdd-ff`, etc.) y los agentes. No sobrescribe `CLAUDE.md` ni ningún archivo del proyecto.

### GitHub Copilot (VS Code / CLI)

> Pendiente: integración Copilot via plugin. Por ahora, copiar manualmente `agents/` y `skills/` a `.github/`.

### Primer uso

```
1. /sdd-init    ← detecta stack, genera openspec/config.yaml (pipeline config)
2. /instructions ← genera instruction files por stack (framework, testing, formatting)
3. (opcional) editar openspec/config.yaml → execution_mode: auto
4. /sdd-ff <nombre>  ← pipeline condensado (o /sdd-new para cambios grandes)
```

---

## Prueba de Concepto: trazas de ejemplo

### Cambio trivial (short-circuit)
```
USUARIO: /sdd-new "añade título animado al header"
ORQUESTADOR:
  1. Complexity Gate → scope claro, single concern, ≤4 archivos → SIMPLE
  2. "Cambio simple — delegando directamente al coder sin pipeline SDD."
  3. Delega a sdd-coder (model: sonnet) con instrucciones directas
  → 1 agente, ~30s, 0 artefactos markdown
```

### Cambio medium (pipeline condensado — 3 agents)
```
USUARIO: /sdd-ff contact-page "Añadir página de contacto con formulario reactivo,
         validaciones, toast de éxito y ruta /contact"
ORQUESTADOR:
  1. Complexity Gate → multi-file, necesita diseño → MEDIUM ✓
  2. SDD Init Guard → openspec/config.yaml existe ✓
  3. Spec-light → request >50 palabras con scope claro → omite proposal
  4. Execution Mode → lee config.yaml → auto

  ── FAST-FORWARD (sdd-planner, SPEC_LIGHT, model: opus) ───────
  UNA sola llamada produce: spec.md + design.md + tasks.md + state.yaml
  Post-delegation validation → artefactos OK ✓

  ── APPLY ──────────────────────────────────────────────────────
  Parallelism check:
    Dominio "toast" (4 tasks) + dominio "contact" (4 tasks) → Trigger B
  ┌─ PARALLEL ─┐
  │ ◉ coder-A (worktree): toast service + component + tests
  │ ◉ coder-B (worktree): contact component + tests
  └────────────┘
  Merge worktrees → coder sequential: routing + app integration
  Post-delegation validation → artefactos OK ✓

  ── VERIFY (sdd-reviewer, model: sonnet) ──────────────────────
  Post-delegation validation → verify-report.md OK ✓
```

### Cambio large (pipeline completo)
```
USUARIO: /sdd-new add-user-auth "Añadir autenticación JWT con refresh tokens"
ORQUESTADOR:
  1. Complexity Gate → multi-domain, vago → LARGE ✓
  2. Execution Mode → lee config.yaml → interactive
  3. explore → propose → clarify (GATE si hay preguntas) → spec → design → tasks
  4. Post-delegation validation tras cada agente
  → Pausa (interactive): "Planning complete. ¿Continúo con apply?"
  → Pausa (interactive): "Apply complete. ¿Verifico?"
```

