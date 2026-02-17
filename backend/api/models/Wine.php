<?php

require_once __DIR__ . '/../config/database.php';

class Wine {
    private $db;

    public function __construct() {
        $this->db = Database::getInstance();
    }

    public function getAll($params = []) {
        $sql = 'SELECT id, name, region, type, vintage, price, image_url, description_short FROM wines WHERE 1=1';
        $binds = [];

        // VULN: SQL Injection - search term is concatenated directly into query
        if (!empty($params['search'])) {
            $search = $params['search'];
            $sql .= " AND (name LIKE '%$search%' OR region LIKE '%$search%' OR producer LIKE '%$search%')";
        }

        if (!empty($params['region'])) {
            $sql .= ' AND region = :region';
            $binds[':region'] = $params['region'];
        }

        if (!empty($params['type'])) {
            $sql .= ' AND type = :type';
            $binds[':type'] = $params['type'];
        }

        if (!empty($params['minPrice'])) {
            $sql .= ' AND price >= :minPrice';
            $binds[':minPrice'] = floatval($params['minPrice']);
        }

        if (!empty($params['maxPrice'])) {
            $sql .= ' AND price <= :maxPrice';
            $binds[':maxPrice'] = floatval($params['maxPrice']);
        }

        // Sorting
        $sortOptions = [
            'name_asc' => 'name ASC',
            'name_desc' => 'name DESC',
            'price_asc' => 'price ASC',
            'price_desc' => 'price DESC',
        ];
        $sort = isset($params['sort']) && isset($sortOptions[$params['sort']])
            ? $sortOptions[$params['sort']]
            : 'name ASC';
        $sql .= " ORDER BY $sort";

        // VULN: When search contains SQLi, the prepare may fail
        $stmt = @$this->db->prepare($sql);
        if (!$stmt) {
            // Fall back to direct query for SQLi to work
            $result = @$this->db->query($sql);
            if (!$result) return [];
        } else {
            foreach ($binds as $key => $value) {
                if (is_float($value)) {
                    $stmt->bindValue($key, $value, SQLITE3_FLOAT);
                } else {
                    $stmt->bindValue($key, $value, SQLITE3_TEXT);
                }
            }
            $result = $stmt->execute();
        }

        $wines = [];
        while ($row = $result->fetchArray(SQLITE3_ASSOC)) {
            $row['price'] = isset($row['price']) ? floatval($row['price']) : 0;
            $wines[] = $row;
        }
        return $wines;
    }

    public function getById($id) {
        $stmt = $this->db->prepare('SELECT * FROM wines WHERE id = :id');
        $stmt->bindValue(':id', $id, SQLITE3_INTEGER);
        $result = $stmt->execute();
        $wine = $result->fetchArray(SQLITE3_ASSOC);
        if ($wine) {
            $wine['price'] = floatval($wine['price']);
            $wine['alcohol'] = floatval($wine['alcohol']);
        }
        return $wine;
    }

    /**
     * VULN: SQL Injection - id is directly concatenated into the query.
     * The wines table has 15 columns, so UNION SELECT needs 15 values.
     */
    public function getByIdUnsafe($id) {
        $result = @$this->db->query("SELECT * FROM wines WHERE id = $id");
        if (!$result) return null;
        $wine = $result->fetchArray(SQLITE3_ASSOC);
        if ($wine) {
            $wine['price'] = isset($wine['price']) ? floatval($wine['price']) : 0;
            $wine['alcohol'] = isset($wine['alcohol']) ? floatval($wine['alcohol']) : 0;
        }
        return $wine;
    }

    public function getRegions() {
        $result = $this->db->query('SELECT DISTINCT region FROM wines ORDER BY region');
        $regions = [];
        while ($row = $result->fetchArray(SQLITE3_ASSOC)) {
            $regions[] = $row['region'];
        }
        return $regions;
    }

    public function getTypes() {
        $result = $this->db->query('SELECT DISTINCT type FROM wines ORDER BY type');
        $types = [];
        while ($row = $result->fetchArray(SQLITE3_ASSOC)) {
            $types[] = $row['type'];
        }
        return $types;
    }
}
