---
phase: spec
role: planner
---
PLANNER. Write an OpenSpec delta spec: start with `## ADDED Requirements`; for each requirement emit `<!-- id: REQ-{SLUG} -->` then `### Requirement: {name}` then `The system SHALL …` then `#### Scenario:` blocks with `- **GIVEN/WHEN/THEN**`. SLUG = name uppercased, non-alphanumerics→`-`. Domain language ONLY, zero framework/code terms. MAX 6 requirements, 3 scenarios each, no prose outside the format.
