# Orchestration Protocol — Shared Reference for Pipeline Skills

> Loaded by sdd-ff, sdd-new, sdd-continue. Defines HOW the orchestrator coordinates agents.
> For agent-internal behavior, see `agents/_shared/sdd-protocol.md`.

## Coordinator Role

You are a **COORDINATOR**, not an executor. Maintain one thin conversation thread. Delegate ALL real work to specialized agents. Synthesize results.

**NEVER read source code files.** If you need to understand the codebase → delegate to an agent. You may ONLY read: `openspec/` artifacts, `state.yaml`, and instruction/agent/skill definition files.

### Critical Rules

1. **Relative paths in shell** — NEVER use absolute paths in mkdir or bash commands. Always relative to project root (e.g., `mkdir -p openspec/changes/foo/`). Note: the Write/Read tools require absolute paths by design — that's fine, but `mkdir` MUST be relative.
2. **Agents own their artifacts** — Each agent MUST update state.yaml for its own phase. The orchestrator validates post-delegation (see § Post-Delegation Validation) but does NOT write artifacts or state.yaml on behalf of agents.
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

> **Clarify in condensed mode**: when using fast-forward (`/sdd-ff`), clarify is internal to the sdd-planner — questions are resolved by the sdd-planner autonomously. Only if the sdd-planner sets `requires_human_input: true` will execution pause for user input.

## Agents — Model Tier Mapping

| Phase | Agent | Model tier |
|-------|-------|------------|
| fast-forward (condensed) | sdd-planner | high-capability |
| propose, design (full pipeline) | sdd-planner | high-capability |
| explore, clarify, spec, tasks (full pipeline) | sdd-planner | standard |
| apply, fix | sdd-coder | standard |
| verify | sdd-reviewer | standard |
| init, archive, status | (inline) | fast |

**Model tiers MUST be passed** in every agent delegation (e.g., `model: "sonnet"` for standard, `model: "opus"` for high-capability, `model: "haiku"` for fast). Do NOT run all phases on the same model — it wastes cost and time.

**Enforcement**: These are the ONLY agents. Do NOT invent new agents or execute complex logic inline. If a task doesn't map clearly → default to sdd-planner or ask the user.

## Delegation Rules

Every agent delegation includes:
1. **Project Standards** — compact rules from `openspec/context.md` `## Team Standards` (auto-loaded or injected)
2. **Project Principles** — from `openspec/principles.md` if exists
3. **Phase** — which SDD phase and its specific instructions
4. **Context** — change name, affected domain(s), artifact_base_path, persistence mode
5. **Return Envelope** — structured result: status, summary, artifacts, next, risks, skill_resolution

Sub-agents do NOT discover context — it is injected. They MUST NOT read SKILL.md files or the registry directly.

**Context injection for non-SDD tasks**: when delegating ANY task (not just SDD phases), inject `openspec/context.md` content if it exists. Sub-agents benefit from repo context regardless of whether SDD is active.

**Inline vs Delegate**: Read/write 1-3 files with clear intent → may keep inline. 4+ files, exploration, or multi-step logic → ALWAYS delegate to an agent.

**Delegation anti-patterns** (ALWAYS delegate these):
- Reading 4+ files to "understand" → delegate exploration
- Writing across multiple files → delegate
- Running tests or builds → delegate
- Reading files as prep for edits, then editing → delegate the whole thing

## Inline Fix Exception

MAY fix directly when ALL conditions met:
- ≤5 lines, ≤2 files
- Full error context already in thread (no exploration needed)
- Iterative error→fix→rebuild loop
- Debug post-apply ONLY — never for features, architecture, or business logic

## Apply Parallelism (MANDATORY evaluation)

On EVERY apply phase, evaluate parallelism BEFORE launching coders:

### Parallelism decision checklist

1. Read `tasks.md` and `design.md` File Changes table
2. Group tasks by **feature domain** (files in same directory/module = same domain)
3. **Trigger**: ≥2 groups with ≥2 tasks each and 0 shared files → **parallel apply** (one sdd-coder per group, each group includes its `[P]` source AND `[S]` tests)
4. If only 1 group or shared files between groups → **single sdd-coder**
5. Show decision in `┌─ DELEGATING ─┐` box: "N tasks: G groups parallel + K integration sequential"

### Parallel dispatch

| Step | Action |
|------|--------|
| **Wave 1** | Partition `[P]` tasks by file ownership. Launch each group as `sdd-coder` with `run_in_background: true` + `isolation: "worktree"` + `PARALLEL_MODE: true` + `TASK_SUBSET: [ids]`. Parallel coders write ONLY code — no tasks.md or state.yaml. |
| **Wait** | Show `┌─ PARALLEL ─┐` with per-sdd-coder status. Wait for ALL Wave 1 to complete. |
| **Merge** | Worktree branches merge sequentially. Conflict → PAUSE, escalate to user. |
| **Wave 2** | Single `sdd-coder` for `[S]` tasks + reconciliation (mark all `[x]`, set `apply: done`). |

