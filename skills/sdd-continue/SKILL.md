---
name: sdd-continue
description: Continue the next dependency-ready SDD phase for the current change
user-invocable: true
disable-model-invocation: true
argument-hint: "[change-name]"
---

## Instructions for the Orchestrator

1. Read `state.yaml` of the active change (or the one specified by the user)
2. Determine the next phase where status = `pending` and all dependencies are `done`/`skipped`
3. Delegate to the corresponding agent (see Agents table in orchestrator instructions)
4. If no pending phases → inform user: "Pipeline complete for {change-name}"
5. If `none` mode → `sdd-continue` is unavailable (state not persisted). Inform user.
