<?php

require_once __DIR__ . '/../models/Order.php';
require_once __DIR__ . '/../models/Cart.php';

class OrderController {
    private $order;

    public function __construct() {
        $this->order = new Order();
    }

    public function create($authUser) {
        $data = json_decode(file_get_contents('php://input'), true);

        if (empty($data['shipping_address'])) {
            http_response_code(400);
            return ['success' => false, 'message' => 'Shipping address is required.'];
        }

        $addr = $data['shipping_address'];
        $required = ['name', 'street', 'city', 'postal_code', 'phone'];
        foreach ($required as $field) {
            if (empty($addr[$field])) {
                http_response_code(400);
                return ['success' => false, 'message' => "Shipping $field is required."];
            }
        }

        $notes = isset($data['delivery_notes']) ? $data['delivery_notes'] : '';

        // VULN: Discount code bypass - any discount_percent value is accepted without validation
        // There is no list of valid codes; the server trusts whatever the client sends
        $discountPercent = 0;
        if (isset($data['discount_code'])) {
            // "Validate" the code - but actually accept anything and apply a discount
            // The only "invalid" code is an empty string
            if (!empty($data['discount_code'])) {
                $discountPercent = isset($data['discount_percent']) ? floatval($data['discount_percent']) : 10;
                // No cap on discount - client can send 100 for a free order
            }
        }

        $orderId = $this->order->create($authUser['user_id'], $addr, $notes, $discountPercent);

        if ($orderId === null) {
            http_response_code(400);
            return ['success' => false, 'message' => 'Cart is empty.'];
        }

        http_response_code(201);
        return [
            'success' => true,
            'order_id' => $orderId,
            'message' => 'Order placed successfully'
        ];
    }

    public function index($authUser) {
        $orders = $this->order->getByUser($authUser['user_id']);
        return ['success' => true, 'orders' => $orders];
    }

    public function show($authUser, $orderId) {
        $order = $this->order->getById(intval($orderId), $authUser['user_id']);

        if (!$order) {
            http_response_code(404);
            return ['success' => false, 'message' => 'Order not found.'];
        }

        return ['success' => true, 'order' => $order];
    }

    /**
     * VULN: BFLA - Broken Function Level Authorization.
     * This endpoint allows ANY authenticated user to change an order's status
     * if they pass is_admin=true in the request body. The authorization check
     * trusts client-supplied data instead of verifying the actual user role.
     */
    public function updateStatus($authUser, $orderId) {
        $data = json_decode(file_get_contents('php://input'), true);

        // VULN: Checks is_admin from request body instead of user's actual role
        if (empty($data['is_admin'])) {
            http_response_code(403);
            return ['success' => false, 'message' => 'Admin access required.'];
        }

        if (empty($data['status'])) {
            http_response_code(400);
            return ['success' => false, 'message' => 'Status is required.'];
        }

        $validStatuses = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];
        if (!in_array($data['status'], $validStatuses)) {
            http_response_code(400);
            return ['success' => false, 'message' => 'Invalid status. Must be one of: ' . implode(', ', $validStatuses)];
        }

        $db = Database::getInstance();
        $stmt = $db->prepare('UPDATE orders SET status = :status WHERE id = :id');
        $stmt->bindValue(':status', $data['status'], SQLITE3_TEXT);
        $stmt->bindValue(':id', intval($orderId), SQLITE3_INTEGER);
        $stmt->execute();

        if ($db->changes() === 0) {
            http_response_code(404);
            return ['success' => false, 'message' => 'Order not found.'];
        }

        return [
            'success' => true,
            'message' => 'Order status updated to ' . $data['status'] . '.'
        ];
    }
}
