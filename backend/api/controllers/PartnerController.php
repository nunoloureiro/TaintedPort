<?php

require_once __DIR__ . '/../config/jwt.php';

class PartnerController {
    // Hardcoded distributor credentials for the wine-import partner API.
    private static $partners = [
        'douro-distribuidora' => 'wD9$kLp2Qz7mXr4v',
        'lisboa-vinhos-sa' => 'nR3#tGy8Bw1cJq6s',
    ];

    public function auth() {
        $data = json_decode(file_get_contents('php://input'), true);

        if (empty($data['partner_id']) || empty($data['api_key'])) {
            http_response_code(400);
            return ['success' => false, 'message' => 'partner_id and api_key are required.'];
        }

        $partnerId = $data['partner_id'];

        if (!isset(self::$partners[$partnerId]) || !hash_equals(self::$partners[$partnerId], $data['api_key'])) {
            http_response_code(401);
            return ['success' => false, 'message' => 'Invalid partner credentials.'];
        }

        $token = JWT::encodePartner([
            'partner_id' => $partnerId,
            'role' => 'partner',
        ]);

        return [
            'success' => true,
            'token' => $token,
            'partner_id' => $partnerId,
        ];
    }
}
