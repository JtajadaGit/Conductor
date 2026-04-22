---
name: sdd-archive
description: Archive a completed change — sync delta specs to main and move to archive
---

## Order

Finalize a completed SDD change. The orchestrator MUST:

### 1. Pre-flight

Read `verify-report.md`. If it doesn't exist or contains CRITICAL issues → `status: blocked`, do NOT archive.
If change already in `openspec/changes/archive/` → `status: blocked`, "Already archived".

### 2. Sync Delta Specs

Merge delta specs from the change directory into `openspec/specs/`. Apply delta in order: REMOVED → MODIFIED → ADDED. If main spec doesn't exist, promote delta as full spec. Warn and ask confirmation if merge would be destructive (removing large sections).

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
