<?php

require_once __DIR__ . '/../models/User.php';
require_once __DIR__ . '/../models/Order.php';
require_once __DIR__ . '/../config/database.php';

class AdminController {
    private $db;

    public function __construct() {
        $this->db = Database::getInstance();
    }

    /**
     * Check if the authenticated user is an admin.
     * VULN: Privilege Escalation via JWT claim manipulation - checks is_admin from the
     * JWT token payload instead of the database. Since the JWT "none" algorithm and
     * signature bypass vulnerabilities allow token forgery, an attacker can craft a
     * JWT with is_admin=true to gain admin access without being an actual admin.
     */
    private function requireAdmin($authUser) {
        if (empty($authUser['is_admin'])) {
            http_response_code(403);
            echo json_encode(['success' => false, 'message' => 'Admin access required.']);
            exit;
        }
    }

    /**
     * List all orders with user info.
     */
    public function listOrders($authUser) {
        $this->requireAdmin($authUser);

        $result = $this->db->query(
            'SELECT o.id, o.user_id, u.name as user_name, u.email as user_email,
                    o.total, o.status, o.shipping_name, o.shipping_city,
                    o.created_at as order_date,
                    (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) as items_count
             FROM orders o
             JOIN users u ON o.user_id = u.id
             ORDER BY o.created_at DESC'
        );

        $orders = [];
        while ($row = $result->fetchArray(SQLITE3_ASSOC)) {
            $row['total'] = floatval($row['total']);
            $orders[] = $row;
        }

        return ['success' => true, 'orders' => $orders];
    }

    /**
     * Get a single order detail (admin view - includes user info).
     */
    public function getOrder($authUser, $orderId) {
        $this->requireAdmin($authUser);

        $stmt = $this->db->prepare(
            'SELECT o.*, u.name as user_name, u.email as user_email
             FROM orders o
             JOIN users u ON o.user_id = u.id
             WHERE o.id = :id'
        );
        $stmt->bindValue(':id', intval($orderId), SQLITE3_INTEGER);
        $result = $stmt->execute();
        $order = $result->fetchArray(SQLITE3_ASSOC);

        if (!$order) {
            http_response_code(404);
            return ['success' => false, 'message' => 'Order not found.'];
        }

        // Get order items
        $stmt = $this->db->prepare('SELECT * FROM order_items WHERE order_id = :order_id');
        $stmt->bindValue(':order_id', intval($orderId), SQLITE3_INTEGER);
        $result = $stmt->execute();

        $items = [];
        while ($row = $result->fetchArray(SQLITE3_ASSOC)) {
            $row['price'] = floatval($row['price']);
            $row['subtotal'] = floatval($row['subtotal']);
            $items[] = $row;
        }
        $order['items'] = $items;
        $order['total'] = floatval($order['total']);

        return ['success' => true, 'order' => $order];
    }

    /**
     * Update order status.
     */
    public function updateOrderStatus($authUser, $orderId) {
        $this->requireAdmin($authUser);

        $data = json_decode(file_get_contents('php://input'), true);

        if (empty($data['status'])) {
            http_response_code(400);
            return ['success' => false, 'message' => 'Status is required.'];
        }

        $validStatuses = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];
        if (!in_array($data['status'], $validStatuses)) {
            http_response_code(400);
            return ['success' => false, 'message' => 'Invalid status. Must be one of: ' . implode(', ', $validStatuses)];
        }

        $stmt = $this->db->prepare('UPDATE orders SET status = :status WHERE id = :id');
        $stmt->bindValue(':status', $data['status'], SQLITE3_TEXT);
        $stmt->bindValue(':id', intval($orderId), SQLITE3_INTEGER);
        $stmt->execute();

        if ($this->db->changes() === 0) {
            http_response_code(404);
            return ['success' => false, 'message' => 'Order not found.'];
        }

        return [
            'success' => true,
            'message' => 'Order status updated to ' . $data['status'] . '.'
        ];
    }
}
