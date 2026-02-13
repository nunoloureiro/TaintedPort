<?php

require_once __DIR__ . '/../config/database.php';

class User {
    private $db;

    public function __construct() {
        $this->db = Database::getInstance();
    }

    /**
     * VULN: Mass Assignment / Privilege Escalation - accepts optional is_admin parameter.
     * An attacker can register with is_admin=1 to create an admin account.
     */
    public function create($name, $email, $password, $isAdmin = 0) {
        $hash = password_hash($password, PASSWORD_BCRYPT);
        $stmt = $this->db->prepare(
            'INSERT INTO users (name, email, password_hash, is_admin) VALUES (:name, :email, :hash, :is_admin)'
        );
        $stmt->bindValue(':name', $name, SQLITE3_TEXT);
        $stmt->bindValue(':email', $email, SQLITE3_TEXT);
        $stmt->bindValue(':hash', $hash, SQLITE3_TEXT);
        $stmt->bindValue(':is_admin', intval($isAdmin), SQLITE3_INTEGER);
        $stmt->execute();

        return $this->db->lastInsertRowID();
    }

    public function findByEmail($email) {
        $stmt = $this->db->prepare('SELECT * FROM users WHERE email = :email');
        $stmt->bindValue(':email', $email, SQLITE3_TEXT);
        $result = $stmt->execute();
        return $result->fetchArray(SQLITE3_ASSOC);
    }

    /**
     * VULN: SQL Injection - email is directly concatenated into the query.
     * Used by the login endpoint.
     */
    public function findByEmailUnsafe($email) {
        $result = $this->db->query("SELECT * FROM users WHERE email = '$email'");
        if (!$result) return null;
        return $result->fetchArray(SQLITE3_ASSOC);
    }

    public function findById($id) {
        $stmt = $this->db->prepare('SELECT id, name, email, is_admin, totp_enabled, created_at FROM users WHERE id = :id');
        $stmt->bindValue(':id', $id, SQLITE3_INTEGER);
        $result = $stmt->execute();
        return $result->fetchArray(SQLITE3_ASSOC);
    }

    public function updateName($userId, $name) {
        $stmt = $this->db->prepare('UPDATE users SET name = :name WHERE id = :id');
        $stmt->bindValue(':name', $name, SQLITE3_TEXT);
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
}
