# SDD Phase — Common Protocol

Boilerplate identical across all SDD phase skills. Sub-agents MUST load this alongside their phase-specific SKILL.md.

Executor boundary: every SDD phase agent is an EXECUTOR, not an orchestrator. Do the phase work yourself. Do NOT launch sub-agents, do NOT call `delegate`/`task`, and do NOT bounce work back unless the phase skill explicitly says to stop and report a blocker.

## A. Skill Loading

1. Check if the orchestrator injected a `## Project Standards (auto-resolved)` block in your launch prompt. If yes, follow those rules — they are pre-digested compact rules from the skill registry. **Do NOT read any SKILL.md files.**
2. If no Project Standards block was provided, check for `SKILL: Load` instructions. If present, load those exact skill files.
3. If neither was provided, search for the skill registry as a fallback:
   a. Read `.atl/skill-registry.md` from the project root if it exists
   b. From the registry's **Compact Rules** section, apply rules whose triggers match your current task.
4. If no registry exists, proceed with your phase skill only.

NOTE: the preferred path is (1) — compact rules pre-injected by the orchestrator. Paths (2) and (3) are fallbacks for backwards compatibility. Searching the registry is SKILL LOADING, not delegation. If `## Project Standards` is present, IGNORE any `SKILL: Load` instructions — they are redundant.

## B. Artifact Retrieval (OpenSpec Mode)

Read artifacts directly from the filesystem:

```
openspec/changes/{change-name}/{artifact-type}.md → full content (REQUIRED)
```

> **Note**: For specs, the path is nested: `specs/{domain}/spec.md`. For all other artifacts, the path is flat: `{artifact-type}.md`.
> If a REQUIRED artifact is missing, return `status: blocked` with `risks: 'Missing prerequisite: {artifact-name}'`. Do NOT proceed without required inputs.

## C. Artifact Persistence

Every phase that produces an artifact MUST persist it. Skipping this BREAKS the pipeline — downstream phases will not find your output.

### OpenSpec mode

> Create the change directory (`openspec/changes/{change-name}/`) if it does not exist before writing.

Write the artifact to the filesystem:
```
openspec/changes/{change-name}/{artifact-type}.md
```

### None mode

Return result inline only. Do not write any files.

## D. Return Envelope

Every phase MUST return a structured envelope to the orchestrator:

- `status`: `success`, `partial`, or `blocked`
- `executive_summary`: 1-3 sentence summary of what was done
- `detailed_report`: (optional) full phase output, or omit if already inline
- `artifacts`: list of artifact keys/paths written
- `next_recommended`: the next SDD phase to run, or "none"
- `risks`: risks discovered, or "None"
- `skill_resolution`: how skills were loaded — `injected` (received Project Standards from orchestrator), `fallback-registry` (self-loaded from registry), `fallback-path` (loaded via SKILL: Load path), or `none` (no skills loaded)

Example:

```markdown
**Status**: success
**Summary**: Proposal created for `{change-name}`. Defined scope, approach, and rollback plan.
**Artifacts**: `openspec/changes/{change-name}/proposal.md`
**Next**: sdd-spec or sdd-design
**Risks**: None
**Skill Resolution**: injected — {N} skills ({skill-1}, {skill-2}, ...)
(other values: `fallback-registry`, `fallback-path`, or `none — no registry found`)
```
