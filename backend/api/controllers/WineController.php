<?php

require_once __DIR__ . '/../models/Wine.php';

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

        $result = [
            'success' => true,
            'wines' => $wines,
            'total' => count($wines)
        ];

        // VULN: Reflected XSS - search term is reflected without sanitization
        if (!empty($params['search'])) {
            $result['search_query'] = $params['search'];
            $result['message'] = 'Showing results for: ' . $params['search'];
        }

        return $result;
    }

    public function show($id) {
        // VULN: SQL Injection via wine ID
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
}
