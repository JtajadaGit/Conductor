# Troubleshooting Guide

Common issues and resolutions when using the Conductor SDD framework.

## Build Fails After sdd-apply Reports "All Tasks Complete"

**Symptom**: `sdd-apply` returns `status: success` with all tasks marked `[x]`, but the build/tests fail.

**Why**: Apply verifies that files were created/modified per the task list, but does not validate that the code compiles or passes tests (unless `post_hook` is configured).

**Solutions**:
1. **Configure `post_hook`** in `openspec/config.yaml` to catch build errors during apply:
   ```yaml
   rules:
     apply:
       post_hook: "npm run build 2>&1 | tail -30"
       post_hook_on_fail: retry
       post_hook_max_retries: 3
   ```
2. **Use `sdd-fix`** to debug build failures with structured iteration
3. **Run `sdd-verify`** which executes the build command if configured

## Sub-Agent Returns Invalid or Empty Envelope

**Symptom**: Phase completes but the orchestrator can't parse the result.

**Solutions**:
1. Retry the phase once (the orchestrator does this automatically)
2. If it fails again, the orchestrator escalates to the user
3. Check if the sub-agent ran out of context (common with `sdd-apply` on large task lists)

## state.yaml Has Inconsistent State

**Symptom**: Phases show wrong status, or `current_phase` doesn't match reality.

**Solutions**:
1. Manually edit `openspec/changes/{change-name}/state.yaml`
2. Or delete it — the orchestrator will re-derive state from existing artifacts on next `sdd-continue`

## sdd-continue Says "No Next Phase"

**Symptom**: All phases show `done` but you know work remains.

**Causes**:
- The change was already archived
- state.yaml is stale — delete and re-run `sdd-continue`

## Compaction Lost Context

**Symptom**: The orchestrator stops injecting Project Standards, sub-agents report `skill_resolution: none`.

**Solution**: The orchestrator auto-recovers by re-reading `.atl/skill-registry.md`. If it doesn't, manually say "update skills" or "reload registry" to trigger re-caching.

## Ecosystem Breaking Changes (e.g., Storybook 8, Next.js 15)

**Symptom**: Apply generates code using patterns from an older version of a library.

**Why**: The AI model's training data may not include the latest breaking changes.

**Solutions**:
1. Configure `post_hook` to catch failures early
2. Use `sdd-fix` for iterative debugging
3. Add lessons to `openspec/lessons-learned.md` so future sessions avoid the same mistakes
4. Consider providing version-specific docs in `openspec/principles.md`
