---
name: sdd-new
description: Start a new SDD change — evaluates input completeness and launches planning pipeline
user-invocable: true
disable-model-invocation: true
argument-hint: "<change-name-or-description>"
---

## Instructions for the Orchestrator

Evaluate the user's input to determine the starting phase:

### Input Assessment
- **Detailed** (scope + approach + constraints, or >100 words with clear scope):
  → SKIP explore, go directly to propose → clarify
- **Vague** (just a name, or <30 words, or unclear scope):
  → explore → propose → clarify
- **Uncertain**: ask user "Do you need me to explore the codebase or do you already have a clear approach?"

### Execution Flow

1. If openspec mode: create `openspec/changes/{change-name}/` directory
2. Initialize `state.yaml` with DAG state (all phases `pending`)
3. For each phase in sequence: delegate to `sdd-planner` with corresponding phase
4. **Clarify gate**: if `questions_count > 0` → PAUSE, present questions to user, wait for answers
5. When clarify completes with 0 questions → present summary:
   > "Planning complete through clarify. Continue with spec → design → tasks? Or stop here?"
6. If user confirms → continue pipeline (or suggest `/sdd-ff` for full fast-forward)
