## ADDED Requirements

<!-- id: REQ-ORDER -->
### Requirement: Order processing
The system SHALL process orders across all backend stacks.
#### Scenario: Place order
- **GIVEN** a cart
- **WHEN** checkout
- **THEN** order created

<!-- id: REQ-CART -->
### Requirement: Cart UI
The storefront SHALL render the cart.
#### Scenario: Show cart
- **GIVEN** items
- **WHEN** open cart
- **THEN** items listed
