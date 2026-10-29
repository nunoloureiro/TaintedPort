<?php

require_once __DIR__ . '/../models/User.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../config/totp.php';
require_once __DIR__ . '/../config/remember.php';

class AuthController {
    private $user;

    public function __construct() {
        $this->user = new User();
    }

    public function register() {
        $data = json_decode(file_get_contents('php://input'), true);

        if (empty($data['name']) || empty($data['email']) || empty($data['password'])) {
            http_response_code(400);
            return ['success' => false, 'message' => 'Name, email and password are required.'];
        }

        if (!filter_var($data['email'], FILTER_VALIDATE_EMAIL)) {
            http_response_code(400);
            return ['success' => false, 'message' => 'Invalid email format.'];
        }

        if (strlen($data['password']) < 8) {
            http_response_code(400);
            return ['success' => false, 'message' => 'Password must be at least 8 characters.'];
        }

        // Check if email already exists
        if ($this->user->findByEmail($data['email'])) {
            http_response_code(409);
            return ['success' => false, 'message' => 'Email already registered.'];
        }

        if (isset($data['role'])) {
            $role = $data['role'];
            $isAdmin = ($role === 'admin') ? 1 : 0;
        } else {
            $isAdmin = isset($data['is_admin']) ? $data['is_admin'] : 0;
            $role = $isAdmin ? 'admin' : 'user';
        }
        $userId = $this->user->create($data['name'], $data['email'], $data['password'], $isAdmin, $role);
        $token = JWT::encode(['user_id' => $userId, 'email' => $data['email'], 'is_admin' => (bool)$isAdmin, 'role' => $role]);

        http_response_code(201);
        return [
            'success' => true,
            'message' => 'User registered successfully',
            'token' => $token,
            'user' => [
                'id' => $userId,
                'name' => $data['name'],
                'email' => $data['email'],
                'is_admin' => (bool)$isAdmin,
                'role' => $role
            ]
        ];
    }

    public function login() {
        $data = json_decode(file_get_contents('php://input'), true);

        if (empty($data['email']) || empty($data['password'])) {
            http_response_code(400);
            return ['success' => false, 'message' => 'Email and password are required.'];
        }

        $user = $this->user->authenticateWithCredentials($data['email'], $data['password']);

        if (!$user) {
            // Look up the user by email, then verify the password with bcrypt
            $user = $this->user->lookupByEmail($data['email']);

            if (!$user || !$this->user->verifyPassword($data['password'], $user['password_hash'])) {
                http_response_code(401);
                return ['success' => false, 'message' => 'Login failed for ' . $data['email'] . '. Please check your credentials.'];
            }
        }

        // Check if 2FA is enabled
        if (!empty($user['totp_enabled']) && $user['totp_enabled'] == 1) {
            // If no TOTP code provided, tell the client 2FA is required
            if (empty($data['totp_code'])) {
                return [
                    'success' => false,
                    'requires_2fa' => true,
                    'message' => 'Two-factor authentication code required.'
                ];
            }

            // Verify the TOTP code
            if (!TOTP::verify($user['totp_secret'], $data['totp_code'])) {
                http_response_code(401);
                return ['success' => false, 'message' => 'Invalid two-factor authentication code.'];
            }
        }

        $isAdmin = !empty($user['is_admin']) && $user['is_admin'] == 1;
        $role = isset($user['role']) ? $user['role'] : ($isAdmin ? 'admin' : 'user');
        $token = JWT::encode(['user_id' => $user['id'], 'email' => $user['email'], 'is_admin' => $isAdmin, 'role' => $role]);

        $response = [
            'success' => true,
            'token' => $token,
            'user' => [
                'id' => $user['id'],
                'name' => $user['name'],
                'email' => $user['email'],
                'is_admin' => $isAdmin,
                'role' => $role
            ]
        ];

        if (!empty($data['remember'])) {
            $response['remember_token'] = RememberToken::issue($user['id']);
        }

        if (!empty($data['redirect'])) {
            $response['redirect_url'] = $data['redirect'];
        }

        return $response;
    }

