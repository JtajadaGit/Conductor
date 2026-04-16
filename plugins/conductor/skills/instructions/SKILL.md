---
name: instructions
description: >
  Generate platform instruction files from detected stack and project config.
  Writes to .github/instructions/ (Copilot) and .claude/rules/ (Claude Code).
  Each file scoped via applyTo to the file types it affects.
user-invocable: true
disable-model-invocation: true
effort: medium
---

## Purpose

Generate instruction files that ANY AI tool (Claude, Copilot, or any future tool) loads automatically when editing relevant files. Each file targets a specific concern (testing, formatting, framework conventions) and only loads for matching file patterns via `applyTo`.

These files are the **shared team contract** — every AI agent on every machine reads the same rules. They complement `openspec/config.yaml` (which holds pipeline execution config) without duplicating it.

## Steps

### 1. Read Stack
Read `openspec/config.yaml` → extract `x-conductor.stack` fields (language, framework, version, runtime, package_manager).
If config doesn't exist → `status: blocked`. Inform user: "Run /sdd-init first." Do NOT proceed.

### 2. Scan Project Config Files
Detect and extract actionable rules from:

| File | What it controls |
|------|-----------------|
| `.editorconfig` | Indentation, charset, line endings |
| `prettier.config.*` / `.prettierrc*` / `package.json → prettier` | Code formatting rules |
| `eslint.config.*` / `.eslintrc*` | Linting rules, code quality |
| `tsconfig.json` / `tsconfig.app.json` | TypeScript strictness, compiler options |
| `.stylelintrc*` | CSS/SCSS linting |
| `biome.json` | Formatting + linting (Biome) |
| `ruff.toml` / `pyproject.toml [tool.ruff]` | Python linting |
| `clippy.toml` | Rust linting |
| `phpstan.neon` / `phpcs.xml` | PHP linting |
| `checkstyle.xml` / `spotless` | Java formatting |

Extract only rules that affect code generation (indentation, naming, strictness, banned patterns).

### 3. Scan Existing Instruction Files
Read any existing instruction files in `.github/instructions/` and `.claude/rules/`. Identify which were auto-generated (contain `_Auto-updated by /instructions_`) vs manually created. Preserve manual files — only update auto-generated ones.

### 4. Detect target platform

Check which platform directories exist in the project:
- `.claude/` exists → write to `.claude/rules/{name}.md`
- `.github/` exists → write to `.github/instructions/{name}.instructions.md`
- Both exist → write to both (dual-platform project)
- Neither exists → create for the platform currently running this skill

### 5. Generate instruction files by concern

Write each file to the detected platform location(s).

**CRITICAL RULES**:
- NEVER use `applyTo: "**"` — every file MUST target specific file types
- NEVER duplicate info from `openspec/config.yaml` (testing commands, hooks, coverage thresholds → config.yaml only)
- Each file ≤ 200 words — concise, actionable, no filler
- If re-running, MERGE — preserve manual additions, update auto-generated content

#### 5a. Testing instructions (ONLY if test runner detected)

| Stack | applyTo |
|-------|---------|
| Angular/Jasmine | `**/*.spec.ts` |
| React/Jest | `**/*.test.tsx,**/*.test.ts` |
| React/Vitest | `**/*.test.tsx,**/*.test.ts` |
| Python/pytest | `**/test_*.py,**/*_test.py` |
| Python/unittest | `**/test_*.py` |
| Go | `**/*_test.go` |
| Rust | `**/*.rs` (tests inline) |
| Java/JUnit | `**/*Test.java,**/*Tests.java` |
| PHP/PHPUnit | `**/tests/**/*.php,**/*Test.php` |
| Kotlin | `**/*Test.kt` |

Content:
```markdown
---
applyTo: "{test_pattern}"
---
# Testing
_Auto-updated by /instructions on {date}._

- Pattern: {spec file pattern and location convention}
- Framework: {test framework and style, e.g., `describe`/`it`, `test()`, `def test_`}
- {Any testing conventions from config files}

> Runner commands and coverage config: see `openspec/config.yaml` → `x-conductor.testing`
```

#### 5b. Formatting instructions (ONLY if formatting config detected)

| Stack | applyTo |
|-------|---------|
| TypeScript | `**/*.ts,**/*.tsx` |
| Angular templates | `**/*.component.html` |
| Python | `**/*.py` |
| Go | `**/*.go` |
| PHP | `**/*.php` |
| Java | `**/*.java` |
| SCSS/CSS | `**/*.scss,**/*.css` |

