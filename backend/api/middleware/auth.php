<?php

require_once __DIR__ . '/../config/jwt.php';

function authenticateToken() {
    $headers = getallheaders();
    $authHeader = isset($headers['Authorization']) ? $headers['Authorization'] : '';

    if (empty($authHeader) || !preg_match('/^Bearer\s+(.+)$/', $authHeader, $matches)) {
        http_response_code(401);
        echo json_encode(['success' => false, 'message' => 'Access denied. No token provided.']);
        exit;
    }

    $token = $matches[1];
    $decoded = JWT::decode($token);

    if ($decoded === null) {
        http_response_code(401);
        echo json_encode(['success' => false, 'message' => 'Invalid or expired token.']);
        exit;
    }

    return $decoded;
}
