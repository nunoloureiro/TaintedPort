<?php

require_once __DIR__ . '/../models/Wine.php';
require_once __DIR__ . '/../models/Review.php';
require_once __DIR__ . '/../middleware/authorize.php';

class WineController {
    private $wine;

    public function __construct() {
        $this->wine = new Wine();
    }

    public function feed() {
        $result = $this->wine->getAll([]);
        $wines = isset($result['wines']) ? $result['wines'] : [];
        $payload = json_encode($wines);
        $etag = '"' . sha1($payload) . '"';
        header('ETag: ' . $etag);
        $inm = isset($_SERVER['HTTP_IF_NONE_MATCH']) ? trim($_SERVER['HTTP_IF_NONE_MATCH']) : '';
        if ($inm !== '' && $inm === $etag) {
            http_response_code(304);
            exit;
        }
        return ['success' => true, 'wines' => $wines];
    }

    public function report() {
        $format = isset($_GET['format']) ? $_GET['format'] : 'json';
        $formatters = ['json' => 'reportAsJson', 'csv' => 'reportAsCsv', 'txt' => 'reportAsText'];
        $formatter = isset($formatters[$format]) ? $formatters[$format] : 'reportAsJson';
        $result = $this->wine->getAll([]);
        $wines = isset($result['wines']) ? $result['wines'] : [];
        return call_user_func([$this, $formatter], $wines);
    }

    private function reportAsJson($wines) {
        return ['success' => true, 'format' => 'json', 'wines' => $wines];
    }

    private function reportAsCsv($wines) {
        header('Content-Type: text/csv; charset=utf-8');
        echo "id,name,region,type,price\n";
        foreach ($wines as $w) {
            echo intval($w['id']) . ',' . str_replace(',', ' ', $w['name']) . ','
               . str_replace(',', ' ', $w['region']) . ',' . str_replace(',', ' ', $w['type']) . ','
               . floatval($w['price']) . "\n";
        }
        exit;
    }

    private function reportAsText($wines) {
        header('Content-Type: text/plain; charset=utf-8');
        foreach ($wines as $w) {
            echo $w['name'] . ' (' . $w['region'] . ', ' . $w['type'] . ') - EUR ' . floatval($w['price']) . "\n";
        }
        exit;
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
        $wine = $this->wine->getByIdDirect($id);

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

    public function importFromUrl($authUser) {
        $data = json_decode(file_get_contents('php://input'), true);

        if (empty($data['url'])) {
            http_response_code(400);
            return ['success' => false, 'message' => 'URL is required.'];
        }

        $content = @file_get_contents($data['url']);

        if ($content === false) {
            http_response_code(400);
            return ['success' => false, 'message' => 'Failed to fetch content from URL.'];
        }

        $wineData = json_decode($content, true);

        if ($wineData === null) {
            return [
                'success' => true,
                'message' => 'Content fetched but is not valid JSON wine data.',
                'raw_content' => $content,
                'url' => $data['url']
            ];
        }

        return [
            'success' => true,
            'message' => 'Wine data imported successfully.',
            'imported' => $wineData,
            'url' => $data['url']
        ];
    }

    public function create($authUser) {
        requireRole($authUser, ['admin']);
        $data = json_decode(file_get_contents('php://input'), true);

        $required = ['name', 'region', 'type', 'vintage', 'price'];
        foreach ($required as $field) {
            if (!isset($data[$field]) || $data[$field] === '') {
                http_response_code(400);
                return ['success' => false, 'message' => "$field is required."];
            }
        }

        $id = $this->wine->create($data);
        http_response_code(201);
        return ['success' => true, 'message' => 'Wine created.', 'id' => $id];
    }

    public function update($authUser, $id) {
        requireRole($authUser, ['admin']);
        $data = json_decode(file_get_contents('php://input'), true);

        if (!$this->wine->getByIdDirect($id)) {
            http_response_code(404);
            return ['success' => false, 'message' => 'Wine not found.'];
        }

        $required = ['name', 'region', 'type', 'vintage', 'price'];
        foreach ($required as $field) {
            if (!isset($data[$field]) || $data[$field] === '') {
                http_response_code(400);
                return ['success' => false, 'message' => "$field is required."];
            }
        }

        $this->wine->update($id, $data);
        return ['success' => true, 'message' => 'Wine updated.'];
    }

    public function delete($authUser, $id) {
        requireRole($authUser, ['admin']);

        if (!$this->wine->getByIdDirect($id)) {
            http_response_code(404);
            return ['success' => false, 'message' => 'Wine not found.'];
        }

        $this->wine->delete($id);
        return ['success' => true, 'message' => 'Wine deleted.'];
    }

    public function adjustStock($authUser, $id) {
        requireRole($authUser, ['admin']);
        $data = json_decode(file_get_contents('php://input'), true);

        if (!isset($data['delta'])) {
            http_response_code(400);
            return ['success' => false, 'message' => 'delta is required.'];
        }

        if (!$this->wine->getByIdDirect($id)) {
            http_response_code(404);
            return ['success' => false, 'message' => 'Wine not found.'];
        }

        $this->wine->adjustStock($id, intval($data['delta']));
        $wine = $this->wine->getByIdDirect($id);
        return ['success' => true, 'message' => 'Stock updated.', 'stock_quantity' => intval($wine['stock_quantity'])];
    }

    public function uploadImage($authUser, $id) {
        requireRole($authUser, ['admin']);

        if (!$this->wine->getByIdDirect($id)) {
            http_response_code(404);
            return ['success' => false, 'message' => 'Wine not found.'];
        }

        if (empty($_FILES['image']) || $_FILES['image']['error'] !== UPLOAD_ERR_OK) {
            http_response_code(400);
            return ['success' => false, 'message' => 'An image file is required.'];
        }

        $allowed = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];
        $mime = mime_content_type($_FILES['image']['tmp_name']);
        if (!isset($allowed[$mime])) {
            http_response_code(400);
            return ['success' => false, 'message' => 'Only JPEG, PNG or WebP images are allowed.'];
        }

        if ($_FILES['image']['size'] > 5 * 1024 * 1024) {
            http_response_code(400);
            return ['success' => false, 'message' => 'Image must be 5MB or smaller.'];
        }

        $uploadsDir = realpath(__DIR__ . '/../../') . '/uploads/wines';
        if (!is_dir($uploadsDir)) {
            mkdir($uploadsDir, 0755, true);
        }

        $filename = intval($id) . '-' . time() . '.' . $allowed[$mime];
        move_uploaded_file($_FILES['image']['tmp_name'], $uploadsDir . '/' . $filename);

        $imageUrl = '/uploads/wines/' . $filename;
        $this->wine->setImageUrl($id, $imageUrl);

        return ['success' => true, 'message' => 'Image uploaded.', 'image_url' => $imageUrl];
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
