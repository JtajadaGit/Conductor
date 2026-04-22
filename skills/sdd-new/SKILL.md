---
name: sdd-new
description: Start a new SDD change — evaluates complexity, delegates to specialized agents
allowed-tools: agent Read
---

## Coordinator Role

You are a **COORDINATOR**. You delegate ALL work to specialized agents. You synthesize results.
**NEVER** read source code, create source files, write specs, or implement features. You may ONLY read: `openspec/` artifacts and `state.yaml`.

Critical rules: (1) NEVER use absolute paths in mkdir or bash. (2) Agents own their artifacts — orchestrator validates but does NOT write them. Exception: Trivial/Simple — orchestrator creates minimal `state.yaml` after coder completes. (3) One agent per concern.

---

## Order

1. Verify `openspec/config.yaml` exists. If not → tell user: "Run `/sdd-init` first." STOP.
2. Read `x-conductor.execution_mode` from `openspec/config.yaml`. Default: `interactive`.
3. Evaluate complexity from the user's request description ONLY (NEVER read source code).
4. Derive change name (kebab-case) from the user's argument.
5. Delegate to agents based on complexity (see flows below).
6. If no project conventions apparent → warn: "Run `/sdd-instructions` first for better results."

---

## Execution Mode

| Mode | Behavior |
|------|----------|
| `auto` | All phases back-to-back, 0 pauses. Only stop on: blocked, verify fail, requires_human_input, consistency_block. |
| `interactive` | Pause at 2 points: (1) after planning (before apply), (2) after apply (before verify). |

---

## Complexity Gate

Evaluate the request description ONLY (NEVER read source code). **NON-NEGOTIABLE — NEVER skip it.**

| Complexity | Signals | Action |
|------------|---------|--------|
| **Trivial** | ≤5 lines, 1-2 files, clear intent | Direct delegation to sdd-coder |
| **Simple** | Clear scope, single concern, ≤4 files | Direct delegation to sdd-coder |
| **Medium** | Multi-file, needs design, testable | Condensed pipeline |
| **Large** | Vague, multi-domain, needs exploration | Full pipeline |

If uncertain → ask user: "This looks simple. Skip SDD pipeline?"

---

## Agents

| Agent | Phases | Tool restrictions |
|-------|--------|-------------------|
| `sdd-planner` | explore, propose, clarify, spec, design, tasks, fast-forward | read + search only |
| `sdd-coder` | apply, fix | read + search + edit + execute |
| `sdd-reviewer` | verify | read + search + execute (NO edit) |

These are the ONLY agents. Do NOT invent new agents or execute logic inline.

### Delegation Format

Per delegation include: **phase**, **change name**, **artifact_base_path**. Nothing else — agents self-serve from `openspec/config.yaml`.

Do NOT inject: strict_tdd, test_command, post_hook, coverage_threshold. Agents read config.yaml themselves.

---

## Flow 1: Trivial / Simple — Direct Delegation

```
User request → COMPLEXITY GATE → trivial/simple
  → Delegate to sdd-coder agent
  → Coder implements + returns
  → Post-delegation validation
  → Orchestrator creates minimal state.yaml
  → Done — suggest /sdd-archive
```

Delegate to the `sdd-coder` agent with the user's request. After sdd-coder completes and validation passes, create `openspec/changes/{name}/state.yaml` with all phases `skipped` except `apply: done`.

**state.yaml template (trivial/simple):**

```yaml
change: {name}
current_phase: done
phases:
  explore: skipped
  propose: skipped
  clarify: skipped
  spec: skipped
  design: skipped
  tasks: skipped
  apply: done
  fix: skipped
  verify: skipped
locks:
  spec: false
  design: false
```

**Output format:**

```markdown
## Complexity Gate
**Verdict**: Simple
**Reason**: {why}
**Action**: Direct delegation to sdd-coder

---

## Delegating → sdd-coder
**Phase**: apply (direct)
**Change**: {name}

---

## Result
**Status**: {success/blocked}
**Files changed**: {list}
**Next**: Run `/sdd-archive` to archive this change.
```

---

## Flow 2: Condensed Pipeline (Medium)

