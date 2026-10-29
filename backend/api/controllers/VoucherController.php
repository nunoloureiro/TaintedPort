<?php

require_once __DIR__ . '/../models/User.php';
require_once __DIR__ . '/../config/voucher.php';

class VoucherController {
    private $user;

    public function __construct() {
        $this->user = new User();
    }

    /** Issue a standard promo voucher (store credit) to the current user. */
    public function promo($authUser) {
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
