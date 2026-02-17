<?php

require_once __DIR__ . '/../models/Review.php';

class ReviewController {
    private $review;

    public function __construct() {
        $this->review = new Review();
    }

    /**
     * List reviews for a wine.
     * VULN: SQL Injection on wine_id (uses getByWineIdUnsafe).
     */
    public function list($wineId) {
        $reviews = $this->review->getByWineIdUnsafe($wineId);

        // Calculate average
        $totalRating = 0;
        foreach ($reviews as $r) {
            $totalRating += $r['rating'];
        }
        $avgRating = count($reviews) > 0 ? round($totalRating / count($reviews), 1) : 0;

        return [
            'success' => true,
            'reviews' => $reviews,
            'avg_rating' => $avgRating,
            'review_count' => count($reviews)
        ];
    }

    /**
     * Create a review for a wine.
     */
    public function create($authUser, $wineId) {
        $data = json_decode(file_get_contents('php://input'), true);

        if (empty($data['rating'])) {
            http_response_code(400);
            return ['success' => false, 'message' => 'Rating is required.'];
        }

        $rating = intval($data['rating']);
        if ($rating < 1 || $rating > 5) {
            http_response_code(400);
            return ['success' => false, 'message' => 'Rating must be between 1 and 5.'];
        }

        $comment = isset($data['comment']) ? $data['comment'] : '';

        $reviewId = $this->review->create(intval($wineId), $authUser['user_id'], $rating, $comment);

        if ($reviewId === false) {
            http_response_code(409);
            return ['success' => false, 'message' => 'You have already reviewed this wine.'];
        }

        http_response_code(201);
        return [
            'success' => true,
            'message' => 'Review submitted successfully.',
            'review_id' => $reviewId
        ];
    }
}
