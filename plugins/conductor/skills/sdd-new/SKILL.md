---
name: sdd-new
description: Start a new SDD change — evaluates complexity first, launches pipeline only if warranted
user-invocable: true
disable-model-invocation: true
argument-hint: "<change-name-or-description>"
effort: high
---

> **Orchestration protocol**: load `skills/_shared/orchestration-protocol.md` for coordination rules (execution mode, delegation, model tiers, parallelism, validation, error handling, visual output).

## Instructions for the Orchestrator

### Step 0: Complexity Gate (MANDATORY)

BEFORE creating any artifacts, evaluate the request against the Hard Stop Rule:

| Complexity | Signal | Action |
|------------|--------|--------|
| **Trivial** | ≤5 lines, 1-2 files, clear intent | Delegate directly to `sdd-coder`. **No pipeline. No artifacts. No state.yaml.** |
| **Simple** | Clear scope, single concern, ≤4 files | Delegate directly to `sdd-coder`. **No pipeline.** |
| **Medium** | Multi-file, needs design, testable | **Condensed pipeline** (single sdd-planner call). |
| **Large** | Vague, multi-domain, needs exploration | **Full pipeline** (explore first, then ask user about `/sdd-ff`). |

**For Trivial/Simple**:
1. Tell the user "Cambio simple — delegando directamente al sdd-coder sin pipeline SDD."
2. Delegate to `sdd-coder` with the user's request.
3. After sdd-coder completes, log the change minimally:
   - Create `openspec/changes/{change-name}/` with a single `state.yaml`:
     ```yaml
     change: {change-name}
     created: {ISO-8601}
     updated: {ISO-8601}
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
     last_completed_task: ""
     locks:
       spec: false
       design: false
     ```
   - This enables `/sdd-status` to show history of ALL changes, not just SDD ones.

### Step 1: Medium → Condensed Pipeline

1. **Evaluate spec-light**: if user request is >50 words with clear scope, approach, and acceptance criteria → add `SPEC_LIGHT: true` (skips proposal). Otherwise → standard condensed.
2. Delegate to `sdd-planner` with `PHASE: fast-forward` (+ `SPEC_LIGHT: true` if applicable) and the change description
3. The sdd-planner creates everything in ONE call (dir, spec, design, tasks, state.yaml — and proposal if not spec-light)
4. **Run Post-Delegation Validation** (check artifacts exist per orchestrator rules)
5. Present summary. Pause: "Planning complete. ¿Continúo con apply?"
6. On confirm → evaluate parallelism (mandatory), then delegate to `sdd-coder`, then `sdd-reviewer`

### Step 1 (alt): Large → Full Pipeline

1. Delegate to `sdd-planner` with `PHASE: explore`
2. Present exploration results
3. Ask user: "¿Quieres continuar con el pipeline completo? Usa `/sdd-ff {name}` para fast-forward."

### Step 2: Orchestrator Boundaries

- **Do NOT create directories.** The sdd-planner creates them.
- **Do NOT write state.yaml.** The sdd-planner writes it.
- **Do NOT read artifacts between phases.** The next agent reads them.
- **ALWAYS use relative paths.** Never absolute.

## Rules
- Step 0 is NON-NEGOTIABLE. NEVER skip the complexity gate.
- Do NOT read source code to evaluate complexity — use the request description + platform instruction files (auto-loaded) only.
- If uncertain about complexity, ask: "This looks simple enough for direct delegation. Want me to skip the SDD pipeline?"
