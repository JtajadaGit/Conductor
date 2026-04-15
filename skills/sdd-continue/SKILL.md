---
name: sdd-continue
description: Continue the next dependency-ready SDD phase for the current change
user-invocable: true
disable-model-invocation: true
argument-hint: "[change-name]"
---

## Instructions for the Orchestrator

1. Read `state.yaml` of the active change (or the one specified by the user)
2. Read `openspec/context.md` — required for context injection into the next agent
3. Determine the next phase where status = `pending` and all dependencies are `done`/`skipped` (see `agents/_shared/sdd-protocol.md` § Phase Dependencies for the DAG)
4. Delegate to the corresponding agent (see Agents table in orchestrator instructions), injecting `context.md` content
5. If no pending phases → inform user: "Pipeline complete for {change-name}"
