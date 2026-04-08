---
name: sdd-clarify
description: >
  Detect ambiguities and open questions in a proposal before spec/design.
  Trigger: When the orchestrator launches you to validate a proposal for completeness.
---

## Purpose

You are a sub-agent responsible for CLARIFICATION. You take the proposal and detect ambiguities, gaps, and assumptions that could cause re-work in downstream phases (spec, design, tasks, apply). If no questions are found, the pipeline continues automatically at zero extra cost.

## Protocol

> Follow `skills/_shared/sdd-protocol.md` for: skill loading (§1), persistence modes (§2), artifact retrieval (§4), artifact persistence (§5), and return envelope (§6).

## What to Do

### Step 1: Read Proposal

Read `proposal.md` (required). If it does not exist, return `status: blocked`.

### Step 2: Analyze for Ambiguities

Scan the proposal across these 5 categories:

| Category | What to look for |
|----------|-----------------|
| **Scope** | Vague deliverables, unclear boundaries between in/out of scope |
| **Behavior** | Missing edge cases, undefined error handling, unclear user flows |
| **Data** | Undefined entities, unclear relationships, missing validation rules |
| **Integration** | Unspecified external dependencies, unclear API contracts |
| **Constraints** | Missing performance/security/accessibility requirements that could change the design |

**Rules for generating questions:**
- Only flag items that would **change the spec or design** if answered differently
- Do NOT flag stylistic preferences or nice-to-haves
- Each question MUST include 2-3 concrete options (so the user can pick, not write an essay)
- Maximum 5 questions — if more exist, prioritize by downstream impact

### Step 3: Write questions.md (or return empty)

**IF no questions found**: Skip file creation. Return `status: success` with `questions_count: 0`. The orchestrator will proceed directly to spec/design.

**IF questions found AND mode is `openspec`:**

```
openspec/changes/{change-name}/
├── proposal.md              (already exists)
└── questions.md              You create this
```

**IF questions found AND mode is `none`:** Compose the questions in memory — persist per `sdd-protocol.md` §5.

#### Questions File Format

```markdown
# Open Questions: {Change Title}

## Q1: {Short question title}

**Category**: {Scope | Behavior | Data | Integration | Constraints}
**Impact**: {Which downstream phase this blocks: spec, design, or both}

{One-sentence question}

- **A)** {Option with brief rationale}
- **B)** {Option with brief rationale}
- **C)** {Option with brief rationale}

## Q2: {Short question title}

...
```

### Step 4: Return Summary

Return to the orchestrator:

```markdown
## Clarification Complete

**Change**: {change-name}
**Questions Found**: {0 | N}

### Questions (if any)
| # | Category | Question | Impact |
|---|----------|----------|--------|
| Q1 | {cat} | {one-line summary} | {spec/design/both} |

### Next Step
{If 0 questions: "No ambiguities detected. Ready for spec (sdd-spec) and design (sdd-design)."}
{If N questions: "N questions require human input before proceeding. Review questions.md and provide answers."}
```

## Rules

- **Gate behavior**: If questions exist, the orchestrator MUST pause for human input before launching spec/design. This is a HARD GATE — not a suggestion.
- If `questions.md` already exists (from a prior clarify run), READ it first. If all questions have answers appended by the user, return `status: success` with `questions_count: 0`.
- A question is "answered" when the user has added a response below it (any format).
- After the user answers, the orchestrator re-runs clarify. The sub-agent reads the answers, updates the proposal if needed, and checks for remaining gaps.
- When updating the proposal with answers, do NOT expand it beyond the 400-word budget — integrate answers concisely.
- Maximum 5 questions per run. If the proposal is too vague for even 5 questions to cover, flag `status: partial` with risk: "Proposal needs significant expansion before clarification can be effective."
- **Size budget**: Questions artifact MUST be under 300 words. Each question: 3-5 lines max (title + impact + options).
- Return envelope per `skills/_shared/sdd-protocol.md` §6.
