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
| **Medium** | Multi-file, needs design, testable | Proceed with SDD pipeline below. |
| **Large** | Vague, multi-domain, needs exploration | Proceed with SDD pipeline below. |

**For Trivial/Simple**: tell the user "Cambio simple — delegando directamente al coder sin pipeline SDD." Then delegate to `sdd-coder` with the user's request as direct instructions. Done. No further steps.

**For Medium/Large**: continue to Step 1.

### Step 1: Input Assessment

- **Detailed** (scope + approach + constraints, or >100 words with clear scope):
  → SKIP explore, go directly to propose → clarify
- **Vague** (just a name, or <30 words, or unclear scope):
  → explore → propose → clarify
- **Uncertain**: ask user "Do you need me to explore the codebase or do you already have a clear approach?"

### Step 2: Execution Flow

1. If openspec mode: create `openspec/changes/{change-name}/` directory
2. Initialize `state.yaml` with DAG state (all phases `pending`)
3. For each phase in sequence: delegate to `sdd-planner` with corresponding phase
4. **Clarify gate**: if `questions_count > 0` → PAUSE, present questions to user, wait for answers
5. When clarify completes with 0 questions → present summary:
   > "Planning complete through clarify. Continue with spec → design → tasks? Or stop here?"
6. If user confirms → continue pipeline (or suggest `/sdd-ff` for full fast-forward)

## Rules
- Step 0 is NON-NEGOTIABLE. NEVER skip the complexity gate.
- Do NOT read source code yourself to evaluate complexity — use the user's description and `openspec/context.md` metadata only.
- If uncertain about complexity, ask the user: "This looks simple enough for direct delegation. Want me to skip the SDD pipeline?"
