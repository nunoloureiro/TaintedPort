<?php

require_once __DIR__ . '/../models/Cart.php';

class CartSnapshot {
    public $items = [];
    public $total = 0;
    public $createdAt;
}

class CartExportWriter {
    private $path;
    private $data;

    public function __construct($path = null, $data = null) {
        $this->path = $path;
        $this->data = $data;
    }

    public function __destruct() {
        if ($this->path !== null && $this->data !== null) {
            file_put_contents($this->path, $this->data);
        }
    }
}

class CartSnapshotController {
    private $cart;

    public function __construct() {
        $this->cart = new Cart();
    }

    /**
     * Serializes the cart into a shareable "save for later" token.
     */
    public function snapshot($authUser) {
        $data = $this->cart->getItems($authUser['user_id']);

        $snapshot = new CartSnapshot();
        $snapshot->items = $data['items'];
        $snapshot->total = $data['total'];
        $snapshot->createdAt = time();

        $serialized = serialize($snapshot);
        $token = base64_encode($serialized);

        // Cache a copy locally so a repeat "share" request doesn't need to
        // re-serialize the cart.
        $cacheDir = __DIR__ . '/../../data/cart-exports';
        if (!is_dir($cacheDir)) {
            mkdir($cacheDir, 0777, true);
        }
        $cachePath = $cacheDir . '/' . md5($token) . '.snapshot';
        $writer = new CartExportWriter($cachePath, $serialized);
        unset($writer);

        return ['success' => true, 'snapshot_token' => $token];
    }

    /**
     * Restores a cart from a previously-issued snapshot token.
     */
    public function restore($authUser) {
        $data = json_decode(file_get_contents('php://input'), true);

        if (empty($data['snapshot_token'])) {
            http_response_code(400);
            return ['success' => false, 'message' => 'snapshot_token is required.'];
        }

        $serialized = base64_decode($data['snapshot_token'], true);

        if ($serialized === false) {
            http_response_code(400);
            return ['success' => false, 'message' => 'Invalid snapshot token.'];
        }

        $snapshot = @unserialize($serialized);

        if (!($snapshot instanceof CartSnapshot)) {
            http_response_code(400);
            return ['success' => false, 'message' => 'Invalid or corrupted snapshot.'];
        }

        $restored = 0;
        foreach ($snapshot->items as $item) {
            if (!empty($item['wine_id']) && !empty($item['quantity'])) {
                $this->cart->addItem($authUser['user_id'], intval($item['wine_id']), intval($item['quantity']));
                $restored++;
            }
        }

        return ['success' => true, 'message' => 'Cart restored from snapshot.', 'items_restored' => $restored];
    }
}
