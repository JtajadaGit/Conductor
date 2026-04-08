# SDD Protocol — Unified Reference for All Phase Skills

> This file consolidates the common protocol for all SDD phase sub-agents.
> Every phase skill references this file instead of multiple _shared/ files.

## Executor Boundary

Every SDD phase agent is an EXECUTOR, not an orchestrator. Do the phase work yourself. Do NOT launch sub-agents, do NOT call `delegate`/`task`, and do NOT bounce work back unless the phase skill explicitly says to stop and report a blocker.

## 1. Skill Loading

1. Check if the orchestrator injected a `## Project Standards (auto-resolved)` block in your launch prompt. If yes, follow those rules — they are pre-digested compact rules from the skill registry. **Do NOT read any SKILL.md files.**
2. If no Project Standards block was provided, read `.atl/skill-registry.md` from the project root as fallback. Apply rules whose triggers match your current task.
3. If no registry exists, proceed with your phase skill only.

> The preferred path is (1). Path (2) is a fallback for when the orchestrator lost its cache (e.g., after compaction). If `## Project Standards` is present, the registry is redundant — do NOT read it.

## 2. Persistence Modes

The orchestrator passes `artifact_store.mode` with one of: `openspec | none`.

**Default**: `openspec`. Use `none` only when the user explicitly requests ephemeral mode.

| Mode       | Read from              | Write to   | Project files |
| ---------- | ---------------------- | ---------- | ------------- |
| `openspec` | Filesystem             | Filesystem | Yes           |
| `none`     | Orchestrator prompt    | Nowhere    | Never         |

### Project Principles (Optional)

If `openspec/principles.md` exists, the orchestrator injects its content as `## Project Principles (auto-resolved)` in the sub-agent prompt. Sub-agents follow those principles as non-negotiable constraints.

## 3. OpenSpec Directory Structure

```
openspec/
├── config.yaml              ← Project-specific SDD config
├── principles.md            ← (optional) Human-authored, never AI-modified
├── lessons-learned.md       ← (optional) Cross-session debugging insights
├── specs/                   ← Source of truth (main specs)
│   └── {domain}/
│       └── spec.md
└── changes/                 ← Active changes
    ├── archive/             ← Completed changes (YYYY-MM-DD-{change-name}/)
    └── {change-name}/       ← Active change folder
        ├── state.yaml
        ├── exploration.md   ← (optional) from sdd-explore
        ├── proposal.md      ← from sdd-propose
        ├── questions.md     ← (optional) from sdd-clarify
        ├── specs/           ← from sdd-spec
        │   └── {domain}/
        │       └── spec.md
        ├── design.md        ← from sdd-design
        ├── tasks.md         ← from sdd-tasks (updated by sdd-apply)
        └── verify-report.md ← from sdd-verify
```

## 4. Artifact Retrieval (OpenSpec Mode)

Read artifacts directly from the filesystem:

```
openspec/changes/{change-name}/{artifact-type}.md
```

> For specs, the path is nested: `specs/{domain}/spec.md`. For all other artifacts, the path is flat.
> If a REQUIRED artifact is missing, return `status: blocked` with `risks: 'Missing prerequisite: {artifact-name}'`. Do NOT proceed without required inputs.

## 5. Artifact Persistence

Every phase that produces an artifact MUST persist it. Skipping this BREAKS the pipeline.

- **openspec**: Create `openspec/changes/{change-name}/` if it does not exist, then write: `openspec/changes/{change-name}/{artifact-type}.md`
- **none**: Return result inline only. Do not write any files.

### Writing Rules

- If a file already exists, READ it first and UPDATE it (don't overwrite blindly)
- If the change directory already exists with artifacts, the change is being CONTINUED
- Use `openspec/config.yaml` `rules` section for project-specific constraints per phase

## 6. Return Envelope

Every phase MUST return a structured envelope:

- `status`: `success`, `partial`, or `blocked`
- `executive_summary`: 1-3 sentence summary
- `artifacts`: list of artifact keys/paths written
- `next_recommended`: the next SDD phase to run, or "none"
- `risks`: risks discovered, or "None"
- `requires_human_input`: `true` if human decisions are needed before downstream phases
- `skill_resolution`: `injected`, `fallback-registry`, `fallback-path`, or `none`

When `requires_human_input` is `true`, include a `human_input_needed` field describing what is needed.

## 7. state.yaml Schema

Written by the orchestrator after each phase. Read by the orchestrator for recovery.

```yaml
change: {change-name}
created: {ISO-8601}
updated: {ISO-8601}
mode: openspec
phases:
  explore: pending | done | skipped
  proposal: pending | done
  clarify: pending | done | skipped
  spec: pending | in_progress | done
  design: pending | in_progress | done
  tasks: pending | done
  apply: pending | in_progress | done
  verify: pending | pass | fail
  archive: pending | done
current_phase: {phase-name}
locks:
  spec: false
  design: false
```

## 8. Config Reference

```yaml
# openspec/config.yaml
schema: spec-driven

context: |
  Tech stack: {detected}
  Architecture: {detected}
  Testing: {detected}
  Style: {detected}

strict_tdd: false

rules:
  proposal:
    - Include rollback plan for risky changes
  specs:
    - Use Given/When/Then for scenarios
    - Use RFC 2119 keywords (MUST, SHALL, SHOULD, MAY)
  design:
    - Include sequence diagrams for complex flows
    - Document architecture decisions with rationale
  tasks:
    - Group by phase, use hierarchical numbering
    - Keep tasks completable in one session
  apply:
    - Follow existing code patterns
    strict_tdd: false
    test_command: ""
    pre_hook: ""
    post_hook: ""
    post_hook_on_fail: "retry"
    post_hook_max_retries: 3
  verify:
    test_command: ""
    build_command: ""
    coverage_threshold: 0
  archive:
    - Warn before merging destructive deltas
```

## 9. Archive Convention

When archiving, the change folder moves to:
```
openspec/changes/archive/YYYY-MM-DD-{change-name}/
```

Use today's date in ISO format. The archive is an AUDIT TRAIL — never delete or modify archived changes.
