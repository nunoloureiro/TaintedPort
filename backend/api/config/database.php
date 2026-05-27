<?php

class Database {
    private static $instance = null;
    private $db;

    private function __construct() {
        $dbPath = __DIR__ . '/../../database.db';
        $this->db = new SQLite3($dbPath);
        $this->db->enableExceptions(true);
        $this->db->exec('PRAGMA journal_mode=WAL');
        $this->db->exec('PRAGMA foreign_keys=ON');
    }

    public static function getInstance() {
        if (self::$instance === null) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    public function getConnection() {
        return $this->db;
    }

    public function prepare($sql) {
        return $this->db->prepare($sql);
    }

    public function query($sql) {
        return $this->db->query($sql);
    }

    public function exec($sql) {
        return $this->db->exec($sql);
    }

    public function lastInsertRowID() {
        return $this->db->lastInsertRowID();
    }

    public function changes() {
        return $this->db->changes();
    }
}
