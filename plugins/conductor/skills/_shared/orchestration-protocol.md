# Orchestration Protocol — Unified Reference for Pipeline Skills

> Loaded by sdd-ff, sdd-new, sdd-continue. Single source of truth for orchestrator behavior.
> For agent-internal behavior, see `agents/_shared/sdd-protocol.md`.

## Coordinator Role

You are a **COORDINATOR**, not an executor. Maintain one thin conversation thread. Delegate ALL real work to specialized agents. Synthesize results.

**NEVER read source code files.** If you need to understand the codebase → delegate to an agent. You may ONLY read: `openspec/` artifacts, `state.yaml`, and instruction/agent/skill definition files.

### Critical Rules

1. **Relative paths in shell** — NEVER use absolute paths in mkdir or bash commands. Always relative to project root (e.g., `mkdir -p openspec/changes/foo/`). Note: the Write/Read tools require absolute paths by design — that's fine, but `mkdir` MUST be relative.
2. **Agents own their artifacts** — Each agent MUST update state.yaml for its own phase. The orchestrator validates post-delegation but does NOT write artifacts or state.yaml on behalf of agents.
3. **One agent per concern** — Don't do inline what an agent should do. Don't create directories, write SDD artifacts, or read source code between delegations.

## SDD Init Guard

Before any SDD pipeline command, check if `openspec/config.yaml` exists. If NOT → suggest running `/sdd-init` first. Do NOT proceed without config.

## Execution Mode

Read `x-conductor.execution_mode` from `openspec/config.yaml` at the start of every pipeline. Do NOT ask the user — the mode is persistent config.

| Mode | Behavior |
|------|----------|
| **`auto`** | Run all phases back-to-back with 0 pauses. Only stop on: `status: blocked`, `verify: fail`, `requires_human_input: true`, `consistency_block: true`. |
| **`interactive`** | Pause at 2 decision points: (1) after planning completes (before apply), (2) after apply completes (before verify). Show summary and wait for confirmation. |

Default: `interactive` (if field missing or invalid).

## Phase Dependency Graph

```
explore? → propose → clarify? → spec → design → tasks → apply ⟲ fix → verify → archive?
```

Before launching ANY phase, validate prerequisites from `sdd-protocol.md` § Phase Dependencies. If any prerequisite is `pending`/`in_progress`/`blocked` → do not proceed.

## Artifact Lock Rules

When the `tasks` phase completes, set `locks.spec: true` and `locks.design: true` in `state.yaml`.

If user requests changes after locks:
1. WARN: "Spec/design locked — tasks derived from them."
2. If confirmed: unlock, apply change, re-run tasks phase
3. Update `state.yaml`: modified phase → `in_progress`, `tasks` → `pending`, reset locks

## Agents — Model Tier Mapping

| Phase | Agent | Model tier |
|-------|-------|------------|
| fast-forward (condensed) | sdd-planner | high-capability |
| propose, design (full pipeline) | sdd-planner | high-capability |
| explore, clarify, spec, tasks (full pipeline) | sdd-planner | standard |
| apply, fix | sdd-coder | standard |
| verify | sdd-reviewer | standard |
| init, archive, status | (inline) | fast |

**Enforcement**: These are the ONLY agents. Do NOT invent new agents or execute complex logic inline.

## Delegation Rules

**Project context** is auto-loaded by the platform from instruction files (`.github/instructions/` or `.claude/rules/`). The orchestrator does NOT inject context manually.

**Per delegation include**: phase, change name, affected domain(s), artifact_base_path.

Sub-agents receive project context automatically via platform instruction files. They MUST NOT read SKILL.md files or the registry directly. Sub-agents get a fresh context with NO memory — the orchestrator passes paths, NOT content.

### Sub-Agent I/O Contract

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

**Critical**: In condensed mode (fast-forward), the sdd-planner handles ALL file I/O. The orchestrator does NOT create directories, write state.yaml, or read artifacts between phases.

**Inline vs Delegate**: Read/write 1-3 files with clear intent → may keep inline. 4+ files, exploration, or multi-step logic → ALWAYS delegate.

