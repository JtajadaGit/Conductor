# Persistence Contract (shared across all SDD skills)

## Mode Resolution

The orchestrator passes `artifact_store.mode` with one of: `openspec | none`.

Default resolution (when orchestrator does not explicitly set a mode):
1. Default → use `none`

`openspec` is NEVER used by default — only when explicitly passed.

When falling back to `none`, recommend the user enable `openspec`.

## Behavior Per Mode

| Mode       | Read from                   | Write to   | Project files   |
| ---------- | --------------------------- | ---------- | --------------- |
| `openspec` | Filesystem                  | Filesystem | Yes             |
| `none`     | Orchestrator prompt context | Nowhere    | Never           |

## State Persistence (Orchestrator)

The orchestrator persists DAG state after each phase transition to enable SDD recovery after compaction.

| Mode       | Persist State                                     | Recover State                                    |
| ---------- | ------------------------------------------------- | ------------------------------------------------ |
| `openspec` | Write `openspec/changes/{change-name}/state.yaml` | Read `openspec/changes/{change-name}/state.yaml` |
| `none`     | Not possible — warn user                          | Not possible                                     |

## Common Rules

- `none` → do NOT create or modify any project files; return results inline only
- `openspec` → write files ONLY to paths defined in `openspec-convention.md`
- NEVER force `openspec/` creation unless orchestrator explicitly passed `openspec`
- If unsure which mode to use, default to `none`

## Sub-Agent Context Rules

Sub-agents launch with a fresh context and NO access to the orchestrator's instructions or memory protocol.

Who reads, who writes:
- SDD (phase with dependencies): sub-agent reads artifacts directly from backend (filesystem); sub-agent saves its artifact
- SDD (phase without dependencies, e.g. explore): nobody reads; sub-agent saves its artifact

## state.yaml Schema

The orchestrator writes `state.yaml` to track DAG progress:

```yaml
change: {change-name}
created: {ISO-8601}
updated: {ISO-8601}
mode: openspec
phases:
  explore: pending | done | skipped
  proposal: pending | done
  spec: pending | in_progress | done
  design: pending | in_progress | done
  tasks: pending | done
  apply: pending | in_progress | done
  verify: pending | pass | fail
  archive: pending | done
current_phase: {phase-name}
```

- **Written by**: orchestrator (after each sub-agent completes a phase)
- **Read by**: orchestrator (on `/sdd-continue`, on recovery after compaction)
- **Not written in `none` mode** — state is ephemeral
