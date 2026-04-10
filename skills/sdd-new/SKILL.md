---
name: sdd-new
description: Start a new SDD change — evaluates complexity first, launches pipeline only if warranted
user-invocable: true
disable-model-invocation: true
argument-hint: "<change-name-or-description>"
---

## Instructions for the Orchestrator

### Step 0: Complexity Gate (MANDATORY)

BEFORE creating any artifacts, evaluate the request against the Hard Stop Rule:

| Complexity | Signal | Action |
|------------|--------|--------|
| **Trivial** | ≤5 lines, 1-2 files, clear intent | Delegate directly to `sdd-coder`. **No pipeline. No artifacts. No state.yaml.** |
| **Simple** | Clear scope, single concern, ≤4 files | Delegate directly to `sdd-coder`. **No pipeline.** |
| **Medium** | Multi-file, needs design, testable | **Condensed pipeline** (single planner call). |
| **Large** | Vague, multi-domain, needs exploration | **Full pipeline** (explore first, then ask user about `/sdd-ff`). |

**For Trivial/Simple**:
1. Tell the user "Cambio simple — delegando directamente al coder sin pipeline SDD."
2. Delegate to `sdd-coder` with the user's request.
3. After coder completes, log the change minimally:
   - Create `openspec/changes/{change-name}/` with a single `state.yaml`:
     ```yaml
     change: {change-name}
     created: {ISO-8601}
     updated: {ISO-8601}
     mode: openspec
     current_phase: done
     complexity: trivial|simple
     phases:
       apply: done
     ```
   - This enables `/sdd-status` to show history of ALL changes, not just SDD ones.

### Step 1: Medium → Condensed Pipeline

1. Delegate to `sdd-planner` with `PHASE: fast-forward` and the change description
2. The planner creates everything in ONE call (dir, proposal, spec, design, tasks, state.yaml)
3. Present summary. Pause: "Planning complete. ¿Continúo con apply?"
4. On confirm → delegate to `sdd-coder`, then `sdd-reviewer`

### Step 1 (alt): Large → Full Pipeline

1. Delegate to `sdd-planner` with `PHASE: explore`
2. Present exploration results
3. Ask user: "¿Quieres continuar con el pipeline completo? Usa `/sdd-ff {name}` para fast-forward."

### Step 2: Orchestrator Boundaries

- **Do NOT create directories.** The planner creates them.
- **Do NOT write state.yaml.** The planner writes it.
- **Do NOT read artifacts between phases.** The next agent reads them.
- **ALWAYS use relative paths.** Never absolute.

## Rules
- Step 0 is NON-NEGOTIABLE. NEVER skip the complexity gate.
- Do NOT read source code to evaluate complexity — use description + `openspec/context.md` only.
- If uncertain about complexity, ask: "This looks simple enough for direct delegation. Want me to skip the SDD pipeline?"
