<?php

require_once __DIR__ . '/../models/User.php';

class PasswordResetController {
    private $user;
    private $logFile;

    public function __construct() {
        $this->user = new User();
        $this->logFile = __DIR__ . '/../../data/password-reset-requests.log';
        $dir = dirname($this->logFile);
        if (!is_dir($dir)) {
            mkdir($dir, 0777, true);
        }
    }

    public function forgotPassword() {
        $data = json_decode(file_get_contents('php://input'), true);

        if (empty($data['email'])) {
            http_response_code(400);
            return ['success' => false, 'message' => 'Email is required.'];
        }

        $user = $this->user->findByEmail($data['email']);

        if ($user) {
            $issuedAt = time();
            $this->user->setResetTokenIssuedAt($user['id'], $issuedAt);

            $entry = [
                'timestamp' => date('Y-m-d\TH:i:s\Z'),
                'user_id' => $user['id'],
                'email' => $user['email'],
                'requested_at' => $issuedAt,
            ];
            file_put_contents($this->logFile, json_encode($entry) . "\n", FILE_APPEND | LOCK_EX);
        }

        return [
            'success' => true,
            'message' => 'If that email address is registered, a password reset link has been sent.',
        ];
    }

    public function resetPassword() {
        $data = json_decode(file_get_contents('php://input'), true);

        if (empty($data['email']) || empty($data['token']) || empty($data['new_password'])) {
            http_response_code(400);
            return ['success' => false, 'message' => 'Email, token, and new password are required.'];
        }

        if (strlen($data['new_password']) < 8) {
            http_response_code(400);
            return ['success' => false, 'message' => 'New password must be at least 8 characters.'];
        }

        $user = $this->user->findByEmail($data['email']);

        if (!$user || empty($user['reset_token_issued_at'])) {
            http_response_code(400);
            return ['success' => false, 'message' => 'Invalid or expired reset token.'];
        }

        $issuedAt = intval($user['reset_token_issued_at']);

        if (time() - $issuedAt > 3600) {
            http_response_code(400);
            return ['success' => false, 'message' => 'Invalid or expired reset token.'];
        }

        $expectedToken = hash('sha256', $user['id'] . ':' . $issuedAt);

        if (!hash_equals($expectedToken, $data['token'])) {
            http_response_code(400);
            return ['success' => false, 'message' => 'Invalid or expired reset token.'];
        }

        $this->user->updatePassword($user['id'], $data['new_password']);
        $this->user->clearResetToken($user['id']);

        return [
            'success' => true,
            'message' => 'Password has been reset successfully.',
        ];
    }

    public function logData() {
        if (!file_exists($this->logFile)) {
            return ['success' => true, 'entries' => [], 'count' => 0];
        }

        $lines = file($this->logFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        $entries = [];
        foreach ($lines as $line) {
            $decoded = json_decode($line, true);
            if ($decoded) {
                $entries[] = $decoded;
            }
        }

        $entries = array_reverse($entries);

        return ['success' => true, 'entries' => $entries, 'count' => count($entries)];
    }
}
