---
name: sdd-instructions
description: >
  Generate platform instruction files from detected stack and project config.
  Writes to .github/instructions/ (Copilot) and .claude/rules/ (Claude Code).
  Each file scoped via applyTo (Copilot) or paths (Claude Code) to the file types it affects.
---

## Purpose

Generate instruction files that ANY AI tool (Claude, Copilot, or any future tool) loads automatically when editing relevant files. Each file targets a specific concern (testing, formatting, framework conventions) and only loads for matching file patterns via `applyTo` (Copilot) or `paths` (Claude Code).

These files are the **shared team contract** — every AI agent on every machine reads the same rules. They complement `openspec/config.yaml` (which holds pipeline execution config) without duplicating it.

## Order

### 1. Read Stack

Read `openspec/config.yaml` → extract `x-conductor.stack` fields (language, framework, version, runtime, package_manager).
If config doesn't exist → `status: blocked`. Inform user: "Run /sdd-init first." Do NOT proceed.

### 2. Scan Project Config Files

Detect project configuration files that control formatting, linting, type checking, and code style. Extract only rules that affect code generation (indentation, naming, strictness, banned patterns).

### 3. Scan Existing Instruction Files

Read any existing instruction files in `.github/instructions/` and `.claude/rules/`. Classify each file:
- **Auto-generated** (contains `_Auto-updated by /sdd-instructions_`) → candidate for update
- **Manually created** (no auto-update marker) → NEVER modify or overwrite

**Skip evaluation**: If auto-generated files already exist AND their content matches the current detected stack (same framework, same test runner, same conventions):
- Report: "Instruction files are up to date — no changes needed."
- Do NOT regenerate. Only regenerate when stack has changed or files are missing.
- If only some files need updating, update only those.

**Merge behavior**: When re-running on existing auto-generated files:
- Compare detected rules against existing content
- If no meaningful differences → skip that file
- If differences found → update the auto-generated sections, preserve any manual additions between auto-generated markers

### 4. Detect Target Platform

Check which platform directories exist in the project:
- `.claude/` exists → write to `.claude/rules/{name}.md`
- `.github/` exists → write to `.github/instructions/{name}.instructions.md`
- Both exist → write to both (dual-platform project)
- Neither exists → create for the platform currently running this skill

### 5. Generate Instruction Files by Concern

Write each file to the detected platform location(s).

**CRITICAL RULES**:
- NEVER use `applyTo: "**"` (Copilot) or `paths: ["**"]` (Claude Code) — every file MUST target specific file types
- NEVER duplicate info from `openspec/config.yaml` (testing commands, hooks, coverage thresholds → config.yaml only)
- Each file ≤ 200 words — concise, actionable, no filler
- If re-running, MERGE — preserve manual additions, update auto-generated content

#### 5a. Testing instructions (ONLY if test runner detected)

Scope `applyTo` (Copilot) or `paths` (Claude Code) to the project's test file pattern (derived from detected stack and conventions).

```markdown
---
applyTo: "{test_pattern}"                  # Copilot
# paths: ["{test_pattern}"]               # Claude Code
---
# Testing
_Auto-updated by /sdd-instructions on {date}._

- Pattern: {spec file pattern and location convention}
- Framework: {test framework and style}
- {Any testing conventions from config files}

> Runner commands and coverage config: see `openspec/config.yaml` → `x-conductor.testing`
```

#### 5b. Formatting instructions (ONLY if formatting config detected)

Scope `applyTo` (Copilot) or `paths` (Claude Code) to the project's source file types.

```markdown
---
applyTo: "{source_pattern}"                # Copilot
# paths: ["{source_pattern}"]             # Claude Code
---
# Formatting & linting
_Auto-updated by /sdd-instructions on {date}._

{extracted rules: indentation, charset, quotes, line endings}
{language-specific strictness flags}
{linter rules if applicable}
```

#### 5c. Framework-specific instructions (ONLY if framework detected)

Generate ONE file per detected framework. Name it after the framework. Scope `applyTo` (Copilot) or `paths` (Claude Code) to the framework's relevant file patterns.

Scan the actual codebase for architecture, directories, entry points and conventions:

```markdown
---
applyTo: "{framework_pattern}"             # Copilot
# paths: ["{framework_pattern}"]           # Claude Code
---
# {Framework} {version}
_Auto-updated by /sdd-instructions on {date}._

{1-line stack summary}

## Architecture
{pattern detected from project structure}

## Key Directories
| Path | Purpose |
|------|---------|
{detected modules and what they contain}

## Entry Points
{main files, CLI entrypoints, API roots}

## Conventions
{framework-specific conventions detected from actual project code and config}

## Known Fragile Areas
{leave blank — fill as discovered}
```

> `/sdd-init` does NOT create instruction files. This skill is the ONLY source of instruction files.

#### 5d. Styling instructions (ONLY if CSS/SCSS/styling config detected)

Scope `applyTo` (Copilot) or `paths` (Claude Code) to the project's styling file patterns. Content: extracted styling conventions (class naming, methodology, preprocessor config).

### 6. Return Summary

Report: which platform(s) detected, which instruction files were generated/updated, each with its `applyTo`/`paths` pattern, which config sources were scanned.

## Boundary with openspec/config.yaml

| In instruction files | In config.yaml | NEVER in both |
|---------------------|----------------|---------------|
| How to format code | Which formatter to run | Formatter command |
| How to write tests | Which test runner to use | Test run command |
| Framework conventions | Framework name/version | — |
| Linting rules summary | Linter tool name | Lint command |
| File organization | — | — |

**Rule**: instruction files say HOW to write code. config.yaml says WHAT tools to run. No overlap.

## Rules

- NEVER use `applyTo: "**"` (Copilot) or `paths: ["**"]` (Claude Code) — every file MUST target specific file patterns.
- Each file ≤ 200 words — the platform loads ALL matching files per interaction.
- ONLY generate files for technologies actually detected — no placeholders.
- Write ONLY to detected platform(s) — `.claude/rules/` if Claude, `.github/instructions/` if Copilot, both if dual.
- When re-running, MERGE — preserve manual additions, only update auto-generated sections.
- Do NOT scan user-level directories — only project-level config.
- Instruction files are TEAM artifacts — commit them, review them.
