<?php

require_once __DIR__ . '/../models/Order.php';
require_once __DIR__ . '/../models/Cart.php';
require_once __DIR__ . '/../models/DiscountCode.php';
require_once __DIR__ . '/../config/tracking.php';
require_once __DIR__ . '/../config/stripe.php';

class OrderController {
    private $order;

    public function __construct() {
        $this->order = new Order();
    }

    /**
     * Issue a shareable "track your order" link for one of the caller's own
     * orders. The token payload is base64url-encoded and signed.
     */
    public function trackingLink($authUser, $orderId) {
        $order = $this->order->getById(intval($orderId), $authUser['user_id']);
        if (!$order || $order['user_id'] != $authUser['user_id']) {
            http_response_code(404);
            return ['success' => false, 'message' => 'Order not found.'];
        }

        $data = 'order_id=' . intval($orderId) . '&iat=' . time();
        $sig = TrackingLink::sign($data);
        $d = rtrim(strtr(base64_encode($data), '+/', '-_'), '=');

        return [
            'success' => true,
            'tracking_url' => '/orders/track?d=' . $d . '&sig=' . $sig,
        ];
    }

    /**
     * Public order tracking via a signed link (no login). Verifies the
     * signature over the raw token bytes, then serves the order.
     */
    public function track() {
        $d = isset($_GET['d']) ? $_GET['d'] : '';
        $sig = isset($_GET['sig']) ? $_GET['sig'] : '';

        $data = base64_decode(strtr($d, '-_', '+/'));
        if ($data === false || !TrackingLink::verify($data, $sig)) {
            http_response_code(403);
            return ['success' => false, 'message' => 'Invalid or expired tracking link.'];
        }

        // Pull the fields out of the signed token. Split by hand so the
        // "amount"-style bracket rewriting parse_str() does can't bite us.
        $params = [];
        foreach (explode('&', $data) as $pair) {
            if ($pair === '') continue;
            $kv = explode('=', $pair, 2);
            $params[urldecode($kv[0])] = isset($kv[1]) ? urldecode($kv[1]) : '';
        }
        $orderId = isset($params['order_id']) ? intval($params['order_id']) : 0;

        $order = $this->order->getById($orderId, 0);
        if (!$order) {
            http_response_code(404);
            return ['success' => false, 'message' => 'Order not found.'];
        }

        return ['success' => true, 'order' => $order];
    }

    /**
     * Downloadable invoice for one of the caller's own orders. The order the
     * caller is authorized for is resolved from the request's `id` scope before
     * the invoice body is loaded.
     */
    public function invoice($authUser) {
        $scope = self::queryScope('id');
        if ($scope === null) {
            http_response_code(400);
            return ['success' => false, 'message' => 'id is required.'];
        }

        if (!$this->order->belongsTo((int) $scope, $authUser['user_id'])) {
            http_response_code(403);
            return ['success' => false, 'message' => 'You do not have access to this invoice.'];
        }

        $id = isset($_GET['id']) ? (int) $_GET['id'] : (int) $scope;
        $invoice = $this->order->getInvoice($id);
        if (!$invoice) {
            http_response_code(404);
            return ['success' => false, 'message' => 'Invoice not found.'];
        }

        return ['success' => true, 'invoice' => $invoice];
    }

    /** First value supplied for a key in the raw request query string. */
    private static function queryScope($key) {
        $qs = isset($_SERVER['QUERY_STRING']) ? $_SERVER['QUERY_STRING'] : '';
        foreach (explode('&', $qs) as $pair) {
            if ($pair === '') continue;
            $kv = explode('=', $pair, 2);
            if (urldecode($kv[0]) === $key) {
                return isset($kv[1]) ? urldecode($kv[1]) : '';
            }
        }
        return null;
    }

    public function receipt($authUser, $orderId) {
        if (!$this->order->belongsTo((int) $orderId, $authUser['user_id'])) {
            http_response_code(404);
            return ['success' => false, 'message' => 'Order not found.'];
        }
        $invoice = $this->order->getInvoice((int) $orderId);
        if (!$invoice) {
            http_response_code(404);
            return ['success' => false, 'message' => 'Order not found.'];
        }
        return ['success' => true, 'receipt' => $invoice];
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

        // Card payment is optional. When a payment_intent_id is supplied we
        // must confirm the payment actually succeeded, belongs to this buyer,
        // and covers the amount owed before fulfilling the order. Orders placed
        // without one fall back to payment-on-delivery, as before.
        $paymentIntentId = null;
        if (!empty($data['payment_intent_id'])) {
            if (!StripeClient::enabled()) {
                http_response_code(503);
                return ['success' => false, 'message' => 'Card payments are not configured.'];
            }
            $expected = $this->order->checkoutAmountCents($authUser['user_id'], $discountPercent);
            $pi = StripeClient::retrievePaymentIntent($data['payment_intent_id']);
            $p = $pi['data'];
            $ok = $pi['status'] < 400
                && isset($p['status']) && $p['status'] === 'succeeded'
                && (string)(isset($p['metadata']['user_id']) ? $p['metadata']['user_id'] : '') === (string)$authUser['user_id']
                && intval(isset($p['amount']) ? $p['amount'] : 0) >= $expected;
            if (!$ok) {
                http_response_code(402);
                return ['success' => false, 'message' => 'Payment could not be verified.'];
            }
            if ($this->order->isPaymentIntentUsed($data['payment_intent_id'])) {
                http_response_code(409);
                return ['success' => false, 'message' => 'This payment has already been used for an order.'];
            }
            $paymentIntentId = $data['payment_intent_id'];
        }

        $orderId = $this->order->create($authUser['user_id'], $addr, $notes, $discountPercent, $paymentIntentId);

        if ($orderId === null) {
            http_response_code(400);
            return ['success' => false, 'message' => 'Cart is empty.'];
        }

        if (is_array($orderId) && isset($orderId['error'])) {
            http_response_code(409);
            return ['success' => false, 'message' => $orderId['message']];
        }

        // If the code used matches a real managed discount code, count
        // the redemption against it for reporting purposes.
        if (!empty($data['discount_code'])) {
            $discountModel = new DiscountCode();
            $realCode = $discountModel->findByCode(strtoupper(trim($data['discount_code'])));
            if ($realCode) {
                $discountModel->incrementUsedCount($realCode['id']);
            }
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
