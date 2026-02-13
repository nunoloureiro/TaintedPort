#!/bin/sh
set -e

echo "============================================"
echo "  TaintedPort - Starting fresh instance"
echo "============================================"

# Always reset the database on container start
# This ensures a clean state for security testing
echo "[init] Resetting database..."
cd /var/www/backend
rm -f database.db
php setup_db.php

# Ensure correct permissions
chown -R www-data:www-data /var/www/backend/database.db

echo "[init] Database ready."
echo "[init] Starting services..."

exec "$@"
