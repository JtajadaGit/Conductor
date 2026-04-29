# POC: Pipeline SDD completo en Copilot CLI y Claude Code

> **Documento de prueba de concepto** — Walkthrough práctico del pipeline Conductor ejecutándose en ambas plataformas. Los comandos y salidas son plausibles, no capturas reales. Fecha: 2026-04-22.

---

## 1. Setup del proyecto (ambas plataformas)

Estructura de directorios tras instalar Conductor en un proyecto Angular 20:

```
proyecto/
├── .github/                          # ← Copilot CLI
│   ├── agents/
│   │   ├── sdd-planner.agent.md
│   │   ├── sdd-coder.agent.md
│   │   └── sdd-reviewer.agent.md
│   ├── skills/
│   │   ├── sdd-init/SKILL.md
│   │   ├── sdd-new/SKILL.md
│   │   ├── sdd-instructions/SKILL.md
│   │   ├── sdd-continue/SKILL.md
│   │   ├── sdd-status/SKILL.md
│   │   └── sdd-archive/SKILL.md
│   ├── instructions/                 # generados por /sdd-instructions
│   │   ├── angular.instructions.md
│   │   ├── testing.instructions.md
│   │   └── formatting.instructions.md
│   └── hooks/hooks.json
│
├── .claude/                          # ← Claude Code
│   ├── agents/
│   │   ├── sdd-planner.md
│   │   ├── sdd-coder.md
│   │   └── sdd-reviewer.md
│   ├── skills/
│   │   ├── sdd-init/SKILL.md
│   │   ├── sdd-new/SKILL.md
│   │   ├── sdd-instructions/SKILL.md
│   │   ├── sdd-continue/SKILL.md
│   │   ├── sdd-status/SKILL.md
│   │   └── sdd-archive/SKILL.md
│   └── rules/                        # generados por /sdd-instructions
│       ├── angular.md
│       ├── testing.md
│       └── formatting.md
│
├── openspec/                         # compartido — ambas plataformas
│   ├── config.yaml
│   ├── specs/
│   └── changes/
│       └── archive/
│
└── src/                              # proyecto Angular
```

**Clave**: los agentes y skills son idénticos en contenido. Solo cambian las rutas y el formato de frontmatter (`applyTo:` vs `paths:`). `openspec/` es compartido.

---

## 2. Inicialización (`/sdd-init`)

El usuario ejecuta `/sdd-init` en su terminal:

### Copilot CLI
```
$ copilot /sdd-init

Detecting stack...
  Language: TypeScript 5.8 (strict)
  Framework: Angular 20 standalone
  Runtime: Node 22.x
  Package manager: npm

Testing infrastructure:
  Runner: vitest
  Layers: unit ✓  integration ✓  e2e ✗
  Coverage: v8

Created:
  openspec/config.yaml
  openspec/specs/
  openspec/changes/archive/

strict_tdd: true (test runner detected)
Run `/sdd-instructions` to generate platform instruction files for your stack.
```

### Claude Code
```
> /sdd-init

Detecting stack...
  Language: TypeScript 5.8 (strict)
  Framework: Angular 20 standalone
  Runtime: Node 22.x
  Package manager: npm

Testing infrastructure:
  Runner: vitest
  Layers: unit ✓  integration ✓  e2e ✗
  Coverage: v8

Created:
  openspec/config.yaml
  openspec/specs/
  openspec/changes/archive/

strict_tdd: true (test runner detected)
Run `/sdd-instructions` to generate platform instruction files for your stack.
```

**Resultado idéntico**: `/sdd-init` es inline (no delega a agentes), genera los mismos archivos. La única diferencia es cómo se invoca.

---

## 3. Generación de instructions (`/sdd-instructions`)

### Copilot CLI — genera `.github/instructions/`
```
$ copilot /sdd-instructions

Reading openspec/config.yaml...
Scanning project config: tsconfig.json, .editorconfig, .prettierrc
Platform detected: .github/

Generated:
  .github/instructions/angular.instructions.md  (applyTo: "**/*.ts")
  .github/instructions/testing.instructions.md   (applyTo: "**/*.spec.ts")
  .github/instructions/formatting.instructions.md (applyTo: "**/*.{ts,html,scss}")
```

