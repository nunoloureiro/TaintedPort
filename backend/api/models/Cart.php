<?php

require_once __DIR__ . '/../config/database.php';

class Cart {
    private $db;

    public function __construct() {
        $this->db = Database::getInstance();
    }

    public function getItems($userId) {
        $stmt = $this->db->prepare(
            'SELECT c.id, c.wine_id, w.name as wine_name, w.image_url as wine_image, 
                    w.price, c.quantity, (w.price * c.quantity) as subtotal
             FROM cart_items c 
             JOIN wines w ON c.wine_id = w.id 
             WHERE c.user_id = :user_id'
        );
        $stmt->bindValue(':user_id', $userId, SQLITE3_INTEGER);
        $result = $stmt->execute();

        $items = [];
        $total = 0;
        while ($row = $result->fetchArray(SQLITE3_ASSOC)) {
            $row['price'] = floatval($row['price']);
            $row['subtotal'] = floatval($row['subtotal']);
            $total += $row['subtotal'];
            $items[] = $row;
        }

        return ['items' => $items, 'total' => round($total, 2)];
    }

    public function addItem($userId, $wineId, $quantity, $customPrice = null) {
        // Check if wine exists
        $stmt = $this->db->prepare('SELECT id FROM wines WHERE id = :id');
        $stmt->bindValue(':id', $wineId, SQLITE3_INTEGER);
        $result = $stmt->execute();
        if (!$result->fetchArray()) {
            return false;
        }

        // VULN: Price manipulation - if a custom price is provided, update the wine's price
        // This allows a client to set any price for a wine before adding to cart
        if ($customPrice !== null) {
            $stmt = $this->db->prepare('UPDATE wines SET price = :price WHERE id = :id');
            $stmt->bindValue(':price', $customPrice, SQLITE3_FLOAT);
            $stmt->bindValue(':id', $wineId, SQLITE3_INTEGER);
            $stmt->execute();
        }

        // Upsert: insert or update quantity
        $stmt = $this->db->prepare(
            'INSERT INTO cart_items (user_id, wine_id, quantity) VALUES (:user_id, :wine_id, :qty)
             ON CONFLICT(user_id, wine_id) DO UPDATE SET quantity = quantity + :qty2'
        );
        $stmt->bindValue(':user_id', $userId, SQLITE3_INTEGER);
        $stmt->bindValue(':wine_id', $wineId, SQLITE3_INTEGER);
        $stmt->bindValue(':qty', $quantity, SQLITE3_INTEGER);
        $stmt->bindValue(':qty2', $quantity, SQLITE3_INTEGER);
        $stmt->execute();
        return true;
    }

    public function updateItem($userId, $wineId, $quantity) {
        if ($quantity <= 0) {
            return $this->removeItem($userId, $wineId);
        }

        $stmt = $this->db->prepare(
            'UPDATE cart_items SET quantity = :qty WHERE user_id = :user_id AND wine_id = :wine_id'
        );
        $stmt->bindValue(':qty', $quantity, SQLITE3_INTEGER);
        $stmt->bindValue(':user_id', $userId, SQLITE3_INTEGER);
        $stmt->bindValue(':wine_id', $wineId, SQLITE3_INTEGER);
        $stmt->execute();
        return true;
    }

    public function removeItem($userId, $wineId) {
        $stmt = $this->db->prepare(
            'DELETE FROM cart_items WHERE user_id = :user_id AND wine_id = :wine_id'
        );
        $stmt->bindValue(':user_id', $userId, SQLITE3_INTEGER);
        $stmt->bindValue(':wine_id', $wineId, SQLITE3_INTEGER);
        $stmt->execute();
        return true;
    }

    public function clear($userId) {
        $stmt = $this->db->prepare('DELETE FROM cart_items WHERE user_id = :user_id');
        $stmt->bindValue(':user_id', $userId, SQLITE3_INTEGER);
        $stmt->execute();
        return true;
    }
}
