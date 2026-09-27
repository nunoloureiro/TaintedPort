<?php

class CoverageView {
    private $file;

    public function __construct() {
        $this->file = __DIR__ . '/../../../crawler-coverage/views.json';
    }

    public function all() {
        if (!is_readable($this->file)) {
            throw new Exception('Coverage view map not found.');
        }

        $map = json_decode(file_get_contents($this->file), true);
        if (!isset($map['views']) || !is_array($map['views'])) {
            throw new Exception('Coverage view map is malformed.');
        }
        return $map['views'];
    }

    // Fixed paths win over templates, so /orders/track never resolves to /orders/:id
    public function resolve($surface, $method, $path) {
        $templateMatch = null;
        foreach ($this->all() as $view) {
            if ($view['surface'] !== $surface || $view['method'] !== $method) {
                continue;
            }
            if ($view['path'] === $path) {
                return $view['id'];
            }
            if ($templateMatch === null && strpos($view['path'], ':') !== false) {
                $parts = preg_split('#:[a-z_]+#i', $view['path']);
                $quoted = array_map(function ($part) {
                    return preg_quote($part, '#');
                }, $parts);
                if (preg_match('#^' . implode('[^/]+', $quoted) . '$#D', $path)) {
                    $templateMatch = $view['id'];
                }
            }
        }
        return $templateMatch;
    }
}
