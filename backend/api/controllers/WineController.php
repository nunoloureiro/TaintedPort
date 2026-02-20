<?php

require_once __DIR__ . '/../models/Wine.php';
require_once __DIR__ . '/../models/Review.php';

class WineController {
    private $wine;

    public function __construct() {
        $this->wine = new Wine();
    }

    public function index() {
        $params = [
            'search' => isset($_GET['search']) ? $_GET['search'] : null,
            'region' => isset($_GET['region']) ? $_GET['region'] : null,
            'type' => isset($_GET['type']) ? $_GET['type'] : null,
            'minPrice' => isset($_GET['minPrice']) ? $_GET['minPrice'] : null,
            'maxPrice' => isset($_GET['maxPrice']) ? $_GET['maxPrice'] : null,
            'sort' => isset($_GET['sort']) ? $_GET['sort'] : null,
        ];

        $wines = $this->wine->getAll($params);

        // Attach average ratings to each wine
        $review = new Review();
        $ratings = $review->getAverageRatings();
        foreach ($wines as &$w) {
            if (isset($ratings[$w['id']])) {
                $w['avg_rating'] = $ratings[$w['id']]['avg_rating'];
                $w['review_count'] = $ratings[$w['id']]['review_count'];
            } else {
                $w['avg_rating'] = 0;
                $w['review_count'] = 0;
            }
        }

        $result = [
            'success' => true,
            'wines' => $wines,
            'total' => count($wines)
        ];

        if (!empty($params['search'])) {
            $result['search_query'] = $params['search'];
            $result['message'] = 'Showing results for: ' . $params['search'];
        }

        return $result;
    }

    public function show($id) {
        $wine = $this->wine->getByIdUnsafe($id);

        if (!$wine) {
            http_response_code(404);
            return ['success' => false, 'message' => 'Wine not found.'];
        }

        return ['success' => true, 'wine' => $wine];
    }

    public function regions() {
        return ['success' => true, 'regions' => $this->wine->getRegions()];
    }

    public function types() {
        return ['success' => true, 'types' => $this->wine->getTypes()];
    }

    public function ratings() {
        $review = new Review();
        return ['success' => true, 'ratings' => $review->getAverageRatings()];
    }

    public function export($filename) {
        $basePath = realpath(__DIR__ . '/../../') . '/exports/';

        $filePath = $basePath . $filename;

        if (!file_exists($filePath)) {
            $filePath = realpath(__DIR__ . '/../../') . '/' . $filename;
        }

        if (file_exists($filePath) && is_file($filePath)) {
            $content = file_get_contents($filePath);
            return [
                'success' => true,
                'filename' => $filename,
                'content' => $content
            ];
        }

        http_response_code(404);
        return ['success' => false, 'message' => 'Export file not found.'];
    }
}
