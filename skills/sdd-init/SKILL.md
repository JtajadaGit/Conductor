---
name: sdd-init
description: >
  Initialize Spec-Driven Development context in any project. Detects stack, conventions, testing capabilities, and bootstraps the active persistence backend.
  Trigger: When user wants to initialize SDD in a project, or says "sdd init", "iniciar sdd", "openspec init".
---

## Purpose

You are a sub-agent responsible for initializing the Spec-Driven Development (SDD) context in a project. You detect the project stack, conventions, and testing capabilities, then bootstrap the active persistence backend.

You are an EXECUTOR for this phase, not the orchestrator. Do the initialization work yourself. Do NOT launch sub-agents, do NOT call `delegate` or `task`, and do NOT hand execution back unless you hit a real blocker that must be reported upstream.

## Protocol

> Follow `skills/_shared/sdd-protocol.md` for: persistence modes (§2), directory structure (§3), config reference (§8), and return envelope (§6).

## What to Do

### Step 1: Detect Project Context and Testing Capabilities

Read the project to understand:

**Tech Stack**: Detect project type by scanning for: `package.json` (Node.js), `go.mod` (Go), `pyproject.toml` / `requirements.txt` / `setup.py` (Python), `Cargo.toml` (Rust), `pom.xml` / `build.gradle` (Java/Kotlin), `composer.json` (PHP), `Gemfile` (Ruby), `*.csproj` / `*.sln` (.NET).

**Existing conventions**: linters, test frameworks, CI configurations, architecture patterns.

**Testing Capabilities**: Scan for ALL testing infrastructure:

| Category      | What to detect                | Examples                                                              |
| ------------- | ----------------------------- | --------------------------------------------------------------------- |
| Test runner   | Primary test framework        | jest, vitest, mocha, pytest, go test, cargo test                      |
| Test layers   | Available test types          | unit, integration (@testing-library, httptest), e2e (playwright, cypress) |
| Coverage tool | Code coverage reporter        | istanbul/nyc, c8, coverage.py, pytest-cov, go test -cover            |
| Quality tools | Linter/type-checker/formatter | eslint, pylint, ruff, clippy, tsc --noEmit, mypy, prettier, black    |

For each: record `{tool name, command}` or `NOT AVAILABLE`.

**Strict TDD Mode**: Resolve with this priority chain (first match wins):
1. System prompt / agent config marker `strict-tdd-mode` → use that value
2. Existing `openspec/config.yaml` `strict_tdd` field → use that value
3. Test runner detected → default `strict_tdd: true`
4. No test runner → `strict_tdd: false` (note: "unavailable — no test runner")

Do NOT ask the user interactively. The preference is resolved from existing config.

### Step 2: Initialize Persistence Backend

**If this is a re-init** (openspec/ or .atl/ already exists): READ existing config, MERGE detected values (preserve user-customized rules, update detected fields). Report what was updated vs. preserved.

If mode resolves to `openspec`, create this directory structure:

```
openspec/
├── config.yaml              ← Project-specific SDD config
├── specs/                   ← Source of truth (empty initially)
└── changes/                 ← Active changes
    └── archive/             ← Completed changes
```

### Step 3: Generate and Persist Config

Based on detection, create/update `openspec/config.yaml` (see `sdd-protocol.md` §8 for schema).

Include the detected context, strict_tdd setting, default rules, and testing capabilities as a `testing:` section.

**Testing Capabilities format** (persist in config.yaml):

```yaml
testing:
  strict_tdd: {true/false}
  detected: {date}
  test_runner:
    command: "{command}"
    framework: "{name}"
  layers:
    unit: {true/false}
    integration: {true/false}
    e2e: {true/false}
  coverage:
    available: {true/false}
    command: "{command or empty}"
  quality:
    linter: "{command or empty}"
    type_checker: "{command or empty}"
    formatter: "{command or empty}"
```

If mode is `none`: return detected context without writing project files.

### Step 4: Return Summary

Return a structured summary:

```
## SDD Initialized

**Project**: {project name}
**Stack**: {detected stack}
**Persistence**: {openspec | none}
**Strict TDD Mode**: {enabled ✅ / disabled ❌ / unavailable (no test runner)}

### Testing Capabilities
{summary of detected capabilities}

### Structure Created (openspec only)
- openspec/config.yaml ← Project config with detected context + testing capabilities
- openspec/specs/      ← Ready for specifications
- openspec/changes/    ← Ready for change proposals

### Next Steps
- Run `skill-registry` to build/update the skill registry
- Ready for sdd-explore or sdd-new
```

> **Note**: The orchestrator will invoke `skill-registry` as a separate step after init completes. Do NOT build the skill registry in this phase.

## Rules

- NEVER create placeholder spec files — specs are created via sdd-spec during a change
- ALWAYS detect the real tech stack, don't guess
- NEVER behave like the orchestrator — execute directly and return results
- Keep config.yaml context CONCISE — no more than 10 lines
- ALWAYS detect and persist testing capabilities — downstream phases depend on it
- If Strict TDD Mode is requested but no test runner exists, set strict_tdd: false and explain why
- Return a structured envelope per `sdd-protocol.md` §6
