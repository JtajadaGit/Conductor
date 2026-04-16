# Orchestrator Reference — On-Demand Protocol

> Load this file only when you need detailed error recovery, lock management, or sub-agent protocol.
> The essentials are in CLAUDE.md / copilot-instructions.md.

## Error Recovery Protocol

| Trigger | Action | Behavior |
|---------|--------|----------|
| `status: blocked` | PAUSE → DISPLAY → OPTIONS | Show blocker. Offer: (A) provide info and retry, (B) skip with warning, (C) abort. |
| `status: partial` (apply) | PAUSE → RESUME | Show `last_completed_task`. Ask: (A) retry remaining tasks, (B) inspect and fix, (C) abort. Do NOT auto-retry. |
| `verify: fail` | PAUSE → DISPLAY REPORT | Show verify-report.md. Offer: (A) fix code and re-run apply (reset `apply: pending`), (B) re-plan (unlock spec/design), (C) abort. |
| `consistency_block: true` | BLOCK APPLY | Present 4-check failures. User MUST choose: (A) unlock and modify spec/design, re-run tasks, (B) abort. |
| Fix cycle exhausted (5 iterations) | HARD STOP | Report all attempted fixes. User MUST decide — do NOT auto-retry apply. |
| Timeout/crash (`in_progress` phase) | RETRY (MAX 2) → ESCALATE | Ask user: (A) retry phase, (B) abort. Max 2 retries before escalating. |
| Compaction detected | AUTO-RECOVER | Re-read `state.yaml`, `openspec/config.yaml`. Platform instruction files are auto-loaded. |
| `skill_resolution: none` | INFO ONLY | Platform instruction files not found. Suggest running `/sdd-init` + `/instructions`. |
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
2. Re-read `openspec/config.yaml` for pipeline config
3. Platform instruction files are auto-loaded — no manual re-read needed
4. Re-read `openspec/principles.md` if exists
5. Resume from `current_phase` in state.yaml

## Phase Dependency Graph

```
explore? → propose → clarify? → spec → design → tasks → apply ⟲ fix → verify → archive?
```

See `sdd-protocol.md` § Phase Dependencies for the full prerequisite table. Before launching ANY phase via sdd-continue, validate prerequisites are met.

## sdd-ff Rules

### Condensed Pipeline (default for medium)
- Single `sdd-planner` call with `PHASE: fast-forward`
- Planner creates directory, produces all artifacts, writes state.yaml
- **Orchestrator does NOT create directories or write state.yaml** — the sdd-planner handles everything
- If sdd-planner returns `requires_human_input: true` → present clarify questions to user (sdd-planner already wrote `clarify: pending` in state.yaml), re-launch after answers
- If sdd-planner returns `consistency_block: true` → present issues, wait for user

### Full Pipeline (for large/vague changes)
- Abort rule: if any phase fails, stop and report which phases completed successfully
- Clarify gate: after propose, run clarify. If `questions_count > 0`, STOP and present questions. Max 2 clarify rounds.
- spec BEFORE design (spec-driven, NO parallel)

## sdd-continue Behavior

1. Read `state.yaml` of active change (or specified change)
2. If `state.yaml` missing or malformed → `status: blocked`, suggest `/sdd-status`
3. If any phase = `in_progress` → ask user: (A) retry, (B) abort
4. For each phase in order [explore, propose, clarify, spec, design, tasks, apply, verify, archive]:
   - if status == `pending`:
     - Check prerequisites from Phase Dependency Graph (sdd-protocol.md)
     - If any prerequisite is `pending`/`in_progress`/`blocked` → skip
     - If all prerequisites `done`/`skipped` → delegate to corresponding agent
5. If no eligible phase found → "Pipeline complete"

## Sub-Agent Launch Pattern

**Once per session**:
1. Read `openspec/config.yaml` for pipeline config
2. Read `openspec/principles.md` if it exists, cache as compact principles (max 5 lines)
3. Platform instruction files (`.github/instructions/`, `.claude/rules/`) are auto-loaded — no manual injection needed

**Per delegation**:
1. Always include: change_name, affected domain(s), artifact_base_path
2. Project context (stack, architecture, formatting, testing) is auto-loaded by the platform via instruction files
3. Sub-agents do NOT read SKILL.md files or the registry

## Sub-Agent Context Protocol

Sub-agents get a fresh context with NO memory.

| Phase | Reads | Writes |
|-------|-------|--------|
| **fast-forward** | user request, main specs, principles, lessons-learned | dir + proposal.md + spec.md + design.md + tasks.md + state.yaml |
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

**Critical**: In condensed mode (fast-forward), the sdd-planner agent handles ALL file I/O. The orchestrator does NOT create directories, write state.yaml, or read artifacts between phases.


## Parallel Apply Dispatch

When apply phase starts, evaluate [P] tasks for parallel execution:

### Decision
1. Read `tasks.md` and `design.md` File Changes table.
2. Group tasks by **feature domain** (files in same directory/module = same domain). Each group includes source `[P]` AND test `[S]` tasks for that domain.
3. **Trigger**: ≥2 groups with ≥2 tasks each and 0 shared files → **parallel apply** (one sdd-coder per group).
4. Integration tasks (routing, app config, shared files) → always in Wave 2 (sequential sdd-coder).
5. If only 1 group or shared files between groups → **single sdd-coder** (standard mode).

