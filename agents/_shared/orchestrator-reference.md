# Orchestrator Reference — On-Demand Protocol

> Load this file only when you need detailed error recovery, lock management, or sub-agent protocol.
> The essentials are in CLAUDE.md / copilot-instructions.md.

## Error Recovery Protocol

| Trigger | Action | Behavior |
|---------|--------|----------|
| `status: blocked` | PAUSE → DISPLAY → OPTIONS | Show blocker. Offer: (A) provide info and retry, (B) skip with warning, (C) abort. |
| `status: partial` | MERGE → CONTINUE | Accept completed work. Ask: retry remaining or skip? |
| Timeout/crash | RETRY (MAX 2) → ESCALATE | Max 2 retries per phase before escalating to user. |
| Compaction detected (`skill_resolution ≠ injected`) | AUTO-RECOVER | Re-read `openspec/conventions.md` + `openspec/principles.md`. Re-cache. If openspec: re-read `state.yaml`. |
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
2. Re-read `openspec/conventions.md` to restore compact rules cache
3. Re-read `openspec/principles.md` if exists
4. Resume from `current_phase` in state.yaml

## sdd-ff Rules

### Condensed Pipeline (default for medium)
- Single `sdd-planner` call with `PHASE: fast-forward`
- Planner creates directory, produces all artifacts, writes state.yaml
- **Orchestrator does NOT create directories or write state.yaml** — the planner handles everything
- If planner returns `requires_human_input: true` → present clarify questions, re-launch after answers
- If planner returns `consistency_block: true` → present issues, wait for user

### Full Pipeline (for large/vague changes)
- Abort rule: if any phase fails, stop and report which phases completed successfully
- Clarify gate: after propose, run clarify. If `questions_count > 0`, STOP and present questions
- spec BEFORE design (spec-driven, NO parallel)
- `none` mode: WARN user before launching — context may exhaust after 3+ phases

## sdd-continue Behavior

1. Read `state.yaml` of active change (or specified change)
2. Find next phase where status = `pending` and all dependencies are `done`/`skipped`
3. Delegate to corresponding agent
4. If no pending phases → "Pipeline complete"

## Sub-Agent Launch Pattern

**Once per session**:
1. Read `openspec/conventions.md`, cache Compact Rules and User Skills trigger table
2. Read `openspec/context.md`, cache repo context
3. If no registry, warn and proceed without project-specific standards
4. Read `openspec/principles.md` if it exists, cache as compact principles (max 5 lines)

**Per delegation**:
1. Match skills by code context (file patterns) AND task context (actions)
2. Inject repo context from `openspec/context.md`
3. Inject principles as `## Project Principles (auto-resolved)` FIRST
4. Inject matching compact rules as `## Project Standards (auto-resolved)`
5. Always include artifact store mode (`openspec` or `none`)

**Key**: inject compact rules TEXT, not paths. Sub-agents do NOT read SKILL.md files or the registry.

## Sub-Agent Context Protocol

Sub-agents get a fresh context with NO memory.

| Phase | Reads | Writes |
|-------|-------|--------|
| **fast-forward** | user request, context.md, main specs, principles, lessons-learned | dir + proposal.md + spec.md + design.md + tasks.md + state.yaml |
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

**Critical**: In condensed mode (fast-forward), the planner agent handles ALL file I/O. The orchestrator does NOT create directories, write state.yaml, or read artifacts between phases.

> **`none` mode exception**: orchestrator MUST pass previous phase's result content in the prompt.

## Mode `none` Handling

| Mode | Recovery |
|------|----------|
| `openspec` | read `openspec/changes/*/state.yaml` |
| `none` | Not persisted — explain to user. `sdd-continue` unavailable. |

## State Tracking Responsibility

The orchestrator does NOT update state.yaml between phases. Each agent is responsible for updating its own phase status:

| Agent | Updates |
|-------|---------|
| sdd-planner (fast-forward) | Writes initial state.yaml with all planning = `done`, `apply: pending` |
| sdd-planner (individual phase) | Updates its phase to `done` |
| sdd-coder | Sets `apply: done`, `current_phase: verify` |
| sdd-reviewer | Sets `verify: pass` or `fail` |

In **Interactive mode**: orchestrator MAY additionally read state.yaml between phases for status display.

**Critical**: state.yaml updates by agents are NOT optional. They are phase gates for `/sdd-continue` and DAG recovery after compaction.

