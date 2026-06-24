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
2. If target spec.md doesn't exist → write the target with this EXACT skeleton (no `## ADDED|MODIFIED|REMOVED|RENAMED Requirements` headers — those are delta-only markers and MUST be removed during promotion; the `### Requirement:` blocks are promoted directly into the spec body, in their original order):

   ```
   # {Domain} Specification

   ## Purpose

   {1-2 sentence description of the domain, derived from proposal.md or from the requirement names}

   {### Requirement: ... blocks from the delta, with their #### Scenario: blocks, separated by single blank lines}
   ```

   The promoted spec MUST NOT contain the string `## ADDED Requirements` (or MODIFIED/REMOVED/RENAMED). If a shell here-string is needed because a higher-level Create tool fails, this rule still applies — strip those headers when composing the here-string.
3. If target exists → apply delta in order: RENAMED → REMOVED → MODIFIED → ADDED. Preserve target's existing `# Title` and `## Purpose`.

NEVER promote specs as flat files (e.g., `openspec/specs/my-feature.md`). ALWAYS use domain subdirectories (`openspec/specs/{domain}/spec.md`).

Warn and ask confirmation if merge would be destructive (removing large sections).

### 3. Apply Suggested Instruction Updates

If `verify-report.md` contains a `## Suggested Instruction Updates` section, apply those updates to the relevant platform instruction files.

### 4. Seal provenance + chain (if engine installed)

If the `conductor` command is available (installed via `/sdd-verify`), produce signed, auditable
evidence that this GREEN change passed the gates, and append it to the tamper-evident provenance chain
(invoke by command name — never by a plugin path):
1. `conductor seal openspec/changes/{change-name} --src <src or omit> --priv $CONDUCTOR_PRIV_KEY -o openspec/changes/{change-name}/provenance.json`
   (Ed25519 signature; the seal moves with the change in step 5). `$CONDUCTOR_PRIV_KEY` is the org's
   private key — from a vault, never hardcoded.
2. `conductor ledger append openspec/changes/{change-name}/provenance.json --ledger openspec/provenance.ledger.jsonl`
   (hash-chained: each entry binds to the previous → any later tampering breaks the chain).
If `conductor` is not installed → skip and note `Provenance: skipped (run /sdd-verify)`.

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
