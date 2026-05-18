#!/bin/bash
# inject-state.sh — sessionStart hook
# Reads active change state and injects it as context at session start.
# This gives the agent awareness of where the pipeline left off.

CHANGES_DIR="openspec/changes"
CONTEXT=""

# Find most recent non-complete state.yaml
if [ -d "$CHANGES_DIR" ]; then
  LATEST=$(find "$CHANGES_DIR" -maxdepth 2 -name "state.yaml" -newer "$CHANGES_DIR" 2>/dev/null | head -1)

  if [ -n "$LATEST" ]; then
    STATUS=$(grep "^status:" "$LATEST" 2>/dev/null | head -1 | sed 's/status: *//')
    CHANGE=$(grep "^change:" "$LATEST" 2>/dev/null | head -1 | sed 's/change: *//')
    PHASE=$(grep "^current_phase:" "$LATEST" 2>/dev/null | head -1 | sed 's/current_phase: *//')
    COMPLEXITY=$(grep "^complexity:" "$LATEST" 2>/dev/null | head -1 | sed 's/complexity: *//')
    AUTO=$(grep "^auto_mode:" "$LATEST" 2>/dev/null | head -1 | sed 's/auto_mode: *//')

    if [ "$STATUS" != "complete" ] && [ -n "$CHANGE" ]; then
      CONTEXT="[SDD ACTIVE] change: $CHANGE | status: $STATUS | phase: $PHASE | complexity: $COMPLEXITY | auto: $AUTO | artifacts: openspec/changes/$CHANGE/"
    fi
  fi
fi

# Read config if exists
if [ -f "openspec/config.yaml" ]; then
  TDD=$(grep "strict_tdd:" "openspec/config.yaml" 2>/dev/null | head -1 | sed 's/.*strict_tdd: *//')
  MAX_CYCLES=$(grep "max_review_cycles:" "openspec/config.yaml" 2>/dev/null | head -1 | sed 's/.*max_review_cycles: *//')
  CONFIG_CTX="[SDD CONFIG] tdd: ${TDD:-false} | max_review_cycles: ${MAX_CYCLES:-3}"
  CONTEXT="$CONTEXT $CONFIG_CTX"
fi

if [ -n "$CONTEXT" ]; then
  echo "{\"additionalContext\":\"$CONTEXT\"}"
else
  echo "{}"
fi
