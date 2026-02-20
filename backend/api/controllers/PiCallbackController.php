<?php

class PiCallbackController {
    private $logFile;

    public function __construct() {
        $this->logFile = __DIR__ . '/../../data/pi-callbacks.log';
        $dir = dirname($this->logFile);
        if (!is_dir($dir)) {
            mkdir($dir, 0777, true);
        }
    }

    public function callback() {
        $entry = [
            'timestamp' => date('Y-m-d\TH:i:s\Z'),
            'ip' => $_SERVER['REMOTE_ADDR'] ?? 'unknown',
            'user_agent' => $_SERVER['HTTP_USER_AGENT'] ?? 'unknown',
            'referer' => $_SERVER['HTTP_REFERER'] ?? '',
            'method' => $_SERVER['REQUEST_METHOD'] ?? 'GET',
            'params' => $_GET,
        ];

        if ($_SERVER['REQUEST_METHOD'] === 'POST') {
            $body = file_get_contents('php://input');
            $jsonBody = json_decode($body, true);
            $entry['body'] = $jsonBody ?: $body;
        }

        $line = json_encode($entry) . "\n";
        file_put_contents($this->logFile, $line, FILE_APPEND | LOCK_EX);

        header('Content-Type: image/gif');
        header('Cache-Control: no-store, no-cache');
        // 1x1 transparent GIF
        echo base64_decode('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7');
        exit;
    }

    public function logData() {
        if (!file_exists($this->logFile)) {
            return ['success' => true, 'entries' => [], 'count' => 0];
        }

        $lines = file($this->logFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        $entries = [];
        foreach ($lines as $line) {
            $decoded = json_decode($line, true);
            if ($decoded) {
                $entries[] = $decoded;
            }
        }

        $entries = array_reverse($entries);

        return ['success' => true, 'entries' => $entries, 'count' => count($entries)];
    }
}
