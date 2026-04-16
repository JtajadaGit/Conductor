---
name: sdd-new
description: Start a new SDD change — evaluates complexity, picks the right pipeline automatically
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
| **Trivial** | ≤5 lines, 1-2 files, clear intent | Delegate directly to `sdd-coder`. **No pipeline.** |
| **Simple** | Clear scope, single concern, ≤4 files | Delegate directly to `sdd-coder`. **No pipeline.** |
| **Medium** | Multi-file, needs design, testable | **Condensed pipeline** (Step 1). |
| **Large** | Vague, multi-domain, needs exploration | **Full pipeline** (Step 2). |

**For Trivial/Simple**:
1. Tell the user "Cambio simple — delegando directamente al coder sin pipeline SDD."
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
2. Delegate to `sdd-planner` with `PHASE: fast-forward` (+ `SPEC_LIGHT: true` if applicable) and the change description.
3. The sdd-planner creates everything in ONE call (dir, spec, design, tasks, state.yaml — and proposal if not spec-light).
4. **Run Post-Delegation Validation** (check artifacts exist per orchestrator rules).
5. Handle response:
   - `requires_human_input: true` → present clarify questions. After answers, re-launch `PHASE: fast-forward` with answers appended.
   - `consistency_block: true` → present issues to user, wait for resolution.
   - `status: success` → present summary.
6. Continue based on execution mode:
   - **auto** → evaluate parallelism (mandatory), delegate to `sdd-coder`, then `sdd-reviewer`.
   - **interactive** → pause: "Planning complete. ¿Continúo con apply?"

### Step 2: Large → Full Pipeline

1. Delegate to `sdd-planner` with `PHASE: explore`.
2. Present exploration results.
3. Delegate to `sdd-planner` with `PHASE: propose`.
4. Run clarify if needed (`PHASE: clarify`). If questions > 0 → pause for user input.
5. Continue with `PHASE: spec` → `PHASE: design` → `PHASE: tasks` (sequential).
6. **Run Post-Delegation Validation** after each phase.
7. Continue based on execution mode:
   - **auto** → proceed to apply + verify.
   - **interactive** → pause: "Planning complete. ¿Continúo con apply?"

### Step 3: Apply + Verify

1. Evaluate parallelism (mandatory) — see orchestration-protocol § Apply Parallelism.
2. Delegate to `sdd-coder` with `PHASE: apply`.
3. On success:
   - **auto** → delegate to `sdd-reviewer` with `PHASE: verify`.
   - **interactive** → pause: "Apply complete. ¿Verifico?"
4. After verify → suggest `/sdd-archive`.

### Orchestrator Boundaries

- **Do NOT create directories.** The sdd-planner creates them.
- **Do NOT write state.yaml.** The sdd-planner writes it.
- **Do NOT read artifacts between phases.** The next agent reads them.
- **ALWAYS use relative paths.** Never absolute.

## Rules
- Step 0 is NON-NEGOTIABLE. NEVER skip the complexity gate.
- Do NOT read source code to evaluate complexity — use the request description + platform instruction files (auto-loaded) only.
- If uncertain about complexity, ask: "This looks simple enough for direct delegation. Want me to skip the SDD pipeline?"
