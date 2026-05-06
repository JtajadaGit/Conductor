# OpenSpec Artifact Format

## Directory structure

```
openspec/
├── specs/                           # Source of truth (promoted from changes)
│   └── {domain}/
│       └── spec.md
├── changes/
│   ├── {change-name}/               # Active change
│   │   ├── proposal.md              # WHY: intent, scope, approach
│   │   ├── specs/                   # Delta specs
│   │   │   └── {domain}/
│   │   │       └── spec.md          # GIVEN/WHEN/THEN requirements
│   │   ├── design.md                # HOW: technical approach (tech-agnostic)
│   │   ├── tasks.md                 # Checklist with hierarchical numbering
│   │   └── state.yaml               # Pipeline state (Conductor extension)
│   └── archive/
│       └── YYYY-MM-DD-{name}/       # Completed changes (audit trail)
└── config.yaml                      # Project config
```

## STRICT naming rules

| Artifact | Filename | Location | Format |
|----------|----------|----------|--------|
| Exploration | `exploration.md` | change root | Markdown (Conductor extension) |
| Proposal | `proposal.md` | change root | Markdown |
| Spec | `spec.md` | `specs/{domain}/spec.md` | Markdown, GIVEN/WHEN/THEN |
| Design | `design.md` | change root | Markdown |
| Tasks | `tasks.md` | change root | Markdown with checkboxes |
| State | `state.yaml` | change root | YAML (Conductor extension) |
| Apply report | `apply-report.md` | change root | Markdown (Conductor extension) |
| Verify report | `verify-report.md` | change root | Markdown (Conductor extension) |

**FORBIDDEN variant names:**
- `explore.md` → use `exploration.md`
- `propose.md` → use `proposal.md`
- `fix-report.md` → append to `apply-report.md`
- `verify-report-final.md` → overwrite `verify-report.md`

### FORBIDDEN files inside openspec/
- NO `.yaml` specs (use `.md`)
- NO `.json` tasks (use `.md`)
- NO `contract.api.yaml`
- NO `README.md`
- NO mock data, fixtures, or config files
- NO code files

## spec.md format — ZERO CODE

Specs use GIVEN/WHEN/THEN in domain language. ZERO TypeScript, ZERO class names, ZERO file paths.

**For new features (delta spec in changes/):**
```markdown
# {Domain} Specification

## Purpose
{One paragraph — what this domain does in domain language}

## ADDED Requirements

### Requirement: {Name} (MUST/SHALL/SHOULD/MAY)

#### Scenario: {Descriptive Name}
- **GIVEN** {precondition}
- **WHEN** {action}
- **THEN** {outcome}
- **AND** {additional outcome}
```

**For modifications to existing specs:**
```markdown
## MODIFIED Requirements
### Requirement: {Name}
{updated scenarios}

## REMOVED Requirements
### Requirement: {Name}
{reason for removal}
```

**WRONG** (code in spec):
```
interface Product { id: string; name: string; }
```
**RIGHT** (domain language):
```
A product has a unique identifier, a display name, a price, and a category.
```

## tasks.md format

```markdown
## Phase 1: Foundation
- [ ] 1.1 {what to build — domain language}
- [ ] 1.2 {what to build}

## Phase 2: Core
- [ ] 2.1 {what to build}
```

## design.md format

```markdown
# Design: {change-name}
## Components
{Logical responsibilities — NOT class/file names}
## Data Flow
{How data moves}
## Decisions
| Decision | Why | Alternatives |
```

## state.yaml format (Conductor extension) — MAX 15 LINES

```yaml
change: {kebab-name}
status: planning | implementing | reviewing | complete | blocked
complexity: simple | medium | complex
current_phase: {last-phase}
phases:
  explore: done
  propose: done
  clarify: done | skipped
  spec: done
  design: done | skipped
  tasks: done | skipped
  apply: done
  verify: pass | fail
```

Skipped phases MUST be marked as `skipped`, not omitted.
NO summaries, NO metrics, NO exploration findings. Just phase tracking.

## Word limits

| Artifact | Max words |
|----------|-----------|
| proposal.md | 400 |
| spec.md | 650 per domain |
| design.md | 800 |
| tasks.md | 530 |