Ejemplo de frontmatter Copilot:
```yaml
---
applyTo: "**/*.spec.ts"
---
```

### Claude Code — genera `.claude/rules/`
```
> /sdd-instructions

Reading openspec/config.yaml...
Scanning project config: tsconfig.json, .editorconfig, .prettierrc
Platform detected: .claude/

Generated:
  .claude/rules/angular.md       (paths: ["**/*.ts"])
  .claude/rules/testing.md       (paths: ["**/*.spec.ts"])
  .claude/rules/formatting.md    (paths: ["**/*.{ts,html,scss}"])
```

Ejemplo de frontmatter Claude Code:
```yaml
---
paths: ["**/*.spec.ts"]
---
```

**Mismo contenido, distinto mecanismo de scope.** Los archivos se cargan automáticamente cuando un agente toca archivos que coinciden con el patrón.

---

## 4. Pipeline completo: cambio "Large"

El usuario solicita una migración compleja:

```
/sdd-new migración-auth-jwt
```

### 4.1 Complexity Gate

Ambas plataformas — el orquestador (skill `sdd-new`) evalúa:

```
┌─ COMPLEXITY GATE ─┐
│ Request: migración-auth-jwt
│ Señales: multi-dominio (auth, interceptors, guards, tokens),
│          requiere exploración, afecta toda la app
│ Veredicto: LARGE
│ Acción: Pipeline completo (explore → propose → clarify → spec → design → tasks → apply → verify)
└─────────────────────┘
```

### 4.2 PLANNER: explore

```
● explore  ○ propose  ○ clarify  ○ spec  ○ design  ○ tasks  ○ apply  ○ verify
```

**Copilot CLI** — delega al agente por nombre:
```
┌─ DELEGATING ─┐
│ Agent: sdd-planner
│ Phase: explore
│ Model: standard
│ Mecanismo: copilot --agent sdd-planner "PHASE: explore, CHANGE: migración-auth-jwt"
└───────────────┘
```
Copilot carga `sdd-planner.agent.md`, le inyecta las instructions que coincidan, y el agente trabaja en su propia ventana de contexto.

**Claude Code** — delega con la herramienta Agent:
```
┌─ DELEGATING ─┐
│ Agent: sdd-planner
│ Phase: explore
│ Model: standard
│ Mecanismo: Agent(name="sdd-planner", prompt="PHASE: explore, CHANGE: migración-auth-jwt")
└───────────────┘
```
Claude Code carga `sdd-planner.md`, inyecta rules que coincidan, contexto aislado.

**Artefacto generado**: `openspec/changes/migración-auth-jwt/exploration.md`

### 4.3 PLANNER: propose

```
● explore  ◉ propose  ○ clarify  ○ spec  ○ design  ○ tasks  ○ apply  ○ verify
```

```
┌─ DELEGATING ─┐
│ Agent: sdd-planner | Phase: propose | Model: high-capability
└───────────────┘

┌─ RESULT ─┐
│ Status: success
│ Artefactos: openspec/changes/migración-auth-jwt/proposal.md
│ Capabilities: auth-jwt-service, token-interceptor, auth-guard
│ Siguiente: clarify
└────────────┘
```

### 4.4 PLANNER: clarify

```
● explore  ● propose  ◉ clarify  ○ spec  ○ design  ○ tasks  ○ apply  ○ verify
```

El planner detecta ambigüedades:

```
┌─ ⚠ GATE ─┐
│ requires_human_input: true
│ Preguntas:
│   1. ¿Token refresh silencioso o redirect a login al expirar?
│   2. ¿Los roles vienen del JWT o de un endpoint separado?
│ Esperando respuesta del usuario...
└────────────┘
```

El usuario responde: "Refresh silencioso. Roles en el JWT."

Artefacto: `openspec/changes/migración-auth-jwt/questions.md`

### 4.5 PLANNER: spec

```
● explore  ● propose  ● clarify  ◉ spec  ○ design  ○ tasks  ○ apply  ○ verify
```

