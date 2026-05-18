---
name: sdd-instructions
description: >
  Generate scoped instruction files from detected stack and project config.
  Copilot: .github/instructions/*.instructions.md (applyTo pattern).
  Claude Code: .claude/rules/*.md (paths pattern).
  Each file = HOW to write code for a specific concern. One concern per file, as atomic as possible.
user-invocable: true
disable-model-invocation: true
---

## Purpose

Generate **atomic** scoped instruction files that AI tools load automatically **when editing matching files**. Each file tells the AI HOW to write code for ONE specific concern: one architectural layer, one test type, one formatting rule set.

These are the **shared team contract** — every AI agent reads the same rules when touching relevant files.

**Atomic = one concern per file.** Do NOT create kitchen-sink files that mix multiple concerns. A project with layered architecture should have separate files for each layer, each test type, each cross-cutting concern — not one giant file.

This skill NEVER creates `copilot-instructions.md`, `CLAUDE.md`, or any repo-level file. Only scoped files with `applyTo` (Copilot) or `paths` (Claude Code).

**Technology agnostic.** This skill works for ANY stack. It contains ZERO framework names, ZERO code examples. All content is discovered from the actual project.

## Order

### 1. Read Stack

Read `openspec/config.yaml` → extract `x-conductor.stack`, `testing`, `quality` fields.
If config doesn't exist → `status: blocked`. "Run /sdd-init first."

### 2. Deep Scan Project

This is the most important step. Scan the ACTUAL codebase to discover what exists.

**Config files** — read every config file at the project root and in config directories:
- Language/compiler configs (strict modes, path aliases, targets)
- Build tool configs (builder, budgets, assets, output)
- Package manager manifests (scripts, dependencies)
- Editor configs (indentation, charset, line endings)
- Linter configs (rules, overrides)
- Formatter configs (style rules)
- Test runner configs (frameworks, patterns, coverage)

**Source code structure:**
- Scan the source root to discover directories and their roles
- Identify directory conventions: what lives where, naming patterns
- Read 2-3 actual source files per discovered layer to extract real patterns
- Read 1-2 actual test files per test type to extract real patterns
- Identify import/dependency boundaries between layers

**Architecture detection:**
- Discover the actual architecture from directory structure and code — do NOT assume any pattern
- Identify each distinct layer/concern that deserves its own instruction file
- Note naming conventions, file suffixes, and organizational patterns

### 3. Scan Existing Instruction Files

Read ALL existing files in `.github/instructions/` and/or `.claude/rules/`. For EACH file:

1. **Read its full content** — understand what concerns, rules, and patterns it already covers
2. **Classify it:**
   - **Auto-generated** (contains `_Auto-updated by /sdd-instructions_`) → can be updated in place
   - **Manually created** (no marker) → NEVER modify, NEVER delete, NEVER overwrite

3. **Build a coverage map** — list every concern/rule already covered by existing files:
   - Which architectural layers have instructions?
   - Which testing patterns are documented?
   - Which formatting/linting rules are specified?
   - Which `applyTo`/`paths` scopes are already taken?

**This coverage map drives Step 5.** You must NOT generate content that duplicates what existing files already cover.

**Behavior matrix:**

| Existing files | Action |
|---------------|--------|
| None exist | Create from scratch — full set based on Step 2 discovery |
| Only manual files exist | Read them, create NEW auto-generated files that COMPLEMENT (not duplicate) the manual ones. If a manual file already covers a concern fully, do NOT create an auto-generated file for the same concern |
| Only auto-generated files exist | Update them in place with fresh content from Step 2. Add new files for newly discovered concerns. NEVER delete existing auto-generated files |
| Mix of manual + auto-generated | Update auto-generated files. NEVER touch manual files. New files must not overlap with either type |

**Overlap prevention rules:**
- If an existing file covers a layer/scope → do NOT create another file for the same layer/scope
- If an existing file covers testing patterns for a specific test type → do NOT create a testing file with the same scope
- If an existing file partially covers a concern → your auto-generated file should cover ONLY the gap (different scope or complementary rules)
- When in doubt about overlap, do NOT generate the file — better a gap than a contradiction

### 4. Detect Target Platform

Detect which platform is in use. Write ONLY to the detected platform — NEVER write to both unless both exist.

- `.github/` exists AND `.claude/` does NOT exist → **Copilot only**. Write to `.github/instructions/`.
- `.claude/` exists AND `.github/` does NOT exist → **Claude Code only**. Write to `.claude/rules/`.
- Both exist → write to both.
- Neither exists → create ONLY for the platform currently running this skill.

**NEVER create `copilot-instructions.md`, `CLAUDE.md`, or any repo-level file. Only scoped files.**

### 5. Plan Instruction Files

Before generating, plan the full list of files. Cross-reference Step 2 discoveries against the **coverage map from Step 3**. Only plan files for concerns NOT already covered by existing instruction files.

**For each planned file, verify:** Does an existing file (manual or auto-generated) already cover this concern and scope? If yes → skip it or narrow your scope to the uncovered gap.

**File categories** — generate ONLY what the project actually has:

**a) General** (always, if not already covered):
- One file with `applyTo: "**"` — stack summary, commands, path aliases, project-wide conventions
- This is the ONLY file allowed to use global scope

**b) Formatting / linting** (if config detected and not already covered):
- One file scoped to source file extensions — rules extracted from actual config files

**c) Architecture layers** (one file per distinct layer discovered in Step 2):
- Discover layers from the actual directory structure
- Each layer gets its own file scoped to its directory path
- Include: responsibilities, dependency boundaries, naming conventions, code patterns (GOOD + BAD from real code)
- If a layer has sub-concerns large enough to warrant separate files, split them

**d) Testing** (one file per test type discovered):
- Discover test types from actual test files and configs
- Each test type gets its own file scoped to its file pattern
- Include: setup patterns, assertion conventions, mocking strategy, coverage expectations

**e) Styling** (if style files detected and not already covered):
- One file scoped to the style file extension

**Naming convention:** `{concern}.instructions.md` or `{layer}.{sub-concern}.instructions.md` for nested concerns. Use names that reflect the project's own terminology.

**How many files?** As many as the architecture justifies. A simple project may need 3-4 files. A complex layered project may need 10-15. Let the project structure drive the count — do NOT pad with unnecessary files, and do NOT compress distinct concerns into too few files.

### 6. Generate Files

For each planned file, generate content following these rules:

**File structure:**
```markdown
---
description: "One-line description of when to use this file"
applyTo: "narrowly/scoped/pattern/**"
---
# Title
_Auto-updated by /sdd-instructions on {ISO-date}._

{Content: rules, patterns, code examples from ACTUAL project code}
```

**Content rules:**
- Extract patterns from REAL code found in Step 2 — do NOT invent conventions
- Include GOOD and BAD code examples from the actual codebase (show the pattern AND the anti-pattern)
- Include "Never" / "Anti-patterns" sections with concrete prohibitions discovered from the project
- Every command must be copy-paste runnable with exact flags from the project's own scripts
- Keep focused: one concern per file, no kitchen-sink content
- Aim for 30-80 lines per file (some complex layers may need up to 120)

**Scoping rules:**
- `applyTo` must be as narrow as possible — target the exact directory/pattern
- NEVER use `applyTo: "**"` except for the general file
- Match real project paths discovered in Step 2

### 7. Return Summary

Report: platforms detected, files generated/updated, each with its `applyTo`/`paths`, config sources scanned.

**STOP here. Do NOT invoke any other skill.**

## Content Quality Rules

1. **Show, don't tell**: one code snippet > three paragraphs of description
2. **Include GOOD and BAD examples**: from the ACTUAL codebase, not invented
3. **Copy-paste commands**: every command must be runnable, with exact flags from the project
4. **Boundaries matter**: always include "Never do" sections
5. **Scan real code**: extract patterns from the ACTUAL codebase, not generic best practices
6. **Keep focused**: one concern per file, no kitchen-sink files
7. **Atomic**: if a file covers two distinct concerns, split it into two files

## Boundary with openspec/config.yaml

| In instruction files | In config.yaml |
|---------------------|----------------|
| HOW to write code (patterns, structure, examples) | WHICH tools to run (commands, thresholds) |
| Conventions with GOOD/BAD examples | Stack name/version |
| "Never do" restrictions | Pipeline phases |
| Project structure reference | — |

## Size Guidelines

| File type | Recommended |
|-----------|-------------|
| Scoped instruction file | 30-80 lines (max ~120 for complex layers) |
| Code examples per file | 1-2 (GOOD + BAD) |
| Total files | As many as the architecture justifies |

## Platform Format

Use the format for the detected platform ONLY:

**Copilot** — file: `.github/instructions/{name}.instructions.md`
```yaml
---
description: "When to use this file"
applyTo: "pattern"
excludeAgent: ["sdd-reviewer"]  # Add when content is coding-only
---
```

**Claude Code** — file: `.claude/rules/{name}.md`
```yaml
---
description: "When to use this file"
paths: ["pattern"]
excludeAgent: ["sdd-reviewer"]  # Add when content is coding-only
---
```

### excludeAgent usage

| File type | excludeAgent |
|-----------|-------------|
| Testing instructions | `["sdd-reviewer"]` — reviewer runs tests, doesn't write them |
| Formatting instructions | `["sdd-reviewer"]` — reviewer doesn't format code |
| Architecture / layer instructions | — (reviewer needs these to validate patterns) |
| Styling instructions | `["sdd-reviewer"]` — reviewer doesn't write styles |

All files: include auto-update marker `_Auto-updated by /sdd-instructions on {date}._`

## Rules

- ZERO technology names or code examples in THIS skill file — all content comes from scanning the actual project
- NEVER create `copilot-instructions.md`, `CLAUDE.md`, or any repo-level file — only scoped files with applyTo/paths
- NEVER create files for a platform that is not detected
- NEVER use `applyTo: "**"` except for the general file
- NEVER delete existing instruction files — update auto-generated ones, leave manual ones untouched
- ONLY generate for detected technologies and layers — no placeholders, no files for things that don't exist
- Write ONLY to the detected platform(s) from Step 4
- When re-running, build coverage map first, then COMPLEMENT — never duplicate
- Instruction files are TEAM artifacts — commit and review them
- ALWAYS scan the actual codebase for patterns — do not invent conventions
- ALWAYS include code examples (GOOD + BAD) extracted from real project files
- ONE concern per file — if you're mixing concerns, split the file