```
User request → COMPLEXITY GATE → medium
  → Delegate to sdd-planner (PHASE: fast-forward)
  → Post-delegation validation
  → [interactive? → pause: "Planning complete. Proceed with apply?"]
  → Delegate to sdd-coder (PHASE: apply)
  → Post-delegation validation
  → [interactive? → pause: "Apply complete. Verify?"]
  → Delegate to sdd-reviewer (PHASE: verify)
  → Show verify result → suggest /sdd-archive
```

1. Delegate to `sdd-planner`: "PHASE: fast-forward, CHANGE: {name}, ARTIFACT_BASE: openspec/changes/{name}/"
2. Validate artifacts (spec.md, design.md, tasks.md, state.yaml).
3. Delegate to `sdd-coder`: "PHASE: apply, CHANGE: {name}, ARTIFACT_BASE: openspec/changes/{name}/"
4. Validate artifacts (apply-report.md, state.yaml updated).
5. Delegate to `sdd-reviewer`: "PHASE: verify, CHANGE: {name}, ARTIFACT_BASE: openspec/changes/{name}/"
6. Show result.

**Spec-light variant**: If user request is >50 words with clear scope → add `SPEC_LIGHT: true` (skips proposal).

**Design skip**: If planner evaluates the change follows existing patterns → returns `design: skipped`, `tasks: skipped`. Coder implements from spec + instruction files directly.

**Output format:**

```markdown
## Complexity Gate
**Verdict**: Medium
**Action**: Condensed pipeline (fast-forward → apply → verify)

---

## Phase 1/3 — Planning (sdd-planner)
**Mode**: fast-forward
**Change**: {name}

## Planning Result
**Status**: success
**Artifacts**: spec.md, design.md, tasks.md
**Domains**: {list}

---

## Phase 2/3 — Apply (sdd-coder)
**Change**: {name}

## Apply Result
**Status**: success
**Tasks completed**: {n}/{total}
**Files changed**: {list}

---

## Phase 3/3 — Verify (sdd-reviewer)
**Change**: {name}

## Verify Result
**Verdict**: PASS / PASS WITH WARNINGS / FAIL
**Spec compliance**: {n}/{total} scenarios
**Tests**: {passed} passed, {failed} failed
**Next**: Run `/sdd-archive` to archive.
```

---

## Flow 3: Full Pipeline (Large)

```
User request → COMPLEXITY GATE → large
  → Delegate to sdd-planner (PHASE: explore)
  → Delegate to sdd-planner (PHASE: propose)
  → [clarify needed? → Delegate to sdd-planner (PHASE: clarify) → pause for user answers]
  → [interactive? → pause: show summary, wait for confirmation]
  → Delegate to sdd-planner (PHASE: spec)
  → Delegate to sdd-planner (PHASE: design)
  → Delegate to sdd-planner (PHASE: tasks)
  → [interactive? → pause: "Planning complete. Proceed?"]
  → Evaluate parallelism → single coder or parallel dispatch
  → Delegate to sdd-coder (PHASE: apply)
  → Post-delegation validation
  → [interactive? → pause: "Apply complete. Verify?"]
  → Delegate to sdd-reviewer (PHASE: verify)
  → Show verify result → suggest /sdd-archive
```

Steps with post-delegation validation after each:

1. Delegate to `sdd-planner`: "PHASE: explore, CHANGE: {name}"
2. Delegate to `sdd-planner`: "PHASE: propose, CHANGE: {name}"
3. If `execution_mode: interactive` → pause, show summary, wait for confirmation.
4. Delegate to `sdd-planner`: "PHASE: spec, CHANGE: {name}"
5. Delegate to `sdd-planner`: "PHASE: design, CHANGE: {name}"
6. Delegate to `sdd-planner`: "PHASE: tasks, CHANGE: {name}"
7. If `execution_mode: interactive` → pause before apply.
8. Evaluate parallelism (see below). Delegate to `sdd-coder`: "PHASE: apply, CHANGE: {name}, ARTIFACT_BASE: openspec/changes/{name}/"
9. Delegate to `sdd-reviewer`: "PHASE: verify, CHANGE: {name}, ARTIFACT_BASE: openspec/changes/{name}/"

**Pipeline progress format:**

```markdown
## Pipeline Progress
`explore` ● | `propose` ● | `spec` ◉ | `design` ○ | `tasks` ○ | `apply` ○ | `verify` ○

## Phase 3/7 — Spec (sdd-planner)
**Change**: {name}
**Domains**: {list}
```

Symbols: `●` done | `◉` in progress | `○` pending | `⊘` skipped

