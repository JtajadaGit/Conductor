---
name: sdd-archive
description: Archive a completed change — sync delta specs to main and move to archive
user-invocable: true
disable-model-invocation: true
argument-hint: "[change-name]"
---

## Steps

### 1. Pre-flight
Read `verify-report.md`. If it doesn't exist or contains CRITICAL issues → `status: blocked`, do NOT archive.
If change already in `openspec/changes/archive/` → `status: blocked`, "Already archived".

### 2. Sync Delta Specs
For each delta spec in `openspec/changes/{change-name}/specs/`:
- **Main spec exists**: apply delta in order: RENAMED → REMOVED → MODIFIED → ADDED. Preserve all requirements NOT in delta.
- **Main spec doesn't exist**: copy delta as full spec to `openspec/specs/{domain}/spec.md`
- If merge would be destructive (removing large sections) → WARN and ask confirmation.

### 3. Update context.md (if verify-report suggested updates)
If `verify-report.md` contains a `## Suggested context.md Updates` section, apply those updates to `openspec/context.md`.

### 4. Move to Archive
```
openspec/changes/{change-name}/
  → openspec/changes/archive/YYYY-MM-DD-{change-name}/
```

### 5. Verify
- [ ] Main specs updated correctly
- [ ] Context.md updated (if applicable)
- [ ] Change folder moved to archive
- [ ] Archive contains all artifacts
- [ ] Active changes directory no longer has this change

### 6. Output
`archive-report.md` with: specs synced, archive contents, source of truth updated.

## Rules
- NEVER archive with CRITICAL issues in verify report
- ALWAYS sync delta specs BEFORE moving to archive
- Archive is AUDIT TRAIL — never delete or modify archived changes
- Use ISO date format (YYYY-MM-DD)
- After archive, `openspec/specs/` will contain the promoted main specs — this is the source of truth for future changes
