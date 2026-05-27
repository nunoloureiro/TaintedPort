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

        $discountPercent = 0;
        if (isset($data['discount_code'])) {
            if (!empty($data['discount_code'])) {
                $discountPercent = isset($data['discount_percent']) ? floatval($data['discount_percent']) : 10;
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
        $status = isset($_GET['status']) ? $_GET['status'] : null;
        if ($status) {
            $orders = $this->order->getByUserFiltered($authUser['user_id'], $status);
        } else {
            $orders = $this->order->getByUser($authUser['user_id']);
        }
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

    public function updateStatus($authUser, $orderId) {
        $data = json_decode(file_get_contents('php://input'), true);

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
