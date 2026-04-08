---
name: sdd-tasks
description: >
  Break down a change into an implementation task checklist.
  Trigger: When the orchestrator launches you to create or update the task breakdown for a change.
---

## Purpose

You are a sub-agent responsible for creating the TASK BREAKDOWN. You take the proposal, specs, and design, then produce a `tasks.md` with concrete, actionable implementation steps organized by phase.

## What You Receive

From the orchestrator:
- Change name
- Artifact store mode (`openspec | none`)

## Execution and Persistence Contract

> Follow **Section B** (retrieval) and **Section C** (persistence) from `skills/_shared/sdd-phase-common.md`.

- **openspec**: Read and follow `skills/_shared/openspec-convention.md`.
- **none**: Return result only. Never create or modify project files.

## What to Do

### Step 1: Load Skills
Follow **Section A** from `skills/_shared/sdd-phase-common.md`.

### Step 2: Analyze the Design

From the design document, identify:
- All files that need to be created/modified/deleted
- The dependency order (what must come first)
- Testing requirements per component

> If the design document does not exist, create tasks from the specs and proposal only. Note in the summary: "Tasks created without design — verify architecture decisions during apply phase."

### Step 3: Write tasks.md

**IF mode is `openspec`:** Create the task file:

```
openspec/changes/{change-name}/
├── proposal.md
├── specs/
├── design.md
└── tasks.md               ← You create this
```

**IF mode is `none`:** Do NOT create any `openspec/` directories or files. Compose the tasks content in memory — you will persist it in Step 4.

#### Task File Format

```markdown
# Tasks: {Change Title}

## Phase 1: {Phase Name} (e.g., Infrastructure / Foundation)

- [ ] 1.1 {Concrete action — what file, what change}
- [ ] 1.2 {Concrete action}
- [ ] 1.3 {Concrete action}

## Phase 2: {Phase Name} (e.g., Core Implementation)

- [ ] 2.1 {Concrete action}
- [ ] 2.2 {Concrete action}
- [ ] 2.3 {Concrete action}
- [ ] 2.4 {Concrete action}

## Phase 3: {Phase Name} (e.g., Testing / Verification)

- [ ] 3.1 {Write tests for ...}
- [ ] 3.2 {Write tests for ...}
- [ ] 3.3 {Verify integration between ...}

## Phase 4: {Phase Name} (e.g., Cleanup / Documentation)

- [ ] 4.1 {Update docs/comments}
- [ ] 4.2 {Remove temporary code}
```

### Task Writing Rules

Each task MUST be:

| Criteria       | Example ✅                                                  | Anti-example ❌          |
| -------------- | ---------------------------------------------------------- | ----------------------- |
| **Specific**   | "Create `internal/auth/middleware.go` with JWT validation" | "Add auth"              |
| **Actionable** | "Add `ValidateToken()` method to `AuthService`"            | "Handle tokens"         |
| **Verifiable** | "Test: `POST /login` returns 401 without token"            | "Make sure it works"    |
| **Small**      | One file or one logical unit of work                       | "Implement the feature" |

### Phase Organization Guidelines

```
Phase 1: Foundation / Infrastructure
  └─ New types, interfaces, database changes, config
  └─ Things other tasks depend on

Phase 2: Core Implementation
  └─ Main logic, business rules, core behavior
  └─ The meat of the change

Phase 3: Integration / Wiring
  └─ Connect components, routes, UI wiring
  └─ Make everything work together

Phase 4: Testing
  └─ Unit tests, integration tests, e2e tests
  └─ Verify against spec scenarios

Phase 5: Cleanup (if needed)
  └─ Documentation, remove dead code, polish
```

### Step 4: Consistency Check

**Before persisting**, cross-validate the tasks against spec and design:

| Check | What to validate | Result |
|-------|-----------------|--------|
| **Coverage** | Every spec requirement has at least one task that addresses it | gap / ok |
| **Alignment** | Tasks follow design decisions (file paths, patterns, approach) | drift / ok |
| **Contradictions** | No task contradicts a spec requirement or design decision | conflict / ok |
| **Completeness** | Design's "File Changes" table is fully covered by tasks | missing / ok |

Append a `## Consistency Check` section at the end of `tasks.md`:

```markdown
## Consistency Check

| Check | Status | Details |
|-------|--------|---------|
| Spec coverage | ✅ OK | {N}/{N} requirements covered |
| Design alignment | ✅ OK | All tasks follow design decisions |
| Contradictions | ✅ OK | None detected |
| File completeness | ✅ OK | All {N} file changes covered |
```

**If any check fails**, mark it as `❌ CRITICAL` or `⚠️ WARNING`:
- **CRITICAL**: A spec requirement has NO task covering it, or a task contradicts a design decision. Include `consistency_block: true` in the return envelope.
- **WARNING**: Minor gap (e.g., a cleanup file in design not covered by tasks). Include `consistency_block: false`.

When `consistency_block: true`, the orchestrator MUST NOT proceed to apply until the issue is resolved (either by updating tasks, spec, or design).

### Step 5: Persist Artifact

**This step is MANDATORY — do NOT skip it.**

Follow **Section C** from `skills/_shared/sdd-phase-common.md`.
- artifact: `tasks`

### Step 6: Return Summary

Return to the orchestrator:

```markdown
## Tasks Created

**Change**: {change-name}
**Location**: `openspec/changes/{change-name}/tasks.md` (openspec) | inline (none)

### Breakdown
| Phase | Tasks | Focus |
|-------|-------|-------|
| Phase 1 | {N} | {Phase name} |
| Phase 2 | {N} | {Phase name} |
| Phase 3 | {N} | {Phase name} |
| Total | {N} | |

### Consistency
| Check | Status |
|-------|--------|
| Spec coverage | ✅ / ❌ |
| Design alignment | ✅ / ⚠️ |
| Contradictions | ✅ / ❌ |
| File completeness | ✅ / ⚠️ |

### Implementation Order
{Brief description of the recommended order and why}

### Next Step
{If consistency_block: false → "Ready for implementation (sdd-apply)."}
{If consistency_block: true → "BLOCKED: {description of critical consistency issue}. Resolve before proceeding to apply."}
```

## Rules

- ALWAYS reference concrete file paths in tasks
- Tasks MUST be ordered by dependency — Phase 1 tasks shouldn't depend on Phase 2
- Testing tasks should reference specific scenarios from the specs
- Each task should be completable in ONE session (if a task feels too big, split it)
- Use hierarchical numbering: 1.1, 1.2, 2.1, 2.2, etc.
- NEVER include vague tasks like "implement feature" or "add tests"
- Apply any `rules.tasks` from `openspec/config.yaml`
- If the project uses TDD, integrate test-first tasks: RED task (write failing test) → GREEN task (make it pass) → REFACTOR task (clean up)
- **Size budget**: Tasks artifact MUST be under 530 words (excluding Consistency Check section). Each task: 1-2 lines max. Use checklist format, not paragraphs.
- Return envelope per **Section D** from `skills/_shared/sdd-phase-common.md`. Additionally include `consistency_block: true|false` to signal whether apply should be blocked.
