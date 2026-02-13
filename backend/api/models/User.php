<?php

require_once __DIR__ . '/../config/database.php';

class User {
    private $db;

    public function __construct() {
        $this->db = Database::getInstance();
    }

    public function create($name, $email, $password) {
        $hash = password_hash($password, PASSWORD_BCRYPT);
        $stmt = $this->db->prepare(
            'INSERT INTO users (name, email, password_hash) VALUES (:name, :email, :hash)'
        );
        $stmt->bindValue(':name', $name, SQLITE3_TEXT);
        $stmt->bindValue(':email', $email, SQLITE3_TEXT);
        $stmt->bindValue(':hash', $hash, SQLITE3_TEXT);
        $stmt->execute();

        return $this->db->lastInsertRowID();
    }

    public function findByEmail($email) {
        $stmt = $this->db->prepare('SELECT * FROM users WHERE email = :email');
        $stmt->bindValue(':email', $email, SQLITE3_TEXT);
        $result = $stmt->execute();
        return $result->fetchArray(SQLITE3_ASSOC);
    }

    public function findById($id) {
        $stmt = $this->db->prepare('SELECT id, name, email, totp_enabled, created_at FROM users WHERE id = :id');
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
