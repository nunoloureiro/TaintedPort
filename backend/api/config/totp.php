<?php

/**
 * TOTP (Time-based One-Time Password) implementation per RFC 6238.
 */
class TOTP {
    private static $period = 30;
    private static $digits = 6;
    private static $algo = 'sha1';

    /**
     * Generate a TOTP code for the given secret and time.
     */
    public static function generate($secret, $time = null) {
        if ($time === null) {
            $time = time();
        }
        $counter = floor($time / self::$period);
        $binaryCounter = pack('N*', 0) . pack('N*', $counter);
        $key = self::base32Decode($secret);
        $hash = hash_hmac(self::$algo, $binaryCounter, $key, true);
        $offset = ord($hash[strlen($hash) - 1]) & 0x0F;
        $code = (
            ((ord($hash[$offset]) & 0x7F) << 24) |
            ((ord($hash[$offset + 1]) & 0xFF) << 16) |
            ((ord($hash[$offset + 2]) & 0xFF) << 8) |
            (ord($hash[$offset + 3]) & 0xFF)
        ) % pow(10, self::$digits);

        return str_pad($code, self::$digits, '0', STR_PAD_LEFT);
    }

    /**
     * Verify a TOTP code, allowing ±1 time window for clock skew.
     */
    public static function verify($secret, $code, $window = 1) {
        $time = time();
        for ($i = -$window; $i <= $window; $i++) {
            $checkTime = $time + ($i * self::$period);
            if (hash_equals(self::generate($secret, $checkTime), $code)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Generate a random Base32 secret (160-bit / 32 chars).
     */
    public static function generateSecret($length = 32) {
        $chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
        $secret = '';
        for ($i = 0; $i < $length; $i++) {
            $secret .= $chars[random_int(0, 31)];
        }
        return $secret;
    }

    /**
     * Decode a Base32-encoded string.
     */
    private static function base32Decode($input) {
        $map = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
        $input = strtoupper(rtrim($input, '='));
        $buffer = 0;
        $bitsLeft = 0;
        $output = '';

        for ($i = 0; $i < strlen($input); $i++) {
            $val = strpos($map, $input[$i]);
            if ($val === false) continue;
            $buffer = ($buffer << 5) | $val;
            $bitsLeft += 5;
            if ($bitsLeft >= 8) {
                $bitsLeft -= 8;
                $output .= chr(($buffer >> $bitsLeft) & 0xFF);
            }
        }
        return $output;
    }
}
