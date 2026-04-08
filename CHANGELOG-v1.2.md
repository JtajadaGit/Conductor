# Changelog — Conductor v1.2

> Based on real-world feedback from a full SDD session (Storybook web deploy, ~8 user requests, ~10 sub-agents).
> See `SDD-FRAMEWORK-FEEDBACK.md` for the complete analysis.

## Breaking Changes

- **Default persistence mode changed to `openspec`** (was `none`). Users who want ephemeral mode must now explicitly request `none`. This eliminates the double-init pattern where users defaulted to `none` then immediately re-ran with `openspec`.

- **Dependency graph changed**: `spec` now runs BEFORE `design` by default (spec-driven ordering). In `sdd-ff`, they MAY still run in parallel, but sequential is the recommended default.

## New Features

### sdd-fix skill (T2-I)
New skill for structured debug post-apply. Iterates: error→diagnose→fix→rebuild (up to 5 times). Reads and appends to `lessons-learned.md`.

### Apply hooks: pre_hook and post_hook (T1-D)
`sdd-apply` now supports hooks in `openspec/config.yaml`:
```yaml
rules:
  apply:
    pre_hook: "node -e \"console.log(Object.keys(require('my-lib')))\""
    post_hook: "npm run build 2>&1 | tail -30"
    post_hook_on_fail: retry  # retry | stop | warn
    post_hook_max_retries: 3
```
- `pre_hook` validates preconditions before implementation starts
- `post_hook` validates build after each batch of tasks
- On failure with `retry`: sub-agent reads error, attempts fix, re-runs (up to max_retries)

### Verify fast-path (T2-H)
`sdd-verify` now checks for test/build infrastructure at Step 0. If neither exists, enters fast path: only completeness check, static spec match, and design coherence. Skips test execution, coverage, and behavioral validation.

### sdd-status meta-command
New inline command (no sub-agent) — reads `state.yaml` and shows progress.

### Conditional explore in sdd-new (T1-E)
`sdd-new` now evaluates user input:
- If user provided scope + approach + constraints → **skip explore**, run propose → clarify
- If user provided only a name or vague idea → run explore → propose → clarify

### lessons-learned.md (T2-J)
New optional file at `openspec/lessons-learned.md`. `sdd-fix` appends ecosystem insights. Future sessions can read it to avoid repeating the same mistakes.

## Improvements

### Graduated Hard Stop Rule (T1-F)
Added **Inline Fix Exception**: orchestrator MAY perform fixes directly when:
- Fix is ≤5 lines in ≤2 files
- Orchestrator has full error context
- It's an iterative debug cycle (error→fix→rebuild)
- Delegating would cost >5x more tokens

### Reduced orchestrator instructions (T0-A)
`copilot-instructions.md`: 230→146 lines. `CLAUDE.md`: 222→144 lines.
Detailed protocol moved to `skills/_shared/orchestrator-reference.md` (loaded on demand).

### Unified shared protocol (T0-B)
3 shared files (`sdd-phase-common.md` + `persistence-contract.md` + `openspec-convention.md`) consolidated into 1 file: `skills/_shared/sdd-protocol.md` (170 lines). Sub-agents now make 1 file read instead of 3.
Legacy files preserved for backward compatibility but protocol references updated.

### Compacted all SKILL.md files (T2-K)
Removed repeated boilerplate ("What You Receive", "Execution and Persistence Contract", "Step 1: Load Skills", persistence steps) from all 9 phase skills. Replaced with compact protocol reference. Reductions:
- sdd-explore: 122→94 lines
- sdd-propose: 140→118 lines
- sdd-clarify: 124→104 lines
- sdd-spec: 169→148 lines
- sdd-design: 160→145 lines
- sdd-tasks: 200→146 lines
- sdd-init: 237→126 lines
- sdd-apply: 152→157 lines (grew due to hooks addition)
- sdd-verify: 283→276 lines (grew due to fast-path addition)
- sdd-archive: 139→122 lines

### Separated skill registry from sdd-init (T1-G)
`sdd-init` reduced from 9 steps to 4. Skill registry construction is no longer duplicated inside init — orchestrator calls `skill-registry` as a separate step after init.

### Synced CLAUDE.md (T2-L)
Applied all changes to both orchestrator instruction files.

## Documentation

### New guides
- `docs/14-troubleshooting.md` — Common issues and resolutions
- `docs/15-monorepos.md` — Working with monorepos
- `docs/16-sin-git.md` — Projects without Git
- `docs/17-cuando-romper-reglas.md` — When to break the rules

### Updated docs
- `docs/08-plataformas-compatibles.md` — Added real agent type→model mapping for Copilot, noted Opus limitation, updated _shared/ structure, fixed openspec default.

## Summary

| Metric | Before (v1.1) | After (v1.2) |
|--------|---------------|--------------|
| copilot-instructions.md | 230 lines | 146 lines |
| CLAUDE.md | 222 lines | 144 lines |
| _shared/ files to read | 3 (+ resolver) | 1 protocol + resolver |
| Default persistence | `none` | `openspec` |
| SKILL.md total lines | ~1,725 | ~1,436 |
| Explore always required | Yes | Conditional |
| Post-apply debug | Manual/ad-hoc | Hooks + sdd-fix |
| Verify without tests | Full 283-line flow | Fast-path (~80 lines) |
| Documentation guides | 13 | 17 |
