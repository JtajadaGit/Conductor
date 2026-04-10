---
name: sdd-status
description: Show progress of current SDD change — reads state.yaml
user-invocable: true
---

## Instructions for the Orchestrator

1. Read `state.yaml` of the active change (or specified change)
2. Show DAG progress: each phase with its status (pending/done/skipped/in_progress)
3. List existing artifacts in the change folder
4. Show next phase to execute
5. If no active change found → inform user
