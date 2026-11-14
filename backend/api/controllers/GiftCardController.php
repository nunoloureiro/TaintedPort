<?php

require_once __DIR__ . '/../config/giftcard.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/stripe.php';
require_once __DIR__ . '/../models/User.php';
require_once __DIR__ . '/../middleware/authorize.php';

class GiftCardController {
    private $user;

    public function __construct() {
        $this->user = new User();
    }

    /** Card values a customer can buy, in EUR. */
    const DENOMINATIONS = [10, 25, 50];
    /** Largest card an admin can issue, in EUR. */
    const ADMIN_MAX = 500;

    /** The caller's own cards (bought, or given to them by the shop). */
    public function mine($authUser) {
        $db = Database::getInstance();
        $stmt = $db->prepare(
            'SELECT g.id, g.card_id, g.amount, g.source, g.token, g.created_at,
                    (r.id IS NOT NULL) AS redeemed
             FROM gift_cards g LEFT JOIN redeemed_gift_cards r ON r.card_id = g.card_id
             WHERE g.owner_user_id = :uid ORDER BY g.id DESC'
        );
        $stmt->bindValue(':uid', $authUser['user_id'], SQLITE3_INTEGER);
        return [
            'success' => true,
            'denominations' => self::DENOMINATIONS,
            'gift_cards' => $this->rows($stmt->execute()),
        ];
    }

    /** Start a card purchase: a PaymentIntent for one of the listed values. */
    public function purchaseIntent($authUser) {
        if (!StripeClient::enabled()) {
            http_response_code(503);
            return ['success' => false, 'message' => 'Gift card purchases are not available right now.'];
        }
        $data = json_decode(file_get_contents('php://input'), true) ?: [];
        $amount = isset($data['amount']) ? intval($data['amount']) : 0;
        if (!in_array($amount, self::DENOMINATIONS, true)) {
            http_response_code(400);
            return ['success' => false, 'message' => 'Choose one of: ' . implode(', ', self::DENOMINATIONS) . ' EUR.'];
        }

        $res = StripeClient::createPaymentIntent($amount * 100, 'eur', [
            'user_id' => (string) $authUser['user_id'],
            'kind' => 'giftcard',
            'card_amount' => (string) $amount,
        ]);
        if ($res['status'] >= 400 || empty($res['data']['client_secret'])) {
            http_response_code(502);
            return ['success' => false, 'message' => 'Could not initialize the payment.'];
        }
        return [
            'success' => true,
            'client_secret' => $res['data']['client_secret'],
            'payment_intent_id' => $res['data']['id'],
            'amount' => $amount * 100,
            'currency' => 'eur',
        ];
    }

    /** Finish a card purchase once its payment has succeeded. */
    public function purchase($authUser) {
        if (!StripeClient::enabled()) {
            http_response_code(503);
            return ['success' => false, 'message' => 'Gift card purchases are not available right now.'];
        }
        $data = json_decode(file_get_contents('php://input'), true) ?: [];
        if (empty($data['payment_intent_id'])) {
            http_response_code(400);
            return ['success' => false, 'message' => 'payment_intent_id is required.'];
        }

        $pi = StripeClient::retrievePaymentIntent($data['payment_intent_id']);
        $p = $pi['data'];
        $meta = isset($p['metadata']) ? $p['metadata'] : [];
        $amount = isset($meta['card_amount']) ? intval($meta['card_amount']) : 0;
        $ok = $pi['status'] < 400
            && isset($p['status']) && $p['status'] === 'succeeded'
            && (isset($meta['kind']) ? $meta['kind'] : '') === 'giftcard'
            && (string)(isset($meta['user_id']) ? $meta['user_id'] : '') === (string)$authUser['user_id']
            && in_array($amount, self::DENOMINATIONS, true)
            && intval(isset($p['amount']) ? $p['amount'] : 0) === $amount * 100
            && (isset($p['currency']) ? $p['currency'] : '') === 'eur';
        if (!$ok) {
            http_response_code(402);
            return ['success' => false, 'message' => 'Payment could not be verified.'];
        }

        // One card per payment (UNIQUE payment_intent_id).
        $card = $this->store($amount, $authUser['user_id'], 'purchase', $data['payment_intent_id'], null);
        if ($card === null) {
            http_response_code(409);
            return ['success' => false, 'message' => 'This payment has already been used for a gift card.'];
        }
        http_response_code(201);
        return ['success' => true, 'gift_card' => $card];
    }

    /** Admin: every card issued so far. */
    public function adminIndex($authUser) {
        requireAdmin($authUser);
        $db = Database::getInstance();
        $res = $db->query(
            'SELECT g.id, g.card_id, g.amount, g.source, g.token, g.created_at, g.owner_user_id,
                    o.name AS owner_name, o.email AS owner_email, i.name AS issued_by_name,
                    (r.id IS NOT NULL) AS redeemed
             FROM gift_cards g
             JOIN users o ON o.id = g.owner_user_id
             LEFT JOIN users i ON i.id = g.issued_by
             LEFT JOIN redeemed_gift_cards r ON r.card_id = g.card_id
             ORDER BY g.id DESC'
        );
        return ['success' => true, 'gift_cards' => $this->rows($res)];
    }

