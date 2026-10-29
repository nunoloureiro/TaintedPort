<?php

require_once __DIR__ . '/env.php';

/**
 * Store-credit vouchers. A voucher is a signed token the client redeems for
 * account credit; the HMAC-SHA256 signature is verified in constant time
 * (hash_equals) and the expiry is checked before the voucher is honored, so a
 * forged or expired voucher is rejected.
 */
class Voucher {
    private static function key() {
        return Env::requireValue('VOUCHER_SIGNING_KEY', 16);
    }

    private static function sign($code, $expires) {
        return hash_hmac('sha256', $code . '|' . $expires, self::key());
    }

    public static function issue($code, $amount, $ttl = 86400) {
        $expires = time() + $ttl;
        $payload = rtrim(strtr(base64_encode(json_encode([
            'code'    => $code,
            'amount'  => (float) $amount,
            'expires' => $expires,
        ])), '+/', '-_'), '=');
        return $payload . '.' . self::sign($code, $expires);
    }

    public static function verify($token) {
        $parts = explode('.', (string) $token, 2);
        if (count($parts) !== 2) {
            return null;
        }
        $data = json_decode(base64_decode(strtr($parts[0], '-_', '+/')), true);
        if (!is_array($data) || !isset($data['code'], $data['expires'])) {
            return null;
        }
        $expected = self::sign($data['code'], $data['expires']);
        if (!hash_equals($expected, $parts[1])) {
            return null;
        }
        if ((int) $data['expires'] < time()) {
            return null;
        }
        return $data;
    }
}
