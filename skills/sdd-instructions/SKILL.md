---
name: sdd-instructions
description: >
  Generate scoped instruction files from detected stack and project config.
  Copilot: .github/instructions/*.instructions.md (applyTo pattern).
  Claude Code: .claude/rules/*.md (paths pattern).
  Each file = HOW to write code for a specific concern (testing, framework, formatting, styling).
user-invocable: true
disable-model-invocation: true
---

## Purpose

Generate scoped instruction files that AI tools load automatically **when editing matching files**. Each file tells the AI HOW to write code: patterns, conventions, architecture, code examples.

These are the **shared team contract** — every AI agent reads the same rules when touching relevant files.

This skill NEVER creates `copilot-instructions.md`, `CLAUDE.md`, or any repo-level file. Only scoped files with `applyTo` (Copilot) or `paths` (Claude Code).

## Order

### 1. Read Stack

Read `openspec/config.yaml` → extract `x-conductor.stack`, `testing`, `quality` fields.
If config doesn't exist → `status: blocked`. "Run /sdd-init first."

### 2. Scan Project Config Files

Read actual project configs to extract rules:
- `tsconfig.json` → strict mode, paths, target
- `angular.json` → builder, budgets, assets, styles config
- `package.json` → scripts, dependencies, prettier/eslint config
- `.editorconfig` → indentation, charset, line endings
- `.eslintrc*` / `eslint.config.*` → linting rules
- `.prettierrc*` → formatting rules
- Any framework-specific configs (e.g., `karma.conf.js`, `jest.config.*`, `playwright.config.*`)

### 3. Scan Existing Instruction Files

Read existing files in `.github/instructions/` and/or `.claude/rules/`:
- **Auto-generated** (contains `_Auto-updated by /sdd-instructions_`) → update candidate
- **Manually created** → NEVER modify

**Skip if up-to-date**: If auto-generated files exist AND match current detected stack → "No changes needed."
**Merge on re-run**: Update auto-generated sections, preserve manual additions.

### 4. Detect Target Platform

Detect which platform is in use. Write ONLY to the detected platform — NEVER write to both unless both exist.

- `.github/` exists AND `.claude/` does NOT exist → **Copilot only**. Write to `.github/instructions/`.
- `.claude/` exists AND `.github/` does NOT exist → **Claude Code only**. Write to `.claude/rules/`.
- Both exist → write to both.
- Neither exists → create ONLY for the platform currently running this skill.

**NEVER create `copilot-instructions.md`, `CLAUDE.md`, or any repo-level file. Only scoped files.**

### 5. Generate Scoped Instruction Files

#### 5a. Testing instructions (ONLY if test runner detected)

Scope: `applyTo: "**/*.spec.ts"` (or detected test pattern)

```markdown
---
applyTo: "{test_file_pattern}"
---
# Testing
_Auto-updated by /sdd-instructions on {date}._

## Setup
- Framework: {Jasmine/Jest/Vitest} with {Angular TestBed / React Testing Library / etc.}
- Pattern: `*.spec.ts` colocated with source file

## Structure
```typescript
// GOOD: clear describe/it blocks with TestBed
describe('ComponentName', () => {
  let component: ComponentName;
  let fixture: ComponentFixture<ComponentName>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ComponentName],
      providers: [/* mock dependencies */]
    }).compileComponents();
    fixture = TestBed.createComponent(ComponentName);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
```

## Rules
- One `describe` per class/function
- Mock external services with spies: `jasmine.createSpyObj('Name', ['method'])`
- Use `fakeAsync`/`tick` for async operations, not raw `setTimeout`
- Test observable streams with `subscribe` + `done` callback or `firstValueFrom`
- {Additional rules from detected test config}

## Never
- Import real HTTP services in unit tests — use HttpClientTestingModule
- Use `fit` or `fdescribe` in committed code
- Skip tests with `xit`/`xdescribe` without a TODO comment
```

#### 5b. Formatting instructions (ONLY if formatting config detected)

Scope: `applyTo: "**/*.ts,**/*.html,**/*.css"`

```markdown
---
applyTo: "{source_pattern}"
---
# Formatting
_Auto-updated by /sdd-instructions on {date}._

- Indent: {N} spaces (no tabs)
- Quotes: {single/double} for {language}
- Semicolons: {always/never}
- Trailing comma: {es5/all/none}
- Max line length: {N} characters
- Final newline: always
- {Additional rules from .editorconfig / .prettierrc}

## TypeScript specifics
- Use `const` by default, `let` only when reassignment needed
- Prefer template literals over string concatenation
- Destructure objects and arrays when accessing 2+ properties
- {Key rules from tsconfig: strict, noImplicitAny, etc.}
```

#### 5c. Framework instructions (ONLY if framework detected)

Scope: `applyTo: "src/**/*.ts,src/**/*.html"`

Include REAL code examples from the project. Scan the codebase for actual patterns.

