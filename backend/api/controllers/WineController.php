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

        return [
            'success' => true,
            'wines' => $wines,
            'total' => count($wines)
        ];
    }

    public function show($id) {
        $wine = $this->wine->getById($id);

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
