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
| `openspec/context.md` | sdd-init | Orquestador al iniciar sesión (+ copia a `.github/instructions/` si Copilot) |
| `openspec/conventions.md` | skill-registry | Orquestador al iniciar sesión (+ copia a `.github/instructions/` si Copilot) |
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
Combina los dos bloques. `openspec/` es compartido — cualquier plataforma lee y escribe los mismos artefactos. `.github/instructions/` se genera automáticamente si Copilot está configurado.

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

### Cambio complejo (pipeline completo)
```
USUARIO: /sdd-ff add-user-auth "Añadir autenticación JWT con refresh tokens"
ORQUESTADOR:
  1. Complexity Gate → multi-file, necesita diseño, testable → MEDIUM ✓
  2. SDD Init Guard → openspec/config.yaml existe ✓
  3. Input Assessment → scope claro → SKIP explore
  4. Crea state.yaml (auto mode: solo al inicio y al final)

  ── PROPOSE (sdd-planner, model: opus) ─────────────────────────
  Contexto inyectado: openspec/context.md + principles.md + conventions.md
  Output: proposal.md (≤400 words)

  ── CLARIFY (sdd-planner, model: sonnet) ───────────────────────
  2 preguntas → GATE PAUSA → usuario responde → continúa

  ── SPEC (sdd-planner, model: sonnet) ──────────────────────────
  Self-validation: ✓ escenarios, ✓ no impl details, ✓ markers resueltos

  ── DESIGN (sdd-planner, model: opus) ──────────────────────────
  Lee exploration.md + lessons-learned.md. Principles gate: ✓

  ── TASKS (sdd-planner, model: sonnet) ─────────────────────────
  Tasks con [P] markers. Consistency Check ✓. Locks activados.

  → state.yaml final escrito. "Planning complete. ¿Continúo con apply?"
```

**Validación:**
- ✅ Complexity Gate bloquea pipeline para cambios triviales
- ✅ Model tiers diferenciados (opus/sonnet/haiku)
- ✅ Orquestador NUNCA lee código fuente
- ✅ state.yaml escrito solo 2 veces en auto mode
- ✅ Todo en `openspec/` (no `.github/instructions/`)

---

## Documentación

- [Quick Start](docs/quick-start.md) — Instalación y primer uso
- [Pipeline SDD](docs/sdd-pipeline.md) — Fases, TDD, hooks
- [OpenSpec](docs/openspec.md) — Persistencia, artefactos, recuperación
- [Avanzado](docs/advanced.md) — Tokens, mejores prácticas, troubleshooting
