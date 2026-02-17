<?php

require_once __DIR__ . '/../config/database.php';

class Order {
    private $db;

    public function __construct() {
        $this->db = Database::getInstance();
    }

    public function create($userId, $shippingData, $deliveryNotes = '', $discountPercent = 0) {
        $cart = new Cart();
        $cartData = $cart->getItems($userId);

        if (empty($cartData['items'])) {
            return null;
        }

        $total = $cartData['total'];

        // VULN: Discount bypass - discount_percent is trusted from client, no validation
        if ($discountPercent > 0) {
            $total = $total * (1 - ($discountPercent / 100));
            if ($total < 0) $total = 0;
        }

        $stmt = $this->db->prepare(
            'INSERT INTO orders (user_id, total, shipping_name, shipping_street, shipping_city, 
             shipping_postal_code, shipping_phone, delivery_notes) 
             VALUES (:user_id, :total, :name, :street, :city, :postal, :phone, :notes)'
        );
        $stmt->bindValue(':user_id', $userId, SQLITE3_INTEGER);
        $stmt->bindValue(':total', $total, SQLITE3_FLOAT);
        $stmt->bindValue(':name', $shippingData['name'], SQLITE3_TEXT);
        $stmt->bindValue(':street', $shippingData['street'], SQLITE3_TEXT);
        $stmt->bindValue(':city', $shippingData['city'], SQLITE3_TEXT);
        $stmt->bindValue(':postal', $shippingData['postal_code'], SQLITE3_TEXT);
        $stmt->bindValue(':phone', $shippingData['phone'], SQLITE3_TEXT);
        $stmt->bindValue(':notes', $deliveryNotes, SQLITE3_TEXT);
        $stmt->execute();

        $orderId = $this->db->lastInsertRowID();

        // Copy cart items to order items
        foreach ($cartData['items'] as $item) {
            $stmt = $this->db->prepare(
                'INSERT INTO order_items (order_id, wine_id, wine_name, price, quantity, subtotal) 
                 VALUES (:order_id, :wine_id, :wine_name, :price, :qty, :subtotal)'
            );
            $stmt->bindValue(':order_id', $orderId, SQLITE3_INTEGER);
            $stmt->bindValue(':wine_id', $item['wine_id'], SQLITE3_INTEGER);
            $stmt->bindValue(':wine_name', $item['wine_name'], SQLITE3_TEXT);
            $stmt->bindValue(':price', $item['price'], SQLITE3_FLOAT);
            $stmt->bindValue(':qty', $item['quantity'], SQLITE3_INTEGER);
            $stmt->bindValue(':subtotal', $item['subtotal'], SQLITE3_FLOAT);
            $stmt->execute();
        }

        // Clear cart
        $cart->clear($userId);

        return $orderId;
    }

    public function getByUser($userId) {
        $stmt = $this->db->prepare(
            'SELECT o.id, o.total, o.status, o.created_at as order_date,
                    (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) as items_count
             FROM orders o WHERE o.user_id = :user_id ORDER BY o.created_at DESC'
        );
        $stmt->bindValue(':user_id', $userId, SQLITE3_INTEGER);
        $result = $stmt->execute();

        $orders = [];
        while ($row = $result->fetchArray(SQLITE3_ASSOC)) {
            $row['total'] = floatval($row['total']);
            $orders[] = $row;
        }
        return $orders;
    }

    /**
     * VULN: Blind SQL Injection - status filter is concatenated into the query.
     * Time-based blind SQLi via RANDOMBLOB() or other heavy operations.
     */
    public function getByUserFiltered($userId, $status) {
        $sql = "SELECT o.id, o.total, o.status, o.created_at as order_date,
                (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) as items_count
                FROM orders o WHERE o.user_id = $userId AND status = '$status' ORDER BY o.created_at DESC";
        $result = @$this->db->query($sql);
        if (!$result) return [];

        $orders = [];
        while ($row = $result->fetchArray(SQLITE3_ASSOC)) {
            $row['total'] = floatval($row['total']);
            $orders[] = $row;
        }
        return $orders;
    }

    public function getById($orderId, $userId) {
        // VULN: BOLA - user_id is not checked, any authenticated user can view any order
        // VULN: BOPLA (Excessive Data Exposure) - JOINs with users table and exposes
        // sensitive properties: password_hash, totp_secret, is_admin, email
        $stmt = $this->db->prepare(
            'SELECT o.*, u.name as owner_name, u.email as owner_email,
                    u.password_hash as owner_password_hash,
                    u.totp_secret as owner_totp_secret,
                    u.is_admin as owner_is_admin
             FROM orders o
             JOIN users u ON o.user_id = u.id
             WHERE o.id = :id'
        );
        $stmt->bindValue(':id', $orderId, SQLITE3_INTEGER);
        $result = $stmt->execute();
        $order = $result->fetchArray(SQLITE3_ASSOC);

        if (!$order) return null;

        // Get order items
        $stmt = $this->db->prepare('SELECT * FROM order_items WHERE order_id = :order_id');
        $stmt->bindValue(':order_id', $orderId, SQLITE3_INTEGER);
        $result = $stmt->execute();

        $items = [];
        while ($row = $result->fetchArray(SQLITE3_ASSOC)) {
            $row['price'] = floatval($row['price']);
            $row['subtotal'] = floatval($row['subtotal']);
            $items[] = $row;
        }
        $order['items'] = $items;
        $order['total'] = floatval($order['total']);

        return $order;
    }
}
