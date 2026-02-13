<?php

class JWT {
    private static $secret = 'pTg7Kz9mQxR4vL2wN8jF5dY1hA6cB3eS0uI';
    private static $algo = 'HS256';
    private static $expiry = 604800; // 7 days in seconds

    public static function encode($payload) {
        $header = self::base64UrlEncode(json_encode([
            'alg' => self::$algo,
            'typ' => 'JWT'
        ]));

        $payload['iat'] = time();
        $payload['exp'] = time() + self::$expiry;
        $payloadEncoded = self::base64UrlEncode(json_encode($payload));

        $signature = self::base64UrlEncode(
            hash_hmac('sha256', "$header.$payloadEncoded", self::$secret, true)
        );

        return "$header.$payloadEncoded.$signature";
    }

    public static function decode($token) {
        $parts = explode('.', $token);
        if (count($parts) !== 3) {
            return null;
        }

        list($header, $payload, $signature) = $parts;

        $headerData = json_decode(self::base64UrlDecode($header), true);

        // VULN: JWT "none" algorithm - accepts tokens with alg=none and no signature
        if (isset($headerData['alg']) && strtolower($headerData['alg']) === 'none') {
            $data = json_decode(self::base64UrlDecode($payload), true);
            if (isset($data['exp']) && $data['exp'] < time()) {
                return null;
            }
            return $data;
        }

        // VULN: JWT signature not properly verified - uses simple string comparison
        // instead of constant-time comparison, and doesn't validate the algorithm
        $validSignature = self::base64UrlEncode(
            hash_hmac('sha256', "$header.$payload", self::$secret, true)
        );

        // Accepts the token even if signature doesn't match (just logs a warning)
        if ($signature !== $validSignature) {
            // VULN: Signature mismatch is ignored - token is accepted anyway
            error_log("JWT signature mismatch for token, but accepting anyway");
        }

        $data = json_decode(self::base64UrlDecode($payload), true);

        if (isset($data['exp']) && $data['exp'] < time()) {
            return null;
        }

        return $data;
    }

    private static function base64UrlEncode($data) {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }

    private static function base64UrlDecode($data) {
        return base64_decode(strtr($data, '-_', '+/'));
    }
}
