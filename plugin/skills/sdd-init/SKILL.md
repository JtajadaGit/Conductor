---
name: sdd-init
description: >
  Initialize SDD pipeline — detect tech stack, bootstrap openspec/ persistence
  structure. Use when setting up Conductor in a new or existing project.
user-invocable: true
disable-model-invocation: true
---

## Purpose

Bootstrap `openspec/` — the persistence layer for the SDD pipeline. Detects stack, testing and architecture and stores them in `openspec/config.yaml` (OpenSpec rules + detected stack/testing metadata). The **executable** pipeline config (models per phase, lenses, pauses, custom pipeline, checks) lives in `openspec/conductor.json` and is run by the **deterministic driver** — the code drives the phases in order; there are no agents to dispatch.

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

### 5b. `.copilotignore` (lo genera el MOTOR — no lo escribas a mano)

**No escribas `.copilotignore` manualmente.** El paso **5b2** (`conductor_init_config`) lo genera de forma **DETERMINISTA** desde el motor, en el root del proyecto (exclusión de contexto = ahorro directo de tokens; idempotente, **nunca pisa** el del usuario). El host Copilot lo honra de forma nativa. (Contenido: `node_modules/`, `dist/`, `build/`, `out/`, `target/`, `coverage/`, `.angular/`, `*.log`, `*.lock`, lockfiles, `.env*`, `*.pem`, `*.key`, `*.min.js`, `*.map`, `openspec/changes/**/.conductor/`.)

### 5b2. Scaffold the user config (editor autocomplete)

Call the MCP tool **`conductor_init_config`** with `{ "openspecDir": "<abs project root>/openspec" }`. It creates `openspec/conductor.json` (only if missing) + its JSON Schema for editor validation. Do not write these files yourself.

### 5c. Ignore conductor's internal plumbing in git

If the project has a `.gitignore`, ensure it contains the line `openspec/changes/**/.conductor/` (append it if missing). Those are conductor's internal run files (state/telemetry) — never committed, never edited by hand.

### 6. Generate `openspec/config.yaml`

The config.yaml has two sections: OpenSpec standard fields + Conductor extensions with the **declarative pipeline**.

```yaml
schema: spec-driven

# Absolute path of the project root (detect it now with the shell, e.g. `Get-Location`/`pwd`).
# Agents pass it to conductor_gate as an ABSOLUTE changeDir, because the MCP server may run in a
# different working directory than the project and relative paths would not resolve.
project_root: "{absolute path of this project}"

# OpenSpec standard
context: "{framework} {version}, {language} strict, {package_manager}"
rules:
  proposal:
    - Why, What Changes, Capabilities, Impact — no architecture
  specs:
    - Use Given/When/Then format
    - Clean Requirement headers; SHALL/MUST in the normative sentence, never in the header
  design:
    - Logical responsibilities only; no class/file names
  tasks:
    - Size tasks for single-session completion
    - Use checkbox format `- [ ] N.M {description}`

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

  # PIPELINE — DESCRIPTIVO solo: documenta el flujo de fases por defecto. El motor NO lee config.yaml.
  # El pipeline EJECUTABLE (reordenar/omitir fases, modelos por fase, lentes, pausas, checks, comandos de
  # test/build in-loop, post_hook) vive en openspec/conductor.json (su propio JSON Schema). El driver
  # DETERMINISTA recorre las fases por complejidad y asigna el rol en código — no hay agentes que despachar.
  pipeline:
    max_review_cycles: 2
    phases:
      - name: explore
        optional: true
        artifact: exploration.md
      - name: propose
        optional: false
        artifact: proposal.md
      - name: clarify
        optional: true
        artifact: questions.md
      - name: spec
        optional: false
        artifact: specs/{domain}/spec.md
      - name: design
        optional: true
        artifact: design.md
      - name: tasks
        optional: true
        artifact: tasks.md
      - name: apply
        optional: false
        artifact: apply-report.md
      - name: verify
        optional: false
        artifact: verify-report.md
```

### 7. Return Summary

Report: stack detected, architecture pattern, strict TDD, openspec files created.

The deterministic gate engine ships WITH the plugin as an MCP server (declared in the plugin
manifest, auto-registered on install) — there is NOTHING extra to install and NO path to configure.
Confirm it is reachable: check that the `conductor_gate` tool is available (e.g. `/mcp` shows the
`conductor` server). If it is not visible, tell the user their CLI/IDE may need a restart or a
version that loads plugin MCP servers; the pipeline still runs (reviewer falls back to AI review + tests).

Optionally, generate a CI job that runs the gate on PRs (the engine is installed in CI via the
company package; the workflow calls `conductor gate ...` by command name).

Always end with this exact text (print it, do NOT execute it):
> Run `/sdd-instructions` to generate platform instruction files for your stack.

**STOP here. Do NOT invoke /sdd-instructions or any other skill. The user will run it manually if needed.**

## Rules

- NEVER create placeholder spec files.
- ALWAYS detect real stack from project files, don't guess.
- `/sdd-init` owns `openspec/` ONLY — does NOT write to `.github/instructions/`.
- **In-loop test/build commands are OFF by default.** (If you ever want them, set them in `openspec/conductor.json`'s `verify` phase — never in `config.yaml`, which the engine does not read.) conductor's in-loop verification is the **deterministic gate** (tech-agnostic, instant) plus the apply phase's fast `post_hook` check — NOT the project's full test suite. The full test/build is delegated to **CI** (generate it with the CI workflow), where latency/quirks are acceptable. This keeps the plugin agnostic and prevents any slow or non-terminating test runner from blocking the pipeline. Store the detected commands under `x-conductor.testing` (metadata, for the CI generator) — do NOT wire them as in-loop verify commands by default.
- If the user explicitly wants in-loop tests, the configured command MUST be the runner's **single-run / non-watch** invocation, called via the runner's own binary (not via a package-manager script wrapper, which often fails to pass flags and leaves the process in watch mode → hangs). Use only real, documented flags of that runner; never invent flags. It MUST be a command you are confident terminates on its own.
- For `verify`, never use a production/optimized build — it is slow and redundant (the tests, or the apply `post_hook`, already compile the code). A verify build, if any, is a fast check only.
- Fill the apply-phase `post_hook` with the stack's FAST static/type check if one exists — the cheap in-loop "does it compile" signal.
