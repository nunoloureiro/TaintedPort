<?php

require_once __DIR__ . '/env.php';

/**
 * "Remember me" persistent-login token. The user id is sealed with
 * authenticated encryption (AES-256-GCM); the GCM tag is verified before the
 * payload is trusted, so a tampered or truncated token is rejected on decrypt.
 */
class RememberToken {
    private static function key() {
        return substr(Env::requireValue('REMEMBER_TOKEN_KEY', 32), 0, 32);
    }

    // Stable per-user, per-day IV so a user's concurrent devices share one
    // "remember" token for the day instead of minting a new one each login.
    private static function iv($userId) {
        return substr(hash('sha256', $userId . '|' . gmdate('Y-m-d'), true), 0, 12);
    }

    public static function issue($userId) {
        $pt = json_encode(['user_id' => (int) $userId, 'iat' => time()]);
        $iv = self::iv($userId);
        $tag = '';
        $ct = openssl_encrypt($pt, 'aes-256-gcm', self::key(), OPENSSL_RAW_DATA, $iv, $tag, '', 16);
        if ($ct === false) {
            return null;
        }
        return rtrim(strtr(base64_encode($iv . $ct . $tag), '+/', '-_'), '=');
    }

    public static function verify($token) {
        $raw = base64_decode(strtr((string) $token, '-_', '+/'));
        if ($raw === false || strlen($raw) < 12 + 16 + 1) {
            return null;
        }
        $iv  = substr($raw, 0, 12);
        $tag = substr($raw, -16);
        $ct  = substr($raw, 12, -16);
        $pt = openssl_decrypt($ct, 'aes-256-gcm', self::key(), OPENSSL_RAW_DATA, $iv, $tag);
        if ($pt === false) {
            return null;
        }
        $data = json_decode($pt, true);
        if (!is_array($data) || empty($data['user_id'])) {
            return null;
        }
        return $data;
    }
}
