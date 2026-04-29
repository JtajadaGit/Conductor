#!/bin/bash
# guard-tools.sh — preToolUse hook
# Security guard for Conductor pipeline.
# Blocks: git operations, destructive commands, network calls.

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | grep -o '"toolName":"[^"]*"' | head -1 | sed 's/"toolName":"//;s/"//')
COMMAND=$(echo "$INPUT" | grep -o '"command":"[^"]*"' | head -1 | sed 's/"command":"//;s/"//')

if [ "$TOOL_NAME" = "bash" ] || [ "$TOOL_NAME" = "shell" ] || [ "$TOOL_NAME" = "powershell" ]; then
  case "$COMMAND" in
    # Git — ALL operations blocked
    git\ *)
      echo '{"permissionDecision":"deny","permissionDecisionReason":"BLOCKED: git operations are managed by the user, never by the agent."}'
      exit 0
      ;;
    # Destructive
    rm\ -rf*|rmdir*|del\ /*)
      echo '{"permissionDecision":"deny","permissionDecisionReason":"BLOCKED: destructive operations not allowed."}'
      exit 0
      ;;
    # Network — curl, wget, invoke-webrequest
    curl\ *|wget\ *|Invoke-WebRequest*|Invoke-RestMethod*|*curl.exe*)
      echo '{"permissionDecision":"deny","permissionDecisionReason":"BLOCKED: network calls not allowed during pipeline."}'
      exit 0
      ;;
  esac

  # Also catch curl/wget/git buried in paths or pipes
  if echo "$COMMAND" | grep -qiE '(curl|wget|invoke-webrequest|invoke-restmethod)'; then
    echo '{"permissionDecision":"deny","permissionDecisionReason":"BLOCKED: network calls not allowed during pipeline."}'
    exit 0
  fi
  if echo "$COMMAND" | grep -qiE '^git\b'; then
    echo '{"permissionDecision":"deny","permissionDecisionReason":"BLOCKED: git operations are managed by the user."}'
    exit 0
  fi
fi

# Block web_fetch tool directly
if [ "$TOOL_NAME" = "web_fetch" ]; then
  echo '{"permissionDecision":"deny","permissionDecisionReason":"BLOCKED: web fetching not allowed during pipeline."}'
  exit 0
fi

echo '{"permissionDecision":"allow"}'
