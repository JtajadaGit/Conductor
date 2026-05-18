#!/bin/bash
# inject-context.sh — subagentStart hook
# Injects change context AND instruction file paths into subagents.

CHANGES_DIR="openspec/changes"
CONTEXT=""

# Find active change
if [ -d "$CHANGES_DIR" ]; then
  LATEST=$(find "$CHANGES_DIR" -maxdepth 2 -name "state.yaml" 2>/dev/null | head -1)

  if [ -n "$LATEST" ]; then
    STATUS=$(grep "^status:" "$LATEST" 2>/dev/null | head -1 | sed 's/status: *//')
    CHANGE=$(grep "^change:" "$LATEST" 2>/dev/null | head -1 | sed 's/change: *//')
    COMPLEXITY=$(grep "^complexity:" "$LATEST" 2>/dev/null | head -1 | sed 's/complexity: *//')

    if [ "$STATUS" != "complete" ] && [ -n "$CHANGE" ]; then
      CHANGE_DIR="openspec/changes/$CHANGE"

      # List available artifacts
      ARTIFACTS=""
      [ -f "$CHANGE_DIR/state.yaml" ] && ARTIFACTS="$ARTIFACTS state.yaml"
      [ -d "$CHANGE_DIR/specs" ] && ARTIFACTS="$ARTIFACTS specs/"
      [ -f "$CHANGE_DIR/design.md" ] && ARTIFACTS="$ARTIFACTS design.md"
      [ -f "$CHANGE_DIR/tasks.md" ] && ARTIFACTS="$ARTIFACTS tasks.md"
      [ -f "$CHANGE_DIR/apply-report.md" ] && ARTIFACTS="$ARTIFACTS apply-report.md"
      [ -f "$CHANGE_DIR/verify-report.md" ] && ARTIFACTS="$ARTIFACTS verify-report.md"

      CONTEXT="[SDD CONTEXT] change: $CHANGE | complexity: $COMPLEXITY | artifact_base: $CHANGE_DIR/ | available:$ARTIFACTS"
    fi
  fi
fi

# Find instruction files and inject their paths
INSTRUCTIONS=""
if [ -d ".github/instructions" ]; then
  INSTRUCTIONS=$(find .github/instructions -name "*.instructions.md" 2>/dev/null | tr '\n' ', ' | sed 's/,$//')
fi
if [ -n "$INSTRUCTIONS" ]; then
  CONTEXT="$CONTEXT | [INSTRUCTIONS] Read these before coding: $INSTRUCTIONS"
fi

if [ -n "$CONTEXT" ]; then
  echo "{\"additionalContext\":\"$CONTEXT\"}"
else
  echo "{}"
fi
