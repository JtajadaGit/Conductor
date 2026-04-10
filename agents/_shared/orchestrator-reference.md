# Orchestrator Reference — On-Demand Protocol

> Load this file only when you need detailed error recovery, lock management, or sub-agent protocol.
> The essentials are in CLAUDE.md / copilot-instructions.md.

## Error Recovery Protocol

| Trigger | Action | Behavior |
|---------|--------|----------|
| `status: blocked` | PAUSE → DISPLAY → OPTIONS | Show blocker. Offer: (A) provide info and retry, (B) skip with warning, (C) abort. |
| `status: partial` | MERGE → CONTINUE | Accept completed work. Ask: retry remaining or skip? |
| Timeout/crash | RETRY ONCE → ESCALATE | Retry once. If fails again, report to user. No third attempt. |
| Compaction detected (`skill_resolution ≠ injected`) | AUTO-RECOVER | Re-read `.github/instructions/conventions.instructions.md` + `openspec/principles.md`. Re-cache. If openspec: re-read `state.yaml`. |
| Artifact budget violated | WARN → ACCEPT | Accept but warn that downstream phases consume more tokens. |

**Key principle**: Never silently swallow errors. Every error MUST be reported with enough context for the user to decide.

## Artifact Lock Rules

When the `tasks` phase completes, set `locks.spec: true` and `locks.design: true` in `state.yaml`.

If user requests changes after locks:
1. WARN: "Spec/design locked — tasks derived from them."
2. If confirmed: unlock, apply change, re-run tasks phase
3. Update `state.yaml`: modified phase → `in_progress`, `tasks` → `pending`, reset locks

## Compaction Recovery

1. Re-read `state.yaml` to reconstruct DAG state
2. Re-read `.github/instructions/conventions.instructions.md` to restore compact rules cache
3. Re-read `openspec/principles.md` if exists
4. Resume from `current_phase` in state.yaml

## sdd-ff Rules

- Abort rule: if any phase fails, stop and report which phases completed successfully
- Clarify gate: after propose, run clarify. If `questions_count > 0`, STOP fast-forward and present questions. Resume after answers.
- spec BEFORE design (spec-driven, NO parallel)
- `none` mode: WARN user before launching — context may exhaust after 3+ phases

## sdd-continue Behavior

1. Read `state.yaml` of active change (or specified change)
2. Find next phase where status = `pending` and all dependencies are `done`/`skipped`
3. Delegate to corresponding agent
4. If no pending phases → "Pipeline complete"

## Sub-Agent Launch Pattern

**Once per session**:
1. Read `.github/instructions/conventions.instructions.md`, cache Compact Rules and User Skills trigger table
2. Read `.github/instructions/context.instructions.md`, cache repo context
3. If no registry, warn and proceed without project-specific standards
4. Read `openspec/principles.md` if it exists, cache as compact principles (max 5 lines)

**Per delegation**:
1. Match skills by code context (file patterns) AND task context (actions)
2. Inject repo context from `context.instructions.md`
3. Inject principles as `## Project Principles (auto-resolved)` FIRST
4. Inject matching compact rules as `## Project Standards (auto-resolved)`
5. Always include artifact store mode (`openspec` or `none`)

**Key**: inject compact rules TEXT, not paths. Sub-agents do NOT read SKILL.md files or the registry.

## Sub-Agent Context Protocol

Sub-agents get a fresh context with NO memory.

| Phase | Reads | Writes |
|-------|-------|--------|
| explore | user request | `exploration.md` |
| propose | exploration (opt), main specs (opt) | `proposal.md` |
| clarify | proposal (req) | `questions.md` |
| spec | proposal (req), questions (opt) | `specs/{domain}/spec.md` |
| design | proposal + specs (req), exploration + questions + lessons-learned + principles (opt) | `design.md` |
| tasks | spec + design (req) | `tasks.md` |
| apply | tasks + spec + design (req), lessons-learned (opt) | code changes, `tasks.md` updates |
| fix | error context (req), lessons-learned (opt) | code fix, lessons-learned entry |
| verify | spec + tasks + codebase (req), design (opt) | `verify-report.md` |
| archive | all artifacts | `archive-report.md` |

For phases with required dependencies, sub-agent reads directly from filesystem — orchestrator passes paths, NOT content.

> **`none` mode exception**: orchestrator MUST pass previous phase's result content in the prompt.

## Mode `none` Handling

| Mode | Recovery |
|------|----------|
| `openspec` | read `openspec/changes/*/state.yaml` |
| `none` | Not persisted — explain to user. `sdd-continue` unavailable. |

## Execution Log

After each phase, append to `openspec/changes/{name}/execution-log.md`:

```markdown
| Timestamp | Phase | Status | Duration | Notes |
|-----------|-------|--------|----------|-------|
```
