#!/usr/bin/env bash
# Conductor sessionStart — inject [SDD ACTIVE] context if there is an in-progress change.
# Cross-platform (Linux/macOS, BSD-safe). Outputs single-line JSON.

set -e

OUT='{}'

if [ -d openspec/changes ]; then
  STATE=$(find openspec/changes -maxdepth 2 -name state.yaml 2>/dev/null | head -1)
  if [ -n "$STATE" ]; then
    CHANGE=$(awk -F': *' '/^change:/ {print $2; exit}' "$STATE")
    STATUS=$(awk -F': *' '/^status:/ {print $2; exit}' "$STATE")
    PHASE=$(awk -F': *' '/^current_phase:/ {print $2; exit}' "$STATE")
    if [ "$STATUS" != complete ] && [ "$STATUS" != archived ] && [ -n "$CHANGE" ]; then
      CTX="[SDD ACTIVE] change: $CHANGE | status: $STATUS | phase: $PHASE | artifacts: openspec/changes/$CHANGE/"
      OUT=$(printf '{"additionalContext":"%s"}' "$CTX")
    fi
  fi
fi

printf '%s\n' "$OUT"
