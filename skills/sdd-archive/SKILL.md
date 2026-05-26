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

1. Create `openspec/specs/{domain}/` directory if it doesn't exist.

2. **If target spec.md does NOT exist** (new domain) — build the promoted spec from the delta with this EXACT structure:
   ```markdown
   # {Domain} Specification

   ## Purpose
   {ONE paragraph in domain language describing what this capability covers. Synthesize from the delta's requirements — NEVER use framework/library/technology names. Minimum 50 characters or OpenSpec validator flags as WARNING.}

   ## Requirements

   {All requirements from the delta's `## ADDED Requirements` section, each as `### Requirement: ...` with its normative sentence and scenarios — but WITHOUT the `## ADDED Requirements` wrapper header. The promoted spec uses `## Requirements` as a flat container, never delta operation headers.}
   ```

3. **If target spec.md exists** (modifying existing domain) — apply the delta to it in this EXACT order:
   1. **RENAMED**: for each entry, rename the `### Requirement:` header from FROM to TO in the target spec.
   2. **REMOVED**: delete each named requirement from the target.
   3. **MODIFIED**: replace each named requirement with the delta's complete version (header MUST match existing exactly; if RENAMED was applied above, match against the NEW name).
   4. **ADDED**: append each new requirement under the target's `## Requirements` section.

   After applying, verify `## Purpose` still describes the domain accurately; refresh it if scope changed. Keep it in domain language.

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