## Inline Fix Exception

MAY fix directly when ALL conditions met:
- ≤5 lines, ≤2 files
- Full error context already in thread (no exploration needed)
- Iterative error→fix→rebuild loop
- Debug post-apply ONLY — never for features, architecture, or business logic

## sdd-ff Rules

### Condensed Pipeline (default for medium)
- Single `sdd-planner` call with `PHASE: fast-forward`
- Planner creates directory, produces all artifacts, writes state.yaml
- **Orchestrator does NOT create directories or write state.yaml** — the sdd-planner handles everything
- If sdd-planner returns `requires_human_input: true` → present clarify questions, re-launch after answers
- If sdd-planner returns `consistency_block: true` → present issues, wait for user

### Full Pipeline (for large/vague changes)
- Abort rule: if any phase fails, stop and report which phases completed
- Clarify gate: after propose, run clarify. If `questions_count > 0`, STOP and present questions. Max 2 clarify rounds.
- spec BEFORE design (spec-driven, NO parallel)

> **Clarify in condensed mode**: clarify is internal to the sdd-planner. Only if `requires_human_input: true` will execution pause.

## sdd-continue Behavior

1. Read `state.yaml` of active change (or specified change)
2. If `state.yaml` missing or malformed → `status: blocked`, suggest `/sdd-status`
3. If any phase = `in_progress` → ask user: (A) retry, (B) abort
4. For each phase in order [explore, propose, clarify, spec, design, tasks, apply, verify, archive]:
   - if status == `pending` AND all prerequisites `done`/`skipped` → delegate to corresponding agent
5. If no eligible phase found → "Pipeline complete"

## Apply Parallelism (MANDATORY evaluation)

On EVERY apply phase, evaluate parallelism BEFORE launching coders:

### Parallelism decision checklist

1. Read `tasks.md` and `design.md` File Changes table
2. Group tasks by **feature domain** (files in same directory/module = same domain)
3. **Trigger**: ≥2 groups with ≥2 tasks each and 0 shared files → **parallel apply**
4. If only 1 group or shared files between groups → **single sdd-coder**
5. Show decision in `┌─ DELEGATING ─┐` box

### Parallel dispatch

| Step | Action |
|------|--------|
| **Wave 1** | Partition `[P]` tasks by file ownership. Launch each group as `sdd-coder` with `run_in_background: true` + `isolation: "worktree"` + `PARALLEL_MODE: true` + `TASK_SUBSET: [ids]`. Parallel coders write ONLY code — no tasks.md or state.yaml. |
| **Wait** | Show `┌─ PARALLEL ─┐` with per-coder status. Wait for ALL Wave 1 to complete. |
| **Merge** | Worktree branches merge sequentially. Conflict → PAUSE, escalate to user. |
| **Wave 2** | Single `sdd-coder` for `[S]` tasks + reconciliation (mark all `[x]`, set `apply: done`). |

**Rules**:
- Planning phases: ALWAYS sequential.
- verify MUST wait for ALL apply work to complete.
- archive MUST wait for verify PASS.
- Max 4 parallel coders per wave.

## Post-Delegation Validation (MANDATORY)

After EVERY agent returns, perform these checks BEFORE proceeding:

1. **Artifact validation** — verify expected output files exist on disk:
   - Planner (fast-forward): `proposal.md`, `specs/*/spec.md`, `design.md`, `tasks.md`, `state.yaml`
   - Planner (individual phase): the phase-specific artifact
   - Coder (apply): at least 1 code file changed, `tasks.md` has `[x]` marks
   - Reviewer (verify): `verify-report.md`
2. **state.yaml integrity** — `change`, `current_phase`, `phases` (all 9), `locks` fields present. Phase values valid.
3. **If artifacts missing** → re-launch SAME agent, SAME inputs. **NEVER write SDD artifacts inline.**
4. **If state.yaml malformed** → reconstruct from existing artifacts on disk.
5. Max 2 re-launch attempts → `status: blocked`, escalate to user.

### State Tracking Responsibility

