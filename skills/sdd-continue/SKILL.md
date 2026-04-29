---
name: sdd-continue
description: "Resume an SDD change from where it stopped — reads state.yaml and continues the pipeline."
user-invocable: true
disable-model-invocation: true
argument-hint: "[--auto | --interactive] [change-name]"
---

## Instructions

1. Find the active change:
   - If user specified a change name → read `openspec/changes/{change-name}/state.yaml`
   - If not → scan `openspec/changes/` for the most recently updated `state.yaml` that is NOT `complete`
   - If none found → "No hay cambios activos. Usa `/sdd-new` para empezar uno."

2. Read `openspec/config.yaml` for `auto_mode`, `strict_tdd`, `max_review_cycles`.
   - If user passed `--auto` or `--interactive` → update `auto_mode` in state.yaml (`--auto` → `true`, `--interactive` → `false`).

3. Read `state.yaml` → determine current `status`:

| status | Action |
|--------|--------|
| `planning` | Resume planning — delegate to `sdd-planner` with existing artifacts |
| `blocked` (clarify) | Check if user provided answers → re-delegate to `sdd-planner` |
| `blocked` (partial impl) | Resume implementation — delegate to `sdd-coder` (reads `last_task`) |
| `blocked` (review exhausted) | Show options: fix manually, re-plan, or abort |
| `implementing` | Delegate to `sdd-coder` |
| `reviewing` | Delegate to `sdd-reviewer` |
| `complete` | "Ya completo. Ejecuta `/sdd-archive {change-name}` para archivar." |

4. After each delegation, follow the same logic as `/sdd-new`:
   - Verify artifacts exist.
   - Check `auto_mode` from state.yaml.
   - Handle review loop if reviewer returns FAIL.

5. Update `state.yaml` after each phase transition.

## Rules

- NEVER skip the current pending phase — execute phases in DAG order.
- NEVER generate code or specs yourself — delegate to agents.
- NEVER pause when `auto_mode: true` unless blocked.
- If state.yaml is malformed → inform user: "state.yaml corrupted. Check openspec/changes/{change-name}/"
