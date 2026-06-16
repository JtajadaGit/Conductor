<?php

namespace Vendor\Module\Plugin;

use Magento\Sales\Api\OrderRepositoryInterface;
use Magento\Sales\Api\Data\OrderInterface;

// @conductor REQ-ORDER
class OrderPlugin
{
    public function afterSave(
        OrderRepositoryInterface $subject,
        OrderInterface $result
    ): OrderInterface {
        // post-process saved order
        return $result;
    }
}