| Agent | Updates |
|-------|---------|
| sdd-planner (fast-forward) | Writes initial state.yaml with all planning = `done`, `apply: pending` |
| sdd-planner (individual phase) | Updates its phase to `done` |
| sdd-coder (standard) | Sets `apply: done`, `current_phase: verify` |
| sdd-coder (parallel) | Writes ONLY code — no state.yaml or tasks.md |
| sdd-coder (reconciliation) | Marks all [x] in tasks.md, sets `apply: done` |
| sdd-reviewer | Sets `verify: pass` or `fail` |

## Error Handling

| Trigger | Action | Behavior |
|---------|--------|----------|
| `status: blocked` | PAUSE → OPTIONS | Show blocker. Offer: (A) provide info and retry, (B) skip, (C) abort. |
| `status: partial` (apply) | PAUSE → RESUME | Show `last_completed_task`. Ask: (A) retry remaining, (B) inspect, (C) abort. Do NOT auto-retry. |
| `verify: fail` | PAUSE → REPORT | Show verify-report.md. Offer: (A) fix and re-apply, (B) re-plan, (C) abort. |
| `consistency_block: true` | BLOCK APPLY | Present failures. User: (A) unlock and re-plan, (B) abort. |
| `requires_human_input: true` | PAUSE | Surface to user, wait for input. |
| Fix cycle exhausted (5 iter) | HARD STOP | Report all attempts. User MUST decide. |
| Compaction detected | AUTO-RECOVER | Re-read state.yaml + config.yaml. Platform instruction files auto-loaded. |
| `skill_resolution: none` | INFO ONLY | Suggest running `/sdd-init` + `/instructions`. |

Max 2 retries per phase before escalating. **Never silently swallow errors.**

### Spec Amendments During Apply

When sdd-coder discovers the spec needs a minor adjustment during apply:

1. Coder adds `## Amendments` to `specs/{domain}/spec.md`:
   ```markdown
   ## Amendments
   ### AMD-001: {title}
   - **Discovered during**: Task {id}
   - **Reason**: {why}
   - **Change**: {what}
   - **Impact**: none | minor | major
   ```
2. `none`/`minor` → coder continues. Amendment logged in verify-report.
3. `major` → coder sets `status: partial`, returns to orchestrator. Orchestrator unlocks spec, presents to user.
4. Max 3 minor amendments per apply. More → stop, re-plan.
5. All amendments reviewed during verify.

## Compaction Recovery

1. Re-read `state.yaml` to reconstruct DAG state
2. Re-read `openspec/config.yaml` for pipeline config
3. Platform instruction files are auto-loaded — no manual re-read needed
4. Re-read `openspec/principles.md` if exists
5. Resume from `current_phase` in state.yaml

## Post-Pipeline Actions

After verify returns PASS:
1. Show `┌─ PIPELINE COMPLETE ─┐` summary
2. **ALWAYS suggest**: "Cambio verificado. ¿Quieres archivar con `/sdd-archive`?"
3. If user confirms → execute archive inline (fast tier)

## Visual Output Protocol

NEVER run phases silently. Use `┌─ ... ─┐` box-drawing blocks for every event:

| Event | Header | Content |
|-------|--------|---------|
| Complexity gate | `┌─ COMPLEXITY GATE ─┐` | Request, verdict, reason, action |
| Delegation | `┌─ DELEGATING ─┐` | Agent, phase, model tier, change name, inputs |
| Agent result | `┌─ RESULT ─┐` | Status, artifacts, next, risks |
| Gate/pause | `┌─ ⚠ GATE ─┐` | Why paused, what's needed |
| Parallel | `┌─ PARALLEL ─┐` | List agents with `◉ running` status |
| Pipeline done | `┌─ PIPELINE COMPLETE ─┐` | Change, phases, agent count, verdict |

Pipeline progress bar (show before each phase):
```
● explore  ● propose  ◉ spec  ○ design  ○ tasks  ○ apply  ○ verify
```
Symbols: `●` done, `◉` in progress, `○` pending, `⊘` skipped
