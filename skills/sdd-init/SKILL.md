---
name: sdd-init
description: >
  Initialize Spec-Driven Development context in any project. Detects stack, conventions, testing capabilities, and bootstraps the active persistence backend.
  Trigger: When user wants to initialize SDD in a project, or says "sdd init", "iniciar sdd", "openspec init".
---

## Purpose

You are a sub-agent responsible for initializing the Spec-Driven Development (SDD) context in a project. You detect the project stack, conventions, and testing capabilities, then bootstrap the active persistence backend.

You are an EXECUTOR for this phase, not the orchestrator. Do the initialization work yourself. Do NOT launch sub-agents, do NOT call `delegate` or `task`, and do NOT hand execution back unless you hit a real blocker that must be reported upstream.

## Execution and Persistence Contract

- If mode is `openspec`: Read and follow `skills/_shared/openspec-convention.md`. Run full bootstrap.
- If mode is `none`: Return detected context without writing project files.

## What to Do

### Step 1: Detect Project Context

Read the project to understand:
- Tech stack:

> Detect project type by scanning for: `package.json` (Node.js), `go.mod` (Go), `pyproject.toml` / `requirements.txt` / `setup.py` (Python), `Cargo.toml` (Rust), `pom.xml` / `build.gradle` (Java/Kotlin), `composer.json` (PHP), `Gemfile` (Ruby), `*.csproj` / `*.sln` (.NET).
- Existing conventions (linters, test frameworks, CI)
- Architecture patterns in use

### Step 2: Detect Testing Capabilities

Scan the project for ALL testing infrastructure. This determines what testing modes are available.

| Category | What to detect | Examples |
|----------|---------------|----------|
| Test runner | Primary test framework | jest, vitest, mocha, ava, pytest, go test, cargo test |
| Test layers | Available test types | unit (test runner exists), integration (@testing-library, httptest, WebApplicationFactory), e2e (playwright, cypress, selenium) |
| Coverage tool | Code coverage reporter | istanbul/nyc, c8, vitest --coverage, coverage.py, pytest-cov, go test -cover, coverlet |
| Quality tools | Linter/type-checker/formatter | eslint, pylint, ruff, clippy, tsc --noEmit, mypy, prettier, black, gofmt |

For each: record `{tool name, command}` or `NOT AVAILABLE`. Check `package.json`, `pyproject.toml`, `go.mod`, `Cargo.toml`, `Makefile` as applicable.

### Step 3: Resolve STRICT TDD MODE

Determine whether Strict TDD Mode should be enabled. The resolution follows a priority chain — first match wins:

```
1. Read from system prompt / agent config (highest priority):
   ├── Search for "strict-tdd-mode" marker in the agent's system prompt file
   │   (e.g., CLAUDE.md, GEMINI.md, .cursorrules, etc.)
   ├── If found and says "enabled" → strict_tdd: true
   ├── If found and says "disabled" → strict_tdd: false
   └── This is the preference set by the user in the agent TUI or config

2. If no marker found, check openspec config:
   ├── Read openspec/config.yaml → strict_tdd field
   └── If found → use that value

3. If nothing found AND test runner was detected in Step 2:
   ├── Default: strict_tdd: true (enable if the project CAN do TDD)
   └── This ensures TDD is active even without a TUI setup

4. If no test runner detected:
   ├── strict_tdd: false (cannot enable without test runner)
   └── Include NOTE in summary: "Strict TDD Mode unavailable — no test runner detected"
```

**Do NOT ask the user interactively.** The preference is resolved from existing config. If the user wants to change it, they set `strict_tdd` directly in `openspec/config.yaml`.

### Step 4: Initialize Persistence Backend

If mode resolves to `openspec`, create this directory structure:

```
openspec/
├── config.yaml              ← Project-specific SDD config
├── specs/                   ← Source of truth (empty initially)
└── changes/                 ← Active changes
    └── archive/             ← Completed changes
```

### Step 5: Generate Config (openspec mode)

Based on what you detected, create the config when in `openspec` mode:

```yaml
# openspec/config.yaml
schema: spec-driven

context: |
  Tech stack: {detected stack}
  Architecture: {detected patterns}
  Testing: {detected test framework}
  Style: {detected linting/formatting}

strict_tdd: {true/false}

rules:
  proposal:
    - Include rollback plan for risky changes
    - Identify affected modules/packages
  specs:
    - Use Given/When/Then format for scenarios
    - Use RFC 2119 keywords (MUST, SHALL, SHOULD, MAY)
  design:
    - Include sequence diagrams for complex flows
    - Document architecture decisions with rationale
  tasks:
    - Group tasks by phase (infrastructure, implementation, testing)
    - Use hierarchical numbering (1.1, 1.2, etc.)
    - Keep tasks small enough to complete in one session
  apply:
    - Follow existing code patterns and conventions
    - Load relevant coding skills for the project stack
  verify:
    - Run tests if test infrastructure exists
    - Compare implementation against every spec scenario
  archive:
    - Warn before merging destructive deltas (large removals)
```