    /** Admin: give a card to a customer. */
    public function adminIssue($authUser) {
        requireAdmin($authUser);
        $data = json_decode(file_get_contents('php://input'), true) ?: [];
        $userId = isset($data['user_id']) ? intval($data['user_id']) : 0;
        $amount = isset($data['amount']) ? round(floatval($data['amount']), 2) : 0;
        if ($amount < 1 || $amount > self::ADMIN_MAX) {
            http_response_code(400);
            return ['success' => false, 'message' => 'Amount must be between 1 and ' . self::ADMIN_MAX . ' EUR.'];
        }
        if (!$this->user->findById($userId)) {
            http_response_code(404);
            return ['success' => false, 'message' => 'User not found.'];
        }
        $issuer = isset($authUser['user_id']) ? intval($authUser['user_id']) : null;
        $card = $this->store($amount, $userId, 'admin', null, $issuer);
        http_response_code(201);
        return ['success' => true, 'gift_card' => $card];
    }

    /** Issue a card token and record it. Returns null if the payment was already used. */
    private function store($amount, $ownerId, $source, $paymentIntentId, $issuedBy) {
        $cardId = bin2hex(random_bytes(4));
        $token = GiftCard::issue($amount, $cardId);
        $db = Database::getInstance();
        $stmt = $db->prepare(
            'INSERT INTO gift_cards (card_id, token, amount, owner_user_id, source, payment_intent_id, issued_by)
             VALUES (:cid, :tok, :amt, :uid, :src, :pi, :by)'
        );
        $stmt->bindValue(':cid', $cardId, SQLITE3_TEXT);
        $stmt->bindValue(':tok', $token, SQLITE3_TEXT);
        $stmt->bindValue(':amt', $amount, SQLITE3_FLOAT);
        $stmt->bindValue(':uid', $ownerId, SQLITE3_INTEGER);
        $stmt->bindValue(':src', $source, SQLITE3_TEXT);
        $stmt->bindValue(':pi', $paymentIntentId, $paymentIntentId === null ? SQLITE3_NULL : SQLITE3_TEXT);
        $stmt->bindValue(':by', $issuedBy, $issuedBy === null ? SQLITE3_NULL : SQLITE3_INTEGER);
        try {
            $ok = $stmt->execute();
        } catch (\Exception $e) {
            $ok = false;
        }
        if ($ok === false) {
            return null;
        }
        return [
            'id' => $db->lastInsertRowID(),
            'card_id' => $cardId,
            'amount' => (float) $amount,
            'source' => $source,
            'token' => $token,
            'redeemed' => false,
        ];
    }

    private function rows($result) {
        $out = [];
        while ($row = $result->fetchArray(SQLITE3_ASSOC)) {
            $row['amount'] = (float) $row['amount'];
            $row['redeemed'] = !empty($row['redeemed']);
            $out[] = $row;
        }
        return $out;
    }

    /**
     * Redeem a gift card: decode its value and add it to the account's store
     * credit.
     */
    public function redeem($authUser) {
        $data = json_decode(file_get_contents('php://input'), true);
        if (empty($data['gift_card'])) {
            http_response_code(400);
            return ['success' => false, 'message' => 'gift_card is required.'];
        }

        $fields = GiftCard::decode($data['gift_card']);
        if ($fields === null || !isset($fields['amount']) || empty($fields['id'])) {
            http_response_code(400);
            return ['success' => false, 'message' => 'Invalid gift card.'];
        }

        $amount = floatval($fields['amount']);

        // A gift card is single-use. Claim its id first: the UNIQUE(card_id)
        // constraint makes the INSERT the authoritative guard, so a card that
        // has already been redeemed (or two concurrent redemptions of the same
        // card) can't be credited twice.
        $db = Database::getInstance();
        $stmt = $db->prepare(
            'INSERT INTO redeemed_gift_cards (card_id, user_id, amount, redeemed_at)
             VALUES (:cid, :uid, :amt, :ts)'
        );
        $stmt->bindValue(':cid', (string)$fields['id'], SQLITE3_TEXT);
        $stmt->bindValue(':uid', $authUser['user_id'], SQLITE3_INTEGER);
        $stmt->bindValue(':amt', $amount, SQLITE3_FLOAT);
        $stmt->bindValue(':ts', time(), SQLITE3_INTEGER);
        try {
            $claimed = $stmt->execute();
        } catch (\Exception $e) {
            $claimed = false; // UNIQUE(card_id) violation -> already redeemed
        }
        if ($claimed === false) {
            http_response_code(409);
            return ['success' => false, 'message' => 'This gift card has already been redeemed.'];
        }

        $this->user->addCredit($authUser['user_id'], $amount);

        return [
            'success' => true,
            'message' => 'Gift card redeemed.',
            'credited' => $amount,
            'balance' => $this->user->getCredit($authUser['user_id']),
        ];
    }
}
