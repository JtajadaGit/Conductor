# SDD Protocol — Unified Reference for All Agents

> Single source of truth for all SDD agent behavior.

## Section Applicability

| Section | Planner | Coder | Reviewer |
|---------|---------|-------|----------|
| Executor Boundary | ALL | ALL | ALL |
| Artifact I/O | ALL | WRITE rules only | READ rules only |
| Return Envelope | ALL | ALL | ALL |
| Size Budgets | REQUIRED | SKIP | SKIP |
| RFC 2119 Keywords | REQUIRED | SKIP | SKIP |
| Lessons Learned | READ only | READ + WRITE | REFERENCE |
| State.yaml Update | WRITE initial | WRITE apply phase | WRITE verify phase |
| Phase Dependencies | REFERENCE | REFERENCE | REFERENCE |
| Concurrency Safety | REFERENCE | REQUIRED | REQUIRED |

> **Loading guidance**: agents SHOULD mentally skip sections marked SKIP for their role. The full protocol is loaded for portability, but irrelevant sections do not require processing.

## Executor Boundary

You are an EXECUTOR, not an orchestrator. Execute the work yourself. NEVER launch sub-agents. NEVER read files you don't need for this phase.

**ALWAYS use relative paths** for shell commands (mkdir, bash). NEVER pass absolute paths to `mkdir -p`. Example: `mkdir -p openspec/changes/foo/`, NOT `mkdir -p C:\...\openspec\changes\foo\`.

**Path normalization (Windows)**: When tool results return absolute paths with backslashes, convert to relative Unix-style paths before using in shell commands. Example: `C:\workspace\openspec\specs\` → `openspec/specs/`.

**All artifacts** (proposal.md, spec.md, design.md, tasks.md, state.yaml, verify-report.md) MUST be written inside `openspec/changes/{change-name}/`. NEVER write SDD artifacts to project root.

## Project Context

Project context (stack, architecture, formatting, testing rules) is loaded **automatically** by the platform from instruction files (`.github/instructions/` for Copilot, `.claude/rules/` for Claude Code). Agents do NOT need to read context files manually — the platform injects relevant instructions based on `applyTo` patterns.

If platform instruction files are missing (e.g., `/sdd-init` not yet run), proceed without project context. Read `openspec/config.yaml` directly for pipeline-specific config (hooks, strict_tdd, testing commands).

## Persistence

All SDD artifacts persist to `openspec/` on the filesystem. This is required for DAG recovery, phase gates, `/sdd-continue`, and compaction resilience.

### OpenSpec Structure

```
openspec/
├── config.yaml                    ← OpenSpec standard (schema, context, rules) + Conductor extensions (x-conductor)
├── (context.md removed — replaced by platform instruction files in .github/instructions/ and .claude/rules/)
├── principles.md                  ← (Conductor ext., optional) Human-authored, never AI-modified
├── lessons-learned.md             ← (Conductor ext., optional) Append-only
├── specs/{domain}/spec.md         ← Main specs (promoted by archive) — OpenSpec standard
└── changes/                       ← OpenSpec standard
    ├── archive/YYYY-MM-DD-{name}/ ← Completed changes (audit trail)
    └── {change-name}/
        ├── state.yaml             ← (Conductor ext.) Phase gates, DAG recovery
        ├── proposal.md            ← OpenSpec standard
        ├── specs/{domain}/spec.md ← Delta spec — OpenSpec standard
        ├── design.md              ← OpenSpec standard
        ├── tasks.md               ← OpenSpec standard
        ├── exploration.md         ← (Conductor ext., optional) From explore phase
        ├── questions.md           ← (Conductor ext., optional) From clarify phase
        └── verify-report.md       ← (Conductor ext.) From verify phase
```

## Artifact I/O

- **Read**: direct filesystem access at `openspec/changes/{change-name}/{artifact}.md`
- **Write**: create directory if not exists. READ before UPDATE (don't overwrite blindly).
- **Missing required artifact** → return `status: blocked` with `risks: 'Missing prerequisite: {artifact}'`
- **Missing optional artifact** → log warning, continue with empty defaults
- **Malformed required file** → return `status: blocked` with parse error details
- **Delta specs**: ADDED/MODIFIED/REMOVED sections (OpenSpec standard). Apply order: REMOVED → MODIFIED → ADDED. Optional Conductor extension: RENAMED section (applied first, before REMOVED).
- **Full specs**: when domain is new (no existing main spec)
- **Post-apply deviation**: If apply agent deviates from design.md, it MUST append a `## Deviations` section documenting: what changed, why, and the accepted alternative.

## Return Envelope

Every phase MUST return:

- `status`: `success` | `partial` | `blocked`
- `executive_summary`: 1-3 sentences
- `artifacts`: list of paths written
- `next_recommended`: next SDD phase or "none"
- `risks`: discovered risks or "None"
- `requires_human_input`: `true` → orchestrator PAUSES
- `skill_resolution`: OPTIONAL. Values: `auto` (platform instruction files loaded) | `none` (no instruction files found). Informational only — platform handles context loading automatically.

## Phase Dependencies (DAG)

```
explore? → propose → clarify? → spec → design → tasks → apply ⟲ fix → verify → archive?
```

| Phase | Required prerequisites (MUST be `done`/`skipped`) |
|-------|---------------------------------------------------|
| explore | (none) |
| propose | explore (if not skipped) |
| clarify | propose |
| spec | propose, clarify (if not skipped) |
| design | spec |
| tasks | spec, design |
| apply | tasks |
| verify | apply (MUST be `done`, not `in_progress`) |
| archive | verify (MUST be `pass`) |

**Enforcement**: Before starting ANY phase, verify prerequisites from this table. If any prerequisite is `pending` or `in_progress` → return `status: blocked, risks: 'Prerequisite {phase} not complete'`.

## Concurrency Safety

**Protected files** — serialized access only:
- `openspec/changes/{change-name}/state.yaml` — only ONE agent writes at a time
- `openspec/changes/{change-name}/tasks.md` — only the reconciliation sdd-coder marks [x]
- `openspec/config.yaml` — global, NOT modifiable during apply
- `openspec/lessons-learned.md` — serialize appends (one agent at a time)

**Parallel [P] tasks** — safe with worktree isolation:
- `[P]` markers indicate tasks with NO data dependency between them.
- When ≥4 `[P]` tasks exist with disjoint file sets → orchestrator MAY dispatch parallel coders, each in its own worktree.
- **Parallel coders** receive `PARALLEL_MODE: true` + `TASK_SUBSET: [ids]`. They write ONLY code files. They do NOT update tasks.md or state.yaml.
- After all parallel coders complete, the orchestrator launches ONE sequential sdd-coder for `[S]` tasks. This sdd-coder also reconciles tasks.md (marks all completed tasks `[x]`) and updates state.yaml (`apply: done`).
- If <4 `[P]` tasks or files overlap → single sdd-coder handles everything (standard mode).

**Phase sequencing**: apply → verify → archive MUST be strictly sequential. NEVER overlap phases that write to state.yaml.

## Error Recovery

| Condition | Recovery path |
|-----------|---------------|
| `apply: partial` | Read `last_completed_task` from state.yaml. Re-launch sdd-coder — it skips tasks marked `[x]`, resumes from first unchecked. Orchestrator MUST pause and ask user: (A) retry remaining, (B) abort. Do NOT auto-retry. |
| `verify: fail` | Display verify-report.md to user. Options: (A) fix code and re-run apply (reset `apply: pending`), (B) review spec/design and re-plan, (C) abort. |
| Fix cycle exhausted | After `post_hook_max_retries` exceeded → `status: partial`. After 5 fix iterations → hard stop. Orchestrator MUST pause. Do NOT auto-retry apply. |
| `in_progress` phase (agent crash) | Orchestrator asks user: (A) retry (re-launch agent for same phase), (B) abort. If retry, agent reads state.yaml and resumes. |

## Size Budgets

| Artifact | Max words | Notes |
|----------|-----------|-------|
| exploration | 400 | Approaches table + brief analysis |
| proposal | 400 | Bullet points and tables > prose |
| questions | 300 | 3-5 lines per question max |
| specs | 650 **per domain** | Requirement tables over narrative |
| design | 800 | Decision tables, ASCII diagrams |
| tasks | 530 | Excl. Consistency Check section |
| verify-report | 1500 words | Compress if >1500w; use tables for spec compliance matrix |

Note: spec budget is **per domain**, not total. A change touching 3 domains = up to 1950w of specs.

**Enforcement**: agents MUST self-check word count before writing artifacts. If an artifact exceeds its budget, compress: prefer tables over prose, remove redundant descriptions, delegate detail to downstream phases. Downstream agents SHOULD flag upstream artifacts that exceed budget in their return envelope (`risks` field).

**Instruction files cap**: each instruction file SHOULD NOT exceed 200 words. Keep them concise — the platform loads ALL matching files for every interaction. Config files are the source of truth; instruction files are summaries.

Headers organize, not explain. Prefer tables and bullets over prose.

## Spec Format (OpenSpec standard)

```markdown
# {domain} Specification
## Purpose
## Requirements
### Requirement: {Name}
{Description using MUST/SHALL/SHOULD/MAY per RFC 2119}
#### Scenario: {Name}
- **GIVEN** {precondition} (optional)
- **WHEN** {action}
- **THEN** {outcome}
- **AND** {additional outcome}
```