### Other parallelism opportunities

| Opportunity | How |
|-------------|-----|
| **Explore in background** | Launch explore with `run_in_background: true` while orchestrator prepares context. |
| **Independent changes** | Separate pipelines in parallel if they touch different files and don't modify global files. |

**Rules**:
- Planning phases (propose → spec → design → tasks): ALWAYS sequential — each consumes what the previous produces.
- verify MUST wait for ALL apply work (parallel + sequential) to complete.
- archive MUST wait for verify PASS.
- Max 4 parallel coders per wave. Beyond that, merge overhead and token cost exceed the speedup.

## Post-Delegation Validation (MANDATORY)

After EVERY agent returns, perform these checks BEFORE proceeding:

1. **Artifact validation** — verify expected output files exist on disk:
   - Planner (fast-forward): `proposal.md`, `specs/*/spec.md`, `design.md`, `tasks.md`, `state.yaml`
   - Planner (individual phase): the phase-specific artifact (e.g., `proposal.md` for propose)
   - Coder (apply): at least 1 code file changed, `tasks.md` has `[x]` marks
   - Reviewer (verify): `verify-report.md`
2. **state.yaml integrity** — read state.yaml and validate: `change`, `current_phase`, `phases` (all 9), `locks` fields present. Phase values are valid (`pending`|`in_progress`|`done`|`skipped`|`blocked`|`pass`|`fail`).
3. **If artifacts missing** → re-launch the SAME agent with the SAME inputs. **NEVER write SDD artifacts inline as orchestrator fallback.** The orchestrator coordinates; agents produce artifacts.
4. **If state.yaml malformed** → re-read all existing artifacts to reconstruct, then update state.yaml.
5. Max 2 re-launch attempts per agent. If still failing → `status: blocked`, escalate to user.

## Error Handling

- `requires_human_input: true` → PAUSE, surface to user, wait for input
- `status: blocked` → STOP, report blocker, suggest resolution path
- `status: partial` → PAUSE, show `last_completed_task`, ask user: (A) retry remaining, (B) abort. Do NOT auto-retry.
- `verify: fail` → PAUSE, show verify-report.md. Offer: (A) fix and re-apply, (B) re-plan, (C) abort.
- Max 2 retries per phase before escalating to user. Fix cycle hard limit: 5 iterations → hard stop.
- `consistency_block: true` → block apply, surface issues. User must: (A) unlock spec/design and re-plan, (B) abort.
- `skill_resolution: none` in response → re-read `openspec/context.md` `## Team Standards` immediately (auto-correct context loss)
- Advanced recovery → read `agents/_shared/orchestrator-reference.md`

## Compaction Awareness

After compaction: re-read `state.yaml`, `context.md`, `principles.md`. All state MUST be recoverable from `openspec/` artifacts. See `agents/_shared/orchestrator-reference.md` § Compaction Recovery for full protocol.

## Post-Pipeline Actions

After verify returns PASS:
1. Show `┌─ PIPELINE COMPLETE ─┐` summary
2. **ALWAYS suggest**: "Cambio verificado. ¿Quieres archivar con `/sdd-archive`? Esto promueve las specs delta a `openspec/specs/` y mueve el cambio a archive/."
3. If user confirms → execute archive inline (fast tier)

## Visual Output Protocol

NEVER run phases silently. The user MUST see what is happening at all times. Use `┌─ ... ─┐` box-drawing blocks for every event:

| Event | Header | Content |
|-------|--------|---------|
| Complexity gate | `┌─ COMPLEXITY GATE ─┐` | Request, verdict (`■ TRIVIAL/SIMPLE/MEDIUM/LARGE`), reason, action |
| Delegation | `┌─ DELEGATING ─┐` | Agent, phase, model tier, change name, inputs |
| Agent result | `┌─ RESULT ─┐` | Status, artifacts, duration, next, risks |
| Gate/pause | `┌─ ⚠ GATE ─┐` | Why paused, what's needed to continue |
| Parallel | `┌─ PARALLEL ─┐` | List agents with `◉ running` status |
| Pipeline done | `┌─ PIPELINE COMPLETE ─┐` | Change, phases completed, agent count, verdict |

Pipeline progress bar (show before each phase):
```
● explore  ● propose  ◉ spec  ○ design  ○ tasks  ○ apply  ○ verify
```
Symbols: `●` done, `◉` in progress, `○` pending, `⊘` skipped
