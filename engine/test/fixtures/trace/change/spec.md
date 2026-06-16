## ADDED Requirements

<!-- id: REQ-LOGIN -->
### Requirement: User Login
The system SHALL allow a registered user to authenticate with email and password.

#### Scenario: Valid credentials
- **GIVEN** a registered user
- **WHEN** they submit a correct email and password
- **THEN** a session is created

#### Scenario: Invalid credentials
- **GIVEN** a registered user
- **WHEN** they submit a wrong password
- **THEN** an error is shown

<!-- id: REQ-SESSION -->
### Requirement: Session Expiry
The system SHALL invalidate a session after 30 minutes of inactivity.

#### Scenario: Idle timeout
- **GIVEN** an authenticated user
- **WHEN** 30 minutes pass without activity
- **THEN** the next request is rejected
