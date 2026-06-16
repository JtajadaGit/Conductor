<?php

namespace App\Http\Controllers;

// @conductor REQ-ORDER
class OrderController
{
    # Creates a new order for the given customer.
    public function store(int $customerId, float $total): array
    {
        return [
            'id'         => uniqid('ord_', true),
            'customerId' => $customerId,
            'total'      => $total,
        ];
    }
}