### Step 6: Persist Testing Capabilities

**This step is MANDATORY — do NOT skip it.**

Persist detected testing capabilities as a section in config.yaml (openspec). This cache prevents re-detection on every `sdd-apply` and `sdd-verify` run.

**Testing Capabilities format**:

```markdown
## Testing Capabilities

**Strict TDD Mode**: {enabled/disabled}
**Detected**: {date}

### Test Runner
- Command: `{command}`
- Framework: {name}

### Test Layers
| Layer | Available | Tool |
|-------|-----------|------|
| Unit | ✅ / ❌ | {tool or —} |
| Integration | ✅ / ❌ | {tool or —} |
| E2E | ✅ / ❌ | {tool or —} |

### Coverage
- Available: ✅ / ❌
- Command: `{command or —}`

### Quality Tools
| Tool | Available | Command |
|------|-----------|---------|
| Linter | ✅ / ❌ | {command or —} |
| Type checker | ✅ / ❌ | {command or —} |
| Formatter | ✅ / ❌ | {command or —} |
```

If mode is `openspec`, also write this as a section in `openspec/config.yaml` under `testing:`.

### Step 7: Build Skill Registry

Follow the same logic as the `skill-registry` skill (`skills/skill-registry/SKILL.md`):

1. Scan user skills: glob `*/SKILL.md` across ALL known skill directories. **User-level**: `~/.claude/skills/`, `~/.config/opencode/skills/`, `~/.gemini/skills/`, `~/.cursor/skills/`, `~/.copilot/skills/`, parent of this skill file. **Project-level**: `.claude/skills/`, `.gemini/skills/`, `.agent/skills/`, `skills/`. Skip `sdd-*`, `_shared`, `skill-registry`. Deduplicate by name (project-level wins). Read frontmatter triggers.
2. Scan project conventions: check for `agents.md`, `AGENTS.md`, `CLAUDE.md` (project-level), `.cursorrules`, `GEMINI.md`, `copilot-instructions.md` in the project root. If an index file is found (e.g., `agents.md`), READ it and extract all referenced file paths — include both the index and its referenced files in the registry.
3. **ALWAYS write `.atl/skill-registry.md`** in the project root (create `.atl/` if needed). This file is mode-independent — it's infrastructure, not an SDD artifact.

See `skills/skill-registry/SKILL.md` for the full registry format and scanning details.

### Step 8: Persist Project Context

**This step is MANDATORY — do NOT skip it.**

If mode is `openspec`: the config was already written in Step 5.

### Step 9: Return Summary

Return a structured summary adapted to the resolved mode:

#### If mode is `openspec`:
```
## SDD Initialized

**Project**: {project name}
**Stack**: {detected stack}
**Persistence**: openspec
**Strict TDD Mode**: {enabled ✅ / disabled ❌ / unavailable (no test runner)}

### Testing Capabilities
{same table as above}

### Structure Created
- openspec/config.yaml ← Project config with detected context + testing capabilities
- openspec/specs/      ← Ready for specifications
- openspec/changes/    ← Ready for change proposals

### Next Steps
Ready for /sdd-explore <topic> or /sdd-new <change-name>.
```

#### If mode is `none`:
```
## SDD Initialized

**Project**: {project name}
**Stack**: {detected stack}
**Persistence**: none (ephemeral)
**Strict TDD Mode**: {enabled ✅ / disabled ❌ / unavailable (no test runner)}

### Testing Capabilities
{same table as above}

### Context Detected
{summary of detected stack and conventions}

### Recommendation
Enable `openspec` for artifact persistence across sessions. Without persistence, all SDD artifacts will be lost when the conversation ends.

### Next Steps
Ready for /sdd-explore <topic> or /sdd-new <change-name>.
```

## Rules

- NEVER create placeholder spec files - specs are created via sdd-spec during a change
- ALWAYS detect the real tech stack, don't guess
- NEVER behave like the orchestrator from this phase - execute directly and return results
- If the project already has an `openspec/` directory:

> If `openspec/` already exists with a valid `config.yaml`, READ the existing config. MERGE detected values into it (preserve user-customized rules, update detected fields like testing capabilities). Report what was updated vs. preserved.
- Keep config.yaml context CONCISE - no more than 10 lines
- ALWAYS detect testing capabilities — this is not optional
- ALWAYS persist testing capabilities as a separate observation/section — downstream phases depend on it
- If Strict TDD Mode is requested but no test runner exists, set strict_tdd: false and explain why
- Return a structured envelope with: `status`, `executive_summary`, `detailed_report` (optional), `artifacts`, `next_recommended`, and `risks`
