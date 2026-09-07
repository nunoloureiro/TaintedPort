<?php

require_once __DIR__ . '/../config/database.php';

class ReferralCode {
    private $db;

    public function __construct() {
        $this->db = Database::getInstance();
    }

    public function findByCode($code) {
        $stmt = $this->db->prepare('SELECT * FROM referral_codes WHERE code = :code');
        $stmt->bindValue(':code', $code, SQLITE3_TEXT);
        $result = $stmt->execute();
        return $result->fetchArray(SQLITE3_ASSOC);
    }

    public function incrementUsedCount($id) {
        $stmt = $this->db->prepare('UPDATE referral_codes SET used_count = used_count + 1 WHERE id = :id');
        $stmt->bindValue(':id', $id, SQLITE3_INTEGER);
        $stmt->execute();
        return true;
    }
}
