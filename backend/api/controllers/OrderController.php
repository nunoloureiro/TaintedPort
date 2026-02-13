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
        $orderId = $this->order->create($authUser['user_id'], $addr, $notes);

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
}