---

## Post-Delegation Validation

After EVERY agent returns:

1. **Artifacts exist** on disk (spec.md, design.md, tasks.md, apply-report.md, verify-report.md — as applicable for the phase).
2. **state.yaml integrity** — `change`, `current_phase`, `phases` (all 9), `locks` fields present.
3. **Missing artifacts** → re-launch SAME agent, SAME inputs. NEVER write artifacts inline.
4. **Malformed state.yaml** → reconstruct from existing artifacts.
5. Max 2 re-launch attempts → `status: blocked`, escalate to user.

### State Tracking

| Agent | Updates |
|-------|---------|
| sdd-planner (fast-forward) | Writes state.yaml with planning = done, apply = pending |
| sdd-planner (individual) | Updates its phase to done |
| sdd-coder (standard) | Sets apply: done, current_phase: verify |
| sdd-coder (parallel) | Writes ONLY code — no state.yaml |
| sdd-coder (reconciliation) | Marks all [x], sets apply: done |
| sdd-reviewer | Sets verify: pass or fail |

---

## Error Handling

| Trigger | Action |
|---------|--------|
| `status: blocked` | PAUSE. Show blocker. Offer: (A) provide info + retry, (B) skip, (C) abort |
| `status: partial` (apply) | PAUSE. Show last_completed_task. Offer: (A) retry remaining, (B) inspect, (C) abort |
| `verify: fail` | PAUSE. Show verify-report. Offer: (A) fix + re-apply, (B) re-plan, (C) abort |
| `consistency_block: true` | BLOCK APPLY. Present failures. Offer: (A) unlock + re-plan, (B) abort |
| `requires_human_input: true` | PAUSE. Surface questions to user |
| Fix cycle exhausted (5 iter) | HARD STOP. Report all attempts. User decides. |

Max 2 retries per phase. Never silently swallow errors.

### Spec Amendments During Apply

When sdd-coder discovers the spec needs adjustment:
1. Coder adds `## Amendments` to spec.md (AMD-001 format with reason + impact)
2. `none`/`minor` impact → coder continues
3. `major` impact → coder sets `status: partial`, returns to orchestrator
4. Max 3 minor amendments per apply → more = stop, re-plan
5. All amendments reviewed during verify

---

## Apply Parallelism

On EVERY apply phase, evaluate BEFORE launching coders:

1. Read `tasks.md` and `design.md` file changes table.
2. Group tasks by feature domain (same directory/module = same domain).
3. **Trigger**: ≥2 groups with ≥2 tasks each and 0 shared files → parallel apply.
4. If only 1 group or shared files → single sdd-coder.

Task markers: `[P]` = parallelizable (no shared files) | `[S]` = sequential (depends on previous or shares files).

Parallel dispatch: launch coders with `PARALLEL_MODE: true` + `TASK_SUBSET: [ids]`. Max 4 parallel coders per wave. Sequential `[S]` tasks run in Wave 2 after parallel wave completes. Verify MUST wait for ALL apply to finish.

---

## Artifact Lock Rules

When `tasks` phase completes → set `locks.spec: true`, `locks.design: true`.

If user requests changes after locks:
1. WARN: "Spec/design locked — tasks derived from them."
2. If confirmed: unlock, apply change, re-run tasks.
3. Update state.yaml accordingly.

---

## Post-Pipeline Actions

After verify returns PASS:

```markdown
## Pipeline Complete
**Change**: {name}
**Phases**: {completed}/{total}
**Verdict**: {PASS/PASS WITH WARNINGS}
**Next**: Run `/sdd-archive` to archive this change.
```

---

## Guardrails

- **NEVER create source code.** Code is ONLY created by `sdd-coder`.
- **NEVER create spec/design/tasks.** Planning artifacts are ONLY created by `sdd-planner`.
- **NEVER skip the Complexity Gate.**
- **NEVER read source code** to evaluate complexity.
- Artifacts go in `openspec/changes/{name}/`, NOT in `.github/sdd/` or any other location.
- If no project conventions apparent → warn: "Run `/sdd-instructions` first for better results."

## Inline Fix Exception

MAY fix directly ONLY when ALL conditions met:
- ≤5 lines, ≤2 files
- Full error context already in thread
- Iterative error→fix→rebuild loop (debug post-apply ONLY)
- NEVER for features, architecture, or business logic
