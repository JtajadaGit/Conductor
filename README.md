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

| Comando | Descripción |
|---------|-------------|
| `/sdd-init` | Detecta stack, crea `openspec/config.yaml` |
| `/instructions` | Genera instruction files por stack: framework, testing, formatting |
| `/sdd-new <name>` | Nuevo cambio: evalúa complejidad → elige pipeline automáticamente |
| `/sdd-continue` | Continuar siguiente fase pendiente |
| `/sdd-status` | Mostrar progreso del cambio activo |
| `/sdd-archive` | Archivar cambio completado |

---

## Estructura de un proyecto con Conductor

Tras `/sdd-init` + `/instructions` + un cambio SDD:

```
tu-proyecto/
├── .github/
│   └── instructions/                    ← Instruction files para GitHub Copilot
│       ├── angular.instructions.md      ←   applyTo: "**/*.component.ts,**/*.service.ts,..."
│       ├── testing.instructions.md      ←   applyTo: "**/*.spec.ts"
│       └── formatting.instructions.md   ←   applyTo: "**/*.ts,**/*.html"
├── .claude/
│   └── rules/                           ← Instruction files para Claude Code
│       ├── angular.md                   ←   (mismo contenido, formato Claude)
│       ├── testing.md
│       └── formatting.md
├── openspec/                            ← Pipeline SDD (generado por /sdd-init)
│   ├── config.yaml                      ←   Config ejecutable (hooks, TDD, test commands)
│   ├── specs/                           ←   Especificaciones principales
│   └── changes/
│       ├── mi-feature/                  ←   Cambio activo (generado por /sdd-new)
│       │   ├── state.yaml
│       │   ├── specs/{domain}/spec.md
│       │   ├── design.md
│       │   └── tasks.md
│       └── archive/                     ←   Cambios completados
└── src/                                 ←   Tu código (Conductor no lo toca directamente)
```

> Los instruction files se generan por stack detectado (Angular, React, Django, Spring, etc.) con `applyTo` específico. La plataforma los carga automáticamente cuando el agente toca archivos relevantes.

---

## Plataformas

### Comparativa

|  | Claude Code | Copilot CLI | Copilot VS Code |
|--|-------------|-------------|-----------------|
| **Plugin system** | `/plugin add` | `/plugin install` | No nativo (copiar a `.github/`) |
| **Skills** | `.claude/commands/` o plugin | `.github/skills/` | `.github/skills/` |
| **Agents** | `.claude/agents/` o plugin | `.github/agents/` (`.agent.md`) | `.github/agents/` (`.agent.md`) |
| **Instruction files** | `.claude/rules/*.md` | `.github/instructions/*.instructions.md` | `.github/instructions/*.instructions.md` |
| **Parallel apply** | `Agent` tool + `isolation: "worktree"` | `/fleet` + worktrees | Delega a Copilot CLI |
| **Model routing** | `model:` por delegación (opus/sonnet/haiku) | `--model` flag o BYOK | Modelo de Copilot settings |
| **Sub-agent delegation** | `Agent` tool | Sub-agents automáticos + `/delegate` | Copilot Chat agents |
| **No sobrescribe** | `CLAUDE.md` intacto | `copilot-instructions.md` intacto | `copilot-instructions.md` intacto |

### Cómo funciona en cada plataforma

**Claude Code**: El orquestador usa `Agent` tool para delegar a sub-agentes (`sdd-planner`, `sdd-coder`, `sdd-reviewer`). Cada agente se lanza en un contexto aislado. Parallel apply usa `isolation: "worktree"` + `run_in_background: true`.

**Copilot CLI**: El orquestador delega a sub-agentes via el sistema nativo de agentes. Parallel apply usa `/fleet` para lanzar coders simultáneos en worktrees independientes. Soporta BYOK para usar cualquier modelo compatible.

**Copilot VS Code**: El orquestador delega via Copilot Chat agents. Para pipelines complejos con paralelismo, puede hand-off a Copilot CLI. Las instruction files se cargan automáticamente al editar archivos que matchean `applyTo`.

### Qué comparten las 3 plataformas

- **`openspec/`** — mismos artefactos SDD (config.yaml, specs, changes, state.yaml). Cualquier plataforma lee y escribe los mismos archivos.
- **Instruction files** — `/instructions` genera AMBOS formatos simultáneamente (`.claude/rules/` + `.github/instructions/`). Equipos mixtos trabajan con los mismos estándares.
- **Skills y agents** — misma lógica, mismos archivos `.md`. La plataforma determina cómo se cargan y ejecutan.

### Primer uso (cualquier plataforma)

```
1. /sdd-init     ← detecta stack, genera openspec/config.yaml (pipeline config)
2. /instructions ← genera instruction files por stack (framework, testing, formatting)
3. (opcional) editar openspec/config.yaml → execution_mode: auto
4. /sdd-new <nombre>  ← evalúa complejidad, elige pipeline automáticamente
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
USUARIO: /sdd-new contact-page "Añadir página de contacto con formulario reactivo,
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

