# Working with Monorepos

Guide for using Conductor SDD in monorepo or multi-package projects.

## Key Challenge

`sdd-init` detects the tech stack from the root where it runs. In a monorepo, different packages may have different stacks (e.g., a React frontend + a Go backend).

## Recommendations

### Where to Run sdd-init

Run `sdd-init` from the **root** of the monorepo. The detection will pick up the dominant stack. Then customize `openspec/config.yaml` to specify the full picture:

```yaml
context: |
  Monorepo with:
  - packages/frontend: React 19, TypeScript, Vite
  - packages/backend: Go 1.22, Chi router
  - packages/shared: TypeScript, shared types
```

### Scoping Changes

When running `sdd-new`, be explicit about which package the change targets:

```
sdd-new "Add user auth to packages/backend"
```

The explore and propose phases will focus on the specified package.

### Cross-Package Changes

For changes that span packages:
1. Consider splitting into separate SDD changes per package
2. Or describe the cross-cutting nature in the proposal so design accounts for it

### Library vs Consumer

If your monorepo has a library package and a consumer/sample app:
- Specify in the change description which is the target
- In `openspec/principles.md`, document the relationship:
  ```markdown
  1. **Package relationship**: `my-lib` is the source library, `my-app` consumes it via npm
  ```

## Limitations

- `sdd-init` doesn't auto-detect workspace boundaries (npm workspaces, Go modules, etc.)
- Changes are tracked per-change, not per-package — a single `state.yaml` covers the whole change
