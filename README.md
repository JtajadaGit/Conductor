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
                 │  instructions/ (per platform)    │
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
| **Instructions** | `instructions/CLAUDE.md` o `copilot-instructions.md` | Orquestador SDD (uno por plataforma) |
| **Agents** | `agents/sdd-planner/`, `sdd-coder/`, `sdd-reviewer/` | Ejecutores de fases SDD (contexto aislado) |
| **Skills** | `skills/sdd-*/` + `conventions/` | Flujos invocables on-demand (0 tokens hasta uso) |

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
| **Team Conventions** | `/conventions` actualiza `## Team Standards` en `context.md` — contrato entre personas e IAs del equipo |

### Contexto persistente (sin re-explorar en cada sesión)

| Artefacto | Generado por | Lo lee |
|-----------|-------------|--------|
| `openspec/context.md` | sdd-init + conventions | Orquestador al iniciar sesión. Incluye repo context + team standards |
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
| `/sdd-init` | Detecta stack, crea openspec, genera context files | 1 req |
| `/sdd-new <name>` | Nuevo cambio: [explore?] → propose → clarify | 2-3 req |
| `/sdd-ff <name>` | Fast-forward: condensado (1 planner) o completo según complejidad | 1-3 req |
| `/sdd-continue` | Continuar siguiente fase pendiente | 1 req |
| `/sdd-status` | Mostrar progreso del cambio activo | 0 req |
| `/sdd-archive` | Archivar cambio completado | 1 req |
| `/conventions` | Generar/actualizar `## Team Standards` en `context.md` desde config files | 1 req |

---

## Estructura del Repositorio

```
Conductor/
├── instructions/
│   ├── CLAUDE.md                    ← Orquestador para Claude Code
│   └── copilot-instructions.md      ← Orquestador para GitHub Copilot (VS Code / CLI)
├── agents/
│   ├── _shared/
│   │   ├── sdd-protocol.md          ← Protocolo SDD para agentes (on-demand)
│   │   └── orchestrator-reference.md ← Referencia orquestador (on-demand)
│   ├── sdd-planner/AGENT.md
│   ├── sdd-coder/
│   │   ├── AGENT.md
│   │   └── strict-tdd.md
│   └── sdd-reviewer/
│       ├── AGENT.md
│       └── strict-tdd-verify.md
├── skills/
│   ├── sdd-init/SKILL.md
│   ├── sdd-new/SKILL.md
│   ├── sdd-ff/SKILL.md
│   ├── sdd-continue/SKILL.md
│   ├── sdd-status/SKILL.md
│   ├── sdd-archive/SKILL.md
│   └── conventions/SKILL.md
└── docs/
    ├── quick-start.md
    ├── sdd-pipeline.md
    ├── openspec.md
    └── advanced.md
```

---

## Deploy por Plataforma

### Claude Code
```bash
cp Conductor/instructions/CLAUDE.md            tu-proyecto/.claude/CLAUDE.md
cp -r Conductor/agents/                        tu-proyecto/.claude/agents/
cp -r Conductor/skills/                        tu-proyecto/.claude/skills/
```

### GitHub Copilot (VS Code / CLI)
```bash
cp Conductor/instructions/copilot-instructions.md     tu-proyecto/.github/copilot-instructions.md
cp -r Conductor/agents/                               tu-proyecto/.github/agents/
cp -r Conductor/skills/                               tu-proyecto/.github/skills/
```

### Dual (ambas plataformas)
Combina los dos bloques. `openspec/` es compartido — cualquier plataforma lee y escribe los mismos artefactos.

### Primer uso
```
/sdd-init    ← detecta stack, genera openspec/ (context.md + config.yaml)
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

