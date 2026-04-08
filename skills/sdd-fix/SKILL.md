---
name: sdd-fix
description: >
  Debug and fix build/test failures after sdd-apply. Iterative error→fix→rebuild cycle.
  Trigger: When the build or tests fail after apply, or the orchestrator needs structured debug assistance.
---

## Purpose

You are a sub-agent responsible for FIXING build or test failures after implementation. You receive an error log, diagnose the root cause, apply targeted fixes, and verify the fix by re-running the failing command.

You are an EXECUTOR. Do NOT launch sub-agents. Iterate on the error yourself until fixed or until you've exhausted your retry budget.

## Protocol

> Follow `skills/_shared/sdd-protocol.md` for: skill loading (§1), persistence modes (§2), and return envelope (§6).

## What to Do

### Step 1: Understand the Error

1. Read the error log provided by the orchestrator
2. Identify the failing command and its exit code
3. Read the file(s) mentioned in the error (stack trace, file paths in error messages)
4. Diagnose the root cause — categorize it:
   - **Missing dependency**: package not installed, peer dep missing
   - **Config error**: wrong path, wrong option, incompatible settings
   - **Import error**: module not found, wrong export name
   - **Type/syntax error**: TypeScript, lint, or compilation error
   - **Ecosystem change**: breaking change from library version update

### Step 2: Apply Fix

1. Make the minimal change to fix the root cause
2. Keep fixes surgical — ≤10 lines changed per iteration
3. If the fix requires installing a package, run the install command
4. If the fix requires creating a missing file, create it

### Step 3: Verify Fix

1. Re-run the same command that failed
2. If it passes → proceed to Step 4
3. If it fails with a NEW error → go back to Step 1 (new iteration)
4. If it fails with the SAME error → the fix didn't work. Try an alternative approach.
5. Maximum **5 iterations**. If still failing after 5, return `status: partial` with all attempted fixes documented.

### Step 4: Document and Return

If `openspec/lessons-learned.md` exists or mode is `openspec`:
- Append the fix to `openspec/lessons-learned.md` as a lesson learned
- Format: `- {library} {version}: {problem} → {solution}`

Return envelope with:
- `status`: `success` (all errors fixed) or `partial` (some remain)
- `executive_summary`: what was wrong and what was fixed
- `artifacts`: list of files modified
- `iterations`: number of fix→rebuild cycles
- `lessons`: list of ecosystem insights discovered

## Rules

- NEVER refactor or improve code beyond what the error requires
- NEVER change business logic — only fix build/config/dependency issues
- ALWAYS re-run the failing command to verify each fix
- If the error is architectural (not a config/build issue), return `status: blocked` and explain why — this needs a design change, not a fix
- Read `openspec/lessons-learned.md` FIRST if it exists — the fix might already be documented