```markdown
---
applyTo: "{framework_source_pattern}"
---
# {Framework} {version}
_Auto-updated by /sdd-instructions on {date}._

{1-line stack summary}

## Architecture
{Detected: standalone components / modules / etc.}

## Component Pattern
```typescript
// GOOD: Standalone component with signal-based APIs
@Component({
  selector: 'app-example',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './example.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExampleComponent {
  private readonly service = inject(ExampleService);
  readonly items = this.service.items;  // signal
}
```

```typescript
// BAD: Legacy patterns — do NOT use
@Component({ /* no standalone: true */ })
export class OldComponent {
  @Input() data: any;  // use input() signal + typed
  constructor(private service: ExampleService) {}  // use inject()
}
```

## Service Pattern
- Use `providedIn: 'root'` for singletons
- Use `inject()` function, not constructor injection
- {Detected patterns from actual services in the project}

## Routing
- Routes in `app.routes.ts` (standalone routing)
- Lazy load with `loadComponent: () => import('./feature')`
- {Detected route patterns}

## Key Directories
| Path | Purpose |
|------|---------|
{scan actual src/ structure}

## Never
- Use NgModules for new components (standalone only)
- Use `@Input()` / `@Output()` decorators — use `input()` / `output()` signals
- Create barrel files (`index.ts`) unless the directory has 5+ exports
- {Framework-version-specific anti-patterns}
```

#### 5d. Styling instructions (ONLY if CSS/SCSS detected)

Scope: `applyTo: "**/*.css"` (or `**/*.scss`)

```markdown
---
applyTo: "{style_pattern}"
---
# Styling
_Auto-updated by /sdd-instructions on {date}._

- Preprocessor: {CSS/SCSS/Less}
- Component styles: colocated `{component}.css` beside `{component}.ts`
- Global styles: `src/styles.css`
- {Methodology: BEM/utility-first/none detected}
- {Budget limits from angular.json if present}

## Never
- Use `!important` — fix specificity instead
- Add global styles in component files
- Use inline styles in templates (use class bindings)
```

### 6. Return Summary

Report: platforms detected, files generated/updated, each with its `applyTo`/`paths`, config sources scanned.

## Content Quality Rules

Based on GitHub's analysis of 2,500+ repositories:

1. **Show, don't tell**: one code snippet > three paragraphs of description
2. **Include GOOD and BAD examples**: show the pattern AND the anti-pattern
3. **Copy-paste commands**: every command must be runnable, with exact flags
4. **Boundaries matter**: always include "Never do" sections
5. **Scan real code**: extract patterns from the ACTUAL codebase, not generic best practices
6. **Keep focused**: one concern per file, no kitchen-sink files

## Boundary with openspec/config.yaml

| In instruction files | In config.yaml |
|---------------------|----------------|
| HOW to format code | WHICH formatter to run |
| HOW to write tests (patterns, structure) | WHICH test runner, command, coverage threshold |
| Framework conventions with examples | Framework name/version |
| "Never do" restrictions | — |
| Project structure reference | — |

## Size Guidelines

| File type | Recommended max |
|-----------|----------------|
| Scoped instruction files | ~50-80 lines each |
| Code examples per file | 1-2 (GOOD + BAD) |

## Platform Format

Use the format for the detected platform ONLY:

**Copilot** — file: `.github/instructions/{name}.instructions.md`
```yaml
---
applyTo: "pattern"
excludeAgent: ["sdd-reviewer"]  # Add when content is coding-only (not relevant for review)
---
```

**Claude Code** — file: `.claude/rules/{name}.md`
```yaml
---
paths: ["pattern"]
excludeAgent: ["sdd-reviewer"]  # Add when content is coding-only (not relevant for review)
---
```

### excludeAgent usage

Add `excludeAgent` to instruction files where the content is **only relevant to code writers**, not reviewers:

| File type | excludeAgent |
|-----------|-------------|
| Testing instructions | `["sdd-reviewer"]` — reviewer runs tests, doesn't write them |
| Formatting instructions | `["sdd-reviewer"]` — reviewer doesn't format code |
| Framework instructions | — (reviewer needs these to validate patterns) |
| Styling instructions | `["sdd-reviewer"]` — reviewer doesn't write CSS |

All files: include auto-update marker `_Auto-updated by /sdd-instructions on {date}._`

## Rules

- NEVER create `copilot-instructions.md`, `CLAUDE.md`, or any repo-level file — only scoped files with applyTo/paths
- NEVER create files for a platform that is not detected — if only `.github/` exists, write ZERO files to `.claude/`
- NEVER use `applyTo: "**"` or `paths: ["**"]` — always scope to specific patterns
- ONLY generate for detected technologies — no placeholders
- Write ONLY to the detected platform(s) from Step 4
- When re-running, MERGE — preserve manual additions
- Instruction files are TEAM artifacts — commit and review them
- ALWAYS include code examples (GOOD + BAD) in framework and testing files
- ALWAYS scan the actual codebase for patterns — do not invent conventions
