package com.example.order;

import java.util.UUID;

/**
 * Handles order lifecycle operations.
 */
// @conductor REQ-ORDER
public class OrderService {

    public Order createOrder(String customerId, double total) {
        Order order = new Order();
        order.setId(UUID.randomUUID().toString());
        order.setCustomerId(customerId);
        order.setTotal(total);
        return order;
    }
}
