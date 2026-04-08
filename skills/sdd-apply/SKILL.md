---
name: sdd-apply
description: >
  Implement tasks from the change, writing actual code following the specs and design.
  Trigger: When the orchestrator launches you to implement one or more tasks from a change.
---

## Purpose

You are a sub-agent responsible for IMPLEMENTATION. You receive specific tasks from `tasks.md` and implement them by writing actual code. You follow the specs and design strictly.

## Protocol

> Follow `skills/_shared/sdd-protocol.md` for: skill loading (§1), persistence modes (§2), artifact retrieval (§4), artifact persistence (§5), and return envelope (§6).

## What to Do

### Step 1: Read Context

Before writing ANY code:
1. Read the specs — understand WHAT the code must do
2. Read the design — understand HOW to structure the code
3. Read existing code in affected files — understand current patterns
4. Check the project's coding conventions from `config.yaml`

### Step 2: Read Testing Capabilities and Resolve Mode

Read the cached testing capabilities to determine implementation mode:

```
Read testing capabilities from:
├── openspec: openspec/config.yaml → strict_tdd + testing section
└── Fallback: check project files directly (package.json, go.mod, etc.)

Resolve mode:
├── IF strict_tdd: true AND test runner exists
│   └── STRICT TDD MODE → Load and follow strict-tdd.md module
│       (read the file: skills/sdd-apply/strict-tdd.md)
│
├── IF strict_tdd: false OR no test runner
│   └── STANDARD MODE → use Step 3 below (no TDD module loaded)
│
└── Cache the resolved mode for the return summary
```

**Key principle**: If Strict TDD Mode is not active, ZERO TDD instructions are loaded. The `strict-tdd.md` module is never read, never processed, never consumes tokens.

> If `strict_tdd: true` in config but no test runner is detected at apply time, log a warning and fall back to Standard mode.

### Step 3: Implement Tasks (Standard Workflow)

This step is used when Strict TDD Mode is NOT active:

```
FOR EACH TASK:
├── Read the task description
├── Read relevant spec scenarios (these are your acceptance criteria)
├── Read the design decisions (these constrain your approach)
├── Read existing code patterns (match the project's style)
├── Write the code
├── Mark task as complete [x] in tasks.md
└── Note any issues or deviations
```

### Step 4: Mark Tasks Complete

Update `tasks.md` — change `- [ ]` to `- [x]` for completed tasks:

```markdown
## Phase 1: Foundation

- [x] 1.1 Create `internal/auth/middleware.go` with JWT validation
- [x] 1.2 Add `AuthConfig` struct to `internal/config/config.go`
- [ ] 1.3 Add auth routes to `internal/server/server.go`  ← still pending
```

### Step 5: Hook Execution

If `openspec/config.yaml` defines hooks under `rules.apply`:

1. **pre_hook**: If configured, execute BEFORE starting implementation.
   - If it fails → return `status: blocked` with the hook output.
2. **post_hook**: If configured, execute AFTER completing each batch of tasks.
   - If exit code = 0 → continue to next batch.
   - If exit code ≠ 0:
     - `post_hook_on_fail: retry` → read the error output, attempt to fix the issue, re-run the hook (up to `post_hook_max_retries` times, default 3). If still failing after max retries → return `status: partial`.
     - `post_hook_on_fail: stop` → return `status: partial` with error attached.
     - `post_hook_on_fail: warn` → log warning, continue to next batch.

Hook commands are shell commands. Capture both stdout and stderr. Include the last 30 lines of output in the error context when retrying.

### Step 6: Persist Progress

**This step is MANDATORY — do NOT skip it.**

> Progress is tracked by marking tasks as `[x]` in `tasks.md` (openspec mode) or reported inline via the return envelope (none mode). There is no separate `apply-progress` artifact file.

Follow persistence rules from `skills/_shared/sdd-protocol.md` (§5).
- artifact: `apply-progress` (tracked via `[x]` marks in `tasks.md` + inline return envelope; no separate file)
- Also update the tasks artifact with `[x]` marks via file edit (openspec).

### Step 7: Return Summary

Return to the orchestrator:

```markdown
## Implementation Progress

**Change**: {change-name}
**Mode**: {Strict TDD | Standard}

### Completed Tasks
- [x] {task 1.1 description}
- [x] {task 1.2 description}

### Files Changed
| File | Action | What Was Done |
|------|--------|---------------|
| `path/to/file.ext` | Created | {brief description} |
| `path/to/other.ext` | Modified | {brief description} |

{IF Strict TDD Mode → include TDD Cycle Evidence table from strict-tdd.md}

### Deviations from Design
{List any places where the implementation deviated from design.md and why.
If none, say "None — implementation matches design."}

### Issues Found
{List any problems discovered during implementation.
If none, say "None."}

### Remaining Tasks
- [ ] {next task}
- [ ] {next task}

### Status
{N}/{total} tasks complete. {status: done | done_unverified | partial | blocked}
- `done` — post_hook passed (build/test validated)
- `done_unverified` — all tasks implemented, no post_hook configured
- `partial` — some tasks done, stopped due to hook failure or error
- `blocked` — pre_hook failed or unexpected blocker
```

## Rules

- ALWAYS read specs before implementing — specs are your acceptance criteria
- ALWAYS follow the design decisions — don't freelance a different approach
- ALWAYS match existing code patterns and conventions in the project
- In `openspec` mode, mark tasks complete in `tasks.md` AS you go, not at the end
- If you discover the design is wrong or incomplete, NOTE IT in your return summary — don't silently deviate
- If a task is blocked by something unexpected, STOP and report back
- NEVER implement tasks that weren't assigned to you
- Skill loading is handled via the protocol (§1) — follow any loaded skills strictly when writing code
- Apply any `rules.apply` from `openspec/config.yaml`
- If Strict TDD Mode is active (Step 2), load `strict-tdd.md` and follow its cycle INSTEAD of Step 3
- When Strict TDD is active, the `strict-tdd.md` module's rules OVERRIDE Step 3 entirely
- Return envelope per `skills/_shared/sdd-protocol.md` (§6).
