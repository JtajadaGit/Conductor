## MODIFIED Requirements

<!-- id: REQ-DISCOUNT-CALC -->
### Requirement: Discount Calculator
The system SHALL compute order discounts in an isolated DiscountCalculator class, extracted from PaymentService, preserving the existing public API.

#### Scenario: Refactored calculation
- **GIVEN** an order with eligible items
- **WHEN** PaymentService.calculateTotal() is called
- **THEN** the result matches the previous output and DiscountCalculator is used internally
