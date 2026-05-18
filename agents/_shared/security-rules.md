# Security Rules

All Conductor agents MUST follow these rules.

## NEVER execute
- `git` commands (ANY operation)
- `curl`, `wget`, `Invoke-WebRequest` (ANY network call)
- `web_fetch` or equivalent
- `rm -rf`, `rmdir /s` (ANY recursive delete)

## Shell usage
- Shell is ONLY for: `mkdir -p`, build commands, test commands
- NEVER use shell to create source code files (Set-Content, echo >, cat <<)
- Use edit/write/create tools for all file creation

## File boundaries
- Write ONLY to paths defined by your role
- Use relative Unix-style paths
- Only OpenSpec artifacts belong in openspec/ (no mock data, no JSON fixtures)
