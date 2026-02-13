<?php

require_once __DIR__ . '/../models/Cart.php';

class CartController {
    private $cart;

    public function __construct() {
        $this->cart = new Cart();
    }

    public function index($authUser) {
        $data = $this->cart->getItems($authUser['user_id']);
        return ['success' => true, 'items' => $data['items'], 'total' => $data['total']];
    }

    public function add($authUser) {
        $data = json_decode(file_get_contents('php://input'), true);

        if (empty($data['wine_id']) || empty($data['quantity'])) {
            http_response_code(400);
            return ['success' => false, 'message' => 'wine_id and quantity are required.'];
        }

        $quantity = intval($data['quantity']);
        if ($quantity < 1 || $quantity > 12) {
            http_response_code(400);
            return ['success' => false, 'message' => 'Quantity must be between 1 and 12.'];
        }

        // VULN: Price manipulation - if client sends a price, it overrides the DB price
        $customPrice = isset($data['price']) ? floatval($data['price']) : null;

        $result = $this->cart->addItem($authUser['user_id'], intval($data['wine_id']), $quantity, $customPrice);

        if (!$result) {
            http_response_code(404);
            return ['success' => false, 'message' => 'Wine not found.'];
        }

        return ['success' => true, 'message' => 'Item added to cart'];
    }

    public function update($authUser) {
        $data = json_decode(file_get_contents('php://input'), true);

        if (!isset($data['wine_id']) || !isset($data['quantity'])) {
            http_response_code(400);
            return ['success' => false, 'message' => 'wine_id and quantity are required.'];
        }

        $this->cart->updateItem($authUser['user_id'], intval($data['wine_id']), intval($data['quantity']));
        return ['success' => true, 'message' => 'Cart updated'];
    }

    public function remove($authUser, $wineId) {
        $this->cart->removeItem($authUser['user_id'], intval($wineId));
        return ['success' => true, 'message' => 'Item removed from cart'];
    }
}
