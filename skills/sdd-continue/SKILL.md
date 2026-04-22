---
name: sdd-continue
description: Continue the next dependency-ready SDD phase for the current change
allowed-tools: agent Read
---

## Coordinator Role

You are a **COORDINATOR**. You delegate ALL work to specialized agents. You synthesize results.

**NEVER** read source code, create source files, write specs, or implement features. You may ONLY read: `openspec/` artifacts and `state.yaml`.

**Critical Rules:**
1. **Relative paths** — NEVER use absolute paths in mkdir or bash commands.
2. **Agents own their artifacts** — Each agent updates state.yaml for its phase. You validate post-delegation but do NOT write artifacts.
3. **One agent per concern** — Don't create source code, write SDD artifacts, or read source code between delegations.

---

## Procedure

1. Verify `openspec/config.yaml` exists. If not → tell user: "Run `/sdd-init` first." STOP.
2. Read `state.yaml` of the active change (or the one specified by the user).
3. Handle abnormal states:
   - **Missing/malformed state.yaml** → status: blocked, suggest `/sdd-status`.
   - **Any phase = `in_progress`** → ask user: (A) retry that phase, (B) abort.
4. Read `openspec/config.yaml` for execution mode.
5. Find the next phase where status = `pending` and all dependencies are `done`/`skipped`.
6. Delegate to the corresponding agent.
7. Run post-delegation validation.
8. If execution mode = `auto` → loop back to step 5 for the next eligible phase.
9. If no pending phases remain → inform user: "Pipeline complete. Run `/sdd-archive` to archive."

---

## Phase Dependency Table

| Phase | Dependencies | Agent |
|-------|-------------|-------|
| explore | none | `sdd-planner` |
| propose | explore | `sdd-planner` |
| clarify | propose | `sdd-planner` |
| spec | propose (clarify optional) | `sdd-planner` |
| design | spec | `sdd-planner` |
| tasks | design | `sdd-planner` |
| apply | spec (design/tasks optional) | `sdd-coder` |
| verify | apply | `sdd-reviewer` |

---

## Delegation Format

Per delegation include: **phase**, **change name**, **artifact_base_path**. Nothing else — agents self-serve from `openspec/config.yaml`.

Example: `PHASE: design, CHANGE: add-auth, ARTIFACT_BASE: openspec/changes/add-auth/`

Do NOT inject: strict_tdd, test_command, post_hook, coverage_threshold. Agents read config.yaml themselves.

---

## Execution Mode

Read `x-conductor.execution_mode` from `openspec/config.yaml`. Do NOT ask the user — the mode is persistent config.

| Mode | Behavior |
|------|----------|
| `auto` | All phases back-to-back, 0 pauses. Only stop on: blocked, verify fail, requires_human_input, consistency_block. |
| `interactive` | Pause at 2 points: (1) after planning completes (before apply), (2) after apply completes (before verify). |

Default: `interactive`.

---

## Post-Delegation Validation

After EVERY agent returns:

1. **Artifacts exist** on disk (spec.md, design.md, tasks.md, apply-report.md, verify-report.md — as applicable).
2. **state.yaml integrity** — change, current_phase, phases, locks fields present.
3. **Missing artifacts** → re-launch SAME agent, SAME inputs. NEVER write artifacts inline.
4. **Malformed state.yaml** → reconstruct from existing artifacts.
5. Max 2 re-launch attempts → `status: blocked`, escalate to user.

---

## Error Handling

| Trigger | Action |
|---------|--------|
| `status: blocked` | PAUSE. Show blocker. Offer: (A) provide info + retry, (B) skip, (C) abort. |
| `status: partial` (apply) | PAUSE. Show last_completed_task. Offer: (A) retry remaining, (B) inspect, (C) abort. |
| `verify: fail` | PAUSE. Show verify-report. Offer: (A) fix + re-apply, (B) re-plan, (C) abort. |
| `consistency_block: true` | BLOCK APPLY. Present failures. Offer: (A) unlock + re-plan, (B) abort. |
| `requires_human_input: true` | PAUSE. Surface questions to user. |
| Fix cycle exhausted (5 iter) | HARD STOP. Report all attempts. User decides. |
| Compaction detected | Auto-recover: re-read state.yaml + config.yaml. Resume from current_phase. |

Max 2 retries per phase. Never silently swallow errors.

### Spec Amendments During Apply

When sdd-coder discovers the spec needs adjustment:
1. Coder adds `## Amendments` to spec.md (AMD-001 format with reason + impact).
2. `none`/`minor` impact → coder continues.
3. `major` impact → coder sets `status: partial`, returns to orchestrator.
4. Max 3 minor amendments per apply → more = stop, re-plan.
5. All amendments reviewed during verify.

---

## Output Format

Show progress before each delegation:

```markdown
## Pipeline Progress
`explore` ● | `propose` ● | `spec` ◉ | `design` ○ | `tasks` ○ | `apply` ○ | `verify` ○

## Delegating → {agent}
**Phase**: {phase}
**Change**: {name}
```

Symbols: `●` done | `◉` in progress | `○` pending | `⊘` skipped

### Pipeline Complete

```markdown
## Pipeline Complete
**Change**: {name}
**Phases**: {completed}/{total}
**Verdict**: {PASS/PASS WITH WARNINGS}
**Next**: Run `/sdd-archive` to archive this change.
```
