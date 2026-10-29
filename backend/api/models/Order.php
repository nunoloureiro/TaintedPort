<?php

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/Wine.php';
require_once __DIR__ . '/User.php';

class Order {
    private $db;

    public function __construct() {
        $this->db = Database::getInstance();
    }

    /**
     * Read-only preview of what the buyer must pay by card, in cents: the cart
     * subtotal after the same discount + store-credit logic create() applies,
     * plus 23% VAT. Used to size the Stripe PaymentIntent and to verify it.
     */
    public function checkoutAmountCents($userId, $discountPercent = 0) {
        $cart = new Cart();
        $cartData = $cart->getItems($userId);
        if (empty($cartData['items'])) {
            return 0;
        }
        $total = $cartData['total'];
        if ($discountPercent > 0) {
            $total = $total * (1 - ($discountPercent / 100));
            if ($total < 0) $total = 0;
        }
        $userModel = new User();
        $credit = $userModel->getCredit($userId);
        if ($credit > 0 && $total > 0) {
            $total = round($total - min($credit, $total), 2);
        }
        $grand = round($total * 1.23, 2); // VAT-inclusive, mirrors the UI total
        return (int) round($grand * 100);
    }

    /** True if some order already consumed this Stripe PaymentIntent. */
    public function isPaymentIntentUsed($paymentIntentId) {
        $stmt = $this->db->prepare('SELECT 1 FROM orders WHERE payment_intent_id = :pi LIMIT 1');
        $stmt->bindValue(':pi', $paymentIntentId, SQLITE3_TEXT);
        return (bool) $stmt->execute()->fetchArray(SQLITE3_ASSOC);
    }

    /** Set the status of every order tied to a PaymentIntent. Returns rows changed. */
    public function updateStatusByPaymentIntent($paymentIntentId, $status) {
        $stmt = $this->db->prepare('UPDATE orders SET status = :status WHERE payment_intent_id = :pi');
        $stmt->bindValue(':status', $status, SQLITE3_TEXT);
        $stmt->bindValue(':pi', $paymentIntentId, SQLITE3_TEXT);
        $stmt->execute();
        return $this->db->changes();
    }

    /**
     * Advance a PaymentIntent's order to :status only from the given prior
     * statuses (so a refund/dispute can't be clobbered by a late
     * payment_intent.succeeded, and updates stay idempotent).
     */
    public function advanceStatusByPaymentIntent($paymentIntentId, $status, array $fromStatuses) {
        $names = [];
        foreach ($fromStatuses as $i => $s) {
            $names[] = ':s' . $i;
        }
        $in = implode(',', $names);
        $stmt = $this->db->prepare(
            "UPDATE orders SET status = :status WHERE payment_intent_id = :pi AND status IN ($in)"
        );
        $stmt->bindValue(':status', $status, SQLITE3_TEXT);
        $stmt->bindValue(':pi', $paymentIntentId, SQLITE3_TEXT);
        foreach ($fromStatuses as $i => $s) {
            $stmt->bindValue(':s' . $i, $s, SQLITE3_TEXT);
        }
        $stmt->execute();
        return $this->db->changes();
    }

    public function create($userId, $shippingData, $deliveryNotes = '', $discountPercent = 0, $paymentIntentId = null) {
        $cart = new Cart();
        $cartData = $cart->getItems($userId);

        if (empty($cartData['items'])) {
            return null;
        }

        // Verify stock before committing to the order - report the first
        // item that can't be fulfilled rather than partially decrementing.
        $wine = new Wine();
        foreach ($cartData['items'] as $item) {
            $wineRow = $wine->getById($item['wine_id']);
            if (!$wineRow || $wineRow['stock_quantity'] < $item['quantity']) {
                return [
                    'error' => 'insufficient_stock',
                    'message' => 'Not enough stock for ' . $item['wine_name'] . '.',
                ];
            }
        }

        $total = $cartData['total'];

        if ($discountPercent > 0) {
            $total = $total * (1 - ($discountPercent / 100));
            if ($total < 0) $total = 0;
        }

        // Apply the buyer's store credit toward the order total.
        $userModel = new User();
        $credit = $userModel->getCredit($userId);
        if ($credit > 0 && $total > 0) {
            $applied = min($credit, $total);
            $total = round($total - $applied, 2);
            $userModel->addCredit($userId, -$applied);
        }

        $stmt = $this->db->prepare(
            'INSERT INTO orders (user_id, total, shipping_name, shipping_street, shipping_city,
             shipping_postal_code, shipping_phone, delivery_notes, payment_intent_id)
             VALUES (:user_id, :total, :name, :street, :city, :postal, :phone, :notes, :pi)'
        );
        $stmt->bindValue(':user_id', $userId, SQLITE3_INTEGER);
        $stmt->bindValue(':total', $total, SQLITE3_FLOAT);
        $stmt->bindValue(':name', $shippingData['name'], SQLITE3_TEXT);
        $stmt->bindValue(':street', $shippingData['street'], SQLITE3_TEXT);
        $stmt->bindValue(':city', $shippingData['city'], SQLITE3_TEXT);
        $stmt->bindValue(':postal', $shippingData['postal_code'], SQLITE3_TEXT);
        $stmt->bindValue(':phone', $shippingData['phone'], SQLITE3_TEXT);
        $stmt->bindValue(':notes', $deliveryNotes, SQLITE3_TEXT);
        $stmt->bindValue(':pi', $paymentIntentId, $paymentIntentId === null ? SQLITE3_NULL : SQLITE3_TEXT);
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

            $wine->adjustStock($item['wine_id'], -$item['quantity']);
        }

        // Clear cart
        $cart->clear($userId);

        return $orderId;
    }

    public function belongsTo($orderId, $userId) {
        $stmt = $this->db->prepare('SELECT 1 FROM orders WHERE id = :id AND user_id = :uid LIMIT 1');
        $stmt->bindValue(':id', $orderId, SQLITE3_INTEGER);
        $stmt->bindValue(':uid', $userId, SQLITE3_INTEGER);
        return (bool) $stmt->execute()->fetchArray(SQLITE3_ASSOC);
    }

    public function getInvoice($orderId) {
        $stmt = $this->db->prepare(
            'SELECT o.id, o.total, o.status, o.created_at,
                    o.shipping_name, o.shipping_street, o.shipping_city,
                    o.shipping_postal_code, o.shipping_phone,
                    u.name AS customer_name, u.email AS customer_email
             FROM orders o JOIN users u ON o.user_id = u.id
             WHERE o.id = :id'
        );
        $stmt->bindValue(':id', $orderId, SQLITE3_INTEGER);
        $order = $stmt->execute()->fetchArray(SQLITE3_ASSOC);
        if (!$order) return null;

        $stmt = $this->db->prepare('SELECT wine_name, price, quantity, subtotal FROM order_items WHERE order_id = :id');
        $stmt->bindValue(':id', $orderId, SQLITE3_INTEGER);
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