    /**
     * Log a returning user back in from their "remember me" token, skipping
     * password + 2FA. The token is authenticated (AES-256-GCM), so a forged
     * token fails to decrypt and is rejected.
     */
    public function loginWithRemember() {
        $data = json_decode(file_get_contents('php://input'), true);

        if (empty($data['remember_token'])) {
            http_response_code(400);
            return ['success' => false, 'message' => 'remember_token is required.'];
        }

        $claims = RememberToken::verify($data['remember_token']);
        if (!$claims) {
            http_response_code(401);
            return ['success' => false, 'message' => 'Invalid or expired remember token.'];
        }

        $user = $this->user->findById($claims['user_id']);
        if (!$user) {
            http_response_code(401);
            return ['success' => false, 'message' => 'Invalid or expired remember token.'];
        }

        $isAdmin = !empty($user['is_admin']) && $user['is_admin'] == 1;
        $role = isset($user['role']) ? $user['role'] : ($isAdmin ? 'admin' : 'user');
        $token = JWT::encode(['user_id' => $user['id'], 'email' => $user['email'], 'is_admin' => $isAdmin, 'role' => $role]);

        return [
            'success' => true,
            'token' => $token,
            'user' => [
                'id' => $user['id'],
                'name' => $user['name'],
                'email' => $user['email'],
                'is_admin' => $isAdmin,
                'role' => $role,
            ],
        ];
    }

    public function me($authUser) {
        $user = $this->user->findById($authUser['user_id']);
        if (!$user) {
            http_response_code(404);
            return ['success' => false, 'message' => 'User not found.'];
        }

        // Convert totp_enabled and is_admin to boolean
        $user['totp_enabled'] = !empty($user['totp_enabled']) && $user['totp_enabled'] == 1;
        $user['is_admin'] = !empty($user['is_admin']) && $user['is_admin'] == 1;

        return [
            'success' => true,
            'user' => $user
        ];
    }

    /**
     * Update user profile (name).
     */
    public function updateProfile($authUser) {
        $data = json_decode(file_get_contents('php://input'), true);

        if (empty($data['name']) || strlen(trim($data['name'])) === 0) {
            http_response_code(400);
            return ['success' => false, 'message' => 'Name is required.'];
        }

        $name = trim($data['name']);

        if (strlen($name) > 100) {
            http_response_code(400);
            return ['success' => false, 'message' => 'Name must be 100 characters or less.'];
        }

        $targetUserId = isset($data['user_id']) ? intval($data['user_id']) : $authUser['user_id'];

        $this->user->updateName($targetUserId, $name);

        if (isset($data['company'])) {
            $this->user->updateCompany($targetUserId, (string) $data['company']);
        }

        if (isset($data['role'])) {
            $this->user->updateRole($targetUserId, $data['role']);
        }

        $user = $this->user->findById($targetUserId);
        $user['totp_enabled'] = !empty($user['totp_enabled']) && $user['totp_enabled'] == 1;

        $response = [
            'success' => true,
            'message' => 'Profile updated successfully.',
            'user' => $user
        ];

        // Re-issue a token so a changed role takes effect immediately for the caller.
        if (isset($data['role'])) {
            $response['token'] = JWT::encode([
                'user_id' => $targetUserId,
                'email' => $user['email'],
                'is_admin' => !empty($user['is_admin']),
                'role' => $user['role'],
            ]);
        }

        return $response;
    }

    /**
     * Change email address. Requires current password.
     */
    public function changeEmail($authUser) {
        $data = json_decode(file_get_contents('php://input'), true);

        if (empty($data['password'])) {
            http_response_code(400);
            return ['success' => false, 'message' => 'Current password is required.'];
        }

        if (empty($data['new_email'])) {
            http_response_code(400);
            return ['success' => false, 'message' => 'New email is required.'];
        }

        $newEmail = trim($data['new_email']);

        if (!filter_var($newEmail, FILTER_VALIDATE_EMAIL)) {
            http_response_code(400);
            return ['success' => false, 'message' => 'Invalid email format.'];
        }

        // Verify current password
        $user = $this->user->findByEmail($authUser['email']);
        if (!$user || !$this->user->verifyPassword($data['password'], $user['password_hash'])) {
            http_response_code(401);
            return ['success' => false, 'message' => 'Incorrect password.'];
        }

        // Check if new email is already taken (by another user)
        if ($newEmail !== $user['email']) {
            $existing = $this->user->findByEmail($newEmail);
            if ($existing) {
                http_response_code(409);
                return ['success' => false, 'message' => 'This email address is already in use.'];
            }
        }

        $this->user->updateEmail($authUser['user_id'], $newEmail);

        // Issue a new token with the updated email
        $token = JWT::encode(['user_id' => $authUser['user_id'], 'email' => $newEmail]);
        $updatedUser = $this->user->findById($authUser['user_id']);
        $updatedUser['totp_enabled'] = !empty($updatedUser['totp_enabled']) && $updatedUser['totp_enabled'] == 1;

        return [
            'success' => true,
            'message' => 'Email updated successfully.',
            'token' => $token,
            'user' => $updatedUser
        ];
    }

