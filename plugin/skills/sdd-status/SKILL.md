---
name: sdd-status
description: >
  Show progress of the current SDD run — reads the real run state in
  .conductor/ (timeline.json + state.json) and shows phase status.
user-invocable: true
disable-model-invocation: true
---

## Instructions

conductor's live surface is the local app at `http://127.0.0.1:4750` — for the live view prefer
pointing the user to its run page (`/run/<projectId>/<change>`). This skill is a quick text fallback.

The run state is written by the deterministic driver under the change's `.conductor/` folder
(NOT `state.yaml`):

1. Find the active change at `openspec/changes/<name>/`. Read its `.conductor/`:
   - `.conductor/timeline.json` → phases executed, each with `role`, `model`, `tokens`, `files`, `ms`,
     `ok`, plus the run `verdict` (this is the source of truth for progress).
   - `.conductor/state.json` → current pipeline position (`phases`, `idx`, `status`).
2. Show phase progress from `timeline.json.phases`: each phase with ✅/❌ (`ok`), its role and model, and
   the overall `verdict` (GREEN / NOT-GREEN / ABORTED / BLOCKED / running).
3. List the artifacts present in the change folder (`proposal.md`, `specs/*/spec.md`, `design.md`,
   `tasks.md`, `apply-report.md`, `verify-report.md`).
4. If `state.json.status === 'running'`, show the current/next phase and tell the user to follow it live
   in the app.
5. If no change with a `.conductor/` folder is found → inform the user and suggest `/sdd-run`.
