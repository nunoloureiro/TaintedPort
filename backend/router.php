<?php
// Router for PHP built-in server
// Serves api/index.php for all /api/* routes

$uri = $_SERVER['REQUEST_URI'];
$path = parse_url($uri, PHP_URL_PATH);

// Route all /api/* requests to api/index.php
if (strpos($path, '/api') === 0) {
    require __DIR__ . '/api/index.php';
    return true;
}

// For static files, let PHP's built-in server handle them
return false;
