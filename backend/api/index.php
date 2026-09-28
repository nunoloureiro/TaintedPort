<?php

// CORS headers
header('Content-Type: application/json');

// Permissive CORS - reflects any origin
$origin = isset($_SERVER['HTTP_ORIGIN']) ? $_SERVER['HTTP_ORIGIN'] : '*';
header('Access-Control-Allow-Origin: ' . $origin);
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Coverage-Session');
header('Access-Control-Allow-Credentials: true');

// Handle preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

require_once __DIR__ . '/middleware/auth.php';
require_once __DIR__ . '/middleware/coverage.php';
require_once __DIR__ . '/controllers/AuthController.php';
require_once __DIR__ . '/controllers/WineController.php';
require_once __DIR__ . '/controllers/CartController.php';
require_once __DIR__ . '/controllers/CartSnapshotController.php';
require_once __DIR__ . '/controllers/OrderController.php';
require_once __DIR__ . '/controllers/AdminController.php';
require_once __DIR__ . '/controllers/ReviewController.php';
require_once __DIR__ . '/controllers/PiCallbackController.php';
require_once __DIR__ . '/controllers/PasswordResetController.php';
require_once __DIR__ . '/controllers/PartnerController.php';
require_once __DIR__ . '/controllers/ReferralController.php';
require_once __DIR__ . '/controllers/ContactController.php';
require_once __DIR__ . '/controllers/DiscountController.php';
require_once __DIR__ . '/controllers/WishlistController.php';
require_once __DIR__ . '/controllers/SupportController.php';
require_once __DIR__ . '/controllers/GiftCardController.php';
require_once __DIR__ . '/controllers/PaymentController.php';
require_once __DIR__ . '/controllers/WebhookController.php';
require_once __DIR__ . '/controllers/CoverageController.php';

// Parse the request URI
$requestUri = $_SERVER['REQUEST_URI'];
$basePath = '/api';

// Remove query string for routing
$path = urldecode(parse_url($requestUri, PHP_URL_PATH));

// Remove base path prefix if present
if (strpos($path, $basePath) === 0) {
    $path = substr($path, strlen($basePath));
}

$method = $_SERVER['REQUEST_METHOD'];

// Each route marks its view ID from crawler-coverage/views.json
CoverageRecorder::start();

// Contact preview returns HTML, not JSON — handle before the JSON router
if ($path === '/contact/preview' && $method === 'POST') {
    CoverageRecorder::mark(1);
    $ctrl = new ContactController();
    $ctrl->preview();
}

// Printable ticket view returns HTML, not JSON — handle before the JSON router
if (preg_match('#^/support/tickets/(\d+)/render$#', $path, $renderMatch) && $method === 'GET') {
    CoverageRecorder::mark(2);
    $ctrl = new SupportController();
    $ctrl->render($renderMatch[1]);
    // render() calls exit after sending the HTML
}

// Callback endpoint returns a GIF, not JSON — handle before the JSON router
if ($path === '/pi-callback' && ($method === 'GET' || $method === 'POST')) {
    CoverageRecorder::mark($method === 'GET' ? 3 : 4);
    $ctrl = new PiCallbackController();
    $ctrl->callback();
    // callback() calls exit after sending the GIF
}

// Simple router
$response = null;

