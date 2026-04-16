# Strict TDD Module — Apply Phase

> Loaded ONLY when `strict_tdd: true` AND test runner available.

## The Three Laws

1. Do NOT write production code until you have a failing test
2. Do NOT write more test than is necessary to fail
3. Do NOT write more code than is necessary to pass

## TDD Cycle

For EVERY task:

```
0. SAFETY NET (only if modifying existing files)
   Run existing tests → capture baseline "{N} passing"
   If any FAIL → STOP, report "pre-existing failure"

1. UNDERSTAND
   Read task + spec scenarios + design + existing code/test patterns
   Determine test layer (see below)

2. RED — Write failing test FIRST
   Test references production code that does NOT exist yet
   GATE: do NOT proceed to GREEN until test is written

3. GREEN — Write MINIMUM code to pass
   Fake It is valid (hardcoded returns OK)
   EXECUTE tests → must PASS
   GATE: do NOT proceed until GREEN confirmed

4. TRIANGULATE (MANDATORY by default)
   Add second test case with DIFFERENT inputs/outputs
   If Fake It breaks → generalize to real logic
   MINIMUM: 2 test cases per behavior (happy + edge)
   Skip ONLY when: purely structural, ONE possible output, note reason
   Watch for trivial GREEN: component not rendered, loop 0 times, setup doesn't trigger path

5. REFACTOR — Improve without changing behavior
   Extract constants, functions, improve naming
   EXECUTE tests after EACH step → must STILL PASS

6. Mark task [x]
```

## Choosing Test Layer

| Task type | Layer | Fallback |
|-----------|-------|----------|
| Pure logic, utility, calculation | Unit | — |
| Component rendering, interaction | Integration | Unit + mocks |
| Multi-component flow, API | Integration | Unit + mocks |
| Critical business flow, user journey | E2E | Integration → Unit |

Use HIGHEST available layer. NEVER skip a task because layer unavailable — degrade.

## Test Execution

Run ONLY the relevant test file during TDD cycle, not the full suite. Full suite runs in verify.

## Pure Function Preference

Prefer pure functions (same input → same output, no side effects). TDD naturally pushes toward pure — embrace it.

## Approval Testing (refactoring)

Before touching production code:
1. Write approval tests capturing CURRENT behavior
2. Run → must PASS
3. Refactor production code
4. Run → must STILL PASS
5. If spec says behavior should CHANGE: update test → RED → implement → GREEN

## Assertion Quality Rules

Every assertion MUST: (1) call production code, (2) assert specific expected value, (3) fail if logic changes.

**Banned patterns** (immediate RED flag):
- Tautologies: `expect(true).toBe(true)`
- Type-only: `expect(typeof result).toBe('object')` without value check
- Ghost loops: `for item in []: assert(...)` — zero iterations
- Empty collections: `toHaveLength(0)` without companion non-empty test
- No production call: assertion that never invokes implementation

## Return Summary Extension

```markdown
### TDD Cycle Evidence
| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|

### Test Summary
- Total tests written: {N}
- Total tests passing: {N}
- Layers used: Unit ({N}), Integration ({N}), E2E ({N})
- Pure functions created: {N}
```
