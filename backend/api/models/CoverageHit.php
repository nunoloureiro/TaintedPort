<?php

require_once __DIR__ . '/../config/database.php';

class CoverageHit {
    const SESSION_ID_PATTERN = '/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iD';

    private $db;

    public function __construct() {
        $this->db = Database::getInstance();
    }

    public static function normalizeSessionId($value) {
        return is_string($value) && preg_match(self::SESSION_ID_PATTERN, $value) ? strtolower($value) : null;
    }

    public function getBySession($sessionId) {
        $stmt = $this->db->prepare(
            'SELECT view_id, hit_count, success_count, failure_count, first_visited_at, last_visited_at
             FROM coverage_hits
             WHERE session_id = :session_id'
        );
        $stmt->bindValue(':session_id', $sessionId, SQLITE3_TEXT);
        $result = $stmt->execute();

        $hits = [];
        while ($row = $result->fetchArray(SQLITE3_ASSOC)) {
            $hits[intval($row['view_id'])] = $row;
        }
        return $hits;
    }

    public function record($sessionId, $viewId, $success) {
        // Parallel crawler requests write at the same time; wait for the lock instead of failing
        $this->db->getConnection()->busyTimeout(2000);

        $stmt = $this->db->prepare(
            'INSERT INTO coverage_hits (session_id, view_id, hit_count, success_count, failure_count)
             VALUES (:session_id, :view_id, 1, :success, :failure)
             ON CONFLICT(session_id, view_id) DO UPDATE SET
                 hit_count = hit_count + 1,
                 success_count = success_count + excluded.success_count,
                 failure_count = failure_count + excluded.failure_count,
                 last_visited_at = CURRENT_TIMESTAMP'
        );
        $stmt->bindValue(':session_id', $sessionId, SQLITE3_TEXT);
        $stmt->bindValue(':view_id', $viewId, SQLITE3_INTEGER);
        $stmt->bindValue(':success', $success ? 1 : 0, SQLITE3_INTEGER);
        $stmt->bindValue(':failure', $success ? 0 : 1, SQLITE3_INTEGER);
        $stmt->execute();
    }
}
