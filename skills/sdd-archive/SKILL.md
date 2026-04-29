---
name: sdd-archive
description: >
  Archive a completed change — sync delta specs to main and move to archive.
  Use after a change completes with PASS verdict.
user-invocable: true
disable-model-invocation: true
---

## Order

Finalize a completed SDD change. The orchestrator MUST:

### 1. Pre-flight

Read `verify-report.md`. If it doesn't exist or contains CRITICAL issues → `status: blocked`, do NOT archive.
If change already in `openspec/changes/archive/` → `status: blocked`, "Already archived".

### 2. Sync Delta Specs

Merge delta specs from the change into `openspec/specs/`. The EXACT structure is:

- **Source**: `openspec/changes/{change-name}/specs/{domain}/spec.md`
- **Target**: `openspec/specs/{domain}/spec.md`

For each domain found in the change's `specs/` subdirectory:
1. Create `openspec/specs/{domain}/` directory if it doesn't exist
2. If target spec.md doesn't exist → copy delta as full spec
3. If target exists → apply delta in order: REMOVED → MODIFIED → ADDED

NEVER promote specs as flat files (e.g., `openspec/specs/my-feature.md`). ALWAYS use domain subdirectories (`openspec/specs/{domain}/spec.md`).

Warn and ask confirmation if merge would be destructive (removing large sections).

### 3. Apply Suggested Instruction Updates

If `verify-report.md` contains a `## Suggested Instruction Updates` section, apply those updates to the relevant platform instruction files.

### 4. Update state.yaml

Set `archive: done`, `current_phase: archive`, `updated: {ISO-8601 now}`.

### 5. Move to Archive

Move `openspec/changes/{change-name}/` → `openspec/changes/archive/YYYY-MM-DD-{change-name}/`.

### 6. Output

Report: specs synced, archive contents, source of truth updated.

## Rules

- NEVER archive with CRITICAL issues in verify report.
- ALWAYS sync delta specs BEFORE moving to archive.
- Archive is AUDIT TRAIL — never delete or modify archived changes.
- Use ISO date format (YYYY-MM-DD).
- After archive, `openspec/specs/` contains the promoted main specs — source of truth for future changes.
