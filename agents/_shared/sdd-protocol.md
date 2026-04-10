# SDD Protocol — Unified Reference for All Agents

> Single source of truth for all SDD agent behavior. Replaces sdd-protocol.md + persistence-contract.md + openspec-convention.md + sdd-phase-common.md.

## Executor Boundary

You are an EXECUTOR, not an orchestrator. Execute the work yourself. NEVER launch sub-agents. NEVER read files you don't need for this phase.

**ALWAYS use relative paths** for shell commands (mkdir, bash). NEVER pass absolute paths to `mkdir -p`. Example: `mkdir -p openspec/changes/foo/`, NOT `mkdir -p C:\...\openspec\changes\foo\`.

**All artifacts** (proposal.md, spec.md, design.md, tasks.md, state.yaml, verify-report.md) MUST be written inside `openspec/changes/{change-name}/`. NEVER write SDD artifacts to project root.

## Skill Loading

1. Check if `## Project Standards (auto-resolved)` was injected in your prompt → use it. Do NOT read SKILL.md files.
2. Fallback: read `openspec/conventions.md` → apply compact rules matching file patterns (code context) and action type (task context).
3. Fallback: proceed without project standards.

Token budget: ~50-150 tokens per skill block. Max 5 blocks per delegation — prioritize code context matches.

## Persistence

| Mode | Read from | Write to | Project files |
|------|-----------|----------|---------------|
| `openspec` (default) | Filesystem | Filesystem | Yes |
| `none` | Orchestrator prompt | Nowhere | Never |

### OpenSpec Structure (core)

```
openspec/
├── config.yaml                    ← OpenSpec standard
├── context.md                     ← Repo context (Conductor, canonical)
├── conventions.md                 ← Skills + rules (Conductor, canonical)
├── specs/{domain}/spec.md         ← OpenSpec standard
└── changes/
    ├── archive/YYYY-MM-DD-{name}/ ← OpenSpec standard
    └── {change-name}/
        ├── proposal.md            ← OpenSpec standard
        ├── specs/{domain}/spec.md ← OpenSpec standard (delta)
        ├── design.md              ← OpenSpec standard
        └── tasks.md               ← OpenSpec standard
```

### Conductor Extensions (not part of OpenSpec)

```
openspec/
├── principles.md          (optional, human-authored, never AI-modified)
├── lessons-learned.md     (optional, append-only)
└── changes/{change-name}/
    ├── state.yaml         ← phase gates, DAG recovery
    ├── exploration.md     ← optional, from explore phase
    ├── questions.md       ← optional, from clarify phase
    ├── verify-report.md   ← from verify phase
    └── execution-log.md   ← chronological phase log
```

## Artifact I/O

- **Read**: direct filesystem access at `openspec/changes/{change-name}/{artifact}.md`
- **Write**: create directory if not exists. READ before UPDATE (don't overwrite blindly).
- **Delta specs**: ADDED/MODIFIED/REMOVED/RENAMED sections (when main spec exists). Apply order: RENAMED → REMOVED → MODIFIED → ADDED
- **Full specs**: when domain is new (no existing main spec)
- **Missing required artifact** → return `status: blocked` with `risks: 'Missing prerequisite: {artifact}'`
- **Post-apply deviation**: If apply agent deviates from design.md (e.g., different API due to ecosystem constraint), it MUST append a `## Deviations` section to design.md documenting: what changed, why, and the accepted alternative. This keeps design.md as accurate source of truth.

## Return Envelope

Every phase MUST return:

- `status`: `success` | `partial` | `blocked`
- `executive_summary`: 1-3 sentences
- `artifacts`: list of paths written
- `next_recommended`: next SDD phase or "none"
- `risks`: discovered risks or "None"
- `requires_human_input`: `true` → orchestrator PAUSES
- `skill_resolution`: `injected` | `fallback-registry` | `fallback-path` | `none`

## Size Budgets

| Artifact | Max words | Notes |
|----------|-----------|-------|
| exploration | 400 | Approaches table + brief analysis |
| proposal | 400 | Bullet points and tables > prose |
| questions | 300 | 3-5 lines per question max |
| specs | 650 **per domain** | Requirement tables over narrative |
| design | 800 | Decision tables, ASCII diagrams |
| tasks | 530 | Excl. Consistency Check section |
| verify-report | unlimited | Full report |

Note: spec budget is **per domain**, not total. A change touching 3 domains = up to 1950w of specs.

Headers organize, not explain. Prefer tables and bullets over prose.

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
- Subsections (`### Ecosystem Gotchas`, `### Design Insights`) are REQUIRED structure
- Entries older than 6 months SHOULD be reviewed for staleness during `/sdd-init` re-init

## Context Updates

After a successful verify phase, the reviewer SHOULD include a `## Suggested context.md Updates` section in verify-report.md when:
- New "Known Fragile Areas" were discovered during apply/verify
- Ecosystem constraints affect future changes (e.g., Zone.js fakeAsync limitations)
- Architecture changed significantly (new components, changed entry points)

The orchestrator MAY apply these suggestions to `openspec/context.md` after archive.

## state.yaml Schema

```yaml
change: {change-name}
created: {ISO-8601}
updated: {ISO-8601}
mode: openspec
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
current_phase: {phase-name}
locks:
  spec: false
  design: false
```

### state.yaml Update Rules

ALL fields above are REQUIRED. Agents creating state.yaml MUST include every field.

| When | Who updates | What |
|------|-------------|------|
| Planning complete (fast-forward or tasks done) | sdd-planner | All planning phases = `done`, `apply: pending`, locks set |
| Apply complete | sdd-coder | `apply: done`, `current_phase: verify` |
| Verify complete | sdd-reviewer | `verify: pass` or `fail`, `updated: {now}` |
| Archive complete | orchestrator | `archive: done` |

**In Auto mode**: planning agent writes initial state; apply and verify agents MUST still update their own phase. These updates are NOT optional bookkeeping — they are phase gates for `/sdd-continue` and DAG recovery.

## Config Reference

```yaml
# openspec/config.yaml — OpenSpec-compliant fields
schema: spec-driven
context: |
  Tech stack: {detected}
  Architecture: {detected}
  Testing: {detected}

# Conductor extensions (x-conductor namespace)
x-conductor:
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
