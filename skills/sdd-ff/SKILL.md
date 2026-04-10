---
name: sdd-ff
description: Fast-forward a change through all planning phases (propose → clarify → spec → design → tasks)
user-invocable: true
disable-model-invocation: true
argument-hint: "<change-name>"
---

## Instructions for the Orchestrator

Fast-forward executes the full planning pipeline in sequence.

### Execution Flow

1. Evaluate input (same logic as sdd-new for skip explore)
2. Execute sequence: [explore?] → propose → clarify? → spec → design → tasks
3. **Clarify gate** (OBLIGATORY): if `questions_count > 0` → STOP, present questions, wait for response. Resume after answers.
4. **Spec-first**: spec BEFORE design. NO parallel execution. This is a lesson from real feedback.
5. If `consistency_block: true` in tasks → STOP, present consistency issues to user
6. If any phase fails → STOP, report which phases completed successfully
7. In `none` mode: WARN user before launching — context may exhaust after 3+ phases
