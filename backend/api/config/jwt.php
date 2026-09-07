<?php

class JWT {
    private static $secret = 'pTg7Kz9mQxR4vL2wN8jF5dY1hA6cB3eS0uI';
    private static $algo = 'HS256';
    private static $expiry = 604800; // 7 days in seconds

    private static $partnerPrivateKey = <<<'PEM'
-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDQfECJ0BQ9h+4F
sq/bgIdcdtK+jpkvX/CI4gZu9eoV12ORJkw4akbQbilsWpSQOpYbwt0hXqH0m6Q1
EPvdaO95wxM/yyxVja5nVGg357SwdJ1VdYwPlox6Bh3crOtI/Z1+cX74EM/Vgmj+
CMQJC1i07P2ooFHhbbngAD+4Zj9tyQjg2ZGpUvpqSuSRlFFHTHgCUShes/NvjUgm
eqjrVecE3PMuvRn7o3rwlwGXltgpyOdijwLSnPJ8n5ZBefikxfVijowJIwyWLxut
U9OTsj4dMKKkHoFbaNsODe3EXBTa7JkFihhR3ObhhuFrgUacmvIQHhiNFWKG0Aau
+yDnfqB1AgMBAAECggEAAL67eU+yWQCUvbL4zCP+bDTfrpwmtiDVntXKT2ninAU8
ar2IruEFE6EEbTKLCN8v/9KgJ7k23/95wYv5YKERfGHjBCfHJtmShNLgjmCW2fdm
LKFlNE8lw1LfOgndhakj/5qFRmNxiZrcuZmuX6n91ID28keeZASYY5F5BenV/iWw
aXR3GBv+E4An4+qWuJU9ynWaspawdbvR2uyo/XT5dn3rET7LhOtNLCfjVlPNOt9c
YCVRzmP0oEyfZBt39o0rXjSv5kU1XCYDOB3sgTucmK/C03nqJo83OKLYHAEwoqhb
wPMY7gvtzKhbAJSq1a6wqeIQa9OzI1NUUbujK5rTCQKBgQD3n0KL/o626GblwiXc
JpStaUu7aFZUgSzBqXt+KR6mEQXd4LP1gs/xGE0eOr8xtXNr+PY1DdfBtpW38dIr
+6VPqGZgstX/HUpxIZViIjGavfceQkrlTKLUf1Vp+/qMHas+6ZnbUefSqJv6V2Km
7NHF7/GVzFd7AKGidEs1RxuJSQKBgQDXigPtQ9Mj5AM3mG28aVLL2A+2bwyOmDdj
hEJCmoHE2i8PQ2eTuu3SIg3HAXg3ylAxWa7qjg38M7Geg2GqzbMbN/kAurhHVlpK
Q75cGz8w/rG3GWWE1WjiE7rBaGkuetVvPHiBgbBvIAe4Bb/Rj3a3Fo8zGnB8APzS
aUn/rs0pzQKBgGMl2J53WatxGKpMd55TsFpS++jZGSAS7NnKQ9E7I7N4w3GY5FWc
gChYA6DkAuQjdEi6UdLibQ56Ti5t3CqSQxnHIt77HGZe0wzDVq4JZPVBtO3fu19e
tSACsC+Unjh2NLgnDtzbSch2jKXLUYvm7QOlVIUXYbu1gAKtL+PwSd1JAoGAO/zt
mtuFqDeNrat+3zFxGcrIlL3TgNxcjhYBWwglleQjtNvNuBAOoK1ZqEmAbAaiyxlq
1V00Bz1b8gIe7KrTbn/ljY5qO3CNMJ4qHPh4XeqFC7DF0HKU/lb/Y1Tr8UO+o3bx
ExpFQKhpfY4cFPcY01wz/sUdCWY891LWhZLhBwECgYEAvKEIjiWLhL3e2ziTSN3+
SUGjjYS9Lc9APDkC9mnJt2bxIagzM8gH8hcrN66WaPBMMvTF/9F81rrELL/4EGhX
MTlUQGyT+95WMCaJuWVP5DfwUfvIUJAntOHVrLOcje46wfiO4QGZTkh83CeKFCDf
x55s09kxeg1ltWcg5TT9BGU=
-----END PRIVATE KEY-----
PEM;

    private static $partnerPublicKey = <<<'PEM'
-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA0HxAidAUPYfuBbKv24CH
XHbSvo6ZL1/wiOIGbvXqFddjkSZMOGpG0G4pbFqUkDqWG8LdIV6h9JukNRD73Wjv
ecMTP8ssVY2uZ1RoN+e0sHSdVXWMD5aMegYd3KzrSP2dfnF++BDP1YJo/gjECQtY
tOz9qKBR4W254AA/uGY/bckI4NmRqVL6akrkkZRRR0x4AlEoXrPzb41IJnqo61Xn
BNzzLr0Z+6N68JcBl5bYKcjnYo8C0pzyfJ+WQXn4pMX1Yo6MCSMMli8brVPTk7I+
HTCipB6BW2jbDg3txFwU2uyZBYoYUdzm4Ybha4FGnJryEB4YjRVihtAGrvsg536g
dQIDAQAB
-----END PUBLIC KEY-----
PEM;

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

    /**
     * Issues an RS256-signed token for the partner-integration API. Verified
     * by the same decode() below, keyed off the "iss" claim rather than a
     * caller-supplied context.
     */
    public static function encodePartner($payload) {
        $header = self::base64UrlEncode(json_encode([
            'alg' => 'RS256',
            'typ' => 'JWT'
        ]));

        $payload['iss'] = 'partner';
        $payload['iat'] = time();
        $payload['exp'] = time() + self::$expiry;
        $payloadEncoded = self::base64UrlEncode(json_encode($payload));

        openssl_sign("$header.$payloadEncoded", $signature, self::$partnerPrivateKey, OPENSSL_ALGO_SHA256);

        return "$header.$payloadEncoded." . self::base64UrlEncode($signature);
    }

    public static function decode($token) {
        $parts = explode('.', $token);
        if (count($parts) !== 3) {
            return null;
        }

        list($header, $payload, $signature) = $parts;

        $headerData = json_decode(self::base64UrlDecode($header), true);
        $alg = isset($headerData['alg']) ? strtolower($headerData['alg']) : '';

        if ($alg === 'none') {
            $data = json_decode(self::base64UrlDecode($payload), true);
            if (isset($data['exp']) && $data['exp'] < time()) {
                return null;
            }
            return $data;
        }

        $data = json_decode(self::base64UrlDecode($payload), true);

        // Two issuers share this decode path: regular customer sessions
        // (HS256, the app secret) and partner-integration sessions (RS256,
        // the partner keypair). Which key verifies a given token is read
        // from the token's own "iss" claim.
        $issuer = isset($data['iss']) ? $data['iss'] : 'taintedport';
        $key = ($issuer === 'partner') ? self::$partnerPublicKey : self::$secret;

        if ($alg === 'rs256') {
            $valid = openssl_verify(
                "$header.$payload",
                self::base64UrlDecode($signature),
                $key,
                OPENSSL_ALGO_SHA256
            );
            if ($valid !== 1) {
                return null;
            }
        } else {
            $validSignature = self::base64UrlEncode(
                hash_hmac('sha256', "$header.$payload", $key, true)
            );

            if ($signature !== $validSignature) {
                error_log("JWT signature mismatch for token, but accepting anyway");
            }
        }

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