```
┌─ DELEGATING ─┐
│ Agent: sdd-planner | Phase: spec | Model: standard
│ Dominios: auth-jwt-service, token-interceptor, auth-guard
└───────────────┘
```

Artefactos generados:
```
openspec/changes/migración-auth-jwt/
├── specs/
│   ├── auth-jwt-service/spec.md
│   ├── token-interceptor/spec.md
│   └── auth-guard/spec.md
```

Cada spec contiene escenarios GIVEN/WHEN/THEN, keywords RFC 2119.

### 4.6 PLANNER: design

```
● explore  ● propose  ● clarify  ● spec  ◉ design  ○ tasks  ○ apply  ○ verify
```

```
┌─ DELEGATING ─┐
│ Agent: sdd-planner | Phase: design | Model: high-capability
└───────────────┘
```

Artefacto: `openspec/changes/migración-auth-jwt/design.md` — decisiones de arquitectura, tabla de archivos, estrategia de testing. Sin bloques de código.

### 4.7 PLANNER: tasks

```
● explore  ● propose  ● clarify  ● spec  ● design  ◉ tasks  ○ apply  ○ verify
```

Artefacto: `openspec/changes/migración-auth-jwt/tasks.md`

```markdown
## Phase 1: Foundation
- [  ] 1.1 [P] Crear src/app/auth/services/jwt.service.ts
- [  ] 1.2 [P] Crear src/app/auth/interceptors/token.interceptor.ts
- [  ] 1.3 [P] Crear src/app/auth/guards/auth.guard.ts

## Phase 2: Core
- [  ] 2.1 [S] Integrar interceptor en app.config.ts
- [  ] 2.2 [S] Configurar rutas protegidas

## Phase 3: Testing
- [  ] 3.1 [S] Tests jwt.service.spec.ts
- [  ] 3.2 [S] Tests token.interceptor.spec.ts
- [  ] 3.3 [S] Tests auth.guard.spec.ts
```

```
┌─ ⚠ GATE ─┐  (modo interactive)
│ Planificación completa. Resumen:
│   3 specs, 1 design, 8 tasks (3 parallelizable)
│ ¿Procedo con apply?
└────────────┘
```

Locks activados: `locks.spec: true`, `locks.design: true`

### 4.8 CODER: apply

```
● explore  ● propose  ● clarify  ● spec  ● design  ● tasks  ◉ apply  ○ verify
```

El orquestador evalúa paralelismo (obligatorio):

```
┌─ DELEGATING ─┐
│ Parallelism check:
│   Group A (auth/services): task 1.1 — 1 task
│   Group B (auth/interceptors): task 1.2 — 1 task
│   Group C (auth/guards): task 1.3 — 1 task
│ Resultado: 3 grupos con <2 tasks cada uno → single sdd-coder
└───────────────┘
```

**Copilot CLI**:
```
copilot --agent sdd-coder "PHASE: apply, CHANGE: migración-auth-jwt,
  ARTIFACT_BASE: openspec/changes/migración-auth-jwt/"
```

**Claude Code**:
```
Agent(name="sdd-coder", prompt="PHASE: apply, CHANGE: migración-auth-jwt,
  ARTIFACT_BASE: openspec/changes/migración-auth-jwt/")
```

El coder lee `tasks.md`, `design.md`, `specs/*/spec.md`. Implementa tarea por tarea, marca `[x]` en `tasks.md`. Ejecuta `post_hook` si está configurado. Genera `apply-report.md`.

### 4.9 REVIEWER: verify

```
● explore  ● propose  ● clarify  ● spec  ● design  ● tasks  ● apply  ◉ verify
```

En modo `interactive`, el orquestador pregunta primero:

```
┌─ ⚠ GATE ─┐
│ Apply completo. ¿Verifico?
└────────────┘
```

Usuario confirma. Se delega a `sdd-reviewer`:

```
┌─ RESULT ─┐
│ Verdict: PASS WITH WARNINGS
│ Spec Compliance: 9/9 scenarios ✅
│ Tests: 12 passed, 0 failed
│ Build: OK
│ Warnings:
│   - W1: coverage de token.interceptor.ts al 72% (threshold 80%)
│ Artefacto: openspec/changes/migración-auth-jwt/verify-report.md
└────────────┘
```