Delta specs add section headers: `## ADDED Requirements`, `## MODIFIED Requirements`, `## REMOVED Requirements`.

## RFC 2119 Keywords

- MUST/SHALL — mandatory
- SHOULD — recommended
- MAY — optional
- Scenarios: GIVEN/WHEN/THEN/AND

## Lessons Learned

If `openspec/lessons-learned.md` exists:
- sdd-coder MUST read it BEFORE implementing (avoid known errors)
- sdd-coder MUST append after each successful fix
- sdd-coder SHOULD append after discovering ecosystem gotchas during apply (not just fixes)
- sdd-planner SHOULD read it to inform design decisions
- sdd-reviewer MUST reference lessons-learned.md in verify-report if new entries were added during apply

Format (MUST follow this structure):
```markdown
# Lessons Learned
## YYYY-MM-DD: {change-name}
### Ecosystem Gotchas
- {lib} {version}: {problem} → {solution}
### Design Insights
- {actionable insight}
```

- Heading MUST use format `## YYYY-MM-DD: {change-name}` (not a description)
- Entries older than 6 months SHOULD be reviewed for staleness during `/sdd-init` re-init

## Context Updates

After a successful verify phase, the sdd-reviewer SHOULD include a `## Suggested Instruction Updates` section in verify-report.md when:
- New "Known Fragile Areas" were discovered during apply/verify
- Ecosystem constraints affect future changes
- Architecture changed significantly

The orchestrator MAY apply these suggestions to the relevant platform instruction files after archive.

## state.yaml Schema

```yaml
change: {change-name}
created: {ISO-8601}
updated: {ISO-8601}
current_phase: {phase-name}
phases:
  explore: pending | done | skipped
  propose: pending | done
  clarify: pending | done | skipped
  spec: pending | in_progress | done
  design: pending | in_progress | done
  tasks: pending | done
  apply: pending | in_progress | done
  verify: pending | pass | fail
  archive: pending | done
last_completed_task: ""  # Task ID for apply recovery
locks:
  spec: false
  design: false
```

### state.yaml Update Rules

ALL fields above are REQUIRED. Agents creating state.yaml MUST include every field.

| When | Who updates | What |
|------|-------------|------|
| Planning complete | sdd-planner | All planning phases = `done`, `apply: pending`, locks set |
| Apply complete | sdd-coder | `apply: done`, `current_phase: verify`, `updated: {now}` |
| Apply partial | sdd-coder | `apply: in_progress`, `last_completed_task: {id}`, `updated: {now}` |
| Verify complete | sdd-reviewer | `verify: pass` or `fail`, `updated: {now}` |
| Archive complete | orchestrator | `archive: done` |

**In Auto mode**: each agent MUST update state.yaml for its own phase. These updates are phase gates for `/sdd-continue` and DAG recovery.

**Atomic writes**: When updating state.yaml, modify ONLY your phase's fields. Read → modify target fields only → write. Do NOT reconstruct the entire file from memory.

## Config Reference

```yaml
# openspec/config.yaml
schema: spec-driven

# --- OpenSpec standard fields ---
context: "Framework, Language strict, package_manager"  # 1-line summary injected into ALL artifact prompts
rules:                        # Per-artifact constraints (injected only for matching artifact)
  proposal: []
  specs: []
  design: []
  tasks: []

# --- Conductor extensions (x-conductor namespace) ---
x-conductor:
  stack:
    language: ""        # e.g., "typescript", "python", "go"
    runtime: ""         # e.g., "node", "bun", "deno"
    version: ""         # e.g., "20.x", "3.12"
    framework: ""       # e.g., "angular", "express", "django"
    package_manager: "" # e.g., "npm", "pnpm", "yarn"
  monorepo: false       # true if workspace/monorepo detected
  strict_tdd: false
  testing:
    test_runner: { command: "", framework: "" }
    layers: { unit: false, integration: false, e2e: false }
    coverage: { available: false, command: "" }
    quality: { linter: "", type_checker: "", formatter: "" }
  hooks:
    apply:
      pre_hook: ""
      post_hook: ""
      post_hook_on_fail: retry    # retry | stop | warn
      post_hook_max_retries: 3
      checkpoint_every: 5         # run post_hook every N tasks
    verify:
      test_command: ""
      build_command: ""
      coverage_threshold: 0
```

> **OpenSpec vs Conductor**: `schema`, `context`, `rules` are OpenSpec standard fields. Everything under `x-conductor` is a Conductor extension. `context.md` (separate file) is also a Conductor extension con contenido exclusivo (arquitectura, dirs, entry points, team standards). Única duplicación permitida: `## Stack` (1 línea, ~18 tokens) para que context.md sea autosuficiente. NO duplica testing commands ni hooks de config.yaml. OpenSpec uses only the `context:` field (1-line summary) for prompt injection.
