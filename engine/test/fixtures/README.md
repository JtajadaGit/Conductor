# Conductor test fixtures

Small, dependency-free fixtures for the SDD verification tool.

## `xstack/` — cross-stack traceability sources

Each file carries a `@conductor REQ-XXX` annotation in that language's comment
syntax. Used to test requirement-to-code traceability scanning across stacks.

| File | Stack | Annotation |
| --- | --- | --- |
| `xstack/java/OrderService.java` | Java | `// @conductor REQ-ORDER` |
| `xstack/php/OrderController.php` | PHP | `// @conductor REQ-ORDER` (also a `#` line comment) |
| `xstack/salesforce/OrderTrigger.cls` | Salesforce Apex | `// @conductor REQ-ORDER` |
| `xstack/spartacus/order.component.ts` | Angular / SAP Spartacus TS | `// @conductor REQ-CART` |
| `xstack/magento/OrderPlugin.php` | Magento PHP plugin | `// @conductor REQ-ORDER` |
| `xstack/tests/OrderServiceTest.java` | Java test (matches `/Test\./`) | `// @conductor REQ-ORDER` |

Notes for tests:
- `REQ-ORDER` appears in 5 files (one of which is a test file).
- `REQ-CART` appears in 1 file (the Spartacus component).
- The test file is distinguishable by the `/Test\./` filename pattern.

## `contract/` — OpenAPI contract diffing

Shared baseline `v1.json` is compared against two variants.

| File | Purpose |
| --- | --- |
| `contract/v1.json` | Baseline OpenAPI 3.0 spec (Order/Customer domain) |
| `contract/v2-breaking.json` | Multiple breaking changes vs v1 |
| `contract/v2-compatible.json` | Only non-breaking changes vs v1 |

### Breaking changes encoded in `v2-breaking.json` (vs `v1.json`)

1. **Removed path** — `/customers/{customerId}` is deleted entirely.
2. **Removed operation** — `POST /orders` (`createOrder`) is removed (the `GET` on `/orders` remains).
3. **Changed property type** — `Order.total` changes from `number` to `string`.
4. **Added required request parameter** — new required query param `tenantId` on `GET /orders`.
5. **Removed response property** — `Order.currency` is removed from the `Order` schema.
6. **Narrowed enum** — `listOrders` `status` query enum drops `cancelled` (`[draft, paid, shipped, cancelled]` -> `[draft, paid, shipped]`).
7. **Path/query param optional -> required** — `expand` query param on `GET /orders/{orderId}` changes from `required: false` to `required: true`.

### Non-breaking changes in `v2-compatible.json` (vs `v1.json`)

- New optional property `Order.notes` and `OrderInput.notes`.
- New endpoint `GET /customers` (`listCustomers`).
- New optional query param `limit` on `GET /orders`.
- Widened enum — `status` query enum gains `refunded`.
