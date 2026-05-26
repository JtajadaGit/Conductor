#!/usr/bin/env bash
# Conductor preToolUse guard — blocks git/gh/curl/wget/destructive ops + web fetch.
# Cross-platform (Linux/macOS, BSD-sed safe). Reads tool call JSON on stdin,
# writes single-line JSON decision on stdout. Returns exit 0 always (decision in JSON).

set -e

INPUT=$(cat)

allow() {
  printf '%s\n' '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow"}}'
  exit 0
}

deny() {
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"%s"}}\n' "$1"
  exit 0
}

# Block web fetching tools.
case "$INPUT" in
  *'"tool_name"'*'"web_fetch"'*|*'"tool_name"'*'"WebFetch"'*|*'"tool_name"'*'"fetch_url"'*)
    deny "BLOCKED: web fetching not allowed by Conductor policy."
    ;;
esac

# For shell-class tools, block dangerous commands in the input.
case "$INPUT" in
  *'"tool_name"'*'"bash"'*|*'"tool_name"'*'"shell"'*|*'"tool_name"'*'"powershell"'*|*'"tool_name"'*'"execute"'*|*'"tool_name"'*'"run_command"'*)
    # Match: git / gh / curl / wget / rm -rf / rmdir / Remove-Item -Recurse
    if printf '%s' "$INPUT" | grep -Eq '(^|[^A-Za-z])(git|gh)([^A-Za-z]|$)'; then
      deny "BLOCKED: git/gh operations forbidden. The user manages git, never the agent."
    fi
    if printf '%s' "$INPUT" | grep -Eq '(curl|wget|Invoke-WebRequest|Invoke-RestMethod)'; then
      deny "BLOCKED: network calls (curl/wget) not allowed."
    fi
    if printf '%s' "$INPUT" | grep -Eq '(rm[[:space:]]+-rf|rmdir|del[[:space:]]+/s|Remove-Item.*Recurse)'; then
      deny "BLOCKED: destructive deletion not allowed."
    fi
    ;;
esac

allow
