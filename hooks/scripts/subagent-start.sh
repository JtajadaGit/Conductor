#!/usr/bin/env bash
# Conductor subagentStart — inject [SDD CONTEXT] for the active change + instruction file paths.
# Cross-platform.

set -e

OUT='{}'
CTX=""

if [ -d openspec/changes ]; then
  STATE=$(find openspec/changes -maxdepth 2 -name state.yaml 2>/dev/null | head -1)
  if [ -n "$STATE" ]; then
    CHANGE=$(awk -F': *' '/^change:/ {print $2; exit}' "$STATE")
    STATUS=$(awk -F': *' '/^status:/ {print $2; exit}' "$STATE")
    PHASE=$(awk -F': *' '/^current_phase:/ {print $2; exit}' "$STATE")
    if [ "$STATUS" != complete ] && [ "$STATUS" != archived ] && [ -n "$CHANGE" ]; then
      CD="openspec/changes/$CHANGE"
      AVAIL=""
      [ -f "$CD/state.yaml" ]       && AVAIL="$AVAIL state.yaml"
      [ -f "$CD/proposal.md" ]      && AVAIL="$AVAIL proposal.md"
      [ -d "$CD/specs" ]            && AVAIL="$AVAIL specs/"
      [ -f "$CD/design.md" ]        && AVAIL="$AVAIL design.md"
      [ -f "$CD/tasks.md" ]         && AVAIL="$AVAIL tasks.md"
      [ -f "$CD/apply-report.md" ]  && AVAIL="$AVAIL apply-report.md"
      [ -f "$CD/verify-report.md" ] && AVAIL="$AVAIL verify-report.md"
      CTX="[SDD CONTEXT] change: $CHANGE | phase: $PHASE | artifact_base: $CD/ | available:$AVAIL"
    fi
  fi
fi

if [ -d .github/instructions ]; then
  INSTR=$(find .github/instructions -name '*.instructions.md' 2>/dev/null | tr '\n' ',' | sed 's/,$//')
  if [ -n "$INSTR" ]; then
    CTX="$CTX | [INSTRUCTIONS] Read before coding: $INSTR"
  fi
fi

if [ -n "$CTX" ]; then
  OUT=$(printf '{"additionalContext":"%s"}' "$CTX")
fi

printf '%s\n' "$OUT"