### Dispatch (parallel mode)
1. **Partition** `[P]` tasks into groups by file ownership (each file belongs to exactly one group).
2. **Wave 1 — parallel coders**: For each group, launch `sdd-coder` with:
   - `run_in_background: true` (Claude Code) or fleet subtask (Copilot CLI)
   - `isolation: "worktree"` (each sdd-coder gets its own git worktree — no file conflicts)
   - Prompt includes: `PARALLEL_MODE: true`, `TASK_SUBSET: [task-ids]`, spec, design, project standards
   - Parallel coders write ONLY code files. They do NOT touch `tasks.md` or `state.yaml`.
3. **Wait** for all Wave 1 coders to complete. Show `┌─ PARALLEL ─┐` with status per sdd-coder.
4. **Merge**: worktree branches merge into main sequentially. If merge conflict → PAUSE, escalate to user.
5. **Wave 2 — sequential sdd-coder**: Launch single `sdd-coder` (standard mode) for remaining `[S]` tasks. This sdd-coder also:
   - Marks ALL completed tasks (both [P] and [S]) as `[x]` in tasks.md
   - Updates state.yaml: `apply: done`, `current_phase: verify`
6. If no `[S]` tasks exist: launch a minimal sdd-coder to reconcile tasks.md and state.yaml only.

### Error handling in parallel mode
- If any parallel sdd-coder returns `status: partial` → PAUSE, show which group failed, offer retry.
- If worktree merge fails → PAUSE, show conflict files, ask user to resolve.
- If all parallel coders succeed but sequential sdd-coder fails → standard error recovery (fix cycle).

## State Tracking Responsibility

The orchestrator does NOT update state.yaml between phases. Each agent is responsible for updating its own phase status:

| Agent | Updates |
|-------|---------|
| sdd-planner (fast-forward) | Writes initial state.yaml with all planning = `done`, `apply: pending` |
| sdd-planner (individual phase) | Updates its phase to `done` |
| sdd-coder (standard) | Sets `apply: done` (or `in_progress` + `last_completed_task` on partial), `current_phase: verify` |
| sdd-coder (parallel) | Writes ONLY code — no state.yaml or tasks.md updates |
| sdd-coder (reconciliation) | Marks all [x] in tasks.md, sets `apply: done`, `current_phase: verify` |
| sdd-reviewer | Sets `verify: pass` or `fail` |

**Critical**: state.yaml updates by agents are NOT optional. They are phase gates for `/sdd-continue` and DAG recovery after compaction. In parallel mode, only the reconciliation sdd-coder (Wave 2) writes to state.yaml and tasks.md.

## Post-Delegation Artifact Validation

After EVERY agent delegation, the orchestrator MUST validate before proceeding:

### Expected artifacts per agent

| Agent / Phase | Expected artifacts |
|---------------|-------------------|
| sdd-planner (fast-forward) | `proposal.md`, `specs/{domain}/spec.md`, `design.md`, `tasks.md`, `state.yaml` |
| sdd-planner (explore) | `exploration.md` |
| sdd-planner (propose) | `proposal.md` |
| sdd-planner (clarify) | `questions.md` (only if questions > 0) |
| sdd-planner (spec) | `specs/{domain}/spec.md` |
| sdd-planner (design) | `design.md` |
| sdd-planner (tasks) | `tasks.md` |
| sdd-coder (apply) | code files changed + `tasks.md` with `[x]` marks |
| sdd-coder (fix) | code fix applied |
| sdd-reviewer (verify) | `verify-report.md` |

### Validation steps

1. **Check artifact existence**: Glob for expected files in `openspec/changes/{change-name}/`
2. **Check state.yaml integrity**: Required fields: `change`, `created`, `updated`, `current_phase`, `phases` (all 9 phases), `last_completed_task`, `locks` (spec, design). Phase values: `pending`|`in_progress`|`done`|`skipped`|`blocked`|`pass`|`fail`.
3. **Check phase consistency**: `current_phase` should match the first phase with status `pending` whose dependencies are met.

### On validation failure

- **Artifacts missing**: Re-launch the same agent with identical inputs. **NEVER write SDD artifacts inline.** Max 2 re-launches.
- **state.yaml missing/malformed**: Reconstruct from existing artifacts on disk. Set phases with artifacts to `done`, others to their logical state.
- **After 2 failed re-launches**: `status: blocked`, escalate to user with diagnostic.

## Spec Amendments During Apply

When a sdd-coder discovers during apply that the spec needs a minor adjustment (missing field, edge case not covered):

### Lightweight amendment protocol

1. Coder adds `## Amendments` section to the bottom of the relevant `specs/{domain}/spec.md`:
   ```markdown
   ## Amendments
   ### AMD-001: {title}
   - **Discovered during**: Task {id}
   - **Reason**: {why the spec needs adjustment}
   - **Change**: {what is added/modified}
   - **Impact**: none | minor (no re-plan needed) | major (requires re-plan)
   ```
2. If impact = `none` or `minor` → sdd-coder continues. Amendment is logged in verify-report.
3. If impact = `major` → sdd-coder sets `status: partial`, returns to orchestrator. Orchestrator unlocks spec, presents amendment to user.

### Rules
- Amendments ONLY for discoveries during implementation — NOT for changing requirements.
- Max 3 minor amendments per apply phase. If more → stop, re-plan.
- All amendments are reviewed during verify — sdd-reviewer checks they're justified.
- Amendments are preserved in archive for traceability.

