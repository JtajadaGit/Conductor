---
name: sdd-ff
description: Fast-forward a change through all planning phases in a single agent call
user-invocable: true
disable-model-invocation: true
argument-hint: "<change-name>"
---

## Instructions for the Orchestrator

### Step 0: Complexity Gate (MANDATORY)

Same gate as sdd-new. Evaluate BEFORE launching:

- **Trivial/Simple** → "Cambio simple — delegando directamente al coder sin pipeline SDD." → delegate to `sdd-coder`, done.
- **Medium/Large** → proceed with fast-forward below.

### Step 1: Launch Condensed Pipeline

1. Delegate to `sdd-planner` with `PHASE: fast-forward` and the change name/description
2. The planner creates the directory, produces ALL artifacts (proposal, spec, design, tasks, state.yaml) in ONE call
3. **Do NOT create directories yourself. Do NOT write state.yaml yourself.** The planner handles everything.

### Step 2: Handle Response

- `requires_human_input: true` → planner hit a clarify gate. Present questions. After answers, re-launch `PHASE: fast-forward` with answers appended.
- `consistency_block: true` → present consistency issues to user, wait for resolution.
- `status: success` → report summary. Ask: "¿Continúo con apply?"

### Step 3: Apply + Verify (if user confirms)

1. Delegate to `sdd-coder` with `PHASE: apply`
2. On success, delegate to `sdd-reviewer` with `PHASE: verify`
3. **Total: 3 agent calls** (planner + coder + reviewer) instead of 7+

## Rules
- Step 0 is NON-NEGOTIABLE. NEVER skip the complexity gate.
- NEVER create directories or write state.yaml from the orchestrator. The planner agent does it.
- ALWAYS use relative paths. NEVER absolute paths.
- The user explicitly chose `/sdd-ff` — but trivial changes don't need planning phases.
- In `none` mode: WARN user — full planning without persistence may exhaust context.
