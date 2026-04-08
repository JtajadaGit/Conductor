# When to Break the Rules

The Conductor framework has rules designed for the common case. Real-world usage sometimes requires pragmatic exceptions. This guide documents when and how.

## The Hard Stop Rule

**Rule**: The orchestrator delegates all execution to sub-agents.

**When to break it**: During iterative debug cycles post-apply, when:
- The fix is ≤5 lines in ≤2 files
- You already have full context of the error
- It's a tight error→fix→rebuild loop
- Delegating would cost >5x more tokens

**When NOT to break it**:
- New feature implementation (any size)
- Changes requiring reading >3 files
- Architectural or business logic changes

## The Explore-Always Rule

**Rule**: `sdd-new` always runs explore → propose → clarify.

**When to skip explore**: When the user provided:
- Clear scope (what + where)
- Defined approach (how)
- Explicit constraints

The orchestrator evaluates this automatically. If the user message has >100 words describing the change in detail, explore is likely redundant.

## The Spec-Before-Design Rule

**Rule**: Spec runs before design (they CAN run in parallel in sdd-ff).

**When parallel is OK**: When the change is well-understood and the proposal is detailed enough for both phases to work independently.

**When sequential is critical**: When the specs will add requirements not obvious from the proposal (e.g., edge cases, error handling, security constraints that design must account for).

## The Zero-Tolerance Consistency Check

**Rule**: If the consistency check in `sdd-tasks` finds issues, block apply.

**Reality**: The consistency check verifies documents against each other, not against reality. It can say "OK" when:
- A dependency doesn't actually exist
- An API has changed since the design was written
- A breaking change makes the design approach invalid

**Mitigation**: `post_hook` and `pre_hook` in apply catch the real-world issues that consistency checks miss.
