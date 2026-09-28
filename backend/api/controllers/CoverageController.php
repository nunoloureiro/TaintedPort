<?php

require_once __DIR__ . '/../models/CoverageView.php';
require_once __DIR__ . '/../models/CoverageHit.php';
require_once __DIR__ . '/../middleware/coverage.php';

class CoverageController {
    private $views;
    private $hits;

    public function __construct() {
        $this->views = new CoverageView();
        $this->hits = new CoverageHit();
    }

    public function results($sessionId) {
        $sessionId = CoverageHit::normalizeSessionId($sessionId);
        if ($sessionId === null) {
            http_response_code(400);
            return ['success' => false, 'message' => 'The session identifier must be a UUID.'];
        }

        $hits = $this->hits->getBySession($sessionId);

        $views = [];
        foreach ($this->views->all() as $view) {
            $hit = $hits[$view['id']] ?? null;
            $views[] = [
                'id' => $view['id'],
                'surface' => $view['surface'],
                'method' => $view['method'],
                'path' => $view['path'],
                'visited' => $hit !== null,
                'hit_count' => $hit ? intval($hit['hit_count']) : 0,
                'success_count' => $hit ? intval($hit['success_count']) : 0,
                'failure_count' => $hit ? intval($hit['failure_count']) : 0,
                'first_visited_at' => $hit ? $hit['first_visited_at'] : null,
                'last_visited_at' => $hit ? $hit['last_visited_at'] : null,
            ];
        }

        return ['success' => true, 'session_id' => $sessionId, 'views' => $views];
    }

    public function hit() {
        $data = json_decode(file_get_contents('php://input'), true);
        $path = isset($data['path']) && is_string($data['path']) ? $data['path'] : '';
        if ($path === '' || $path[0] !== '/') {
            http_response_code(400);
            return ['success' => false, 'message' => 'path is required.'];
        }

        $path = '/' . trim(strtok($path, '?#'), '/');
        $viewId = $this->views->resolve('frontend', 'GET', $path);
        if ($viewId !== null) {
            CoverageRecorder::mark($viewId);
        }
        return ['success' => true];
    }
}