try {
    // Auth routes
    if ($path === '/auth/register' && $method === 'POST') {
        CoverageRecorder::mark(5);
        $ctrl = new AuthController();
        $response = $ctrl->register();
    }
    elseif ($path === '/auth/login' && $method === 'POST') {
        CoverageRecorder::mark(6);
        $ctrl = new AuthController();
        $response = $ctrl->login();
    }
    elseif ($path === '/auth/me' && $method === 'GET') {
        CoverageRecorder::mark(7);
        $authUser = authenticateToken();
        $ctrl = new AuthController();
        $response = $ctrl->me($authUser);
    }
    elseif ($path === '/auth/profile' && $method === 'PUT') {
        CoverageRecorder::mark(8);
        $authUser = authenticateToken();
        $ctrl = new AuthController();
        $response = $ctrl->updateProfile($authUser);
    }
    elseif ($path === '/auth/email' && $method === 'PUT') {
        CoverageRecorder::mark(9);
        $authUser = authenticateToken();
        $ctrl = new AuthController();
        $response = $ctrl->changeEmail($authUser);
    }
    elseif ($path === '/auth/password' && $method === 'PUT') {
        CoverageRecorder::mark(10);
        $authUser = authenticateToken();
        $ctrl = new AuthController();
        $response = $ctrl->changePassword($authUser);
    }
    elseif ($path === '/auth/password/forgot' && $method === 'POST') {
        CoverageRecorder::mark(11);
        $ctrl = new PasswordResetController();
        $response = $ctrl->forgotPassword();
    }
    elseif ($path === '/auth/password/reset' && $method === 'POST') {
        CoverageRecorder::mark(12);
        $ctrl = new PasswordResetController();
        $response = $ctrl->resetPassword();
    }
    elseif ($path === '/partner/auth' && $method === 'POST') {
        CoverageRecorder::mark(13);
        $ctrl = new PartnerController();
        $response = $ctrl->auth();
    }
    elseif ($path === '/account/referral/redeem' && $method === 'POST') {
        CoverageRecorder::mark(14);
        $authUser = authenticateToken();
        $ctrl = new ReferralController();
        $response = $ctrl->redeem($authUser);
    }
    // Wishlist routes (protected)
    elseif ($path === '/wishlist' && $method === 'GET') {
        CoverageRecorder::mark(15);
        $authUser = authenticateToken();
        $ctrl = new WishlistController();
        $response = $ctrl->index($authUser);
    }
    elseif ($path === '/wishlist' && $method === 'POST') {
        CoverageRecorder::mark(16);
        $authUser = authenticateToken();
        $ctrl = new WishlistController();
        $response = $ctrl->add($authUser);
    }
    elseif (preg_match('#^/wishlist/(\d+)$#', $path, $matches) && $method === 'DELETE') {
        CoverageRecorder::mark(17);
        $authUser = authenticateToken();
        $ctrl = new WishlistController();
        $response = $ctrl->remove($authUser, $matches[1]);
    }
    // Gift card routes (protected)
    elseif ($path === '/giftcards/welcome' && $method === 'GET') {
        CoverageRecorder::mark(18);
        $authUser = authenticateToken();
        $ctrl = new GiftCardController();
        $response = $ctrl->welcome($authUser);
    }
    elseif ($path === '/giftcards/redeem' && $method === 'POST') {
        CoverageRecorder::mark(19);
        $authUser = authenticateToken();
        $ctrl = new GiftCardController();
        $response = $ctrl->redeem($authUser);
    }
    // Discount code routes
    elseif ($path === '/discounts/validate' && $method === 'POST') {
        CoverageRecorder::mark(20);
        $authUser = authenticateToken();
        $ctrl = new DiscountController();
        $response = $ctrl->validate($authUser);
    }
    // Support ticket routes (customer-facing, protected)
    elseif ($path === '/support/tickets' && $method === 'GET') {
        CoverageRecorder::mark(21);
        $authUser = authenticateToken();
        $ctrl = new SupportController();
        $response = $ctrl->index($authUser);
    }
    elseif ($path === '/support/tickets' && $method === 'POST') {
        CoverageRecorder::mark(22);
        $authUser = authenticateToken();
        $ctrl = new SupportController();
        $response = $ctrl->create($authUser);
    }
    elseif (preg_match('#^/support/tickets/(\d+)$#', $path, $matches) && $method === 'GET') {
        CoverageRecorder::mark(23);
        $authUser = authenticateToken();
        $ctrl = new SupportController();
        $response = $ctrl->show($authUser, $matches[1]);
    }
    elseif (preg_match('#^/support/tickets/(\d+)/reply$#', $path, $matches) && $method === 'POST') {
        CoverageRecorder::mark(24);
        $authUser = authenticateToken();
        $ctrl = new SupportController();
        $response = $ctrl->reply($authUser, $matches[1]);
    }
    // 2FA routes
    elseif ($path === '/auth/2fa/setup' && $method === 'POST') {
        CoverageRecorder::mark(25);
        $authUser = authenticateToken();
        $ctrl = new AuthController();
        $response = $ctrl->setup2fa($authUser);
    }
    elseif ($path === '/auth/2fa/enable' && $method === 'POST') {
        CoverageRecorder::mark(26);
        $authUser = authenticateToken();
        $ctrl = new AuthController();
        $response = $ctrl->enable2fa($authUser);
    }
    elseif ($path === '/auth/2fa/disable' && $method === 'POST') {
        CoverageRecorder::mark(27);
        $authUser = authenticateToken();
        $ctrl = new AuthController();
        $response = $ctrl->disable2fa($authUser);
    }
    // Wine routes
    elseif ($path === '/wines' && $method === 'GET') {
        CoverageRecorder::mark(28);
        $ctrl = new WineController();
        $response = $ctrl->index();
    }
    elseif ($path === '/wines/regions' && $method === 'GET') {
        CoverageRecorder::mark(29);
        $ctrl = new WineController();
        $response = $ctrl->regions();
    }
    elseif ($path === '/wines/types' && $method === 'GET') {
        CoverageRecorder::mark(30);
        $ctrl = new WineController();
        $response = $ctrl->types();
    }
    elseif ($path === '/wines/ratings' && $method === 'GET') {
        CoverageRecorder::mark(31);
        $ctrl = new WineController();
        $response = $ctrl->ratings();
    }
    elseif ($path === '/wines/import-url' && $method === 'POST') {
        CoverageRecorder::mark(32);
        $authUser = authenticateToken();
        $ctrl = new WineController();
        $response = $ctrl->importFromUrl($authUser);
    }
    elseif ($path === '/wines' && $method === 'POST') {
        CoverageRecorder::mark(33);
        $authUser = authenticateToken();
        $ctrl = new WineController();
        $response = $ctrl->create($authUser);
    }
    elseif (preg_match('#^/wines/(\d+)/image$#', $path, $matches) && $method === 'POST') {
        CoverageRecorder::mark(34);
        $authUser = authenticateToken();
        $ctrl = new WineController();
        $response = $ctrl->uploadImage($authUser, $matches[1]);
    }
    elseif (preg_match('#^/wines/(\d+)/stock$#', $path, $matches) && $method === 'PUT') {
        CoverageRecorder::mark(35);
        $authUser = authenticateToken();
        $ctrl = new WineController();
        $response = $ctrl->adjustStock($authUser, $matches[1]);
    }
    elseif (preg_match('#^/wines/(\d+)$#', $path, $matches) && $method === 'PUT') {
        CoverageRecorder::mark(36);
        $authUser = authenticateToken();
        $ctrl = new WineController();
        $response = $ctrl->update($authUser, $matches[1]);
    }
    elseif (preg_match('#^/wines/(\d+)$#', $path, $matches) && $method === 'DELETE') {
        CoverageRecorder::mark(37);
        $authUser = authenticateToken();
        $ctrl = new WineController();
        $response = $ctrl->delete($authUser, $matches[1]);
    }
    elseif (preg_match('#^/wines/export/(.+)$#', $path, $matches) && $method === 'GET') {
        CoverageRecorder::mark(38);
        $ctrl = new WineController();
        $response = $ctrl->export($matches[1]);
    }
    // Wine reviews - must be BEFORE the catch-all /wines/:id route
    elseif (preg_match('#^/wines/(.+)/reviews$#', $path, $matches) && $method === 'GET') {
        CoverageRecorder::mark(39);
        $ctrl = new ReviewController();
        $response = $ctrl->list($matches[1]);
    }
    elseif (preg_match('#^/wines/(.+)/reviews$#', $path, $matches) && $method === 'POST') {
        CoverageRecorder::mark(40);
        $authUser = authenticateToken();
        $ctrl = new ReviewController();
        $response = $ctrl->create($authUser, $matches[1]);
    }
    elseif (preg_match('#^/wines/(.+)$#', $path, $matches) && $method === 'GET' && $matches[1] !== 'regions' && $matches[1] !== 'types' && $matches[1] !== 'ratings') {
        CoverageRecorder::mark(41);
        $ctrl = new WineController();
        $response = $ctrl->show($matches[1]);
    }
    // Cart routes (protected)
    elseif ($path === '/cart' && $method === 'GET') {
        CoverageRecorder::mark(42);
        $authUser = authenticateToken();
        $ctrl = new CartController();
        $response = $ctrl->index($authUser);
    }
    elseif ($path === '/cart/add' && $method === 'POST') {
        CoverageRecorder::mark(43);
        $authUser = authenticateToken();
        $ctrl = new CartController();
        $response = $ctrl->add($authUser);
    }
    elseif ($path === '/cart/update' && $method === 'PUT') {
        CoverageRecorder::mark(44);
        $authUser = authenticateToken();
        $ctrl = new CartController();
        $response = $ctrl->update($authUser);
    }
    elseif ($path === '/cart/snapshot' && $method === 'POST') {
        CoverageRecorder::mark(45);
        $authUser = authenticateToken();
        $ctrl = new CartSnapshotController();
        $response = $ctrl->snapshot($authUser);
    }
    elseif ($path === '/cart/restore' && $method === 'POST') {
        CoverageRecorder::mark(46);
        $authUser = authenticateToken();
        $ctrl = new CartSnapshotController();
        $response = $ctrl->restore($authUser);
    }
    elseif (preg_match('#^/cart/remove/(\d+)$#', $path, $matches) && $method === 'DELETE') {
        CoverageRecorder::mark(47);
        $authUser = authenticateToken();
        $ctrl = new CartController();
        $response = $ctrl->remove($authUser, $matches[1]);
    }
    elseif ($path === '/orders' && $method === 'POST') {
        CoverageRecorder::mark(48);
        $authUser = authenticateToken();
        $ctrl = new OrderController();
        $response = $ctrl->create($authUser);
    }
    elseif ($path === '/orders' && $method === 'GET') {
        CoverageRecorder::mark(49);
        $authUser = authenticateToken();
        $ctrl = new OrderController();
        $response = $ctrl->index($authUser);
    }
    elseif ($path === '/orders/track' && $method === 'GET') {
        CoverageRecorder::mark(50);
        $ctrl = new OrderController();
        $response = $ctrl->track();
    }
    elseif ($path === '/payments/create-intent' && $method === 'POST') {
        CoverageRecorder::mark(51);
        $authUser = authenticateToken();
        $ctrl = new PaymentController();
        $response = $ctrl->createIntent($authUser);
    }
    elseif ($path === '/webhooks/stripe' && $method === 'POST') {
        CoverageRecorder::mark(52);
        $ctrl = new WebhookController();
        $response = $ctrl->handle();
    }
    elseif (preg_match('#^/orders/(\d+)/tracking-link$#', $path, $matches) && $method === 'GET') {
        CoverageRecorder::mark(53);
        $authUser = authenticateToken();
        $ctrl = new OrderController();
        $response = $ctrl->trackingLink($authUser, $matches[1]);
    }
    elseif (preg_match('#^/orders/(\d+)$#', $path, $matches) && $method === 'GET') {
        CoverageRecorder::mark(54);
        $authUser = authenticateToken();
        $ctrl = new OrderController();
        $response = $ctrl->show($authUser, $matches[1]);
    }
    elseif (preg_match('#^/orders/(\d+)/status$#', $path, $matches) && $method === 'PUT') {
        CoverageRecorder::mark(55);
        $authUser = authenticateToken();
        $ctrl = new OrderController();
        $response = $ctrl->updateStatus($authUser, $matches[1]);
    }
    // Admin routes (protected - admin only)
    elseif ($path === '/admin/orders' && $method === 'GET') {
        CoverageRecorder::mark(56);
        $authUser = authenticateToken();
        $ctrl = new AdminController();
        $response = $ctrl->listOrders($authUser);
    }
    elseif (preg_match('#^/admin/orders/(\d+)$#', $path, $matches) && $method === 'GET') {
        CoverageRecorder::mark(57);
        $authUser = authenticateToken();
        $ctrl = new AdminController();
        $response = $ctrl->getOrder($authUser, $matches[1]);
    }
    elseif (preg_match('#^/admin/orders/(\d+)/status$#', $path, $matches) && $method === 'PUT') {
        CoverageRecorder::mark(58);
        $authUser = authenticateToken();
        $ctrl = new AdminController();
        $response = $ctrl->updateOrderStatus($authUser, $matches[1]);
    }
    elseif ($path === '/admin/analytics' && $method === 'GET') {
        CoverageRecorder::mark(59);
        $authUser = authenticateToken();
        $ctrl = new AdminController();
        $response = $ctrl->analytics($authUser);
    }
    elseif ($path === '/admin/users' && $method === 'GET') {
        CoverageRecorder::mark(60);
        $authUser = authenticateToken();
        $ctrl = new AdminController();
        $response = $ctrl->users($authUser);
    }
    elseif (preg_match('#^/admin/users/(\d+)/role$#', $path, $matches) && $method === 'PUT') {
        CoverageRecorder::mark(61);
        $authUser = authenticateToken();
        $ctrl = new AdminController();
        $response = $ctrl->updateUserRole($authUser, $matches[1]);
    }
    // Admin: discount codes
    elseif ($path === '/admin/discounts' && $method === 'GET') {
        CoverageRecorder::mark(62);
        $authUser = authenticateToken();
        $ctrl = new DiscountController();
        $response = $ctrl->index($authUser);
    }
    elseif ($path === '/admin/discounts' && $method === 'POST') {
        CoverageRecorder::mark(63);
        $authUser = authenticateToken();
        $ctrl = new DiscountController();
        $response = $ctrl->create($authUser);
    }
    elseif (preg_match('#^/admin/discounts/(\d+)$#', $path, $matches) && $method === 'PUT') {
        CoverageRecorder::mark(64);
        $authUser = authenticateToken();
        $ctrl = new DiscountController();
        $response = $ctrl->update($authUser, $matches[1]);
    }
    elseif (preg_match('#^/admin/discounts/(\d+)$#', $path, $matches) && $method === 'DELETE') {
        CoverageRecorder::mark(65);
        $authUser = authenticateToken();
        $ctrl = new DiscountController();
        $response = $ctrl->delete($authUser, $matches[1]);
    }
    // Admin: referral codes
    elseif ($path === '/admin/referrals' && $method === 'GET') {
        CoverageRecorder::mark(66);
        $authUser = authenticateToken();
        $ctrl = new ReferralController();
        $response = $ctrl->index($authUser);
    }
    elseif ($path === '/admin/referrals' && $method === 'POST') {
        CoverageRecorder::mark(67);
        $authUser = authenticateToken();
        $ctrl = new ReferralController();
        $response = $ctrl->create($authUser);
    }
    elseif (preg_match('#^/admin/referrals/(\d+)$#', $path, $matches) && $method === 'DELETE') {
        CoverageRecorder::mark(68);
        $authUser = authenticateToken();
        $ctrl = new ReferralController();
        $response = $ctrl->delete($authUser, $matches[1]);
    }
    // Admin/support: tickets
    elseif ($path === '/admin/support/tickets' && $method === 'GET') {
        CoverageRecorder::mark(69);
        $authUser = authenticateToken();
        $ctrl = new SupportController();
        $response = $ctrl->adminIndex($authUser);
    }
    elseif (preg_match('#^/admin/support/tickets/(\d+)$#', $path, $matches) && $method === 'GET') {
        CoverageRecorder::mark(70);
        $authUser = authenticateToken();
        $ctrl = new SupportController();
        $response = $ctrl->adminShow($authUser, $matches[1]);
    }
    elseif (preg_match('#^/admin/support/tickets/(\d+)/reply$#', $path, $matches) && $method === 'POST') {
        CoverageRecorder::mark(71);
        $authUser = authenticateToken();
        $ctrl = new SupportController();
        $response = $ctrl->adminReply($authUser, $matches[1]);
    }
    elseif (preg_match('#^/admin/support/tickets/(\d+)/status$#', $path, $matches) && $method === 'PUT') {
        CoverageRecorder::mark(72);
        $authUser = authenticateToken();
        $ctrl = new SupportController();
        $response = $ctrl->updateStatus($authUser, $matches[1]);
    }
    elseif ($path === '/pi-log-data' && $method === 'GET') {
        CoverageRecorder::mark(73);
        $ctrl = new PiCallbackController();
        $response = $ctrl->logData();
    }
    elseif ($path === '/password-reset-log' && $method === 'GET') {
        CoverageRecorder::mark(74);
        $ctrl = new PasswordResetController();
        $response = $ctrl->logData();
    }
    // Crawler coverage (not views themselves, so never marked here)
    elseif ($path === '/coverage/hit' && $method === 'POST') {
        $ctrl = new CoverageController();
        $response = $ctrl->hit();
    }
    elseif (preg_match('#^/coverage/([^/]+)$#', $path, $matches) && $method === 'GET') {
        $ctrl = new CoverageController();
        $response = $ctrl->results($matches[1]);
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
