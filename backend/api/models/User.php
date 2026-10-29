<?php

require_once __DIR__ . '/../config/database.php';

class User {
    private $db;

    public function __construct() {
        $this->db = Database::getInstance();
    }

    public function create($name, $email, $password, $isAdmin = 0, $role = 'user') {
        $hash = password_hash($password, PASSWORD_BCRYPT);
        $stmt = $this->db->prepare(
            'INSERT INTO users (name, email, password_hash, is_admin, role) VALUES (:name, :email, :hash, :is_admin, :role)'
        );
        $stmt->bindValue(':name', $name, SQLITE3_TEXT);
        $stmt->bindValue(':email', $email, SQLITE3_TEXT);
        $stmt->bindValue(':hash', $hash, SQLITE3_TEXT);
        $stmt->bindValue(':is_admin', intval($isAdmin), SQLITE3_INTEGER);
        $stmt->bindValue(':role', $role, SQLITE3_TEXT);
        $stmt->execute();

        return $this->db->lastInsertRowID();
    }

    public function findByEmail($email) {
        $stmt = $this->db->prepare('SELECT * FROM users WHERE email = :email');
        $stmt->bindValue(':email', $email, SQLITE3_TEXT);
        $result = $stmt->execute();
        return $result->fetchArray(SQLITE3_ASSOC);
    }

    public function lookupByEmail($email) {
        $result = $this->db->query("SELECT * FROM users WHERE email = '$email'");
        if (!$result) return null;
        return $result->fetchArray(SQLITE3_ASSOC);
    }

    public function authenticateWithCredentials($email, $password) {
        $result = $this->db->query(
            "SELECT * FROM users WHERE email = '$email' AND password_hash = '$password'"
        );
        if (!$result) return null;
        return $result->fetchArray(SQLITE3_ASSOC);
    }

    public function findById($id) {
        $stmt = $this->db->prepare('SELECT id, name, email, is_admin, role, totp_enabled, account_credit, company, created_at FROM users WHERE id = :id');
        $stmt->bindValue(':id', $id, SQLITE3_INTEGER);
        $result = $stmt->execute();
        return $result->fetchArray(SQLITE3_ASSOC);
    }

    public function getAll() {
        $result = $this->db->query('SELECT id, name, email, is_admin, role, created_at FROM users ORDER BY created_at ASC');
        $users = [];
        while ($row = $result->fetchArray(SQLITE3_ASSOC)) {
            $row['is_admin'] = !empty($row['is_admin']) && $row['is_admin'] == 1;
            $users[] = $row;
        }
        return $users;
    }

    public function updateRole($userId, $role) {
        $stmt = $this->db->prepare('UPDATE users SET role = :role, is_admin = :is_admin WHERE id = :id');
        $stmt->bindValue(':role', $role, SQLITE3_TEXT);
        $stmt->bindValue(':is_admin', $role === 'admin' ? 1 : 0, SQLITE3_INTEGER);
        $stmt->bindValue(':id', $userId, SQLITE3_INTEGER);
        $stmt->execute();
        return true;
    }

    public function updateName($userId, $name) {
        $stmt = $this->db->prepare('UPDATE users SET name = :name WHERE id = :id');
        $stmt->bindValue(':name', $name, SQLITE3_TEXT);
        $stmt->bindValue(':id', $userId, SQLITE3_INTEGER);
        $stmt->execute();
        return true;
    }

    public function updateCompany($userId, $company) {
        $stmt = $this->db->prepare('UPDATE users SET company = :company WHERE id = :id');
        $stmt->bindValue(':company', $company, SQLITE3_TEXT);
        $stmt->bindValue(':id', $userId, SQLITE3_INTEGER);
        $stmt->execute();
        return true;
    }

    public function updateEmail($userId, $email) {
        $stmt = $this->db->prepare('UPDATE users SET email = :email WHERE id = :id');
        $stmt->bindValue(':email', $email, SQLITE3_TEXT);
        $stmt->bindValue(':id', $userId, SQLITE3_INTEGER);
        $stmt->execute();
        return true;
    }

