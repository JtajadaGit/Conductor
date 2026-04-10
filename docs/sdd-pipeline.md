# Pipeline SDD — Spec-Driven Development

---

## Grafo de Dependencias

```
init? → [explore?] → propose → clarify? → spec → design → tasks → apply ⟲ fix → verify → archive?
```

```
                  ┌─────────┐
                  │ explore │  (condicional)
                  └────┬────┘
                       │
                  ┌────▼────┐
                  │ propose │
                  └────┬────┘
                       │
                  ┌────▼────┐
                  │ clarify │  (auto-skip si 0 preguntas)
                  └────┬────┘
                       │
                  ┌────▼────┐
                  │  spec   │  ← SIEMPRE antes de design
                  └────┬────┘
                       │
                  ┌────▼────┐
                  │ design  │  (lee spec como input)
                  └────┬────┘
                       │
                  ┌────▼────┐
                  │  tasks  │  (smart task grouping)
                  └────┬────┘
                       │
                  ┌────▼────┐
                  │  apply  │  (batches · fix loop)
                  └────┬────┘
                       │
                  ┌────▼────┐
                  │ verify  │
                  └────┬────┘
                       │
                  ┌────▼────┐
                  │ archive │  (solo si PASS)
                  └─────────┘
```

---

## Fases — Tabla Resumen

| Fase | Agente | Model tier | Lee | Produce | Budget |
|------|--------|------------|-----|---------|--------|
| explore | sdd-planner | standard | código fuente | `exploration.md` | — |
| propose | sdd-planner | high-capability | exploration (opcional) | `proposal.md` | <400 pal |
| clarify | sdd-planner | standard | proposal (req.) | `questions.md` (si >0) | <300 pal |
| spec | sdd-planner | standard | proposal + questions | `specs/{domain}/spec.md` | <650 pal |
| design | sdd-planner | high-capability | proposal + **spec** (req.) | `design.md` | <800 pal |
| tasks | sdd-planner | standard | spec + design (req.) | `tasks.md` | <530 pal |
| apply | sdd-coder | standard | tasks + spec + design | código + `tasks.md [x]` | — |
| verify | sdd-reviewer | standard | spec + tasks | `verify-report.md` | — |
| archive | (inline) | fast | todos artefactos | specs actualizadas | — |

---

## Hard Stop Rule

El orquestador evalúa complejidad ANTES de actuar:

| Complejidad | Señal | Acción |
|-------------|-------|--------|
| **Trivial** | ≤5 líneas, 1-2 archivos, intent claro | Delega directo. Sin SDD. |
| **Simple** | Scope claro, un solo concern | Delega directo. Sin SDD. |
| **Medio** | Multi-archivo, necesita diseño, testable | **Sugiere** `/sdd-ff`. No auto-ejecuta. |
| **Grande** | Vago, multi-dominio, necesita exploración | **Sugiere** `/sdd-new`. No auto-ejecuta. |

El orquestador **nunca** auto-invoca sdd-new o sdd-ff.

---

## Execution Mode

Al iniciar una sesión SDD, el orquestador pregunta:

- **Auto** — ejecuta fases back-to-back, pausando solo en gates (clarify, consistency_block, errores)
- **Interactive** — pausa tras cada fase para review

Default: Interactive.

---

## Reglas de Skip

| Fase | Condición para skip |
|------|---------------------|
| **explore** | Input >100 palabras con scope + approach + constraints claros → skip |
| **clarify** | 0 preguntas detectadas → auto-skip sin coste extra |
| **verify fast-path** | Sin test runner ni build command → solo checks estáticos |
| **archive** | Solo si verify = PASS (nunca con CRITICAL issues) |

---

## Delegación

### Inline vs Delegate

| Situación | Acción |
|-----------|--------|
| Read/write 1-3 archivos, intent claro | Puede ser inline |
| 4+ archivos, exploración, o lógica multi-step | Siempre delegar |

### Qué se inyecta en cada delegación

