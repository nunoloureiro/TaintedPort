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

        $sql = 'UPDATE orders SET status = :status';
        if (isset($data['tracking_number'])) $sql .= ', tracking_number = :tracking_number';
        if (isset($data['carrier'])) $sql .= ', carrier = :carrier';
        if ($data['status'] === 'shipped') $sql .= ", shipped_at = COALESCE(shipped_at, CURRENT_TIMESTAMP)";
        if ($data['status'] === 'delivered') $sql .= ", delivered_at = COALESCE(delivered_at, CURRENT_TIMESTAMP)";
        $sql .= ' WHERE id = :id';

        $stmt = $this->db->prepare($sql);
        $stmt->bindValue(':status', $data['status'], SQLITE3_TEXT);
        $stmt->bindValue(':id', intval($orderId), SQLITE3_INTEGER);
        if (isset($data['tracking_number'])) $stmt->bindValue(':tracking_number', $data['tracking_number'], SQLITE3_TEXT);
        if (isset($data['carrier'])) $stmt->bindValue(':carrier', $data['carrier'], SQLITE3_TEXT);
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

    /**
     * Dashboard summary: revenue, order mix, top sellers, stock and ticket health.
     */
    public function analytics($authUser) {
        $this->requireAdmin($authUser);

        $totals = $this->db->query(
            "SELECT COUNT(*) as order_count, COALESCE(SUM(total), 0) as revenue
             FROM orders WHERE status != 'cancelled'"
        )->fetchArray(SQLITE3_ASSOC);

        $byStatus = [];
        $result = $this->db->query('SELECT status, COUNT(*) as count FROM orders GROUP BY status');
        while ($row = $result->fetchArray(SQLITE3_ASSOC)) {
            $byStatus[$row['status']] = intval($row['count']);
        }

        $topWines = [];
        $result = $this->db->query(
            "SELECT wine_id, wine_name, SUM(quantity) as units_sold, SUM(subtotal) as revenue
             FROM order_items GROUP BY wine_id ORDER BY units_sold DESC LIMIT 5"
        );
        while ($row = $result->fetchArray(SQLITE3_ASSOC)) {
            $row['units_sold'] = intval($row['units_sold']);
            $row['revenue'] = floatval($row['revenue']);
            $topWines[] = $row;
        }

        $byRegion = [];
        $result = $this->db->query(
            "SELECT w.region, SUM(oi.subtotal) as revenue
             FROM order_items oi JOIN wines w ON oi.wine_id = w.id
             GROUP BY w.region ORDER BY revenue DESC"
        );
        while ($row = $result->fetchArray(SQLITE3_ASSOC)) {
            $row['revenue'] = floatval($row['revenue']);
            $byRegion[] = $row;
        }

        $lowStock = $this->db->query(
            'SELECT id, name, stock_quantity, low_stock_threshold FROM wines
             WHERE stock_quantity <= low_stock_threshold ORDER BY stock_quantity ASC'
        );
        $lowStockWines = [];
        while ($row = $lowStock->fetchArray(SQLITE3_ASSOC)) {
            $row['stock_quantity'] = intval($row['stock_quantity']);
            $lowStockWines[] = $row;
        }

        $openTickets = $this->db->query(
            "SELECT COUNT(*) as count FROM support_tickets WHERE status != 'closed'"
        )->fetchArray(SQLITE3_ASSOC);

        $userCount = $this->db->query('SELECT COUNT(*) as count FROM users')->fetchArray(SQLITE3_ASSOC);

        $groupBy = isset($_GET['group_by']) ? $_GET['group_by'] : 'region';
        $groupColumns = ['region' => 'w.region', 'type' => 'w.type', 'vintage' => 'w.vintage'];
        $groupColumn = isset($groupColumns[$groupBy]) ? $groupColumns[$groupBy] : 'w.region';
        $grouped = [];
        $groupedResult = $this->db->query(
            "SELECT $groupColumn AS bucket, COUNT(*) AS units, COALESCE(SUM(oi.subtotal), 0) AS revenue
             FROM order_items oi JOIN wines w ON oi.wine_id = w.id
             GROUP BY $groupColumn ORDER BY revenue DESC"
        );
        while ($row = $groupedResult->fetchArray(SQLITE3_ASSOC)) {
            $row['units'] = intval($row['units']);
            $row['revenue'] = floatval($row['revenue']);
            $grouped[] = $row;
        }

        return [
            'success' => true,
            'revenue' => floatval($totals['revenue']),
            'order_count' => intval($totals['order_count']),
            'orders_by_status' => $byStatus,
            'top_wines' => $topWines,
            'revenue_by_region' => $byRegion,
            'low_stock_wines' => $lowStockWines,
            'open_tickets' => intval($openTickets['count']),
            'user_count' => intval($userCount['count']),
            'grouped_by' => $groupBy,
            'grouped' => $grouped,
        ];
    }

    /**
     * Account statement for a customer: every order billed to the same company
     * as the selected user, so business accounts that share a billing entity
     * are reconciled together on one statement.
     */
    public function userStatement($authUser, $userId) {
        $this->requireAdmin($authUser);

        $user = new User();
        $target = $user->findById(intval($userId));
        if (!$target) {
            http_response_code(404);
            return ['success' => false, 'message' => 'User not found.'];
        }

        $company = isset($target['company']) ? $target['company'] : '';

        $lines = [];
        if ($company !== '') {
            $sql = "SELECT o.id, o.total, o.status, o.created_at, u.name AS customer_name
                    FROM orders o JOIN users u ON o.user_id = u.id
                    WHERE u.company = '$company'
                    ORDER BY o.created_at DESC";
            $result = @$this->db->query($sql);
            if ($result) {
                while ($row = $result->fetchArray(SQLITE3_ASSOC)) {
                    $row['total'] = floatval($row['total']);
                    $lines[] = $row;
                }
            }
        }

        return [
            'success' => true,
            'customer' => ['id' => intval($target['id']), 'name' => $target['name'], 'company' => $company],
            'statement' => $lines,
        ];
    }

    /**
     * List all users with their roles (Team management).
     */
    public function users($authUser) {
        $this->requireAdmin($authUser);
        $user = new User();
        return ['success' => true, 'users' => $user->getAll()];
    }

    public function updateUserRole($authUser, $userId) {
        $this->requireAdmin($authUser);

        if (intval($userId) === intval($authUser['user_id'])) {
            http_response_code(400);
            return ['success' => false, 'message' => 'You cannot change your own role.'];
        }

        $data = json_decode(file_get_contents('php://input'), true);
        $validRoles = ['user', 'support', 'admin'];
        if (empty($data['role']) || !in_array($data['role'], $validRoles, true)) {
            http_response_code(400);
            return ['success' => false, 'message' => 'role must be one of: ' . implode(', ', $validRoles)];
        }

        $user = new User();
        $user->updateRole($userId, $data['role']);
        return ['success' => true, 'message' => 'Role updated.'];
    }
}
