---
name: sdd-explain
description: "Reverse-engineer an existing/legacy codebase into a draft OpenSpec change (spec.md + tasks.md + extracted OpenAPI). The on-ramp for brownfield work and migrations: deterministic extraction first, then the planner LLM refines. Run on a directory you want to bring under SDD."
user-invocable: true
argument-hint: "<source dir to reverse-engineer>"
---

# /sdd-explain — legacy code → draft spec

Bring existing code under Spec-Driven Development without writing the spec by hand. The conductor
engine extracts structure **deterministically** (capabilities, HTTP endpoints, classes/services,
an OpenAPI skeleton) across stacks (JS/TS, Java, PHP, Python); then the **sdd-planner** refines the
draft into a real spec. Deterministic skeleton + LLM nuance = fast, accurate brownfield on-ramp.

## Steps

### 1. Run extraction (deterministic, no LLM)
Use the conductor engine by **MCP tool name** (`conductor_explain`) — the server ships with the plugin
(auto-registered); never reference a plugin file by path. Call `conductor_explain` with
`{ "srcDir": "<dir>" }`. (In CI/advanced setups where the engine is installed as a CLI, the equivalent
is `conductor explain <dir> --out openspec/changes/{change-name}`.) This produces a draft `spec.md` (delta with `### Requirement:` + `#### Scenario:` stubs + `<!-- id: REQ-… -->`),
a `tasks.md`, and `openapi.extracted.json` (if HTTP routes were found).

### 2. Refine with the planner (LLM)
Dispatch `sdd-planner` (or review manually) to:
- Replace the `(reverse-engineered draft — refine)` / `TODO: confirm` stubs with real intent.
- Merge/rename capabilities that the heuristic split or over-grouped.
- Keep the `<!-- id: REQ-… -->` ids stable — code/tests reference them via `@conductor REQ-…`.

### 3. Establish a baseline for drift & contract gates
- Save `openapi.extracted.json` as the contract baseline (e.g. `openspec/specs/api/openapi.json`) so
  future changes run `conductor contract` against it (breaking-change detection).
- Run `conductor drift <change> --src <dir>` to see how much of the code is already traced vs not —
  the migration backlog, quantified.

### 4. Annotate as you migrate
As code is confirmed, add `// @conductor REQ-…` comments in the relevant files/tests so the
traceability matrix (`conductor trace`) and `drift` gate light up green over time.

## Output (terse)
```
Capabilities: {n} | Endpoints: {m} | Draft: openspec/changes/{change}/ (spec.md, tasks.md, openapi.extracted.json)
Next: refine with sdd-planner; set the OpenAPI baseline; run /sdd-status.
```

## Hard rules
- The extraction is a DRAFT — never present it as a finished spec. The planner/human must confirm.
- Reference ONLY project-relative paths (`openspec/...`, the source dir) — never a plugin path.
- Deterministic, read-only: it never modifies the scanned source.
