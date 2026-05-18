#!/bin/bash
# guard-tools.sh — preToolUse hook
# BLOCKS: git operations, destructive commands, network calls.
# ENFORCES: per-step scope via CONDUCTOR_STEP_SCOPE env var.

INPUT=$(cat)

TOOL_NAME=$(echo "$INPUT" | sed -n 's/.*"tool_name"\s*:\s*"\([^"]*\)".*/\1/p' | head -1)
if [ -z "$TOOL_NAME" ]; then
  TOOL_NAME=$(echo "$INPUT" | sed -n 's/.*"toolName"\s*:\s*"\([^"]*\)".*/\1/p' | head -1)
fi

deny() {
  echo "{\"hookSpecificOutput\":{\"hookEventName\":\"PreToolUse\",\"permissionDecision\":\"deny\",\"permissionDecisionReason\":\"$1\"}}"
  exit 0
}

# Block web_fetch tool
case "$TOOL_NAME" in
  web_fetch|WebFetch) deny "BLOCKED: web fetching not allowed." ;;
esac

# Check shell commands
if [ "$TOOL_NAME" = "bash" ] || [ "$TOOL_NAME" = "shell" ] || [ "$TOOL_NAME" = "powershell" ] || [ "$TOOL_NAME" = "execute" ]; then

  if echo "$INPUT" | grep -qiE '\bgit\b'; then
    deny "BLOCKED: ALL git operations forbidden. The user manages git, never the agent."
  fi

  if echo "$INPUT" | grep -qiE '(rm\s+-rf|rmdir|del\s+/s|Remove-Item.*-Recurse)'; then
    deny "BLOCKED: destructive operations not allowed."
  fi

  if echo "$INPUT" | grep -qiE '(curl|wget|Invoke-WebRequest|Invoke-RestMethod)'; then
    deny "BLOCKED: network calls not allowed."
  fi
fi

# Per-step scope enforcement
if [ -n "$CONDUCTOR_STEP_SCOPE" ]; then
  if [ "$TOOL_NAME" = "edit" ] || [ "$TOOL_NAME" = "write" ] || [ "$TOOL_NAME" = "create" ]; then
    FILE_PATH=$(echo "$INPUT" | sed -n 's/.*"file_\?[Pp]ath"\s*:\s*"\([^"]*\)".*/\1/p' | head -1)
    if [ -z "$FILE_PATH" ]; then
      FILE_PATH=$(echo "$INPUT" | sed -n 's/.*"path"\s*:\s*"\([^"]*\)".*/\1/p' | head -1)
    fi
    if [ -n "$FILE_PATH" ]; then
      ALLOWED=false
      IFS=';' read -ra SCOPES <<< "$CONDUCTOR_STEP_SCOPE"
      for scope in "${SCOPES[@]}"; do
        if [[ "$FILE_PATH" == *"$scope"* ]]; then
          ALLOWED=true
          break
        fi
      done
      if [ "$ALLOWED" = false ]; then
        deny "BLOCKED: File '$FILE_PATH' is outside step scope: $CONDUCTOR_STEP_SCOPE"
      fi
    fi
  fi
fi

echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow"}}'