1. **Project Standards** — compact rules del skill-registry
2. **Project Principles** — de `openspec/principles.md` (si existe)
3. **Phase** — instrucciones específicas de la fase
4. **Context** — nombre del cambio, paths de artefactos, modo de persistencia
5. **Return Envelope** — status, summary, artifacts, next, risks

Sub-agentes **no descubren** contexto — se les inyecta. No leen SKILL.md ni el registry directamente.

---

## Comandos

| Comando | Qué hace | Coste |
|---------|----------|-------|
| `/sdd-init` | Bootstrap: detecta stack, crea openspec, genera registry | 1 req |
| `/sdd-new <name>` | Evalúa input → [explore?] → propose → clarify | 2-3 req |
| `/sdd-ff <name>` | propose → clarify → spec → design → tasks | 4-5 req |
| `/sdd-continue` | Siguiente fase pendiente en el DAG | 1 req |
| `/sdd-status` | Muestra progreso (lee state.yaml) | 0 req |
| `/sdd-archive` | Sync delta specs → main specs, mover a archive/ | 1 req |
| `/skill-registry` | Genera/actualiza `openspec/conventions.md` | 1 req |

---

## Modo TDD Estricto

### Activación (cadena de prioridad)

1. Marcador `strict-tdd-mode: enabled` en config del agente → máxima prioridad
2. `x-conductor.strict_tdd: true` en `openspec/config.yaml`
3. Test runner detectado → `true` por defecto
4. Sin test runner → `false` (imposible sin runner)

### Las Tres Leyes

| Ley | Protege contra |
|-----|---------------|
| No escribir código hasta tener un test que falla | Código sin especificación |
| No escribir más test del necesario para que falle | Tests frágiles sobredimensionados |
| No escribir más código del necesario para pasar | Código especulativo innecesario |

### Ciclo por tarea

```
SAFETY NET → RED (test que falla) → GREEN (mínimo código) → TRIANGULATE → REFACTOR
```

Los módulos TDD (`strict-tdd.md`, `strict-tdd-verify.md`) se cargan **solo** cuando TDD está activo. Si no: **0 tokens** consumidos.

---

## Hooks de Validación

Configurados en `openspec/config.yaml` bajo `x-conductor.hooks.apply`:

```yaml
x-conductor:
  hooks:
    apply:
      pre_hook: "npm ci --dry-run"          # Antes de implementar → falla = blocked
      post_hook: "npm run build && tsc --noEmit"  # Después de cada batch
      post_hook_on_fail: retry              # retry | stop | warn
      post_hook_max_retries: 3
      checkpoint_every: 5                   # Cada N tasks (útil para builds lentos)
```

| `post_hook_on_fail` | Comportamiento |
|---------------------|----------------|
| `retry` | Lee error, intenta fix, re-ejecuta (max retries) |
| `stop` | Para, retorna `status: partial` |
| `warn` | Log warning, continúa |

---

## Lessons Learned

`openspec/lessons-learned.md` — registro append-only de lecciones entre cambios.

- `sdd-coder` lo lee **antes** de implementar (evita errores conocidos)
- `sdd-coder` append después de cada fix exitoso
- `sdd-planner` lo lee para informar decisiones de diseño

```markdown
## 2026-04-01 — add-user-auth
### Ecosystem Gotchas
- jsonwebtoken 9.x: async sign required → use promisify
### Design Insights
- Refresh token rotation adds complexity; use simple expiry for MVPs
```

---

## Error Handling y Recovery

| Señal | Acción del orquestador |
|-------|------------------------|
| `requires_human_input: true` | PAUSE, mostrar al usuario, esperar input |
| `status: blocked` | STOP, reportar blocker, sugerir path |
| `status: partial` | Preguntar: continuar o reintentar |
| `consistency_block: true` | Bloquear apply, mostrar issues |
| `skill_resolution: none\|fallback-*` | Auto-releer `openspec/conventions.md` |
| Max 2 retries | Escalar al usuario |

---

→ [Quick Start](./quick-start.md) | [OpenSpec](./openspec.md) | [Avanzado](./advanced.md)
