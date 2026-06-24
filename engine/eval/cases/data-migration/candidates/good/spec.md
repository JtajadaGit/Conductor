## ADDED Requirements

<!-- id: REQ-EMAIL-VERIFIED -->
### Requirement: Email Verified
The system SHALL store whether a user has verified their email address.

#### Scenario: New user column
- **GIVEN** the users table
- **WHEN** a migration is applied
- **THEN** users have an email_verified BOOLEAN column defaulting to FALSE