### 4.10 Archive

```
┌─ PIPELINE COMPLETE ─┐
│ Change: migración-auth-jwt
│ Phases: 8/8 completadas
│ Agents: planner ×6, coder ×1, reviewer ×1
│ Verdict: PASS WITH WARNINGS
│ Cambio verificado. ¿Quieres archivar con /sdd-archive?
└───────────────────────┘
```

```
/sdd-archive

Syncing delta specs → openspec/specs/
  auth-jwt-service/spec.md   → promoted
  token-interceptor/spec.md  → promoted
  auth-guard/spec.md         → promoted
Moving to archive: openspec/changes/archive/2026-04-22-migración-auth-jwt/
Done.
```

Estado final de `openspec/`:
```
openspec/
├── config.yaml
├── specs/
│   ├── auth-jwt-service/spec.md    ← promoted
│   ├── token-interceptor/spec.md   ← promoted
│   └── auth-guard/spec.md          ← promoted
└── changes/
    └── archive/
        └── 2026-04-22-migración-auth-jwt/
            ├── state.yaml
            ├── exploration.md
            ├── proposal.md
            ├── questions.md
            ├── specs/...
            ├── design.md
            ├── tasks.md
            ├── apply-report.md
            └── verify-report.md
```

---

## 5. Pipeline condensado: cambio "Medium"

```
/sdd-new formulario-perfil-usuario
```

```
┌─ COMPLEXITY GATE ─┐
│ Señales: multi-archivo, necesita diseño, testable, pero scope claro
│ Veredicto: MEDIUM
│ Acción: Pipeline condensado (fast-forward → apply → verify)
└─────────────────────┘
```

### 5.1 PLANNER: fast-forward

Una sola delegación al planner con `PHASE: fast-forward`. El planner ejecuta propose + spec + design + tasks internamente, en una sola ventana de contexto.

```
┌─ DELEGATING ─┐
│ Agent: sdd-planner | Phase: fast-forward | Model: high-capability
└───────────────┘

┌─ RESULT ─┐
│ Status: success
│ Artefactos creados en openspec/changes/formulario-perfil-usuario/:
│   proposal.md, specs/user-profile-form/spec.md, design.md, tasks.md, state.yaml
│ requires_human_input: false
└────────────┘
```

Si el planner evalúa que el cambio sigue convenciones existentes (CRUD estándar), puede saltar design y tasks:

```
│ design: skipped (follows existing patterns)
│ tasks: skipped
│ → sdd-coder implementará directamente desde spec + instruction files
```

### 5.2 Apply + Verify

Mismo flujo que en Large (secciones 4.8-4.9), pero el coder trabaja desde spec directamente si design/tasks fueron saltados.

---

## 6. Delegación directa: cambio "Trivial"

```
/sdd-new fix-typo-header
```

```
┌─ COMPLEXITY GATE ─┐
│ Señales: ≤5 líneas, 1 archivo, intención clara
│ Veredicto: TRIVIAL
│ Acción: Delegación directa a sdd-coder (sin pipeline SDD)
└─────────────────────┘
```

```
Cambio simple — delegando directamente al coder sin pipeline SDD.

┌─ DELEGATING ─┐
│ Agent: sdd-coder | Direct delegation | Model: standard
└───────────────┘

┌─ RESULT ─┐
│ Status: done
│ Fixed typo in src/app/layout/header.component.html
└────────────┘
```

Se crea un `state.yaml` mínimo para trazabilidad:
```yaml
change: fix-typo-header
current_phase: done
phases:
  explore: skipped
  propose: skipped
  clarify: skipped
  spec: skipped
  design: skipped
  tasks: skipped
  apply: done
  verify: skipped
  archive: skipped
```

Sin spec, sin verify, sin archive. El cambio aparece en `/sdd-status` pero no genera artefactos SDD.

---

## 7. Ejecución paralela

Escenario: un cambio Large genera tasks con 2+ grupos parallelizables de 2+ tasks sin archivos compartidos.

