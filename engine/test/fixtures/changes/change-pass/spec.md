## ADDED Requirements

### Requirement: User Login
The system SHALL allow a registered user to authenticate with email and password.

#### Scenario: Valid credentials
- **GIVEN** a registered user
- **WHEN** they submit a correct email and password
- **THEN** a session is created and they are redirected to the dashboard

#### Scenario: Invalid credentials
- **GIVEN** a registered user
- **WHEN** they submit a wrong password
- **THEN** an error is shown and no session is created

### Requirement: Session Expiry
The system SHALL invalidate a session after 30 minutes of inactivity.

#### Scenario: Idle timeout
- **GIVEN** an authenticated user
- **WHEN** 30 minutes pass without activity
- **THEN** the next request is rejected and the user is asked to log in again
