---
name: sdd-init
description: >
  Initialize SDD pipeline — detect tech stack, bootstrap openspec/ persistence
  structure. Use when setting up Conductor in a new or existing project.
user-invocable: true
disable-model-invocation: true
---

## Purpose

Bootstrap `openspec/` — the persistence layer for the SDD pipeline. Detects stack, testing, architecture and stores it as executable config in `openspec/config.yaml`. This file drives agent behavior — which agents run, what hooks execute, in what order.

**Does NOT generate instruction files.** This skill ONLY creates `openspec/`. It must NOT invoke `/sdd-instructions` or any other skill — the user decides what to run next.

## Order

### 1. Detect Stack

Scan the project root for language/framework manifest files (exclude dependency directories). Identify: primary language, runtime, version, framework, and package manager.

### 2. Detect Testing

Identify the project's testing infrastructure: test runner and framework, available test layers (unit, integration, e2e), coverage tooling, and quality tools (linter, type-checker, formatter).

### 3. Detect Architecture

Identify architecture style, key modules/packages, entry points, and conventions from project structure.

### 4. Resolve strict_tdd

Priority chain (first match wins):
1. Existing `openspec/config.yaml` `x-conductor.strict_tdd` → use value
2. Test runner detected → default `true`
3. No test runner → `false`

### 5. Initialize Persistence

- **Re-init** (openspec/ exists): READ existing config, MERGE (preserve user rules, update detected fields).
- **First-init**: Create openspec structure directly.
- Create structure using **RELATIVE paths only**:
  ```
  openspec/
  ├── config.yaml
  ├── specs/
  └── changes/
      └── archive/
  ```

### 5b. Generate `.copilotignore` (if not exists)

If `.copilotignore` does not exist, create it with standard exclusions (node_modules, dist, build, .env, locks, coverage, logs).

### 6. Generate `openspec/config.yaml`

The config.yaml has two sections: OpenSpec standard fields + Conductor extensions with the **declarative pipeline**.

```yaml
schema: spec-driven

# OpenSpec standard
context: "{framework} {version}, {language} strict, {package_manager}"
rules:
  specs:
    - Use Given/When/Then format
  tasks:
    - Size tasks for single-session completion

# Conductor extensions
x-conductor:
  stack:
    language: ""
    runtime: ""
    version: ""
    framework: ""
    package_manager: ""
  monorepo: false
  auto_mode: false
  strict_tdd: false
  testing:
    detected: ""
    test_runner: { command: "", framework: "" }
    layers: { unit: false, integration: false, e2e: false }
    coverage: { available: false, command: "" }
    quality: { linter: "", type_checker: "", formatter: "" }

  # DECLARATIVE PIPELINE — the orchestrator reads this and dispatches agents in order
  pipeline:
    max_review_cycles: 3
    agent_timeout_seconds: 300
    phases:
      - name: explore
        agent: sdd-planner
        optional: true
        artifact: exploration.md
        max_words: 400

      - name: propose
        agent: sdd-planner
        optional: true
        artifact: proposal.md
        max_words: 400

      - name: clarify
        agent: sdd-planner
        optional: true
        artifact: questions.md
        max_words: 300

      - name: spec
        agent: sdd-planner
        optional: false
        artifact: specs/{domain}/spec.md
        max_words: 650

      - name: design
        agent: sdd-planner
        optional: true
        artifact: design.md
        max_words: 800

      - name: tasks
        agent: sdd-planner
        optional: true
        artifact: tasks.md
        max_words: 530

      - name: apply
        agent: sdd-coder
        optional: false
        artifact: apply-report.md
        pre_hook: ""
        post_hook: ""
        post_hook_on_fail: retry
        post_hook_max_retries: 3

      - name: verify
        agent: sdd-reviewer
        optional: false
        artifact: verify-report.md
        test_command: ""
        build_command: ""
        coverage_threshold: 0

      - name: archive
        agent: orchestrator
        optional: true
```

### 7. Return Summary

Report: stack detected, architecture pattern, strict TDD, openspec files created.
Always end with this exact text (print it, do NOT execute it):
> Run `/sdd-instructions` to generate platform instruction files for your stack.

**STOP here. Do NOT invoke /sdd-instructions or any other skill. The user will run it manually if needed.**

## Rules

- NEVER create placeholder spec files.
- ALWAYS detect real stack from project files, don't guess.
- `/sdd-init` owns `openspec/` ONLY — does NOT write to `.github/instructions/`.
- ALL test/build commands MUST include flags to prevent watch mode (`--watch=false`, `--no-watch`, `--single-run`, `--browsers=ChromeHeadless`). NEVER generate bare `ng test` or `npm test`.
- Fill `test_command` and `build_command` in the verify phase with detected commands + non-interactive flags.
- Fill `post_hook` in the apply phase with type-check command if available (e.g., `npx tsc --noEmit`).
