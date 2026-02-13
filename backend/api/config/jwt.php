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

        $validSignature = self::base64UrlEncode(
            hash_hmac('sha256', "$header.$payload", self::$secret, true)
        );

        if (!hash_equals($validSignature, $signature)) {
            return null;
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