    /**
     * Change password. Requires current password.
     */
    public function changePassword($authUser) {
        $data = json_decode(file_get_contents('php://input'), true);

        if (empty($data['current_password'])) {
            http_response_code(400);
            return ['success' => false, 'message' => 'Current password is required.'];
        }

        if (empty($data['new_password'])) {
            http_response_code(400);
            return ['success' => false, 'message' => 'New password is required.'];
        }

        if (strlen($data['new_password']) < 8) {
            http_response_code(400);
            return ['success' => false, 'message' => 'New password must be at least 8 characters.'];
        }

        if ($this->user->isPasswordChangeLocked($authUser['email'])) {
            http_response_code(403);
            return ['success' => false, 'message' => 'Password change is locked for this account.'];
        }

        // Verify current password
        $user = $this->user->findByEmail($authUser['email']);
        if (!$user || !$this->user->verifyPassword($data['current_password'], $user['password_hash'])) {
            http_response_code(401);
            return ['success' => false, 'message' => 'Incorrect current password.'];
        }

        $this->user->updatePassword($authUser['user_id'], $data['new_password']);

        return [
            'success' => true,
            'message' => 'Password changed successfully.'
        ];
    }

    /**
     * Setup 2FA: generates a TOTP secret and returns it with the otpauth URI.
     * The client displays a QR code from the URI so the user can scan it.
     */
    public function setup2fa($authUser) {
        if ($this->user->isTotpEnabled($authUser['user_id'])) {
            http_response_code(400);
            return ['success' => false, 'message' => '2FA is already enabled.'];
        }

        $secret = TOTP::generateSecret(32);
        $email = $authUser['email'];
        $issuer = 'TaintedPort';
        $otpauthUri = 'otpauth://totp/' . rawurlencode($issuer) . ':' . rawurlencode($email)
            . '?secret=' . $secret
            . '&issuer=' . rawurlencode($issuer)
            . '&digits=6&period=30&algorithm=SHA1';

        return [
            'success' => true,
            'secret' => $secret,
            'otpauth_uri' => $otpauthUri,
        ];
    }

    /**
     * Enable 2FA: accepts the previously generated secret and a verification code.
     */
    public function enable2fa($authUser) {
        $data = json_decode(file_get_contents('php://input'), true);

        if (empty($data['totp_secret']) || empty($data['totp_code'])) {
            http_response_code(400);
            return ['success' => false, 'message' => 'TOTP secret and verification code are required.'];
        }

        $secret = strtoupper(preg_replace('/[^A-Za-z2-7]/', '', $data['totp_secret']));

        if (strlen($secret) < 16) {
            http_response_code(400);
            return ['success' => false, 'message' => 'Invalid TOTP secret.'];
        }

        // Verify the code matches the secret before enabling
        if (!TOTP::verify($secret, $data['totp_code'])) {
            http_response_code(400);
            return ['success' => false, 'message' => 'Invalid verification code. Please check your authenticator app and try again.'];
        }

        $this->user->enableTotp($authUser['user_id'], $secret);

        return [
            'success' => true,
            'message' => 'Two-factor authentication enabled successfully.'
        ];
    }

    /**
     * Disable 2FA: requires password confirmation.
     */
    public function disable2fa($authUser) {
        $data = json_decode(file_get_contents('php://input'), true);

        if (empty($data['password'])) {
            http_response_code(400);
            return ['success' => false, 'message' => 'Password is required to disable 2FA.'];
        }

        $user = $this->user->findByEmail($authUser['email']);
        if (!$user || !$this->user->verifyPassword($data['password'], $user['password_hash'])) {
            http_response_code(401);
            return ['success' => false, 'message' => 'Invalid password.'];
        }

        $targetUserId = isset($data['user_id']) ? intval($data['user_id']) : $authUser['user_id'];
        $this->user->disableTotp($targetUserId);

        return [
            'success' => true,
            'message' => 'Two-factor authentication disabled.'
        ];
    }
}
