<?php

require_once __DIR__ . '/../config/database.php';

class Review {
    private $db;

    public function __construct() {
        $this->db = Database::getInstance();
    }

    /**
     * VULN: SQL Injection - wine_id is directly concatenated into the query.
     */
    public function getByWineIdUnsafe($wineId) {
        $sql = "SELECT r.id, r.rating, r.comment, r.created_at, u.name as user_name
                FROM reviews r
                JOIN users u ON r.user_id = u.id
                WHERE r.wine_id = $wineId
                ORDER BY r.created_at DESC";
        $result = @$this->db->query($sql);
        if (!$result) return [];

        $reviews = [];
        while ($row = $result->fetchArray(SQLITE3_ASSOC)) {
            $row['rating'] = intval($row['rating']);
            $reviews[] = $row;
        }
        return $reviews;
    }

    public function create($wineId, $userId, $rating, $comment) {
        // Check if user already reviewed this wine
        $stmt = $this->db->prepare('SELECT id FROM reviews WHERE wine_id = :wine_id AND user_id = :user_id');
        $stmt->bindValue(':wine_id', $wineId, SQLITE3_INTEGER);
        $stmt->bindValue(':user_id', $userId, SQLITE3_INTEGER);
        $result = $stmt->execute();
        if ($result->fetchArray(SQLITE3_ASSOC)) {
            return false; // Already reviewed
        }

        $stmt = $this->db->prepare(
            'INSERT INTO reviews (wine_id, user_id, rating, comment) VALUES (:wine_id, :user_id, :rating, :comment)'
        );
        $stmt->bindValue(':wine_id', $wineId, SQLITE3_INTEGER);
        $stmt->bindValue(':user_id', $userId, SQLITE3_INTEGER);
        $stmt->bindValue(':rating', intval($rating), SQLITE3_INTEGER);
        $stmt->bindValue(':comment', $comment, SQLITE3_TEXT);
        $stmt->execute();

        return $this->db->lastInsertRowID();
    }

    /**
     * Get average ratings for all wines (for listing page).
     */
    public function getAverageRatings() {
        $result = $this->db->query(
            'SELECT wine_id, AVG(rating) as avg_rating, COUNT(*) as review_count
             FROM reviews GROUP BY wine_id'
        );

        $ratings = [];
        while ($row = $result->fetchArray(SQLITE3_ASSOC)) {
            $ratings[$row['wine_id']] = [
                'avg_rating' => round(floatval($row['avg_rating']), 1),
                'review_count' => intval($row['review_count'])
            ];
        }
        return $ratings;
    }
}