### Copilot CLI — `/fleet`

El orquestador detecta que las tasks 1.1-1.3 y 2.1-2.3 son parallelizables (`[P]`):

```
┌─ PARALLEL ─┐
│ Mecanismo: /fleet (context-window isolation)
│
│ Wave 1:
│   ◉ sdd-coder (group-auth)     → tasks 1.1, 1.2, 1.3
│   ◉ sdd-coder (group-api)      → tasks 2.1, 2.2, 2.3
│
│ Cada sub-agente corre en su propia ventana de contexto.
│ No escriben tasks.md ni state.yaml (PARALLEL_MODE: true).
└──────────────┘
```

Copilot lanza los sub-agentes con `/fleet`. Cada uno recibe `TASK_SUBSET` y trabaja aislado. Al terminar Wave 1, un coder final (Wave 2) marca todo `[x]` y ejecuta tasks `[S]`.

### Claude Code — Agent tool + worktree

```
┌─ PARALLEL ─┐
│ Mecanismo: Agent tool con isolation: "worktree" + run_in_background: true
│
│ Wave 1:
│   ◉ Agent(name="sdd-coder", isolation="worktree",
│       prompt="PARALLEL_MODE: true, TASK_SUBSET: [1.1, 1.2, 1.3]")
│   ◉ Agent(name="sdd-coder", isolation="worktree",
│       prompt="PARALLEL_MODE: true, TASK_SUBSET: [2.1, 2.2, 2.3]")
│
│ Cada agente trabaja en un git worktree separado.
│ Al terminar, las ramas se mergean secuencialmente.
└──────────────┘
```

Merge secuencial. Si hay conflicto, se escala al usuario. Wave 2 reconcilia.

---

## 8. Comparativa de mecánicas

| Concepto | Copilot CLI | Claude Code |
|----------|-------------|-------------|
| **Definición de agentes** | `.github/agents/*.agent.md` | `.claude/agents/*.md` |
| **Definición de skills** | `.github/skills/*/SKILL.md` | `.claude/skills/*/SKILL.md` |
| **Instructions/Rules** | `.github/instructions/*.instructions.md` con `applyTo:` | `.claude/rules/*.md` con `paths:` |
| **Invocar skill** | `copilot /sdd-new` o `/sdd-new` | `/sdd-new` |
| **Delegación a agente** | `copilot --agent sdd-planner` (nombre) | `Agent(name="sdd-planner")` (tool) |
| **Aislamiento de contexto** | Ventana de contexto separada | Ventana de contexto separada |
| **Ejecución paralela** | `/fleet` (context-window isolation) | `Agent` con `isolation: "worktree"` |
| **Paralelismo real** | Procesos aislados por contexto | Git worktrees (ramas separadas) |
| **Model routing** | `model` en frontmatter o `/model` | `model` en frontmatter o `/model` |
| **Hooks** | `.github/hooks/hooks.json` | `settings.json` o frontmatter |
| **Agentes built-in** | Explore, Task, Plan, Code-review | (no aplica) |
| **Persistencia** | `openspec/` (compartido) | `openspec/` (compartido) |
| **Delegation cloud** | `/delegate` | (no equivalente directo) |

### Lo que es idéntico en ambas plataformas

- Contenido de agentes y skills (misma lógica, mismo protocolo)
- Estructura completa de `openspec/`
- `config.yaml` y todos los artefactos SDD
- Flujo del pipeline (complexity gate → plan → apply → verify → archive)
- Protocolo de orquestación y reglas de delegación

### Lo que difiere

- Rutas de instalación (`.github/` vs `.claude/`)
- Mecanismo de scope (`applyTo:` vs `paths:`)
- Mecanismo de delegación (nombre del agente vs tool `Agent`)
- Mecanismo de paralelismo (`/fleet` vs worktrees)
- Formato de hooks

---

> **Conclusión**: El pipeline SDD funciona end-to-end en ambas plataformas con los mismos agentes, skills y artefactos. Las diferencias son mecánicas de plataforma, no de lógica. Un equipo puede usar Copilot CLI y Claude Code simultáneamente sobre el mismo `openspec/`.
