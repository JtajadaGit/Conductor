CREATE TABLE orders (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  customer_id VARCHAR(36) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'pending',
  discount_code VARCHAR(32),
  total_cents BIGINT NOT NULL,
  created_at TIMESTAMP NOT NULL
);
