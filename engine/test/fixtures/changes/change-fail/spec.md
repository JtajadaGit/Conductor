## ADDED Requirements

### Requirement: User Login
The system SHALL allow a registered user to authenticate with email and password.

#### Scenario: Valid credentials
- **GIVEN** a registered user
- **WHEN** they submit a correct email and password
- **THEN** a session is created and they are redirected to the dashboard

### Requirement: Session Expiry
The system SHALL invalidate a session after 30 minutes of inactivity.
