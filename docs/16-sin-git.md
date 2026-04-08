# Projects Without Git

Conductor SDD works without Git, but some features are limited.

## What Works Without Git

- All SDD phases (explore → archive)
- Artifact persistence in `openspec/`
- state.yaml tracking
- Skill registry (`.atl/skill-registry.md`)

## What's Limited

| Feature | With Git | Without Git |
|---------|----------|-------------|
| Rollback after apply | `git checkout` | Manual file deletion |
| Change diff | `git diff` | Compare against design.md file list |
| Archive verification | `git log` shows history | Only `openspec/changes/archive/` |
| .gitignore enforcement | Enforced | File exists but not enforced |

## Recommendations

1. **Before `sdd-apply`**: manually note the current state of files that will be modified (or zip the directory)
2. **Configure `post_hook`**: essential for catching errors early when you can't easily rollback
3. **Use `openspec/` as your audit trail**: the archived changes serve as project history
