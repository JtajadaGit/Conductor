package com.example.order;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.assertNotNull;

// @conductor REQ-ORDER
class OrderServiceTest {

    @Test
    void createOrderReturnsOrder() {
        OrderService service = new OrderService();
        Order order = service.createOrder("cust-1", 42.0);
        assertNotNull(order.getId());
    }
}
