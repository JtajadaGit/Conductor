# Conductor

**Framework SDD compacto, agnóstico de stack, multi-platform (Claude Code · GitHub Copilot · Cursor · Gemini CLI)**

---

## ¿Qué es Conductor?

Un orquestador que convierte agentes IA en equipos de ingeniería estructurados. Un **orquestador central** delega trabajo a **3 agentes especializados** con contexto fresco y convenciones del proyecto inyectadas automáticamente.

Conductor usa **Spec-Driven Development (SDD)**: las especificaciones dirigen el diseño, el diseño dirige la implementación. Compatible con [OpenSpec](https://openspec.dev/) — los artefactos base (`specs/`, `changes/`, `config.yaml`) siguen la convención estándar; Conductor extiende con phase gates, artifact locks y sub-agent context injection bajo el namespace `x-conductor`.

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
      │ spec         │  │              │  │              │
      │ design       │  │              │  │              │
      │ tasks        │  │              │  │              │
      └──────────────┘  └──────────────┘  └──────────────┘
```

### Capas

| Capa | Archivos | Función |
|------|----------|---------|
| **Instructions** | `instructions/CLAUDE.md` o `copilot-instructions.md` | Orquestador SDD (uno por plataforma) |
| **Agents** | `agents/sdd-planner/`, `sdd-coder/`, `sdd-reviewer/` | Ejecutores de fases SDD (contexto aislado) |
| **Skills** | `skills/sdd-*/` + `skill-registry/` | Flujos invocables on-demand (0 tokens hasta uso) |

### Características principales

| Feature | Descripción |
|---------|-------------|
| **Hard Stop Rule** | Evalúa complejidad antes de actuar: trivial/simple → delega directo, medio/grande → sugiere SDD |
| **Execution Mode** | Auto (back-to-back) o Interactive (pausa tras cada fase). Se elige al inicio de sesión |
| **Model Routing** | Asigna tier de modelo por fase: high-capability para propose/design, standard para el resto, fast para inline |
| **Inline vs Delegate** | 1-3 archivos → puede ser inline. 4+ archivos → siempre delegar |
| **Artifact Locks** | Spec y design se bloquean tras completar tasks (previene spec-drift) |
| **Lessons Learned** | Registro append-only de errores y soluciones entre sesiones |
| **Skill Resolution Feedback** | Auto-recarga registry si un sub-agente pierde contexto tras compactación |
| **OpenSpec Compliant** | `config.yaml` usa schema estándar + extensiones bajo `x-conductor` |
| **Parallelism Markers** | Tasks se marcan con `[P]` cuando pueden ejecutarse en paralelo |
| **Spec Self-Validation** | Auto-verifica escenarios, no-impl-details y markers resueltos antes de avanzar |
| **Delegation Anti-patterns** | Reglas explícitas de cuándo SIEMPRE delegar |

### Contexto persistente (sin re-explorar en cada sesión)

| Artefacto | Generado por | Lo lee |
|-----------|-------------|--------|
| `.github/instructions/context.instructions.md` | sdd-init | Copilot automático + Orquestador Claude al iniciar sesión |
| `.github/instructions/conventions.instructions.md` | skill-registry | Copilot automático + Orquestador Claude al iniciar sesión |
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
| `/sdd-ff <name>` | Fast-forward: propose → clarify → spec → design → tasks | 4-5 req |
| `/sdd-continue` | Continuar siguiente fase pendiente | 1 req |
| `/sdd-status` | Mostrar progreso del cambio activo | 0 req |
| `/sdd-archive` | Archivar cambio completado | 1 req |
| `/skill-registry` | Generar/actualizar context files y registry | 1 req |

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
│   └── skill-registry/SKILL.md
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
Combina los dos bloques. `openspec/` y `.github/instructions/` son compartidos — cualquier plataforma lee y escribe los mismos artefactos.

### Primer uso
```
/sdd-init    ← detecta stack, genera openspec/ y .github/instructions/
```

---

## Prueba de Concepto: traza de `/sdd-ff add-user-auth`

```
USUARIO: /sdd-ff add-user-auth "Añadir autenticación JWT con refresh tokens"

ORQUESTADOR:
  1. SDD Init Guard → ¿existe openspec/config.yaml? ✓
  2. Execution Mode → (cacheado: Auto)
  3. Input Assessment → 12 palabras, scope claro → SKIP explore
  4. Crea openspec/changes/add-user-auth/state.yaml (all pending)

  ── PROPOSE (sdd-planner, high-capability) ─────────────────────
  Contexto inyectado:
    - ## Repo Context (desde context.instructions.md)
    - ## Project Principles (desde principles.md)
    - ## Project Standards (desde conventions.instructions.md)
    - PHASE: propose
    - Artifact store: openspec
    - Change: add-user-auth

  Output: openspec/changes/add-user-auth/proposal.md (≤400 words)
  Return: { status: success, artifacts: [proposal.md], next: clarify }
  state.yaml → propose: done

  ── CLARIFY (sdd-planner, standard) ────────────────────────────
  Inputs: proposal.md (required)
  Output: questions.md con 2 preguntas (refresh token strategy, session storage)
  Return: { status: success, questions_count: 2, requires_human_input: true }

  GATE → PAUSA. Presenta preguntas al usuario.
  Usuario responde → continúa.
  state.yaml → clarify: done

  ── SPEC (sdd-planner, standard) ───────────────────────────────
  Inputs: proposal.md + questions.md
  Lee openspec/specs/auth/ si existe (delta spec) o crea full spec
  Self-validation: ✓ cada req tiene GIVEN/WHEN/THEN, ✓ no impl details
  Output: openspec/changes/add-user-auth/specs/auth/spec.md (≤650 words)
  state.yaml → spec: done

  ── DESIGN (sdd-planner, high-capability) ──────────────────────
  Inputs: proposal.md + specs/auth/spec.md (REQUIRED)
  Lee: exploration.md (no existe, skip), lessons-learned.md (si existe)
  Principles gate: ✓ pass/fail table vs principles.md
  Output: openspec/changes/add-user-auth/design.md (≤800 words)
  state.yaml → design: done

  ── TASKS (sdd-planner, standard) ──────────────────────────────
  Inputs: spec.md + design.md (REQUIRED)
  Output: tasks.md con [P] markers, hierarchical numbering
  Consistency Check: coverage ✓, alignment ✓, contradictions ✓, completeness ✓
  state.yaml → tasks: done, locks: { spec: true, design: true }

ORQUESTADOR:
  "Planning complete. 5 fases ejecutadas. ¿Continúo con apply?"
```

**Validación del flujo:**
- ✅ Sub-agentes reciben contexto inyectado (no descubren)
- ✅ OpenSpec artifacts en estructura estándar
- ✅ Extensions (state.yaml, locks) claramente separadas
- ✅ Gates funcionan (clarify pausa, consistency check)
- ✅ No hay duplicación de info entre artifacts
- ✅ Cada fase tiene I/O explícito
- ✅ `config.yaml` usa `x-conductor` para extensiones

---

## Documentación

- [Quick Start](docs/quick-start.md) — Instalación y primer uso
- [Pipeline SDD](docs/sdd-pipeline.md) — Fases, TDD, hooks
- [OpenSpec](docs/openspec.md) — Persistencia, artefactos, recuperación
- [Avanzado](docs/advanced.md) — Tokens, mejores prácticas, troubleshooting
