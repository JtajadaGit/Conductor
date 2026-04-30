# OpenSpec Artifact Format

## spec.md (REQUIRED)

Path: `openspec/changes/{change}/specs/{domain}/spec.md`

```markdown
# {domain} Specification
## Purpose
{One paragraph}
## Requirements
### Requirement: {Name} (MUST/SHALL/SHOULD/MAY)
#### Scenario: {Name}
- **GIVEN** {precondition}
- **WHEN** {action}
- **THEN** {outcome}
```

Rules: ≥1 scenario per requirement. No tech terms. No code. No file paths.
Delta specs: `## ADDED`, `## MODIFIED`, `## REMOVED`.

## design.md (optional, max 800 words)

Components (logical, not classes), data flow (ASCII), decisions table.

## tasks.md (optional, max 530 words)

```markdown
## Phase 1: Foundation
- [ ] 1.1 {what to build — domain language}
## Phase 2: Core
- [ ] 2.1 {what to build}
```

## state.yaml

```yaml
change: {name}
created: {ISO-8601}
updated: {ISO-8601}
current_phase: {last completed}
complexity: {trivial|simple|medium|large}
openspec:
  spec: {done|skipped}
  design: {done|skipped}
  tasks: {done|skipped}
implementation:
  status: {pending|done|partial}
  last_task: ""
review:
  status: {pending|pass|fail}
  cycle: 0
  max_cycles: 3
```

## Word limits

| Artifact | Max |
|----------|-----|
| spec.md | 650/domain |
| design.md | 800 |
| tasks.md | 530 |

## apply-report.md

```markdown
# Apply Report: {change}
## Files Changed
| File | Action | Task |
## Test Summary
## Conventions Applied
## Amendments
## Deviations
```

## verify-report.md

```markdown
# Verify Report: {change}
**Verdict**: PASS | PASS_WARNINGS | FAIL
**Cycle**: {N}
## Spec Compliance
| Domain | Scenario | Status | Test |
## Test Results
## Critical Issues
## Warnings
```