Content:
```markdown
---
applyTo: "{source_pattern}"
---
# Formatting & linting
_Auto-updated by /instructions on {date}._

{extracted rules: indentation, charset, quotes, line endings}
{language-specific strictness: TypeScript strict flags, Python type hints, etc.}
{linter rules if applicable}
```

#### 5c. Framework-specific instructions (ONLY if framework detected)

Generate ONE file per framework detected. Name it after the framework.

| Framework | File name | applyTo |
|-----------|-----------|---------|
| Angular | `angular` | `**/*.component.ts,**/*.service.ts,**/*.directive.ts,**/*.pipe.ts,**/*.guard.ts,**/*.component.html` |
| React | `react` | `**/*.tsx,**/*.jsx` |
| Next.js | `nextjs` | `**/app/**/*.tsx,**/pages/**/*.tsx,**/*.tsx` |
| Vue | `vue` | `**/*.vue,**/*.ts` |
| Svelte | `svelte` | `**/*.svelte,**/*.ts` |
| Express | `express` | `**/routes/**/*.ts,**/controllers/**/*.ts,**/middleware/**/*.ts` |
| NestJS | `nestjs` | `**/*.controller.ts,**/*.service.ts,**/*.module.ts,**/*.guard.ts,**/*.dto.ts` |
| Django | `django` | `**/views.py,**/models.py,**/urls.py,**/serializers.py,**/admin.py` |
| FastAPI | `fastapi` | `**/routers/**/*.py,**/models/**/*.py,**/schemas/**/*.py` |
| Flask | `flask` | `**/routes/**/*.py,**/models/**/*.py,**/*.py` |
| Laravel | `laravel` | `**/app/**/*.php,**/routes/**/*.php,**/database/**/*.php` |
| Spring Boot | `spring` | `**/*.java` (in `src/main/`) |
| Gin/Chi/Fiber | `go-web` | `**/handlers/**/*.go,**/routes/**/*.go,**/middleware/**/*.go` |

Content — scan the actual codebase for architecture, directories, entry points and conventions:
```markdown
---
applyTo: "{framework_pattern}"
---
# {Framework} {version}
_Auto-updated by /instructions on {date}._

{1-line stack summary}

## Architecture
{pattern detected from project structure: Component-based/Clean/MVC/Hexagonal/etc.}

## Key Directories
| Path | Purpose |
|------|---------|
{detected modules and what they contain}

## Entry Points
{main files, CLI entrypoints, API roots}

## Conventions
{framework-specific conventions detected from actual project code and config}
{e.g., for Angular: "Standalone components, no NgModules. Use signals for reactivity."}
{e.g., for React: "Functional components with hooks. Use TypeScript strict."}
{e.g., for Django: "Class-based views. Use serializers for API responses."}

## Known Fragile Areas
{leave blank — fill as discovered}
```

> `/sdd-init` does NOT create instruction files. This skill is the ONLY source of instruction files.

#### 5d. Styling instructions (ONLY if CSS/SCSS/styling config detected)

| Stack | applyTo |
|-------|---------|
| SCSS | `**/*.scss` |
| CSS Modules | `**/*.module.css,**/*.module.scss` |
| Tailwind | `**/*.html,**/*.tsx,**/*.jsx,**/*.vue` |

Content: extracted styling conventions (class naming, methodology, preprocessor config).

#### 5e. Principles instructions (ONLY if `openspec/principles.md` exists)

```markdown
---
applyTo: "{source_pattern}"
---
# Project principles
_Sourced from openspec/principles.md. Edit the source, then re-run /instructions._

{content from principles.md — max 5 principles}
```

> Use the detected source pattern (e.g., `**/*.ts,**/*.tsx`), NOT `"**"`. Principles apply when writing code, not when reading docs.

### 6. Return Summary
Report: which platform(s) detected, which instruction files were generated/updated, each with its `applyTo` pattern, which config sources were scanned.

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
- NEVER use `applyTo: "**"` — every file MUST target specific file patterns
- Each file ≤ 200 words — the platform loads ALL matching files per interaction
- ONLY generate files for technologies actually detected — no placeholders
- Write ONLY to detected platform(s) — `.claude/rules/` if Claude, `.github/instructions/` if Copilot, both if dual
- When re-running, MERGE — preserve manual additions, only update auto-generated sections
- Do NOT scan user-level directories — only project-level config
- Instruction files are TEAM artifacts — commit them, review them