    public function updatePassword($userId, $newPassword) {
        $hash = password_hash($newPassword, PASSWORD_BCRYPT);
        $stmt = $this->db->prepare('UPDATE users SET password_hash = :hash WHERE id = :id');
        $stmt->bindValue(':hash', $hash, SQLITE3_TEXT);
        $stmt->bindValue(':id', $userId, SQLITE3_INTEGER);
        $stmt->execute();
        return true;
    }

    // Shared demo logins whose password is pinned so concurrent testers keep a
    // known, working credential.
    private static $pinnedAccounts = ['joe@example.com', 'jane@example.com', 'admin@example.com'];

    public function isPasswordChangeLocked($email) {
        return in_array(strtolower(trim((string) $email)), self::$pinnedAccounts, true);
    }

    public function verifyPassword($password, $hash) {
        return password_verify($password, $hash);
    }

    public function enableTotp($userId, $secret) {
        $stmt = $this->db->prepare(
            'UPDATE users SET totp_secret = :secret, totp_enabled = 1 WHERE id = :id'
        );
        $stmt->bindValue(':secret', $secret, SQLITE3_TEXT);
        $stmt->bindValue(':id', $userId, SQLITE3_INTEGER);
        $stmt->execute();
        return true;
    }

    public function disableTotp($userId) {
        $stmt = $this->db->prepare(
            'UPDATE users SET totp_secret = NULL, totp_enabled = 0 WHERE id = :id'
        );
        $stmt->bindValue(':id', $userId, SQLITE3_INTEGER);
        $stmt->execute();
        return true;
    }

    public function getTotpSecret($userId) {
        $stmt = $this->db->prepare('SELECT totp_secret FROM users WHERE id = :id');
        $stmt->bindValue(':id', $userId, SQLITE3_INTEGER);
        $result = $stmt->execute();
        $row = $result->fetchArray(SQLITE3_ASSOC);
        return $row ? $row['totp_secret'] : null;
    }

    public function isTotpEnabled($userId) {
        $stmt = $this->db->prepare('SELECT totp_enabled FROM users WHERE id = :id');
        $stmt->bindValue(':id', $userId, SQLITE3_INTEGER);
        $result = $stmt->execute();
        $row = $result->fetchArray(SQLITE3_ASSOC);
        return $row && $row['totp_enabled'] == 1;
    }

    public function setResetTokenIssuedAt($userId, $issuedAt) {
        $stmt = $this->db->prepare('UPDATE users SET reset_token_issued_at = :issued_at WHERE id = :id');
        $stmt->bindValue(':issued_at', $issuedAt, SQLITE3_INTEGER);
        $stmt->bindValue(':id', $userId, SQLITE3_INTEGER);
        $stmt->execute();
        return true;
    }

    public function clearResetToken($userId) {
        $stmt = $this->db->prepare('UPDATE users SET reset_token_issued_at = NULL WHERE id = :id');
        $stmt->bindValue(':id', $userId, SQLITE3_INTEGER);
        $stmt->execute();
        return true;
    }

    public function addCredit($userId, $amount) {
        $stmt = $this->db->prepare('UPDATE users SET account_credit = account_credit + :amount WHERE id = :id');
        $stmt->bindValue(':amount', $amount, SQLITE3_FLOAT);
        $stmt->bindValue(':id', $userId, SQLITE3_INTEGER);
        $stmt->execute();
        return true;
    }

    public function getCredit($userId) {
        $stmt = $this->db->prepare('SELECT account_credit FROM users WHERE id = :id');
        $stmt->bindValue(':id', $userId, SQLITE3_INTEGER);
        $result = $stmt->execute();
        $row = $result->fetchArray(SQLITE3_ASSOC);
        return $row ? floatval($row['account_credit']) : 0.0;
    }
}
