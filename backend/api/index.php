<?php

// CORS headers
header('Content-Type: application/json');

$allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:8080',
    'https://taintedport.com',
    'http://taintedport.com',
];
$origin = isset($_SERVER['HTTP_ORIGIN']) ? $_SERVER['HTTP_ORIGIN'] : '';
if (in_array($origin, $allowedOrigins)) {
    header('Access-Control-Allow-Origin: ' . $origin);
} else {
    header('Access-Control-Allow-Origin: https://taintedport.com');
}
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Access-Control-Allow-Credentials: true');

// Handle preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

require_once __DIR__ . '/middleware/auth.php';
require_once __DIR__ . '/controllers/AuthController.php';
require_once __DIR__ . '/controllers/WineController.php';
require_once __DIR__ . '/controllers/CartController.php';
require_once __DIR__ . '/controllers/OrderController.php';

// Parse the request URI
$requestUri = $_SERVER['REQUEST_URI'];
$basePath = '/api';

// Remove query string for routing
$path = parse_url($requestUri, PHP_URL_PATH);

// Remove base path prefix if present
if (strpos($path, $basePath) === 0) {
    $path = substr($path, strlen($basePath));
}

$method = $_SERVER['REQUEST_METHOD'];

// Simple router
$response = null;

try {
    // Auth routes
    if ($path === '/auth/register' && $method === 'POST') {
        $ctrl = new AuthController();
        $response = $ctrl->register();
    }
    elseif ($path === '/auth/login' && $method === 'POST') {
        $ctrl = new AuthController();
        $response = $ctrl->login();
    }
    elseif ($path === '/auth/me' && $method === 'GET') {
        $authUser = authenticateToken();
        $ctrl = new AuthController();
        $response = $ctrl->me($authUser);
    }
    elseif ($path === '/auth/profile' && $method === 'PUT') {
        $authUser = authenticateToken();
        $ctrl = new AuthController();
        $response = $ctrl->updateProfile($authUser);
    }
    elseif ($path === '/auth/email' && $method === 'PUT') {
        $authUser = authenticateToken();
        $ctrl = new AuthController();
        $response = $ctrl->changeEmail($authUser);
    }
    elseif ($path === '/auth/password' && $method === 'PUT') {
        $authUser = authenticateToken();
        $ctrl = new AuthController();
        $response = $ctrl->changePassword($authUser);
    }
    // 2FA routes
    elseif ($path === '/auth/2fa/setup' && $method === 'POST') {
        $authUser = authenticateToken();
        $ctrl = new AuthController();
        $response = $ctrl->setup2fa($authUser);
    }
    elseif ($path === '/auth/2fa/enable' && $method === 'POST') {
        $authUser = authenticateToken();
        $ctrl = new AuthController();
        $response = $ctrl->enable2fa($authUser);
    }
    elseif ($path === '/auth/2fa/disable' && $method === 'POST') {
        $authUser = authenticateToken();
        $ctrl = new AuthController();
        $response = $ctrl->disable2fa($authUser);
    }
    // Wine routes
    elseif ($path === '/wines' && $method === 'GET') {
        $ctrl = new WineController();
        $response = $ctrl->index();
    }
    elseif ($path === '/wines/regions' && $method === 'GET') {
        $ctrl = new WineController();
        $response = $ctrl->regions();
    }
    elseif ($path === '/wines/types' && $method === 'GET') {
        $ctrl = new WineController();
        $response = $ctrl->types();
    }
    elseif (preg_match('#^/wines/(\d+)$#', $path, $matches) && $method === 'GET') {
        $ctrl = new WineController();
        $response = $ctrl->show(intval($matches[1]));
    }
    // Cart routes (protected)
    elseif ($path === '/cart' && $method === 'GET') {
        $authUser = authenticateToken();
        $ctrl = new CartController();
        $response = $ctrl->index($authUser);
    }
    elseif ($path === '/cart/add' && $method === 'POST') {
        $authUser = authenticateToken();
        $ctrl = new CartController();
        $response = $ctrl->add($authUser);
    }
    elseif ($path === '/cart/update' && $method === 'PUT') {
        $authUser = authenticateToken();
        $ctrl = new CartController();
        $response = $ctrl->update($authUser);
    }
    elseif (preg_match('#^/cart/remove/(\d+)$#', $path, $matches) && $method === 'DELETE') {
        $authUser = authenticateToken();
        $ctrl = new CartController();
        $response = $ctrl->remove($authUser, $matches[1]);
    }
    // Order routes (protected)
    elseif ($path === '/orders' && $method === 'POST') {
        $authUser = authenticateToken();
        $ctrl = new OrderController();
        $response = $ctrl->create($authUser);
    }
    elseif ($path === '/orders' && $method === 'GET') {
        $authUser = authenticateToken();
        $ctrl = new OrderController();
        $response = $ctrl->index($authUser);
    }
    elseif (preg_match('#^/orders/(\d+)$#', $path, $matches) && $method === 'GET') {
        $authUser = authenticateToken();
        $ctrl = new OrderController();
        $response = $ctrl->show($authUser, $matches[1]);
    }
    else {
        http_response_code(404);
        $response = ['success' => false, 'message' => 'Endpoint not found.'];
    }
} catch (Exception $e) {
    http_response_code(500);
    $response = ['success' => false, 'message' => 'Internal server error.'];
}

echo json_encode($response);
