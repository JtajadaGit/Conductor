## MODIFIED Requirements

<!-- id: REQ-VALIDATOR -->
### Requirement: Validator
The system SHALL reject email addresses that do not contain an @ symbol.

#### Scenario: Missing at-sign
- **GIVEN** an email input without @
- **WHEN** the validator runs
- **THEN** it returns false
