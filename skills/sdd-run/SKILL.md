---
name: sdd-run
description: "Run the full Spec-Driven Development pipeline deterministically for a feature request. A bundled driver runs every phase in order with a deterministic gate — phases cannot be skipped, regardless of model. Use this to build a feature the SDD way end-to-end."
---

<!-- conductor-role: run -->

# SDD Run

The pipeline runs inside the conductor APP (a local web at `http://127.0.0.1:4750`) — not in this chat. Your ENTIRE job is **one command + one short message**.

## 1. Launch (foreground shell — it exits in seconds)
Run `run.mjs` from this skill's base directory with Node:
- `--request "<user's feature request, verbatim>"`
- `--project "<absolute project root>"`
- `--complexity simple|medium|complex` (simple = small single-capability change)
- `--name <kebab-feature-name>` REQUIRED — meaningful, you derive it (e.g. `counter-component`), never the raw sentence
- `--domain <single-noun>` REQUIRED (e.g. `counter`)

The launcher hands the run to the conductor app and EXITS immediately printing `🌐 SIGUE EL RUN EN VIVO: <url>` and `✅ LAUNCHED`.

## 2. Your one message, then task complete
Tell the user: the run URL (verbatim from the output) + "todo se gestiona ahí: pausas de revisión, aprobar, detener, resultado final e informes". Then mark the task COMPLETE and STOP.
- Do NOT wait for the pipeline, poll, read produced files, run tests, call conductor MCP tools, or relaunch. The app owns the run; results (GREEN/dashboard/AI Act report) live in the app.
- If the output says a run was already in progress, that same URL is the place to watch it — report it and complete.
- `✅ LAUNCHED` / `✅ TASK COMPLETE` in the output = success, exit code 0 = success. Anything else: report the error text verbatim and stop (no retries).
- If the model/agent is unavailable, tell the user to set the BYOK env and stop.
