<?php

require_once __DIR__ . '/../models/User.php';
require_once __DIR__ . '/../config/voucher.php';
require_once __DIR__ . '/../config/database.php';

class VoucherController {
    private $user;

    public function __construct() {
        $this->user = new User();
    }

    /** Issue a standard promo voucher (store credit) to the current user. */
    public function promo($authUser) {
        // One promo voucher per account. The conditional UPDATE flips the flag
        // atomically, so it also settles two simultaneous claims (only one wins).
        $db = Database::getInstance();
        $stmt = $db->prepare(
            'UPDATE users SET promo_voucher_claimed = 1
             WHERE id = :id AND promo_voucher_claimed = 0'
        );
        $stmt->bindValue(':id', $authUser['user_id'], SQLITE3_INTEGER);
        $stmt->execute();
        if ($db->changes() === 0) {
            http_response_code(409);
            return ['success' => false, 'message' => 'You have already claimed your promo voucher.'];
        }

        $code = 'PROMO-' . strtoupper(bin2hex(random_bytes(4)));
        $token = Voucher::issue($code, 10.00);
        return [
            'success' => true,
            'voucher' => $token,
            'amount' => 10.00,
            'message' => 'Promo voucher issued. Redeem it for store credit.',
        ];
    }

    /** Convert the caller's store credit into a transferable signed voucher. */
    public function cashout($authUser) {
        $userId = $authUser['user_id'];
        $balance = $this->user->getCredit($userId);
        if ($balance <= 0) {
            http_response_code(400);
            return ['success' => false, 'message' => 'No store credit available to cash out.'];
        }

        $code = 'CASHOUT-' . strtoupper(bin2hex(random_bytes(4)));
        $token = Voucher::issue($code, $balance);
        $this->user->addCredit($userId, -$balance);

        return [
            'success' => true,
            'voucher' => $token,
            'amount' => $balance,
            'message' => 'Store credit converted to a transferable voucher.',
        ];
    }

    /** Redeem a signed voucher for store credit. */
    public function redeem($authUser) {
        $data = json_decode(file_get_contents('php://input'), true);
        if (empty($data['voucher'])) {
            http_response_code(400);
            return ['success' => false, 'message' => 'voucher is required.'];
        }

        $v = Voucher::verify($data['voucher']);
        if (!$v) {
            http_response_code(400);
            return ['success' => false, 'message' => 'Invalid or expired voucher.'];
        }

        $amount = (float) $v['amount'];

        // A voucher is single-use. Claim its code first: the UNIQUE(code)
        // constraint makes the INSERT the authoritative guard, so a voucher that
        // has already been redeemed (or two concurrent redemptions of the same
        // voucher) can't be credited twice.
        $db = Database::getInstance();
        $stmt = $db->prepare(
            'INSERT INTO redeemed_vouchers (code, user_id, amount, redeemed_at)
             VALUES (:code, :uid, :amt, :ts)'
        );
        $stmt->bindValue(':code', (string) $v['code'], SQLITE3_TEXT);
        $stmt->bindValue(':uid', $authUser['user_id'], SQLITE3_INTEGER);
        $stmt->bindValue(':amt', $amount, SQLITE3_FLOAT);
        $stmt->bindValue(':ts', time(), SQLITE3_INTEGER);
        try {
            $claimed = $stmt->execute();
        } catch (\Exception $e) {
            if (stripos($e->getMessage(), 'UNIQUE') === false) {
                throw $e; // any other database error is a server error
            }
            $claimed = false; // UNIQUE(code) violation -> already redeemed
        }
        if ($claimed === false) {
            http_response_code(409);
            return ['success' => false, 'message' => 'This voucher has already been redeemed.'];
        }

        $this->user->addCredit($authUser['user_id'], $amount);
        $me = $this->user->findById($authUser['user_id']);

        return [
            'success' => true,
            'message' => 'Voucher redeemed.',
            'credited' => $amount,
            'balance' => isset($me['account_credit']) ? $me['account_credit'] : null,
        ];
    }
}
