# Strict TDD Module — Verify Phase

> Loaded ONLY when `strict_tdd: true` AND test runner available.

## TDD Compliance Check

Read apply phase return envelope → find TDD Cycle Evidence table:

For each task row:
- **RED**: must say "✅ Written". Verify test file EXISTS. CRITICAL if missing.
- **GREEN**: must say "✅ Passed". Cross-reference with test execution — test must PASS now. CRITICAL if fails.
- **TRIANGULATE**: if "✅ N cases" → verify N test cases exist. If "➖ Single" → verify spec truly has only 1 scenario. WARNING if multiple scenarios but 1 test.
- **SAFETY NET**: if "✅ N/N" → OK. If "N/A (new)" → verify file was actually new. WARNING if modified but no safety net.
- **REFACTOR**: not verifiable (subjective), skip.

If NO TDD Evidence table found → CRITICAL (protocol not followed).

Summary: "{N}/{total} tasks have complete TDD evidence"

## Test Layer Distribution

Classify test files by layer:
- **Unit**: no render(), no page., mocked dependencies
- **Integration**: render(), screen., userEvent., testing-library
- **E2E**: page.goto(), playwright/cypress imports

Report: Unit ({N} tests / {N} files), Integration ({N}/{N}), E2E ({N}/{N})

Cross-reference with capabilities: WARNING if tests use tools not detected.

## Changed File Coverage

If coverage tool available:
1. Run `{test_command} --coverage`
2. Filter to ONLY changed files
3. Per-file: line %, branch %, uncovered ranges
   - ≥95% → ✅ Excellent
   - ≥80% → ⚠️ Acceptable
   - <80% → ⚠️ Low (list uncovered lines)
4. WARNING if any changed file <80%

If not available: "Coverage analysis skipped — no coverage tool detected"

## Assertion Quality Audit

Scan ALL test files for banned patterns:
- Tautologies: `expect(true).toBe(true)` → CRITICAL
- Type-only: `typeof` without value check → WARNING
- Ghost loops: iterates zero times → CRITICAL
- Empty collections: `toHaveLength(0)` without companion non-empty → WARNING
- No production call → CRITICAL

Flag triangulation quality: WARNING if 1 test case for behavior with multiple spec scenarios.

## Quality Metrics

Run on changed files only, if tools available:
- **Linter**: errors/warnings → WARNING, SUGGESTION
- **Type checker**: errors → WARNING

If neither available: "Quality metrics skipped — no tools detected"

## Report Template Extension

```markdown
### TDD Compliance
| Check | Result | Details |
|-------|--------|---------|
| TDD Evidence reported | ✅/❌ | |
| All tasks have tests | ✅/❌ | {N}/{total} |
| RED confirmed | ✅/⚠️ | {N}/{total} test files verified |
| GREEN confirmed | ✅/❌ | {N}/{total} pass on execution |
| Triangulation adequate | ✅/⚠️/➖ | |
| Safety Net for modified | ✅/⚠️ | |

### Test Layer Distribution
| Layer | Tests | Files | Tools |
|-------|-------|-------|-------|

### Changed File Coverage
| File | Line % | Branch % | Uncovered | Rating |
|------|--------|----------|-----------|--------|

### Assertion Quality
| File | Line | Assertion | Issue | Severity |
|------|------|-----------|-------|----------|

### Quality Metrics
**Linter**: ✅/⚠️/❌/➖ | **Type Checker**: ✅/❌/➖
```
