<?php

require_once __DIR__ . '/../config/stripe.php';
require_once __DIR__ . '/../models/Order.php';

class PaymentController {
    private $order;

    public function __construct() {
        $this->order = new Order();
    }

    /**
     * Create a Stripe PaymentIntent for the caller's current cart. The amount
     * is computed server-side (cart + discount + store credit + VAT) so the
     * client can never dictate what it pays. Returns the client_secret the
     * frontend needs to confirm the card payment.
     */
    public function createIntent($authUser) {
        if (!StripeClient::enabled()) {
            http_response_code(503);
            return ['success' => false, 'message' => 'Card payments are not configured.'];
        }

        $data = json_decode(file_get_contents('php://input'), true) ?: [];

        $discountPercent = 0;
        if (!empty($data['discount_code'])) {
            $discountPercent = isset($data['discount_percent']) ? floatval($data['discount_percent']) : 10;
        }

        $amount = $this->order->checkoutAmountCents($authUser['user_id'], $discountPercent);
        if ($amount <= 0) {
            http_response_code(400);
            return ['success' => false, 'message' => 'No card payment is required for this order.', 'amount' => 0];
        }

        $res = StripeClient::createPaymentIntent($amount, 'eur', ['user_id' => (string) $authUser['user_id'], 'kind' => 'order']);
        if ($res['status'] >= 400 || empty($res['data']['client_secret'])) {
            http_response_code(502);
            return [
                'success' => false,
                'message' => 'Could not initialize the payment.',
                'stripe_error' => isset($res['data']['error']['message']) ? $res['data']['error']['message'] : null,
            ];
        }

        return [
            'success' => true,
            'client_secret' => $res['data']['client_secret'],
            'payment_intent_id' => $res['data']['id'],
            'amount' => $amount,
            'currency' => 'eur',
        ];
    }
}
