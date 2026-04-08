# Orchestrator Reference — Advanced Protocol

> This file contains detailed protocol that the orchestrator loads ON DEMAND.
> The essentials are in the main orchestrator instructions (copilot-instructions.md / CLAUDE.md).
> Read this file when you need detailed error handling, lock management, or sub-agent protocol.

## Error Handling for Meta-Commands

- If a sub-agent returns `requires_human_input: true` → PAUSE, present the `human_input_needed` description to the user, wait for their response before launching the next phase
- If a sub-agent returns `status: blocked` → STOP, report the blocker to the user, suggest resolution
- If a sub-agent returns `status: partial` → report partial result, ask user whether to continue or retry
- Maximum 2 retries per phase before escalating to the user
- **Tasks consistency gate**: if `sdd-tasks` returns `consistency_block: true`, do NOT proceed to `sdd-apply`. Report the consistency issue and suggest re-running the blocked upstream phase (spec or design).
- **Apply batching**: when `sdd-apply` returns partial, exclude blocked tasks from the next batch. If the same task is blocked twice, escalate — do NOT retry a third time.
- `sdd-ff` abort rule: if any phase fails, stop and report which phases completed successfully
- `sdd-ff` clarify gate: after `sdd-propose`, run `sdd-clarify`. If `questions_count > 0`, STOP fast-forward and present questions. Resume after answers.
- `sdd-ff` parallelism: `sdd-spec` and `sdd-design` MAY run in parallel (both depend only on proposal)
- `sdd-ff` in `none` mode: WARN user before launching — context may exhaust after 3+ phases

## Error Recovery Protocol

| Trigger | Action | Behavior |
|---------|--------|----------|
| `status: blocked` | PAUSE → DISPLAY → OPTIONS | Show blocker. Offer: (A) provide info and retry, (B) skip with warning, (C) abort. |
| `status: partial` | MERGE → CONTINUE | Accept completed work. Ask: retry remaining or skip? |
| Timeout/crash | RETRY ONCE → ESCALATE | Retry once. If fails again, report to user. No third attempt. |
| Compaction detected (`skill_resolution ≠ injected`) | AUTO-RECOVER | Re-read `.atl/skill-registry.md` + `openspec/principles.md`. Re-cache. If openspec: re-read `state.yaml`. |
| Artifact budget violated | WARN → ACCEPT | Accept but warn that downstream phases consume more tokens. |

**Key principle**: Never silently swallow errors. Every error MUST be reported with enough context for the user to decide.

## Skill Resolution Feedback

After every delegation, check the `skill_resolution` field:
- `injected` → all good
- `fallback-registry`, `fallback-path`, or `none` → cache was lost. Re-read registry immediately, inject in all subsequent delegations.

## Sub-Agent Launch Pattern

ALL sub-agent launch prompts involving code MUST include pre-resolved compact rules from the skill registry. Follow `_shared/skill-resolver.md`.

**Once per session**:
1. Read `.atl/skill-registry.md`, cache **Compact Rules** and **User Skills** trigger table
2. If no registry, warn and proceed without project-specific standards
3. Read `openspec/principles.md` if it exists, cache as compact principles (max 5 lines)

**Per delegation**:
1. Match skills by code context (file patterns) AND task context (actions)
2. Inject principles as `## Project Principles (auto-resolved)` FIRST
3. Inject matching compact rules as `## Project Standards (auto-resolved)`
4. Always include artifact store mode (`openspec` or `none`)

**Key**: inject compact rules TEXT, not paths. Sub-agents do NOT read SKILL.md files or the registry.

## Sub-Agent Context Protocol

Sub-agents get a fresh context with NO memory.

| Phase | Reads | Writes |
|-------|-------|--------|
| `sdd-explore` | nothing | `exploration.md` |
| `sdd-propose` | exploration (optional) | `proposal.md` |
| `sdd-clarify` | proposal (required) | `questions.md` |
| `sdd-spec` | proposal (required) | `spec.md` |
| `sdd-design` | proposal (required) | `design.md` |
| `sdd-tasks` | spec + design (required) | `tasks.md` |
| `sdd-apply` | tasks + spec + design | updates `tasks.md` |
| `sdd-verify` | spec + design + tasks | `verify-report.md` |
| `sdd-archive` | all artifacts | `archive-report.md` |

For phases with required dependencies, sub-agent reads directly from the filesystem — orchestrator passes paths, NOT content.

> **`none` mode exception**: orchestrator MUST pass previous phase's result content in the prompt. This inflates context — recommend enabling `openspec`.

## Artifact Lock Rule

When `sdd-tasks` completes, set `locks.spec: true` and `locks.design: true` in `state.yaml`.

If user requests changes after locks:
1. WARN: "Spec/design locked — tasks derived from them."
2. If confirmed: unlock, apply change, re-run `sdd-tasks`
3. Update `state.yaml`: modified phase → `in_progress`, `tasks` → `pending`, reset locks

## Recovery Rule

| Mode | Recovery |
|------|----------|
| `openspec` | read `openspec/changes/*/state.yaml` |
| `none` | Not persisted — explain to user. `sdd-continue` unavailable. |
